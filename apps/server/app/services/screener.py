"""Main screener service coordinating market data filtering and streaming."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import deque
from typing import Any, Deque, Dict, List, Set

from fastapi.encoders import jsonable_encoder
from polygon import RESTClient

from app import core
from app.services.history import load_history
from app.services.screener_filters import (
    is_allowed_exchange,
    is_likely_etf,
    passes_price_filter,
    passes_volume_filter,
)
from app.services.screener_price_history import PriceHistoryTracker
from app.services.screener_snapshot import extract_snapshot_data, fetch_snapshot_all
from app.services.screener_volume import VolumeCalculator
from app.types import ScreenerResult


class ScreenerService:
    """Orchestrates screener functionality: fetching snapshots, filtering, and streaming results."""

    def __init__(self, client: RESTClient, interval_s: int = 5):
        """Initialize the screener service.
        
        Args:
            client: Polygon REST client
            interval_s: Seconds between market snapshot updates
        """
        self.logger = logging.getLogger("app.screener")
        self.client = client
        self.interval_s = interval_s
        
        # Historical volume data for relative volume calculations
        self.volumes: Dict[str, Deque[float]] = {}
        self.last_day_ohlc: Dict[str, Dict[str, float]] = {}
        
        # Price history tracking for % change calculations
        self.price_tracker = PriceHistoryTracker()
        
        # Volume calculator (initialized after loading historical data)
        self.volume_calculator: VolumeCalculator | None = None
        
        # WebSocket subscribers and cached results
        self.subscribers: Set[Any] = set()
        self.cached_payload: List[dict] = []
        self.task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the screener service and begin periodic updates without blocking."""
        self.logger.info("ScreenerService starting; scheduling background history load…")
        # Initialize calculator with empty data so _compute can run immediately
        self.volume_calculator = VolumeCalculator(self.volumes)
        # Start periodic loop right away
        self.task = asyncio.create_task(self._loop())
        # Kick off history loading in the background (non-blocking)
        asyncio.create_task(self._load_history_background())

    async def _load_history_background(self) -> None:
        """Load historical data in a background task to avoid blocking startup."""
        try:
            # Run blocking history load in a thread to avoid blocking the event loop
            volumes, last_day_ohlc, _ = await asyncio.to_thread(
                load_history, core.API_KEY, 60, 14
            )
            self.volumes = volumes
            self.last_day_ohlc = last_day_ohlc
            self.volume_calculator = VolumeCalculator(self.volumes)
            self.logger.info("ScreenerService history loaded in background (%s tickers)", len(self.volumes))
        except Exception as e:
            self.logger.error("Failed to load history in background: %s", e)

    async def stop(self) -> None:
        """Stop the screener service."""
        if self.task:
            self.task.cancel()
            with contextlib.suppress(Exception):
                await self.task

    async def _loop(self) -> None:
        """Main loop that periodically fetches and broadcasts market data."""
        while True:
            await self._tick()
            await asyncio.sleep(self.interval_s)

    async def _tick(self) -> None:
        """Fetch current market snapshot, compute filtered results, and broadcast to subscribers."""
        if not core.API_KEY:
            self.logger.error("POLYGON_API_KEY not set; skipping tick")
            self.cached_payload = []
            return
        
        try:
            import time
            current_time = time.time()
            # self.logger.info("Fetching market snapshots…")
            snaps = fetch_snapshot_all(core.API_KEY)
            # self.logger.info("Snapshots fetched: %s", len(snaps))
            
            # Update price history for all tickers
            self._update_price_history(snaps, current_time)
            
            payload = self._compute(snaps)
        except Exception as e:
            # Fallback to client method if available
            try:
                if hasattr(self.client, "list_snapshot_all_tickers"):
                    import time
                    current_time = time.time()
                    self.logger.info("Falling back to client.list_snapshot_all_tickers()…")
                    snaps = list(self.client.list_snapshot_all_tickers())
                    self.logger.info("Snapshots fetched (fallback): %s", len(snaps))
                    
                    # Update price history for all tickers
                    self._update_price_history(snaps, current_time)
                    
                    payload = self._compute(snaps)
                else:
                    raise
            except Exception:
                self.logger.error("Failed to fetch/process snapshots: %s", e)
                payload = []
        
        self.cached_payload = payload
        msg = json.dumps(jsonable_encoder(payload))
        self.logger.debug(
            "Broadcasting payload to %s subscribers; top=%s",
            len(self.subscribers),
            len(payload),
        )
        await asyncio.gather(
            *(ws.send_text(msg) for ws in list(self.subscribers)),
            return_exceptions=True,
        )

    def _update_price_history(self, snaps: List[Any], current_time: float) -> None:
        """Update price history tracker with latest snapshot data.
        
        Args:
            snaps: List of market snapshots
            current_time: Current timestamp in seconds
        """
        for snapshot in snaps:
            data = extract_snapshot_data(snapshot)
            ticker = data["ticker"]
            price = data["price"]
            
            if ticker and price is not None:
                try:
                    self.price_tracker.update_price(ticker, current_time, float(price))
                except Exception:
                    pass

    def _compute(
        self,
        snaps: List[Any],
        min_price: float = 2.0,
        max_price: float = 20.0,
        order_by: str = "rv14",
        limit: int = 200,
    ) -> List[dict]:
        """Compute filtered and sorted screener results from market snapshots.
        
        Args:
            snaps: List of market snapshots
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            order_by: Field to sort by (rv14, rv30, rv60, avg_volume)
            limit: Maximum number of results to return
        
        Returns:
            List of screener result dictionaries
        """
        # Build price and volume maps from snapshots
        price_map: Dict[str, float] = {}
        volume_map: Dict[str, float] = {}
        filtered_by_exchange = 0
        
        # Debug: log structure of first snapshot
        if snaps and self.logger.isEnabledFor(logging.DEBUG):
            self.logger.debug(
                "First snapshot structure: %s", snaps[0] if len(snaps) > 0 else "empty"
            )
        
        for snapshot in snaps:
            data = extract_snapshot_data(snapshot)
            ticker = data["ticker"]
            price = data["price"]
            volume = data["volume"]
            exchange = data["exchange"]
            
            if not ticker:
                continue
            
            # Apply exchange filter
            if not is_allowed_exchange(exchange):
                filtered_by_exchange += 1
                continue
            
            # Store price and volume
            if price is not None:
                try:
                    price_map[ticker] = float(price)
                except Exception:
                    pass
            
            if volume is not None:
                try:
                    volume_map[ticker] = float(volume)
                except Exception:
                    pass
        
        # Process stocks with historical OHLC data
        rows: List[dict] = []
        for ticker in self.last_day_ohlc:
            ohlc = self.last_day_ohlc[ticker]
            yesterday_close = ohlc.get("c", 0.0)
            yesterday_vol = ohlc.get("v", 0.0)
            
            # Get current price from snapshot
            current_price = price_map.get(ticker)
            if current_price is None:
                continue
            
            # Apply filters
            if not passes_price_filter(current_price, yesterday_close, min_price, max_price):
                continue
            
            if not passes_volume_filter(yesterday_vol):
                continue
            
            if is_likely_etf(ticker):
                continue
            
            # Calculate relative volumes
            if self.volume_calculator:
                rv14 = self.volume_calculator.calculate_relative_volume(ticker, 14)
                rv30 = self.volume_calculator.calculate_relative_volume(ticker, 30)
                rv60 = self.volume_calculator.calculate_relative_volume(ticker, 60)
            else:
                rv14 = rv30 = rv60 = 0.0
            
            # Calculate percentage changes for different timeframes
            changes = self.price_tracker.calculate_all_changes(ticker)
            change_close = (
                ((current_price - yesterday_close) / yesterday_close) * 100
                if yesterday_close > 0
                else 0.0
            )
            
            rows.append({
                "ticker": ticker,
                "open": ohlc.get("o", 0.0),
                "high": ohlc.get("h", 0.0),
                "low": ohlc.get("l", 0.0),
                "close": yesterday_close,
                "price": current_price,
                "today_vol": yesterday_vol,
                "rv": rv14,
                "rv14": rv14,
                "rv30": rv30,
                "rv60": rv60,
                "change_1m": changes["change_1m"],
                "change_5m": changes["change_5m"],
                "change_1h": changes["change_1h"],
                "change_close": change_close,
            })
        
        # Sort results
        sort_key = {
            "rv14": lambda x: x["rv14"],
            "rv30": lambda x: x["rv30"],
            "rv60": lambda x: x["rv60"],
            "avg_volume": lambda x: x["today_vol"],
        }.get(order_by, lambda x: x["rv14"])
        rows.sort(key=sort_key, reverse=True)
        
        # Log filtering statistics
        self.logger.debug(
            "Screener filtering: %d stocks filtered by exchange (kept: NASDAQ, NYSE, NYSE Arca, NYSE American)",
            filtered_by_exchange,
        )
        
        return rows[:limit]
