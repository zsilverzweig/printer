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
from app.services.screener.screener import ScreenerService


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
        
        # Screener configuration
        self.screener_criteria_id: str | None = None  # Optional saved screener to use

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

    async def _run_saved_screener(self, criteria_id: str) -> List[dict]:
        """Run a saved screener configuration and return the results.
        
        Args:
            criteria_id: UUID of the saved screening criteria
            
        Returns:
            List of screener results
        """
        try:
            from app.models.strategies import ScreeningCriteria
            from app.services.core.database import get_async_session
            from sqlalchemy import select
            
            # Fetch the screening criteria from database
            async with get_async_session() as session:
                result = await session.execute(
                    select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
                )
                criteria = result.scalar_one_or_none()
                
                if not criteria:
                    self.logger.warning(f"Screener criteria {criteria_id} not found, using default")
                    return self.screener.cached_payload
            
            # Extract filter parameters from saved criteria
            params = criteria.criteria
            min_price = params.get("min_price")
            max_price = params.get("max_price")
            min_volume = params.get("min_volume")
            min_change_percent = params.get("min_change_percent")
            max_change_percent = params.get("max_change_percent")
            exclude_etfs = params.get("exclude_etfs", True)
            asset_types = params.get("asset_types")
            order_by = params.get("order_by", "rv14")
            limit = params.get("limit", 200)
            technical_filters = params.get("technical_filters")
            
            # Fetch latest market data
            snaps = await self.screener.data_loader.fetch_latest_from_timescale()
            
            if not snaps:
                self.logger.warning("No market data available for saved screener")
                return []
            
            # Run screener computation with saved criteria
            results = await self.screener.compute.compute(
                snaps,
                min_price=min_price,
                max_price=max_price,
                min_volume=min_volume,
                min_change_percent=min_change_percent,
                max_change_percent=max_change_percent,
                order_by=order_by,
                limit=limit,
                technical_filters=technical_filters,
                exclude_etfs=exclude_etfs,
                asset_types=asset_types,
            )
            
            self.logger.info(f"Saved screener '{criteria.name}' returned {len(results)} stocks")
            return results
            
        except Exception as e:
            self.logger.error(f"Failed to run saved screener {criteria_id}: {e}", exc_info=True)
            # Fall back to default screener data
            return self.screener.cached_payload
    
    async def _compute_noc_data(self) -> List[dict]:
        """Compute NOC data using screener service data.
        
        Uses real data from ScreenerService:
        - Real-time prices from Polygon snapshots
        - Calculated % change based on selected timeframe
        - Real relative volume metrics
        
        Strategy:
        - If screener_criteria_id is set, run that saved screener
        - Otherwise, use default screener data from service
        - Sort by absolute % change for selected timeframe
        - Return top 50 stocks (most volatile for the timeframe)
        - Minimum 50k volume for adequate liquidity
        
        Returns up to 50 stocks, guaranteeing at least 25 if available.
        
        TODO for production:
        - Run AI sentiment analysis on news
        - Detect bull flag patterns
        - Get float data from company info
        """
        candidates: List[dict] = []
        
        # Get screener data - either from saved screener or default
        if self.screener_criteria_id:
            screener_data = await self._run_saved_screener(self.screener_criteria_id)
        else:
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


