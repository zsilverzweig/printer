"""
Market Data Provider for trading strategies.

Aggregates data from multiple sources (Polygon, Alpaca, internal services)
and provides a unified interface for strategies to access real-time and
historical market data, indicators, news, and float information.
"""

from datetime import datetime, timedelta

from app.services.core.time_context import get_current_time
from app.services.market.metrics_calculator import METRIC_FIELDS
from typing import Any, Callable, Dict, List, Optional
import logging
import asyncio

from polygon import RESTClient
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame

import app.core as core
from app.strategies.base import MarketDataSnapshot
from app.services.core.time_context import get_backtest_context, get_current_time

logger = logging.getLogger(__name__)


class MarketDataProvider:
    """
    Provides comprehensive market data for trading strategies.
    
    Aggregates data from:
    - Polygon: Real-time quotes, historical bars
    - Alpaca: Real-time quotes, historical bars
    - Internal services: News sentiment, float data, screener results
    """
    
    def __init__(
        self,
        polygon_client: Optional[RESTClient] = None,
        alpaca_data_client: Optional[StockHistoricalDataClient] = None,
    ):
        """
        Initialize market data provider.
        
        Args:
            polygon_client: Polygon REST client (optional, uses core.get_client() if not provided)
            alpaca_data_client: Alpaca data client (optional)
        """
        self.polygon_client = polygon_client or core.get_client()
        self.alpaca_data_client = alpaca_data_client
        
        # Real-time subscription callbacks
        self._subscriptions: Dict[str, List[Callable]] = {}
    
    async def get_realtime_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get current real-time quote for a symbol.
        
        In backtest mode, returns historical quote at backtest time.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Dictionary with current quote data
        """
        try:
            # Check if in backtest mode
            ctx = get_backtest_context()
            if ctx:
                # Backtest mode: get historical bar at current backtest time
                from app.services.market.market_data_service import get_market_data_service
                service = get_market_data_service()
                
                # Get the current minute bar
                bars = await service.get_bars(
                    symbol=symbol,
                    timeframe="1Min",
                    lookback_minutes=1  # Just get current minute
                )
                
                if bars and len(bars) > 0:
                    bar = bars[-1]  # Most recent bar
                    return {
                        "symbol": symbol,
                        "price": bar["close"],
                        "bid": bar["low"],  # Approximate
                        "ask": bar["high"],  # Approximate
                        "timestamp": bar["timestamp"],  # Bars use "timestamp" key
                    }
                else:
                    # No bar data at this moment - stock not trading (normal for low volume)
                    # Return None to signal no data, don't raise error
                    logger.debug(f"No bar data for {symbol} at {ctx.current_time} (not trading this minute)")
                    # Raise to propagate up so strategy skips this ticker
                    raise ValueError(f"No bar data available for {symbol} at {ctx.current_time}")
            
            # Live mode: get real-time quote
            if self.alpaca_data_client:
                request = StockLatestQuoteRequest(symbol_or_symbols=symbol)
                quotes = self.alpaca_data_client.get_stock_latest_quote(request)
                quote = quotes[symbol]
                
                return {
                    "symbol": symbol,
                    "bid": float(quote.bid_price),
                    "ask": float(quote.ask_price),
                    "bid_size": quote.bid_size,
                    "ask_size": quote.ask_size,
                    "timestamp": quote.timestamp,
                }
            else:
                # Fallback to Polygon
                last_trade = self.polygon_client.get_last_trade(symbol)
                return {
                    "symbol": symbol,
                    "price": last_trade.price,
                    "size": last_trade.size,
                    "timestamp": datetime.fromtimestamp(last_trade.sip_timestamp / 1e9),
                }
        
        except ValueError as e:
            # Don't log error for expected "no bar data" cases in backtest
            if "No bar data available" in str(e):
                raise  # Re-raise without logging
            logger.error(f"Error getting realtime quote for {symbol}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error getting realtime quote for {symbol}: {e}")
            raise
    
    async def get_historical_bars(
        self, 
        symbol: str, 
        timeframe: str = "1Min",
        lookback_minutes: int = 60
    ) -> List[Dict[str, Any]]:
        """
        Get historical price bars - DATABASE FIRST via MarketDataService.
        
        Maintains backward compatibility with existing strategy code while
        leveraging centralized database-first query logic.
        
        Args:
            symbol: Stock symbol
            timeframe: Bar timeframe (e.g., "1Min", "5Min")
            lookback_minutes: How far back to fetch
            
        Returns:
            List of bars with OHLCV data
        """
        try:
            # Use centralized MarketDataService
            from app.services.market.market_data_service import get_market_data_service
            service = get_market_data_service()
            
            return await service.get_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes
            )
            
        except Exception as e:
            logger.error(f"Error getting historical bars for {symbol}: {e}")
            return []
    
    # _get_polygon_bars removed - now handled by MarketDataService
    
    async def get_indicators(
        self, 
        symbol: str, 
        indicators: List[str]
    ) -> Dict[str, Any]:
        """
        Calculate technical indicators using database-first bar queries.
        
        Args:
            symbol: Stock symbol
            indicators: List of indicator names (e.g., ["MACD", "RSI"])
            
        Returns:
            Dictionary with indicator values
        """
        result = {}
        
        try:
            from app.services.market.market_data_service import get_market_data_service

            service = get_market_data_service()
            indicator_series = await service.get_technical_indicators(
                symbol=symbol,
                timescale="1Min",
                lookback_minutes=120,
            )

            if not indicator_series:
                logger.warning(f"Indicators unavailable for {symbol}")
                return result

            latest = indicator_series[-1]

            for indicator in indicators:
                if indicator == "MACD":
                    result["MACD"] = latest.get("macd_line")
                elif indicator == "RSI":
                    result["RSI"] = latest.get("rsi_14")
        
        except Exception as e:
            logger.error(f"Error calculating indicators for {symbol}: {e}")
        
        return result
    
    async def get_current_prices_batch(self, symbols: List[str]) -> Dict[str, float]:
        """
        Get current prices for multiple symbols in a single batch call.
        
        This is much more efficient than calling get_realtime_quote for each symbol individually.
        Uses Polygon's snapshot API which returns data for all requested symbols.
        
        Args:
            symbols: List of stock symbols
            
        Returns:
            Dictionary mapping symbol to current price. Missing symbols will be omitted.
        """
        if not symbols:
            return {}
        
        try:
            # Use Polygon snapshot API for batch price fetching
            # Format: /v2/snapshot/locale/us/markets/stocks/tickers/{comma-separated symbols}
            symbols_str = ",".join(symbols)
            
            # Run synchronous API call in thread pool
            def fetch_snapshots():
                import urllib.request
                import urllib.parse
                import json
                
                base = f"https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers"
                query = urllib.parse.urlencode({"tickers": symbols_str, "apiKey": core.API_KEY})
                url = f"{base}?{query}"
                
                with urllib.request.urlopen(url, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data.get("tickers", [])
            
            snapshots = await asyncio.to_thread(fetch_snapshots)
            
            # Extract prices from snapshots
            prices = {}
            for snapshot in snapshots:
                ticker = snapshot.get("ticker")
                if not ticker:
                    continue
                
                # Try to get price from lastTrade
                last_trade = snapshot.get("lastTrade")
                if last_trade and isinstance(last_trade, dict):
                    price = last_trade.get("p") or last_trade.get("price")
                    if price:
                        prices[ticker] = float(price)
                        continue
                
                # Fallback: try prevDay close
                prev_day = snapshot.get("prevDay")
                if prev_day and isinstance(prev_day, dict):
                    close = prev_day.get("c")
                    if close:
                        prices[ticker] = float(close)
            
            logger.debug(f"Fetched {len(prices)} prices for {len(symbols)} symbols in batch")
            return prices
            
        except Exception as e:
            logger.error(f"Error fetching batch prices for {len(symbols)} symbols: {e}")
            return {}
    
    async def get_news_sentiment(self, symbol: str) -> Dict[str, Any]:
        """
        Get recent news and sentiment for a symbol.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Dictionary with news sentiment data
        """
        # TODO: Integrate with existing news service
        # For now, return placeholder
        return {
            "sentiment": "neutral",
            "score": 0.0,
            "article_count": 0,
        }
    
    async def get_float_data(self, symbol: str) -> Dict[str, Any]:
        """
        Get float and shares outstanding data.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Dictionary with float data
        """
        # TODO: Integrate with existing float scraper service
        # For now, return placeholder
        return {
            "float": None,
            "shares_outstanding": None,
        }
    
    async def subscribe_realtime(
        self, 
        symbol: str, 
        callback: Callable[[MarketDataSnapshot], None]
    ) -> None:
        """
        Subscribe to real-time updates for a symbol.
        
        Args:
            symbol: Stock symbol
            callback: Function to call with new market data
        """
        if symbol not in self._subscriptions:
            self._subscriptions[symbol] = []
        
        self._subscriptions[symbol].append(callback)
        logger.info(f"Subscribed to real-time data for {symbol}")
    
    async def unsubscribe_realtime(self, symbol: str, callback: Callable) -> None:
        """Unsubscribe from real-time updates."""
        if symbol in self._subscriptions:
            self._subscriptions[symbol] = [
                cb for cb in self._subscriptions[symbol] if cb != callback
            ]
    
    async def build_market_data(self, symbol: str) -> MarketDataSnapshot:
        """
        Build comprehensive MarketData object for a symbol.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            MarketData object with all available data
        """
        try:
            # Get current quote
            quote = await self.get_realtime_quote(symbol)
            
            # Get historical bars
            bars = await self.get_historical_bars(symbol, lookback_minutes=60)
            
            # Get indicators
            indicators = await self.get_indicators(symbol, ["MACD", "RSI"])

            metrics: Dict[str, Any] = {}
            if bars:
                latest_bar = bars[-1]
                for field in METRIC_FIELDS:
                    value = latest_bar.get(field)
                    if value is not None:
                        metrics[field] = value
                if latest_bar.get("vwap") is not None:
                    metrics["vwap"] = latest_bar.get("vwap")

            # Pull daily metrics for broader context (change %, daily RV, etc.)
            try:
                from app.services.market.market_data_service import get_market_data_service

                market_service = get_market_data_service()
                daily_bars = await market_service.get_bars(
                    symbol=symbol,
                    timeframe="1Day",
                    lookback_minutes=60 * 24 * 5,
                )

                if daily_bars:
                    latest_daily = daily_bars[-1]
                    for field in METRIC_FIELDS:
                        value = latest_daily.get(field)
                        if value is not None:
                            metrics[field] = value

                    if latest_daily.get("vwap") is not None:
                        metrics.setdefault("daily_vwap", latest_daily.get("vwap"))

                    prev_daily = daily_bars[-2] if len(daily_bars) >= 2 else None
                    current_close = latest_daily.get("close")
                    prev_close = prev_daily.get("close") if prev_daily else None
                    if current_close is not None and prev_close:
                        delta = current_close - prev_close
                        if prev_close != 0:
                            change_pct = (delta / prev_close) * 100
                            metrics["change_close_pct"] = change_pct
                            metrics["change_percent"] = change_pct
                        metrics["change_close"] = delta
            except Exception as e:
                logger.debug(f"Unable to fetch daily metrics for {symbol}: {e}")
            
            # Determine current price with robust fallback logic
            current_price = 0.0
            
            # Try direct price (from Polygon last trade)
            if quote.get("price"):
                current_price = float(quote["price"])
            # Try mid-price from bid/ask (from Alpaca quote)
            elif quote.get("bid") and quote.get("ask"):
                bid = float(quote["bid"])
                ask = float(quote["ask"])
                if bid > 0 and ask > 0:
                    current_price = (bid + ask) / 2.0
                elif ask > 0:
                    current_price = ask
                elif bid > 0:
                    current_price = bid
            # Try ask only
            elif quote.get("ask"):
                current_price = float(quote["ask"])
            # Try bid only
            elif quote.get("bid"):
                current_price = float(quote["bid"])
            # Try last bar close price as final fallback
            elif bars and len(bars) > 0:
                current_price = float(bars[-1].get("close", 0.0))
                logger.warning(
                    f"No real-time quote available for {symbol}, using last bar close: ${current_price:.2f}"
                )
            
            # Validate we got a valid price
            if current_price <= 0:
                error_msg = (
                    f"Failed to get valid price for {symbol}. "
                    f"Quote data: bid={quote.get('bid')}, ask={quote.get('ask')}, price={quote.get('price')}, "
                    f"bars={len(bars) if bars else 0}"
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            
            logger.debug(f"Built market data for {symbol}: price=${current_price:.2f}")
            
            return MarketDataSnapshot(
                symbol=symbol,
                price=current_price,
                timestamp=get_current_time(),
                bid=quote.get("bid"),
                ask=quote.get("ask"),
                bars=bars,
                indicators=indicators,
                metrics=metrics or None,
            )
        
        except ValueError as e:
            # Don't log error for expected "no bar data" cases in backtest
            if "No bar data available" in str(e):
                raise  # Re-raise without logging
            logger.error(f"Error building market data for {symbol}: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Error building market data for {symbol}: {e}", exc_info=True)
            raise


