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
from app.strategies.base import MarketData

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
        
        logger.info("MarketDataProvider initialized")
    
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
        Get historical price bars for pattern detection.
        
        Args:
            symbol: Stock symbol
            timeframe: Bar timeframe (e.g., "1Min", "5Min")
            lookback_minutes: How far back to fetch
            
        Returns:
            List of bars with OHLCV data
        """
        try:
            if not self.alpaca_data_client:
                logger.warning(f"Alpaca data client not available for {symbol}, using Polygon")
                return await self._get_polygon_bars(symbol, timeframe, lookback_minutes)
            
            # Convert timeframe string to Alpaca TimeFrame
            if timeframe == "1Min":
                tf = TimeFrame.Minute
            elif timeframe == "5Min":
                tf = TimeFrame(5, "Min")
            elif timeframe == "15Min":
                tf = TimeFrame(15, "Min")
            else:
                tf = TimeFrame.Minute
            
            start_time = datetime.now() - timedelta(minutes=lookback_minutes)
            
            request = StockBarsRequest(
                symbol_or_symbols=symbol,
                timeframe=tf,
                start=start_time,
            )
            
            bars = self.alpaca_data_client.get_stock_bars(request)
            
            if symbol not in bars:
                return []
            
            result = []
            for bar in bars[symbol]:
                result.append({
                    "timestamp": bar.timestamp,
                    "open": float(bar.open),
                    "high": float(bar.high),
                    "low": float(bar.low),
                    "close": float(bar.close),
                    "volume": bar.volume,
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Error getting historical bars for {symbol}: {e}")
            # Try fallback
            try:
                return await self._get_polygon_bars(symbol, timeframe, lookback_minutes)
            except:
                return []
    
    async def _get_polygon_bars(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int
    ) -> List[Dict[str, Any]]:
        """Fallback method to get bars from Polygon."""
        try:
            from_date = (datetime.now() - timedelta(minutes=lookback_minutes)).strftime("%Y-%m-%d")
            to_date = datetime.now().strftime("%Y-%m-%d")
            
            # Parse timeframe
            if timeframe == "1Min":
                multiplier, span = 1, "minute"
            elif timeframe == "5Min":
                multiplier, span = 5, "minute"
            else:
                multiplier, span = 1, "minute"
            
            aggs = list(self.polygon_client.list_aggs(
                ticker=symbol,
                multiplier=multiplier,
                timespan=span,
                from_=from_date,
                to=to_date,
                limit=5000
            ))
            
            result = []
            for agg in aggs:
                result.append({
                    "timestamp": datetime.fromtimestamp(agg.timestamp / 1000),
                    "open": float(agg.open),
                    "high": float(agg.high),
                    "low": float(agg.low),
                    "close": float(agg.close),
                    "volume": agg.volume,
                })
            
            return result
        
        except Exception as e:
            logger.error(f"Error getting Polygon bars for {symbol}: {e}")
            return []
    
    async def get_indicators(
        self, 
        symbol: str, 
        indicators: List[str]
    ) -> Dict[str, Any]:
        """
        Calculate technical indicators.
        
        Args:
            symbol: Stock symbol
            indicators: List of indicator names (e.g., ["MACD", "RSI"])
            
        Returns:
            Dictionary with indicator values
        """
        result = {}
        
        try:
            # Get bars for indicator calculation
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
        callback: Callable[[MarketData], None]
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
    
    async def build_market_data(self, symbol: str) -> MarketData:
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
            
            # Build MarketData object
            current_price = quote.get("price") or quote.get("ask", 0.0)
            
            return MarketData(
                symbol=symbol,
                price=current_price,
                timestamp=datetime.now(),
                bid=quote.get("bid"),
                ask=quote.get("ask"),
                bars=bars,
                indicators=indicators,
            )
        
        except Exception as e:
            logger.error(f"Error building market data for {symbol}: {e}")
            raise


