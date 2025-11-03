"""
Market Data Provider for trading strategies.

Aggregates data from multiple sources (Polygon, Alpaca, internal services)
and provides a unified interface for strategies to access real-time and
historical market data, indicators, news, and float information.
"""

from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional
import logging
import asyncio

from polygon import RESTClient
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestQuoteRequest
from alpaca.data.timeframe import TimeFrame

import app.core as core
from app.strategies.base import MarketDataSnapshot

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
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Dictionary with current quote data
        """
        try:
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
            # Get bars for indicator calculation (via MarketDataService -> database first)
            bars = await self.get_historical_bars(symbol, lookback_minutes=120)
            
            if not bars or len(bars) < 26:  # Need at least 26 bars for MACD
                logger.warning(f"Insufficient bars for indicators: {symbol}")
                return result
            
            closes = [bar["close"] for bar in bars]
            
            for indicator in indicators:
                if indicator == "MACD":
                    result["MACD"] = self._calculate_macd(closes)
                elif indicator == "RSI":
                    result["RSI"] = self._calculate_rsi(closes)
                # Add more indicators as needed
        
        except Exception as e:
            logger.error(f"Error calculating indicators for {symbol}: {e}")
        
        return result
    
    def _calculate_macd(self, closes: List[float]) -> float:
        """Calculate MACD indicator (simplified)."""
        if len(closes) < 26:
            return 0.0
        
        # Simple EMA calculation
        def ema(data: List[float], period: int) -> float:
            if len(data) < period:
                return sum(data) / len(data)
            multiplier = 2 / (period + 1)
            ema_val = sum(data[:period]) / period
            for price in data[period:]:
                ema_val = (price - ema_val) * multiplier + ema_val
            return ema_val
        
        ema_12 = ema(closes, 12)
        ema_26 = ema(closes, 26)
        
        return ema_12 - ema_26
    
    def _calculate_rsi(self, closes: List[float], period: int = 14) -> float:
        """Calculate RSI indicator."""
        if len(closes) < period + 1:
            return 50.0
        
        gains = []
        losses = []
        
        for i in range(1, len(closes)):
            change = closes[i] - closes[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
        
        if len(gains) < period:
            return 50.0
        
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
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
                timestamp=datetime.now(),
                bid=quote.get("bid"),
                ask=quote.get("ask"),
                bars=bars,
                indicators=indicators,
            )
        
        except Exception as e:
            logger.error(f"Error building market data for {symbol}: {e}", exc_info=True)
            raise


