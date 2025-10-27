from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import time
from typing import Any, Dict, List, Set

from fastapi.encoders import jsonable_encoder
from polygon import RESTClient

from app import core
from app.types import NocStockData
from app.services.screener import ScreenerService


class NocService:
    """Network Operations Center service for real-time stock monitoring.
    
    Leverages ScreenerService for real price and volume data, then adds
    additional indicators (news sentiment, float, bull flags) and computes
    signal status (green/yellow/red) for each.
    """
    
    def __init__(self, client: RESTClient, screener_service: ScreenerService, interval_s: int = 10):
        self.logger = logging.getLogger("app.noc")
        self.client = client
        self.screener = screener_service
        self.interval_s = interval_s
        self.subscribers: Set[Any] = set()
        self.cached_payload: List[dict] = []
        self.task: asyncio.Task | None = None
        
        # Filter settings (configurable via REST API)
        self.timeframe: str = "close"  # "1m", "5m", "1h", "close"
        self.min_change_percent: float = 5.0  # Minimum % change to display

    async def start(self) -> None:
        self.logger.info("NocService starting; interval=%ss", self.interval_s)
        self.task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self.task:
            self.task.cancel()
            with contextlib.suppress(Exception):
                await self.task

    async def _loop(self) -> None:
        while True:
            await self._tick()
            await asyncio.sleep(self.interval_s)

    async def _tick(self) -> None:
        """Compute NOC data and broadcast to all subscribers."""
        if not core.API_KEY:
            self.logger.error("POLYGON_API_KEY not set; skipping tick")
            self.cached_payload = []
            return
        
        try:
            self.logger.debug("Computing NOC data from screener service")
            payload = await self._compute_noc_data()
            self.cached_payload = payload
            
            # Wrap in message envelope for unified WebSocket
            msg = json.dumps({
                "type": "noc_update",
                "data": jsonable_encoder(payload),
                "timestamp": int(time.time() * 1000)
            })
            self.logger.info(
                "Broadcasting NOC payload to %s subscribers; stocks=%s",
                len(self.subscribers),
                len(payload)
            )
            
            # Broadcast to subscribers with error handling and cleanup
            dead_connections = []
            for ws in list(self.subscribers):
                try:
                    # Check if websocket is in a valid state before sending
                    if hasattr(ws, 'client_state') and hasattr(ws, 'application_state'):
                        # FastAPI WebSocket has client_state and application_state
                        from starlette.websockets import WebSocketState
                        if ws.client_state != WebSocketState.CONNECTED or ws.application_state != WebSocketState.CONNECTED:
                            self.logger.debug("Removing disconnected websocket from NOC subscribers")
                            dead_connections.append(ws)
                            continue
                    
                    await ws.send_text(msg)
                except Exception as e:
                    self.logger.warning("Failed to send to NOC subscriber: %s", e)
                    dead_connections.append(ws)
            
            # Clean up dead connections
            for ws in dead_connections:
                self.subscribers.discard(ws)
        except Exception as e:
            self.logger.error("Failed to compute/broadcast NOC data: %s", e, exc_info=True)

    async def _compute_noc_data(self) -> List[dict]:
        """Compute NOC data using screener service data.
        
        Uses real data from ScreenerService:
        - Real-time prices from Polygon snapshots
        - Calculated % change based on selected timeframe
        - Real relative volume metrics
        
        Strategy:
        - Process all available stocks
        - Sort by absolute % change for selected timeframe
        - Return top 25-50 stocks (most volatile for the timeframe)
        - Minimum 50k volume for adequate liquidity
        
        Returns up to 50 stocks, guaranteeing at least 25 if available.
        
        TODO for production:
        - Run AI sentiment analysis on news
        - Detect bull flag patterns
        - Get float data from company info
        """
        candidates: List[dict] = []
        
        # Get screener data (already has real prices and RV)
        screener_data = self.screener.cached_payload
        
        if not screener_data:
            self.logger.warning("No screener data available, returning empty NOC data")
            return []
        
        # Process all screener data
        for stock in screener_data:
            try:
                # Get the change % for the selected timeframe
                change_pct = self._get_change_for_timeframe(stock)
                
                # Skip stocks without valid change data
                if change_pct is None:
                    continue
                
                # Filter: minimum 50,000 volume for adequate liquidity
                volume = stock.get("today_vol", 0)
                if volume < 50000:
                    continue
                
                stock_data = self._convert_screener_to_noc(stock)
                
                # Update the stock data with the selected timeframe's change
                stock_data["changePercent"] = round(change_pct, 2)
                
                candidates.append(stock_data)
                        
            except Exception as e:
                self.logger.warning("Failed to convert screener data for %s: %s", stock.get("ticker"), e)
        
        # Sort by absolute % change (highest volatility first)
        candidates.sort(key=lambda x: abs(x["changePercent"]), reverse=True)
        
        # Take top 50 (or all if fewer)
        results = candidates[:50]
        
        self.logger.debug(
            "NOC computed: %d stocks (sorted by %s timeframe change, min 50k volume)",
            len(results),
            self.timeframe
        )
        
        return results
    
    def _get_change_for_timeframe(self, stock: dict) -> float | None:
        """Get the % change for the currently selected timeframe."""
        timeframe_map = {
            "1m": "change_1m",
            "5m": "change_5m",
            "1h": "change_1h",
            "close": "change_close",
        }
        
        field = timeframe_map.get(self.timeframe, "change_close")
        return stock.get(field)

    def _convert_screener_to_noc(self, screener_stock: dict) -> dict:
        """Convert screener data to NOC format with additional indicators.
        
        Args:
            screener_stock: Screener result with keys:
                - ticker, price, close (yesterday), rv14, rv30, rv60, etc.
        
        Returns:
            NOC stock data with raw values (client will calculate signal colors)
        """
        ticker = screener_stock["ticker"]
        price = screener_stock["price"]
        yesterday_close = screener_stock["close"]
        rv = screener_stock.get("rv14", 0.0)
        
        # Calculate real % change from yesterday's close to current price
        change_pct = ((price - yesterday_close) / yesterday_close * 100) if yesterday_close else 0.0
        
        # TODO: Replace with real data sources
        # For now, mock these indicators
        news_signal = self._mock_news_signal(ticker, change_pct)
        bull_flag = self._mock_bull_flag_bool(ticker, change_pct)
        
        # Mock sentiment based on change
        sentiment_map = {
            "green": "Positive",
            "yellow": "Neutral",
            "red": "Negative"
        }
        
        # Mock float data (TODO: fetch from company info API)
        float_value = f"{random.uniform(1.0, 15.0):.1f}B"
        
        return {
            "ticker": ticker,
            "price": round(price, 2),
            "changePercent": round(change_pct, 2),
            "relativeVolume": round(rv, 2),
            "newsSentiment": sentiment_map[news_signal],
            "float": float_value,
            "bullFlag": bull_flag,
        }
    
    def _mock_news_signal(self, ticker: str, change_pct: float) -> str:
        """Mock news signal - TODO: Replace with AI sentiment analysis."""
        # Correlate somewhat with price movement for realism
        if change_pct > 3:
            return random.choice(["green", "green", "yellow"])
        elif change_pct > 0:
            return random.choice(["green", "yellow", "yellow"])
        else:
            return random.choice(["yellow", "red", "red"])
    
    def _mock_float_signal(self, ticker: str) -> str:
        """Mock float signal - TODO: Replace with real float data."""
        # Most stocks should have acceptable float
        return random.choice(["green", "green", "yellow"])
    
    def _mock_bull_flag_bool(self, ticker: str, change_pct: float) -> bool:
        """Mock bull flag detection - TODO: Implement pattern recognition."""
        # Correlate with positive price action
        if change_pct > 2:
            return random.choice([True, True, False])
        else:
            return random.choice([True, False, False])


