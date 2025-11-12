"""
Snapshot ingestion service for real-time market data.

Fetches Polygon snapshots every 5 seconds to:
1. Fill gaps in minute bar data (from snapshot's 'min' field)
2. Store latest trade prices for real-time pricing
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from app.models.market_data import MarketData, MarketLatestTrade
from app.services.core.database import get_async_session
from app.services.screener.screener_snapshot import fetch_snapshot_all

logger = logging.getLogger("app.snapshot_ingestion")


class SnapshotMetrics:
    """Tracks snapshot ingestion performance metrics."""
    
    def __init__(self):
        self.snapshots_processed = 0
        self.minute_bars_inserted = 0
        self.trades_updated = 0
        self.batches_processed = 0
        self.errors = 0
        self.last_fetch_time: Optional[datetime] = None
        self.started_at: Optional[datetime] = None
    
    def reset(self):
        """Reset all metrics."""
        self.snapshots_processed = 0
        self.minute_bars_inserted = 0
        self.trades_updated = 0
        self.batches_processed = 0
        self.errors = 0
        self.last_fetch_time = None
        self.started_at = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict:
        """Export metrics as dictionary."""
        now = datetime.now(timezone.utc)
        uptime_seconds = (now - self.started_at).total_seconds() if self.started_at else 0
        
        return {
            "snapshots_processed": self.snapshots_processed,
            "minute_bars_inserted": self.minute_bars_inserted,
            "trades_updated": self.trades_updated,
            "batches_processed": self.batches_processed,
            "errors": self.errors,
            "last_fetch_time": self.last_fetch_time.isoformat() if self.last_fetch_time else None,
            "uptime_seconds": uptime_seconds,
        }


class SnapshotIngestionService:
    """
    Service that ingests Polygon snapshots for real-time market data.
    
    Fetches snapshots every 5 seconds and:
    - Extracts minute bars from 'min' field, inserts if not exists (gap filling)
    - Extracts latest trade data, upserts to market_latest_trades table
    """
    
    def __init__(
        self,
        api_key: str,
        fetch_interval_seconds: int = 5
    ):
        """
        Initialize snapshot ingestion service.
        
        Args:
            api_key: Polygon API key
            fetch_interval_seconds: How often to fetch snapshots (default 5s)
        """
        self.api_key = api_key
        self.fetch_interval_seconds = fetch_interval_seconds
        
        # Metrics
        self.metrics = SnapshotMetrics()
        
        # State
        self.is_running = False
        self.should_stop = False
        self._missing_last_trade_warnings = 0
        self._missing_last_trade_fields_warnings = 0
        self._logged_trade_sample = False
        
        # Background task
        self.fetch_task: Optional[asyncio.Task] = None
    
    async def start(self) -> None:
        """Start the snapshot ingestion service."""
        if self.is_running:
            logger.warning("Snapshot ingestion service already running")
            return
        
        # Start silently
        self.is_running = True
        self.should_stop = False
        self.metrics.reset()
        
        # Start fetch loop
        self.fetch_task = asyncio.create_task(self._fetch_loop())
    
    async def stop(self) -> None:
        """Stop the snapshot ingestion service."""
        if not self.is_running:
            return
        
        logger.info("Stopping snapshot ingestion service")
        self.should_stop = True
        
        # Cancel task
        if self.fetch_task:
            self.fetch_task.cancel()
            try:
                await self.fetch_task
            except asyncio.CancelledError:
                pass
        
        self.is_running = False
        logger.info("Snapshot ingestion service stopped")
    
    def get_metrics(self) -> Dict:
        """Get current ingestion metrics."""
        return self.metrics.to_dict()
    
    async def _fetch_loop(self) -> None:
        """Main loop that periodically fetches snapshots."""
        while not self.should_stop:
            try:
                await self._fetch_and_process()
                await asyncio.sleep(self.fetch_interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in snapshot fetch loop: {e}", exc_info=True)
                self.metrics.errors += 1
                await asyncio.sleep(self.fetch_interval_seconds)
    
    async def _fetch_and_process(self) -> None:
        """Fetch snapshots and process them."""
        try:
            # Fetch snapshots from Polygon (runs in thread pool since it's synchronous)
            snapshots = await asyncio.to_thread(fetch_snapshot_all, self.api_key)
            snapshot_count = len(snapshots or [])
            logger.debug("Snapshot ingestion fetched %d snapshots", snapshot_count)
            
            if not snapshots:
                logger.warning("No snapshots returned from Polygon API")
                return
            
            self.metrics.last_fetch_time = datetime.now(timezone.utc)
            self.metrics.snapshots_processed += len(snapshots)
            
            # Process snapshots into minute bars and latest trades
            minute_bars = []
            latest_trades = []
            
            for snapshot in snapshots:
                # Extract minute bar if available
                min_bar = self._extract_minute_bar(snapshot)
                if min_bar:
                    minute_bars.append(min_bar)
                
                # Extract latest trade
                latest_trade = self._extract_latest_trade(snapshot)
                if latest_trade:
                    latest_trades.append(latest_trade)
            if latest_trades and not self._logged_trade_sample:
                logger.debug(
                    "Sample extracted trades: %s",
                    [
                        {
                            "symbol": lt["symbol"],
                            "price": lt["price"],
                            "timestamp": lt["timestamp"],
                        }
                        for lt in latest_trades[:3]
                    ],
                )
                self._logged_trade_sample = True
            
            # Batch insert minute bars (only if they don't exist)
            if minute_bars:
                await self._insert_minute_bars(minute_bars)
            else:
                logger.debug("Snapshot ingestion extracted 0 minute bars from %d snapshots", snapshot_count)
            
            # Batch upsert latest trades
            if latest_trades:
                await self._upsert_latest_trades(latest_trades)
            else:
                logger.debug("Snapshot ingestion extracted 0 latest trades from %d snapshots", snapshot_count)
            
            self.metrics.batches_processed += 1
            logger.debug(
                f"Processed {len(snapshots)} snapshots: "
                f"{len(minute_bars)} bars, {len(latest_trades)} trades"
            )
            
        except Exception as e:
            logger.error(f"Error fetching/processing snapshots: {e}", exc_info=True)
            self.metrics.errors += 1
    
    def _extract_minute_bar(self, snapshot: dict) -> Optional[dict]:
        """
        Extract minute bar data from snapshot's 'min' field.
        
        Returns dict with: time, symbol, open, high, low, close, volume, vwap, trade_count
        """
        try:
            ticker = snapshot.get("ticker")
            min_data = snapshot.get("min")
            
            if not ticker or not min_data:
                return None
            
            # Extract fields from min data
            # Polygon snapshot min structure: {c, h, l, o, t, v, vw, n}
            timestamp = min_data.get("t")
            if not timestamp:
                return None
            
            # Convert milliseconds to datetime
            dt = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
            
            return {
                "time": dt,
                "symbol": ticker,
                "open": float(min_data.get("o", 0)),
                "high": float(min_data.get("h", 0)),
                "low": float(min_data.get("l", 0)),
                "close": float(min_data.get("c", 0)),
                "volume": int(min_data.get("v", 0)),
                "vwap": float(min_data.get("vw")) if min_data.get("vw") else None,
                "trade_count": int(min_data.get("n")) if min_data.get("n") else None,
                "session_type": "regular",  # TODO: Detect session type
                "timescale": "1min"
            }
        except Exception as e:
            logger.debug(f"Error extracting minute bar from snapshot: {e}")
            return None
    
    def _extract_latest_trade(self, snapshot: dict) -> Optional[dict]:
        """
        Extract latest trade data from snapshot's 'lastTrade' field.
        
        Returns dict with: symbol, price, timestamp, size, exchange, conditions
        """
        try:
            ticker = snapshot.get("ticker")
            last_trade = snapshot.get("lastTrade")
            
            if not ticker or not last_trade:
                self._missing_last_trade_warnings += 1
                if self._missing_last_trade_warnings <= 5:
                    logger.warning(
                        "Snapshot missing lastTrade data for %s (ticker=%s)",
                        "unknown" if not ticker else "provided",
                        ticker,
                    )
                return None
            
            # Extract fields from last trade
            # Polygon lastTrade structure: {p, s, t, x, c}
            price = last_trade.get("p")
            timestamp_raw = last_trade.get("t")
            
            if price is None or timestamp_raw is None:
                self._missing_last_trade_fields_warnings += 1
                if self._missing_last_trade_fields_warnings <= 5:
                    logger.warning(
                        "Snapshot lastTrade missing price/timestamp for %s: %s",
                        ticker,
                        last_trade,
                    )
                return None
            
            if price == 0:
                return None

            # Polygon returns nanosecond timestamps; fall back to micro/milli if already smaller.
            if timestamp_raw > 1_000_000_000_000:  # nanoseconds
                timestamp_seconds = timestamp_raw / 1_000_000_000
            elif timestamp_raw > 1_000_000:  # microseconds
                timestamp_seconds = timestamp_raw / 1_000_000
            else:
                timestamp_seconds = timestamp_raw / 1000

            try:
                dt = datetime.fromtimestamp(timestamp_seconds, tz=timezone.utc)
            except Exception as exc:
                logger.warning(
                    "Snapshot lastTrade timestamp conversion failed for %s (raw=%s): %s",
                    ticker,
                    timestamp_raw,
                    exc,
                )
                return None
            
            # Get conditions as comma-separated string if present
            conditions = last_trade.get("c")
            conditions_str = ",".join(map(str, conditions)) if conditions else None
            
            exchange_code = last_trade.get("x")
            exchange_value = str(exchange_code) if exchange_code is not None else None
            
            day_data = snapshot.get("day") or {}
            day_volume_raw = None
            if isinstance(day_data, dict):
                day_volume_raw = day_data.get("volume")
                if day_volume_raw is None:
                    day_volume_raw = day_data.get("v")
            day_volume = None
            if day_volume_raw is not None:
                try:
                    day_volume = int(day_volume_raw)
                except (TypeError, ValueError):
                    day_volume = None
            
            return {
                "symbol": ticker,
                "price": float(price),
                "timestamp": dt,
                "size": int(last_trade.get("s")) if last_trade.get("s") else None,
                "exchange": exchange_value,
                "conditions": conditions_str,
                "day_volume": day_volume,
                "updated_at": datetime.now(timezone.utc)
            }
        except Exception as e:
            logger.debug(f"Error extracting latest trade from snapshot: {e}")
            return None
    
    async def _insert_minute_bars(self, bars: List[dict]) -> None:
        """
        Batch insert minute bars into market_data table.
        Only inserts if the (time, symbol, timescale) combination doesn't exist.
        
        DEADLOCK PREVENTION:
        - Sorts bars by (time, symbol, timescale) before insertion to ensure consistent lock ordering
        - Implements exponential backoff retry for deadlock detection errors
        
        Note: PostgreSQL has a limit of 32767 parameters per query.
        With 11 columns per row, we can insert ~2900 rows per batch.
        We use 1000 rows per batch for safety.
        """
        if not bars:
            return
        
        # CRITICAL: Sort bars by (time, symbol, timescale) to ensure consistent lock acquisition order
        # This prevents deadlocks when multiple processes insert overlapping data
        bars = sorted(bars, key=lambda b: (b.get("time"), b.get("symbol"), b.get("timescale")))
        
        # Batch size: 1000 rows per insert (11 columns = 11,000 parameters, well under 32,767 limit)
        BATCH_SIZE = 1000
        total_inserted = 0
        
        # Deadlock retry configuration
        MAX_RETRIES = 3
        INITIAL_BACKOFF = 0.1  # 100ms
        
        try:
            for i in range(0, len(bars), BATCH_SIZE):
                batch = bars[i:i + BATCH_SIZE]
                
                for retry_attempt in range(MAX_RETRIES):
                    try:
                        async with get_async_session() as session:
                            # Use PostgreSQL INSERT ... ON CONFLICT DO NOTHING
                            stmt = insert(MarketData).values(batch)
                            stmt = stmt.on_conflict_do_nothing(
                                index_elements=['time', 'symbol', 'timescale']
                            )
                            
                            result = await session.execute(stmt)
                            await session.commit()
                            
                            inserted = result.rowcount
                            total_inserted += inserted
                        
                        # Success - break out of retry loop
                        break
                        
                    except Exception as e:
                        # Check if this is a deadlock error (psycopg error code 40P01)
                        error_msg = str(e).lower()
                        is_deadlock = "deadlock detected" in error_msg or "40p01" in error_msg
                        
                        if is_deadlock and retry_attempt < MAX_RETRIES - 1:
                            # Exponential backoff: 100ms, 200ms, 400ms
                            backoff_time = INITIAL_BACKOFF * (2 ** retry_attempt)
                            logger.warning(
                                f"⚠️  Deadlock detected on attempt {retry_attempt + 1}/{MAX_RETRIES}, "
                                f"retrying in {backoff_time:.1f}s..."
                            )
                            await asyncio.sleep(backoff_time)
                            continue
                        else:
                            # Not a deadlock or out of retries
                            logger.error(f"Error inserting minute bars after {retry_attempt + 1} attempts: {e}", exc_info=True)
                            self.metrics.errors += 1
                            raise
            
            self.metrics.minute_bars_inserted += total_inserted
            
            if total_inserted > 0:
                logger.debug(f"Inserted {total_inserted} minute bars from snapshots (gap filling)")
                
        except Exception as e:
            logger.error(f"Error inserting minute bars: {e}", exc_info=True)
            self.metrics.errors += 1
    
    async def _upsert_latest_trades(self, trades: List[dict]) -> None:
        """
        Batch upsert latest trades into market_latest_trades table.
        Updates existing rows or inserts new ones.
        
        Note: PostgreSQL has a limit of 32767 parameters per query.
        With 7 columns per row, we can upsert ~4600 rows per batch.
        We use 2000 rows per batch for safety.
        
        DEDUPLICATION:
        - Removes duplicate trades for the same symbol within the batch
        - Keeps the last occurrence (most recent data)
        - Prevents "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        """
        if not trades:
            logger.info("Snapshot ingestion received empty latest trade batch to upsert")
            return
        
        # Deduplicate trades by symbol - keep the last occurrence
        seen_symbols = {}
        for trade in trades:
            symbol = trade['symbol']
            seen_symbols[symbol] = trade
        
        trades = list(seen_symbols.values())
        
        if not trades:
            return
        
        # Batch size: 2000 rows per upsert (8 columns = 16,000 parameters, well under 32,767 limit)
        BATCH_SIZE = 2000
        total_updated = 0
        
        try:
            for i in range(0, len(trades), BATCH_SIZE):
                batch = trades[i:i + BATCH_SIZE]
                
                async with get_async_session() as session:
                    # Use PostgreSQL INSERT ... ON CONFLICT DO UPDATE
                    stmt = insert(MarketLatestTrade).values(batch)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=['symbol'],
                        set_={
                            'price': stmt.excluded.price,
                            'timestamp': stmt.excluded.timestamp,
                            'size': stmt.excluded.size,
                            'exchange': stmt.excluded.exchange,
                            'conditions': stmt.excluded.conditions,
                            'day_volume': stmt.excluded.day_volume,
                            'updated_at': stmt.excluded.updated_at
                        }
                    )
                    
                    result = await session.execute(stmt)
                    await session.commit()
                    
                    if not self._logged_trade_sample and batch:
                        logger.debug(
                            "Sample latest trade upsert: %s",
                            {
                                "symbol": batch[0]["symbol"],
                                "price": batch[0]["price"],
                                "timestamp": batch[0]["timestamp"],
                                "exchange": batch[0]["exchange"],
                            },
                        )
                        self._logged_trade_sample = True
                    
                    updated = result.rowcount
                    total_updated += updated
            
            self.metrics.trades_updated += total_updated
            
            logger.debug(f"Updated {total_updated} latest trades from snapshots")
                
        except Exception as e:
            logger.error(f"Error upserting latest trades: {e}", exc_info=True)
            self.metrics.errors += 1


# Global snapshot service instance
_global_snapshot_service: Optional[SnapshotIngestionService] = None


def get_snapshot_service() -> Optional[SnapshotIngestionService]:
    """Get the global snapshot ingestion service instance."""
    return _global_snapshot_service


def initialize_snapshot_service(
    api_key: str,
    fetch_interval_seconds: int = 5
) -> SnapshotIngestionService:
    """Initialize and return the global snapshot ingestion service."""
    global _global_snapshot_service
    _global_snapshot_service = SnapshotIngestionService(
        api_key=api_key,
        fetch_interval_seconds=fetch_interval_seconds
    )
    return _global_snapshot_service

