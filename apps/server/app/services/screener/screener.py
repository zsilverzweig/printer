"""Main screener service coordinating market data filtering and streaming."""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import deque
from datetime import datetime
from typing import Any, Deque, Dict, List, Optional, Set

from fastapi.encoders import jsonable_encoder
from polygon import RESTClient

from app import core
from app.services.market.history import load_history
from app.services.screener.screener_filters import (
    is_allowed_exchange,
    is_likely_etf,
    passes_price_filter,
    passes_volume_filter,
)
from app.services.screener.screener_price_history import PriceHistoryTracker
from app.services.screener.screener_snapshot import extract_snapshot_data, fetch_snapshot_all
from app.services.screener.screener_volume import VolumeCalculator
from app.types import ScreenerResult


# Global screener service instance for strategy engines to access
_global_screener_service: Optional['ScreenerService'] = None


def get_screener_service() -> Optional['ScreenerService']:
    """Get the global screener service instance."""
    return _global_screener_service


def set_screener_service(service: 'ScreenerService') -> None:
    """Set the global screener service instance."""
    global _global_screener_service
    _global_screener_service = service


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
        self.logger.info("ScreenerService starting; loading data from TimescaleDB…")
        # Initialize with TimescaleDB data
        await self._load_from_timescale()
        # Start periodic loop
        self.task = asyncio.create_task(self._loop())

    async def _load_from_timescale(self) -> None:
        """Load historical data from TimescaleDB on startup."""
        try:
            from app.services.screener.screener_volume import TimescaleVolumeCalculator
            from sqlalchemy import text
            from app.services.core.database import get_async_session
            from datetime import date, timedelta
            
            # Initialize TimescaleDB volume calculator
            ts_calc = TimescaleVolumeCalculator(lookback_days=30)
            
            # Get symbols with sufficient complete data
            symbols = await ts_calc.get_symbols_with_complete_data(min_days=14)
            self.logger.info(f"Found {len(symbols)} symbols with complete data")
            
            # Load yesterday's OHLCV for each symbol
            yesterday = date.today() - timedelta(days=1)
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        SELECT 
                            symbol,
                            open,
                            high,
                            low,
                            close,
                            volume
                        FROM market_data_daily
                        WHERE bucket::date = :yesterday
                          AND symbol = ANY(:symbols)
                    """),
                    {"yesterday": yesterday, "symbols": symbols}
                )
                
                for row in result:
                    symbol = row[0]
                    self.last_day_ohlc[symbol] = {
                        "o": float(row[1]),
                        "h": float(row[2]),
                        "l": float(row[3]),
                        "c": float(row[4]),
                        "v": float(row[5])
                    }
            
            # For backward compatibility, keep empty volume calculator
            self.volume_calculator = VolumeCalculator(self.volumes)
            
            self.logger.info(f"Loaded OHLCV for {len(self.last_day_ohlc)} symbols from TimescaleDB")
            
        except Exception as e:
            self.logger.error(f"Failed to load from TimescaleDB: {e}", exc_info=True)
            # Fallback to old method if TimescaleDB not available
            self.logger.warning("Falling back to Polygon grouped daily API")
            volumes, last_day_ohlc, _ = await asyncio.to_thread(
                load_history, core.API_KEY, 60, 14
            )
            self.volumes = volumes
            self.last_day_ohlc = last_day_ohlc
            self.volume_calculator = VolumeCalculator(self.volumes)

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
            self.logger.info("[SCREENER] Fetching market snapshots…")
            snaps = fetch_snapshot_all(core.API_KEY)
            self.logger.info("[SCREENER] Snapshots fetched: %s", len(snaps))
            print(f"[SCREENER DEBUG] Fetched {len(snaps)} snapshots")
            if snaps:
                print(f"[SCREENER DEBUG] First snapshot sample: {snaps[0] if len(snaps) > 0 else 'None'}")
            
            # Update price history for all tickers
            self._update_price_history(snaps, current_time)
            print(f"[SCREENER DEBUG] Last day OHLC count: {len(self.last_day_ohlc)}")
            
            
            # Use permissive defaults (no filters except ETF filter and exchange filter)
            payload = await self._compute(
                snaps,
                min_price=None,
                max_price=None,
                min_volume=None,
                min_change_percent=None,
                max_change_percent=None,
                order_by="rv14",
                limit=200,
                exclude_etfs=True,  # Default to excluding ETFs
                asset_types=None
            )
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
                    
                    # Use permissive defaults (no filters except ETF filter and exchange filter)
                    payload = await self._compute(
                        snaps,
                        min_price=None,
                        max_price=None,
                        min_volume=None,
                        min_change_percent=None,
                        max_change_percent=None,
                        order_by="rv14",
                        limit=200,
                        exclude_etfs=True,  # Default to excluding ETFs
                        asset_types=None
                    )
                else:
                    raise
            except Exception:
                self.logger.error("Failed to fetch/process snapshots: %s", e)
                payload = []
        
        self.cached_payload = payload
        # Wrap in message envelope for unified WebSocket
        msg = {
            "type": "screener_update",
            "data": jsonable_encoder(payload),
            "timestamp": int(time.time() * 1000)
        }
        self.logger.info(
            "Broadcasting payload to %s subscribers; payload_length=%s; first_3=%s",
            len(self.subscribers),
            len(payload),
            payload[:3] if payload else [],
        )
        print(f"[SCREENER DEBUG] Broadcasting to {len(self.subscribers)} subscribers:")
        print(f"  - Payload length: {len(payload)}")
        print(f"  - First item: {payload[0] if payload else 'None'}")
        print(f"  - Message type: screener_update")
        print(f"  - Data type: {type(payload)}")
        # Broadcast to subscribers with error handling and cleanup
        dead_connections = []
        for ws in list(self.subscribers):
            try:
                # Check if websocket is in a valid state before sending
                if hasattr(ws, 'client_state') and hasattr(ws, 'application_state'):
                    # FastAPI WebSocket has client_state and application_state
                    from starlette.websockets import WebSocketState
                    if ws.client_state != WebSocketState.CONNECTED or ws.application_state != WebSocketState.CONNECTED:
                        self.logger.debug("Removing disconnected websocket from screener subscribers")
                        dead_connections.append(ws)
                        continue
                
                # Send as JSON object for unified endpoint, text for legacy endpoints
                try:
                    await ws.send_json(msg)
                except (TypeError, AttributeError):
                    # Fallback to text for legacy endpoints
                    await ws.send_text(json.dumps(msg))
            except Exception as e:
                self.logger.warning("Failed to send to screener subscriber: %s", e)
                dead_connections.append(ws)
        
        # Clean up dead connections
        for ws in dead_connections:
            self.subscribers.discard(ws)

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

    async def _compute(
        self,
        snaps: List[Any],
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,  # Default to excluding ETFs
        asset_types: Optional[List[str]] = None,  # Filter by asset types (e.g., ["CS", "ETF"])
    ) -> List[dict]:
        """Compute filtered and sorted screener results from market snapshots.
        
        Args:
            snaps: List of market snapshots
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            min_volume: Minimum volume for liquidity
            min_change_percent: Minimum % change from yesterday's close
            order_by: Field to sort by (rv14 or avg_volume)
            limit: Maximum number of results to return
        
        Returns:
            List of screener result dictionaries
        """
        # Build price and volume maps from snapshots, and snapshot OHLC lookup
        price_map: Dict[str, float] = {}
        volume_map: Dict[str, float] = {}
        snapshot_ohlc_map: Dict[str, Dict[str, float]] = {}  # ticker -> OHLC data
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
            
            # Extract OHLC from snapshot 'day' field if available
            if isinstance(snapshot, dict) and "day" in snapshot:
                day_data = snapshot["day"]
                if isinstance(day_data, dict):
                    snapshot_ohlc_map[ticker] = {
                        "o": float(day_data.get("o", 0.0)),
                        "h": float(day_data.get("h", 0.0)),
                        "l": float(day_data.get("l", 0.0)),
                        "c": float(day_data.get("c", 0.0)),
                        "v": float(day_data.get("v", 0.0)),
                    }
        
        # Process stocks - use snapshot data directly if last_day_ohlc is empty
        rows: List[dict] = []
        print(f"[SCREENER DEBUG] _compute: Processing stocks")
        print(f"[SCREENER DEBUG] _compute: Price map has {len(price_map)} entries")
        print(f"[SCREENER DEBUG] _compute: snapshot_ohlc_map has {len(snapshot_ohlc_map)} entries")
        print(f"[SCREENER DEBUG] _compute: last_day_ohlc has {len(self.last_day_ohlc)} entries")
        print(f"[SCREENER DEBUG] _compute: Filters - min_price={min_price}, max_price={max_price}, min_volume={min_volume}, min_change_percent={min_change_percent}")
        
        processed_count = 0
        filtered_count = 0
        missing_price_count = 0
        
        # Build ticker set from either last_day_ohlc or price_map
        tickers_to_process = set(self.last_day_ohlc.keys()) if self.last_day_ohlc else set(price_map.keys())
        print(f"[SCREENER DEBUG] _compute: Processing {len(tickers_to_process)} tickers")
        
        for ticker in tickers_to_process:
            # Get OHLC data - prefer last_day_ohlc, fallback to snapshot
            if ticker in self.last_day_ohlc:
                ohlc = self.last_day_ohlc[ticker]
                yesterday_close = ohlc.get("c", 0.0)
                yesterday_vol = ohlc.get("v", 0.0)
                yesterday_open = ohlc.get("o", 0.0)
                yesterday_high = ohlc.get("h", 0.0)
                yesterday_low = ohlc.get("l", 0.0)
            elif ticker in snapshot_ohlc_map:
                # Use OHLC from snapshot
                ohlc = snapshot_ohlc_map[ticker]
                yesterday_close = ohlc.get("c", 0.0)
                yesterday_vol = ohlc.get("v", 0.0)
                yesterday_open = ohlc.get("o", 0.0)
                yesterday_high = ohlc.get("h", 0.0)
                yesterday_low = ohlc.get("l", 0.0)
            else:
                # Fallback: use current price as close if no day data
                current_price = price_map.get(ticker)
                if current_price is None:
                    missing_price_count += 1
                    continue
                yesterday_close = current_price
                yesterday_vol = volume_map.get(ticker, 0.0)
                yesterday_open = current_price
                yesterday_high = current_price
                yesterday_low = current_price
            
            # Get current price from snapshot
            current_price = price_map.get(ticker)
            if current_price is None:
                missing_price_count += 1
                continue
            
            processed_count += 1
            
            # Apply optional filters
            if min_price is not None or max_price is not None:
                filter_min = min_price if min_price is not None else 0.0
                filter_max = max_price if max_price is not None else float('inf')
                if not passes_price_filter(current_price, yesterday_close, filter_min, filter_max):
                    filtered_count += 1
                    continue
            
            if min_volume is not None:
                if not passes_volume_filter(yesterday_vol, min_volume):
                    filtered_count += 1
                    continue
            
            # Apply asset type filtering if specified
            if asset_types and len(asset_types) > 0:
                # For now, use ETF detection as fallback if asset type not available
                # TODO: Query TickerDetails for actual asset type when available
                ticker_type = None
                # Try to infer from ticker patterns if not in database
                if is_likely_etf(ticker):
                    ticker_type = "ETF"
                else:
                    # Assume common stock if not ETF-like
                    ticker_type = "CS"
                
                if ticker_type not in asset_types:
                    filtered_count += 1
                    continue
            elif exclude_etfs:
                # Fallback to ETF exclusion if no asset_types specified
                if is_likely_etf(ticker):
                    filtered_count += 1
                    continue
            
            # Calculate change percent before adding to rows
            change_close_pct = (
                ((current_price - yesterday_close) / yesterday_close) * 100
                if yesterday_close > 0
                else 0.0
            )
            
            # Filter by minimum change percent (only if specified)
            if min_change_percent is not None and abs(change_close_pct) < min_change_percent:
                filtered_count += 1
                continue
            
            # Filter by maximum change percent (if specified)
            if max_change_percent is not None and abs(change_close_pct) > max_change_percent:
                filtered_count += 1
                continue
            
            # Calculate relative volume (rv14) from TimescaleDB - non-blocking, use 0 if fails
            rv14 = 0.0
            try:
                from app.services.screener.screener_volume import TimescaleVolumeCalculator
                ts_calc = TimescaleVolumeCalculator(lookback_days=30)
                rv14 = await ts_calc.calculate_rv14(ticker)
            except (ValueError, Exception):
                # Data incomplete or error - just use 0, don't log or block
                pass
            
            # Calculate percentage changes for different timeframes
            changes = self.price_tracker.calculate_all_changes(ticker)
            
            rows.append({
                "ticker": ticker,
                "open": yesterday_open,
                "high": yesterday_high,
                "low": yesterday_low,
                "close": yesterday_close,
                "price": current_price,
                "today_vol": yesterday_vol,
                "volume": yesterday_vol,
                "rv": rv14,
                "rv14": rv14,
                "change_1m": changes["change_1m"],
                "change_5m": changes["change_5m"],
                "change_1h": changes["change_1h"],
                "change_close": change_close_pct,
                "change_close_pct": change_close_pct,
            })
        
        # Apply technical filters if provided
        if technical_filters:
            rows = await self._apply_technical_filters(rows, technical_filters)
        
        # Sort results
        sort_key = {
            "rv14": lambda x: x["rv14"],
            "avg_volume": lambda x: x["today_vol"],
            "change_close": lambda x: x.get("change_close", 0),
        }.get(order_by, lambda x: x["rv14"])
        rows.sort(key=sort_key, reverse=True)
        
        # Log filtering statistics
        self.logger.info(
            "Screener computed: processed=%s, missing_price=%s, filtered_by_exchange=%s, filtered_out=%s, final_rows=%s",
            processed_count,
            missing_price_count,
            filtered_by_exchange,
            filtered_count,
            len(rows),
        )
        print(f"[SCREENER DEBUG] Final results: {len(rows)} rows after filtering")
        print(f"[SCREENER DEBUG] Processed: {processed_count}, Missing price: {missing_price_count}, Filtered: {filtered_count}, Exchange filtered: {filtered_by_exchange}")
        
        return rows[:limit]
    
    async def compute_historical(
        self,
        timestamp: datetime,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,  # Default to excluding ETFs
        asset_types: Optional[List[str]] = None,  # Filter by asset types
    ) -> List[dict]:
        """Compute screener results at a specific historical timestamp.
        
        Args:
            timestamp: Historical datetime to screen at
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            min_volume: Minimum volume for liquidity
            min_change_percent: Minimum % change from yesterday's close
            max_change_percent: Maximum % change from yesterday's close
            order_by: Field to sort by (rv14, avg_volume, change_close)
            limit: Maximum number of results to return
            technical_filters: Optional dict of technical analysis filters
            exclude_etfs: Whether to exclude ETFs (default: True)
            
        Returns:
            List of screener result dictionaries
        """
        self.logger.info(f"[HISTORICAL SCREENER] Starting compute_historical at {timestamp}")
        print(f"[HISTORICAL SCREENER DEBUG] Starting compute_historical at {timestamp}")
        print(f"[HISTORICAL SCREENER DEBUG] Filters: min_price={min_price}, max_price={max_price}, min_volume={min_volume}, min_change_percent={min_change_percent}")
        
        from app.lib.market_queries import get_snapshot_at_time, get_daily_context
        from app.models.assets import TickerDetails
        from app.services.core.database import get_async_session
        from sqlalchemy import select
        
        try:
            # Get active symbols
            self.logger.info("[HISTORICAL SCREENER] Fetching active symbols")
            async with get_async_session() as session:
                result = await session.execute(
                    select(TickerDetails.symbol).where(
                        TickerDetails.type.in_(["CS", "ETF"]),
                        TickerDetails.active == True
                    )
                )
                all_symbols = [row[0] for row in result.all()]
            
            self.logger.info(f"[HISTORICAL SCREENER] Found {len(all_symbols)} active symbols")
            print(f"[HISTORICAL SCREENER DEBUG] Found {len(all_symbols)} active symbols")
            
            # Get snapshot at timestamp
            self.logger.info(f"[HISTORICAL SCREENER] Getting snapshot at {timestamp}")
            snapshot = await get_snapshot_at_time(timestamp, all_symbols)
            
            self.logger.info(f"[HISTORICAL SCREENER] Got snapshot with {len(snapshot)} symbols")
            print(f"[HISTORICAL SCREENER DEBUG] Got snapshot with {len(snapshot)} symbols")
            
            if not snapshot:
                self.logger.warning(f"[HISTORICAL SCREENER] No snapshot data found at {timestamp}")
                print(f"[HISTORICAL SCREENER DEBUG] No snapshot data found!")
                return []
            
            rows: List[dict] = []
            processed_count = 0
            filtered_count = 0
            missing_context_count = 0
            
            # Process each symbol
            for symbol, bar_data in snapshot.items():
                current_price = bar_data["close"]
                
                # Get daily context (yesterday's OHLC, 90-day high/low)
                context = await get_daily_context(symbol, timestamp)
                
                if not context.get("has_data"):
                    missing_context_count += 1
                    continue
                
                processed_count += 1
                
                yesterday = context["yesterday"]
                yesterday_close = yesterday["close"]
                yesterday_vol = yesterday["volume"]
                
                # Apply optional basic filters
                if min_price is not None or max_price is not None:
                    filter_min = min_price if min_price is not None else 0.0
                    filter_max = max_price if max_price is not None else float('inf')
                    if not passes_price_filter(current_price, yesterday_close, filter_min, filter_max):
                        filtered_count += 1
                        continue
                
                if min_volume is not None:
                    if not passes_volume_filter(yesterday_vol, min_volume):
                        filtered_count += 1
                        continue
                
                # Apply asset type filtering if specified
                if asset_types and len(asset_types) > 0:
                    # For now, use ETF detection as fallback if asset type not available
                    # TODO: Query TickerDetails for actual asset type when available
                    ticker_type = None
                    if is_likely_etf(symbol):
                        ticker_type = "ETF"
                    else:
                        ticker_type = "CS"
                    
                    if ticker_type not in asset_types:
                        filtered_count += 1
                        continue
                elif exclude_etfs:
                    # Fallback to ETF exclusion if no asset_types specified
                    if is_likely_etf(symbol):
                        filtered_count += 1
                        continue
                
                # Calculate change percent
                change_close_pct = (
                    ((current_price - yesterday_close) / yesterday_close) * 100
                    if yesterday_close > 0
                    else 0.0
                )
                
                if min_change_percent is not None and abs(change_close_pct) < min_change_percent:
                    filtered_count += 1
                    continue
                
                if max_change_percent is not None and abs(change_close_pct) > max_change_percent:
                    filtered_count += 1
                    continue
                
                # Calculate relative volume (rv14) at historical time
                rv14 = 0.0
                try:
                    from app.services.screener.screener_volume import TimescaleVolumeCalculator
                    ts_calc = TimescaleVolumeCalculator(lookback_days=30)
                    # Note: calculate_rv14 uses today's date - would need historical version
                    # For now, skip rv14 in historical mode
                    rv14 = 0.0
                except Exception as e:
                    self.logger.debug(f"Error calculating rv14 for {symbol}: {e}")
                
                # Build result row
                row = {
                    "ticker": symbol,
                    "open": yesterday["open"],
                    "high": yesterday["high"],
                    "low": yesterday["low"],
                    "close": yesterday_close,
                    "price": current_price,
                    "today_vol": yesterday_vol,
                    "rv": rv14,
                    "rv14": rv14,
                    "change_close": change_close_pct,
                    # Add context for technical analysis
                    "ninety_day_high": context.get("ninety_day_high"),
                    "ninety_day_low": context.get("ninety_day_low"),
                    # Get historical bars for technical analysis
                    "_historical_bars": await self._get_bars_for_technical_analysis(symbol, timestamp),
                }
                
                rows.append(row)
            
            # Apply technical filters if provided
            if technical_filters:
                rows = await self._apply_technical_filters(rows, technical_filters, is_historical=True)
            
            # Sort results
            sort_key = {
                "rv14": lambda x: x["rv14"],
                "avg_volume": lambda x: x["today_vol"],
                "change_close": lambda x: x.get("change_close", 0),
            }.get(order_by, lambda x: x["rv14"])
            rows.sort(key=sort_key, reverse=True)
            
            # Remove internal _historical_bars field before returning
            for row in rows:
                row.pop("_historical_bars", None)
            
            self.logger.info(
                f"[HISTORICAL SCREENER] Completed: processed={processed_count}, "
                f"missing_context={missing_context_count}, filtered={filtered_count}, "
                f"final_rows={len(rows)}"
            )
            print(f"[HISTORICAL SCREENER DEBUG] Final results: {len(rows)} rows")
            print(f"[HISTORICAL SCREENER DEBUG] Processed: {processed_count}, Missing context: {missing_context_count}, Filtered: {filtered_count}")
            
            return rows[:limit]
            
        except Exception as e:
            self.logger.error(f"[HISTORICAL SCREENER] Error computing historical screener: {e}", exc_info=True)
            print(f"[HISTORICAL SCREENER DEBUG] ERROR: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def _get_bars_for_technical_analysis(
        self,
        symbol: str,
        timestamp: datetime,
        lookback_bars: int = 30
    ) -> List[Dict[str, Any]]:
        """Get historical bars for technical analysis."""
        from app.lib.market_queries import get_historical_bars
        return await get_historical_bars(symbol, "5m", timestamp, lookback_bars)
    
    async def _apply_technical_filters(
        self,
        rows: List[dict],
        technical_filters: Dict[str, Any],
        is_historical: bool = False
    ) -> List[dict]:
        """Apply technical analysis filters to screener results.
        
        Args:
            rows: List of screener result dicts
            technical_filters: Dict of technical filter criteria
            is_historical: Whether we're in historical mode (affects bar retrieval)
            
        Returns:
            Filtered list of rows
        """
        from app.lib.technical_analysis import (
            find_swing_points,
            find_equal_levels,
            find_support_resistance,
            is_price_near_level,
        )
        
        filtered_rows = []
        
        for row in rows:
            symbol = row["ticker"]
            current_price = row["price"]
            
            # Get bars for technical analysis
            if is_historical:
                bars = row.get("_historical_bars", [])
            else:
                # For live mode, would need to track recent bars
                # For now, skip technical filters in live mode
                bars = []
            
            passed = True
            
            # Check relative volume
            if technical_filters.get("relative_volume_min"):
                min_rv = technical_filters["relative_volume_min"]
                if row.get("rv14", 0) < min_rv:
                    passed = False
            
            # Check 90-day high/low
            if technical_filters.get("above_90day_high") is True:
                ninety_high = row.get("ninety_day_high")
                if ninety_high is None or current_price <= ninety_high:
                    passed = False
            
            if technical_filters.get("below_90day_low") is True:
                ninety_low = row.get("ninety_day_low")
                if ninety_low is None or current_price >= ninety_low:
                    passed = False
            
            # Technical analysis requires bars
            if bars and len(bars) >= 10:
                # Find support/resistance levels
                sr_levels = find_support_resistance(bars, tolerance=0.01, min_touches=2)
                resistance_levels = sr_levels.get("resistance", [])
                support_levels = sr_levels.get("support", [])
                
                # Check near resistance
                if technical_filters.get("near_resistance") is True:
                    near_any = any(is_price_near_level(current_price, r, tolerance=0.005) for r in resistance_levels)
                    if not near_any:
                        passed = False
                
                # Check near support
                if technical_filters.get("near_support") is True:
                    near_any = any(is_price_near_level(current_price, s, tolerance=0.005) for s in support_levels)
                    if not near_any:
                        passed = False
                
                # Find swing points
                swing_highs = find_swing_points(bars, kind="high", lookback=2)
                swing_lows = find_swing_points(bars, kind="low", lookback=2)
                
                # Check for equal highs (double top)
                if technical_filters.get("has_equal_highs") is True:
                    equal_highs = find_equal_levels(swing_highs, tolerance=0.0006)
                    if equal_highs is None:
                        passed = False
                
                # Check for equal lows (double bottom)
                if technical_filters.get("has_equal_lows") is True:
                    equal_lows = find_equal_levels(swing_lows, tolerance=0.0006)
                    if equal_lows is None:
                        passed = False
            
            if passed:
                filtered_rows.append(row)
        
        return filtered_rows
