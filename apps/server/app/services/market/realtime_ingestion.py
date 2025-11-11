"""
Real-time market data ingestion service.

Connects to Polygon WebSocket (AM.* for all minute bars), buffers messages,
and batch inserts into TimescaleDB with automatic validation tracking.
"""

import asyncio
import logging
from datetime import datetime, date, timezone, timedelta
from typing import Any, Dict, List, Optional, Set
from collections import defaultdict

from polygon import WebSocketClient
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert

from app.models.market_data import MarketData, SymbolDateValidation
from app.services.core.database import get_async_session
from app.services.core.time_context import get_current_time
from app.services.market.metrics_calculator import METRIC_FIELDS, MetricsCalculator, is_metrics_timescale

logger = logging.getLogger("app.realtime_ingestion")


def _as_numeric(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _build_insert_payload(bar: MarketData) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "time": bar.time,
        "symbol": bar.symbol,
        "timescale": bar.timescale,
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "vwap": bar.vwap,
        "trade_count": bar.trade_count,
        "session_type": bar.session_type,
    }

    for field in METRIC_FIELDS:
        payload[field] = _as_numeric(getattr(bar, field, None))

    return payload


def _build_conflict_update(stmt) -> Dict[str, Any]:
    update_values: Dict[str, Any] = {
        "open": stmt.excluded.open,
        "high": stmt.excluded.high,
        "low": stmt.excluded.low,
        "close": stmt.excluded.close,
        "volume": stmt.excluded.volume,
        "vwap": stmt.excluded.vwap,
        "trade_count": stmt.excluded.trade_count,
        "session_type": stmt.excluded.session_type,
    }

    for field in METRIC_FIELDS:
        update_values[field] = getattr(stmt.excluded, field)

    return update_values


class IngestionMetrics:
    """Tracks ingestion performance metrics."""
    
    def __init__(self):
        self.messages_received = 0
        self.bars_inserted = 0
        self.batches_processed = 0
        self.last_batch_size = 0
        self.last_batch_latency_ms = 0.0
        self.errors = 0
        self.last_message_time: Optional[datetime] = None
        self.started_at: Optional[datetime] = None
    
    def reset(self):
        """Reset all metrics."""
        self.messages_received = 0
        self.bars_inserted = 0
        self.batches_processed = 0
        self.last_batch_size = 0
        self.last_batch_latency_ms = 0.0
        self.errors = 0
        self.last_message_time = None
        self.started_at = get_current_time()
    
    def to_dict(self) -> Dict:
        """Export metrics as dictionary."""
        now = get_current_time()
        uptime_seconds = (now - self.started_at).total_seconds() if self.started_at else 0
        
        return {
            "messages_received": self.messages_received,
            "bars_inserted": self.bars_inserted,
            "batches_processed": self.batches_processed,
            "last_batch_size": self.last_batch_size,
            "last_batch_latency_ms": self.last_batch_latency_ms,
            "errors": self.errors,
            "last_message_time": self.last_message_time.isoformat() if self.last_message_time else None,
            "uptime_seconds": uptime_seconds,
            "avg_bars_per_batch": self.bars_inserted / self.batches_processed if self.batches_processed > 0 else 0
        }


class RealtimeIngestionService:
    """
    Service that ingests real-time market data from Polygon WebSocket.
    
    Subscribes to AM.* (all minute bars), buffers messages, and performs
    batch inserts into TimescaleDB every 5-10 seconds.
    """
    
    def __init__(
        self,
        api_key: str,
        batch_interval_seconds: int = 10,
        enable_validation: bool = True
    ):
        """
        Initialize ingestion service.
        
        Args:
            api_key: Polygon API key
            batch_interval_seconds: How often to batch insert (default 10s)
            enable_validation: Whether to update validation table after inserts
        """
        self.api_key = api_key
        self.batch_interval_seconds = batch_interval_seconds
        self.enable_validation = enable_validation
        
        # Message buffer
        self.message_queue: asyncio.Queue = asyncio.Queue()
        
        # WebSocket client and thread
        self.ws_client: Optional[WebSocketClient] = None
        self.ws_thread = None
        
        # Background tasks
        self.batch_task: Optional[asyncio.Task] = None
        self.validation_task: Optional[asyncio.Task] = None
        
        # Metrics
        self.metrics = IngestionMetrics()
        self.metrics_calculator = MetricsCalculator()
        
        # State
        self.is_running = False
        self.should_stop = False
        
        # Track which symbols/dates we've seen today for validation
        self.daily_bar_counts: Dict[tuple, int] = defaultdict(int)  # (symbol, date) -> count
    
    async def start(self) -> None:
        """Start the ingestion service."""
        if self.is_running:
            logger.warning("Ingestion service already running")
            return
        
        self.is_running = True
        self.should_stop = False
        self.metrics.reset()
        
        # Start WebSocket in background thread
        await self._start_websocket()
        
        # Start batch processing task
        self.batch_task = asyncio.create_task(self._batch_processor())
        
        # Start validation task if enabled
        if self.enable_validation:
            self.validation_task = asyncio.create_task(self._validation_processor())
        
        logger.debug("Real-time ingestion service started")
    
    async def stop(self) -> None:
        """Stop the ingestion service."""
        if not self.is_running:
            return
        
        logger.info("Stopping real-time ingestion service")
        self.should_stop = True
        
        # Stop WebSocket
        if self.ws_client:
            try:
                self.ws_client.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket: {e}")
        
        # Cancel tasks
        if self.batch_task:
            self.batch_task.cancel()
            try:
                await self.batch_task
            except asyncio.CancelledError:
                pass
        
        if self.validation_task:
            self.validation_task.cancel()
            try:
                await self.validation_task
            except asyncio.CancelledError:
                pass
        
        self.is_running = False
        logger.info("Real-time ingestion service stopped")
    
    def get_metrics(self) -> Dict:
        """Get current ingestion metrics."""
        return self.metrics.to_dict()
    
    async def _start_websocket(self) -> None:
        """Start Polygon WebSocket connection in background thread."""
        import threading
        
        # Capture the current event loop before starting the thread
        loop = asyncio.get_event_loop()
        
        def run_websocket():
            """Run WebSocket client in thread."""
            try:
                logger.debug("Starting Polygon WebSocket connection (AM.* subscription)")
                
                # Create WebSocket client
                self.ws_client = WebSocketClient(
                    api_key=self.api_key,
                    subscriptions=["AM.*"],  # All minute bars
                    url="wss://socket.polygon.io/stocks"
                )
                
                # Define message handler
                def handle_message(msgs):
                    """Handle incoming WebSocket messages."""
                    try:
                        if not isinstance(msgs, list):
                            msgs = [msgs]
                        
                        for msg in msgs:
                            # Put message in queue for batch processing
                            # Use the loop we captured before starting the thread
                            asyncio.run_coroutine_threadsafe(
                                self.message_queue.put(msg),
                                loop
                            )
                            self.metrics.messages_received += 1
                            self.metrics.last_message_time = get_current_time()
                    
                    except Exception as e:
                        logger.error(f"Error handling WebSocket message: {e}")
                        self.metrics.errors += 1
                
                # Run WebSocket (blocks until closed)
                self.ws_client.run(handle_msg=handle_message)
                
            except Exception as e:
                logger.error(f"WebSocket thread error: {e}", exc_info=True)
                self.metrics.errors += 1
        
        # Start thread
        self.ws_thread = threading.Thread(target=run_websocket, daemon=True)
        self.ws_thread.start()
        
        logger.debug("WebSocket thread started")
    
    async def _batch_processor(self) -> None:
        """
        Background task that batches messages and inserts into TimescaleDB.
        
        Runs every batch_interval_seconds, collecting all queued messages
        and performing a single batch insert.
        """
        # Batch processor started - no log needed, handled by main startup
        
        while not self.should_stop:
            try:
                # Wait for interval
                await asyncio.sleep(self.batch_interval_seconds)
                
                # Collect all queued messages
                messages = []
                while not self.message_queue.empty():
                    try:
                        msg = self.message_queue.get_nowait()
                        messages.append(msg)
                    except asyncio.QueueEmpty:
                        break
                
                if not messages:
                    continue
                
                # Process batch
                start_time = get_current_time()
                bars_inserted = await self._process_batch(messages)
                end_time = get_current_time()
                
                # Update metrics
                latency_ms = (end_time - start_time).total_seconds() * 1000
                self.metrics.batches_processed += 1
                self.metrics.bars_inserted += bars_inserted
                self.metrics.last_batch_size = len(messages)
                self.metrics.last_batch_latency_ms = latency_ms
                
                logger.debug(
                    f"Batch processed: {bars_inserted} bars from {len(messages)} messages "
                    f"in {latency_ms:.0f}ms"
                )
                
            except Exception as e:
                logger.error(f"Error in batch processor: {e}", exc_info=True)
                self.metrics.errors += 1
        
        logger.info("Batch processor stopped")
    
    async def _process_batch(self, messages: List[Dict]) -> int:
        """
        Process a batch of WebSocket messages and insert into DB.
        
        Args:
            messages: List of Polygon WebSocket messages
            
        Returns:
            Number of bars inserted
        """
        bars: List[MarketData] = []
        
        for msg in messages:
            try:
                # Parse Polygon aggregate bar message
                bar = self._parse_polygon_message(msg)
                if bar:
                    bars.append(bar)
                    
                    # Track for validation
                    bar_date = bar.time.date()
                    key = (bar.symbol, bar_date)
                    self.daily_bar_counts[key] += 1
                    
            except Exception as e:
                logger.error(f"Error parsing message: {e}, msg={msg}")
                self.metrics.errors += 1
        
        if not bars:
            return 0
        
        # Batch insert into TimescaleDB
        try:
            await self._bulk_insert_bars(bars)
            return len(bars)
        except Exception as e:
            logger.error(f"Error inserting batch: {e}", exc_info=True)
            self.metrics.errors += 1
            return 0
    
    def _parse_polygon_message(self, msg: Dict) -> Optional[MarketData]:
        """
        Parse a Polygon WebSocket message into a MarketData object.
        
        Polygon AM (minute aggregate) message format:
        {
            "ev": "AM",       # Event type
            "sym": "AAPL",    # Symbol
            "v": 123456,      # Volume
            "av": 789012,     # Accumulated volume
            "op": 150.0,      # Open
            "vw": 150.5,      # VWAP
            "o": 150.0,       # Open
            "c": 151.0,       # Close
            "h": 151.5,       # High
            "l": 149.5,       # Low
            "a": 150.5,       # Avg/VWAP
            "s": 1234567890000,  # Start timestamp (ms)
            "e": 1234567950000,  # End timestamp (ms)
            "n": 100          # Number of trades
        }
        
        Args:
            msg: Raw Polygon message dict
            
        Returns:
            MarketData object or None if invalid (timescale='1min')
        """
        try:
            # Helper function to get value from either dict or object
            def get_value(obj, *keys):
                """Try to get value from dict keys or object attributes."""
                for key in keys:
                    if isinstance(obj, dict):
                        val = obj.get(key)
                        if val is not None:
                            return val
                    else:
                        # Try as object attribute
                        val = getattr(obj, key, None)
                        if val is not None:
                            return val
                return None
            
            # Check event type
            event_type = get_value(msg, "ev", "event_type")
            if event_type not in ["AM", "A.M"]:
                return None
            
            # Extract fields
            symbol = get_value(msg, "sym", "symbol")
            if not symbol:
                return None
            
            # Timestamp - use start time (s) or end time (e)
            timestamp_ms = get_value(msg, "s", "start_timestamp", "e", "end_timestamp", "t")
            if not timestamp_ms:
                return None
            
            timestamp = datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc)
            
            # OHLCV data
            open_price = get_value(msg, "o", "open", "op")
            high_price = get_value(msg, "h", "high")
            low_price = get_value(msg, "l", "low")
            close_price = get_value(msg, "c", "close")
            volume = get_value(msg, "v", "volume")
            vwap = get_value(msg, "vw", "vwap", "a")
            trade_count = get_value(msg, "n", "trade_count")
            
            # Validate required fields
            if None in [open_price, high_price, low_price, close_price, volume]:
                logger.warning(f"Missing required fields in message for {symbol}")
                return None
            
            # Detect session type (simplified - all as regular for now)
            session_type = "regular"
            
            return MarketData(
                time=timestamp,
                symbol=symbol.upper(),
                timescale='1min',
                open=float(open_price),
                high=float(high_price),
                low=float(low_price),
                close=float(close_price),
                volume=int(volume),
                vwap=float(vwap) if vwap else None,
                trade_count=int(trade_count) if trade_count else None,
                session_type=session_type
            )
            
        except Exception as e:
            logger.error(f"Error parsing Polygon message: {e}, msg={msg}")
            return None
    
    async def _bulk_insert_bars(self, bars: List[MarketData]) -> None:
        """
        Bulk insert bars into TimescaleDB.
        
        Uses ON CONFLICT DO UPDATE to handle late/corrected data.
        
        DEADLOCK PREVENTION:
        - Sorts bars by (time, symbol, timescale) before insertion to ensure consistent lock ordering
        - Implements exponential backoff retry for deadlock detection errors
        
        DEDUPLICATION:
        - Removes duplicate bars with the same (time, symbol, timescale) within the batch
        - Keeps the last occurrence of each duplicate (most recent data)
        - Prevents "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        
        PARAMETER LIMIT HANDLING:
        - PostgreSQL has a 32,767 parameter limit
        - With 11 fields per record, we chunk inserts to stay under this limit
        - Max chunk size: 2000 records (2000 * 11 = 22,000 parameters, safe margin)
        """
        if not bars:
            return
        
        # CRITICAL: Deduplicate bars by (time, symbol, timescale) to prevent ON CONFLICT errors
        # Keep the last occurrence of each duplicate (most recent/corrected data)
        seen_keys = {}
        for bar in bars:
            key = (bar.time, bar.symbol, bar.timescale)
            seen_keys[key] = bar  # This overwrites earlier duplicates with later ones
        
        # Convert back to list after deduplication
        bars = list(seen_keys.values())
        
        if not bars:
            return
        
        # CRITICAL: Sort bars by (time, symbol, timescale) to ensure consistent lock acquisition order
        # This prevents deadlocks when multiple processes insert overlapping data
        bars = sorted(bars, key=lambda b: (b.time, b.symbol, b.timescale))

        # Calculate technical metrics for each bar before insertion
        for bar in bars:
            if is_metrics_timescale(bar.timescale):
                metrics = self.metrics_calculator.calculate(bar.symbol, bar.timescale, bar)
                for field, value in metrics.items():
                    setattr(bar, field, _as_numeric(value))
        
        # Chunk size to avoid PostgreSQL's 32,767 parameter limit
        # With ~30 fields per record (including metrics) we cap at 1000 rows (~30k params)
        CHUNK_SIZE = 1000
        
        # Process bars in chunks
        for chunk_start in range(0, len(bars), CHUNK_SIZE):
            chunk_end = min(chunk_start + CHUNK_SIZE, len(bars))
            bars_chunk = bars[chunk_start:chunk_end]
            
            await self._insert_bar_chunk(bars_chunk)
    
    async def _insert_bar_chunk(self, bars: List[MarketData]) -> None:
        """
        Insert a single chunk of bars (helper for _bulk_insert_bars).
        
        Handles deadlock retries for the chunk.
        """
        # Deadlock retry configuration
        MAX_RETRIES = 3
        INITIAL_BACKOFF = 0.1  # 100ms
        
        async with get_async_session() as session:
            for retry_attempt in range(MAX_RETRIES):
                try:
                    # Convert to dicts for bulk insert
                    values = [
                        _build_insert_payload(bar)
                        for bar in bars
                    ]
                    
                    # Use PostgreSQL INSERT ... ON CONFLICT DO UPDATE
                    # This handles late/corrected bars by updating existing records
                    stmt = insert(MarketData).values(values)
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["time", "symbol", "timescale"],
                        set_=_build_conflict_update(stmt)
                    )
                    
                    await session.execute(stmt)
                    await session.commit()
                    
                    # Success - break out of retry loop
                    break
                    
                except Exception as e:
                    await session.rollback()
                    
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
                        logger.error(f"Bulk insert failed after {retry_attempt + 1} attempts: {e}")
                        raise
    
    async def _validation_processor(self) -> None:
        """
        Background task that periodically validates data completeness.
        
        Runs every 5 minutes to update symbol_date_validation table based
        on ingested data.
        """
        # Validation processor started - no log needed, handled by main startup
        
        while not self.should_stop:
            try:
                await asyncio.sleep(300)  # Run every 5 minutes
                
                # Get unique symbol/date combinations we've seen
                if not self.daily_bar_counts:
                    continue
                
                logger.debug(f"Validating {len(self.daily_bar_counts)} symbol/date combinations")
                
                await self._update_validation_records()
                
            except Exception as e:
                logger.error(f"Error in validation processor: {e}", exc_info=True)
        
        logger.info("Validation processor stopped")
    
    async def _update_validation_records(self) -> None:
        """Update symbol_date_validation table with current bar counts."""
        async with get_async_session() as session:
            try:
                # Get current counts from database for today's data
                today = get_current_time().date()
                recent_cutoff = today - timedelta(days=2)
                
                result = await session.execute(
                    text("""
                        SELECT 
                            symbol,
                            DATE(time) as date,
                            COUNT(*) as bar_count,
                            MIN(time) as first_bar,
                            MAX(time) as last_bar
                        FROM market_data
                        WHERE timescale = '1min'
                          AND DATE(time) >= :cutoff_date
                        GROUP BY symbol, DATE(time)
                    """),
                    {"cutoff_date": recent_cutoff}
                )
                
                # Upsert validation records
                for row in result:
                    symbol = row[0]
                    bar_date = row[1]
                    bar_count = row[2]
                    first_bar = row[3]
                    last_bar = row[4]
                    
                    # Upsert validation record
                    stmt = insert(SymbolDateValidation).values(
                        symbol=symbol,
                        date=bar_date,
                        bar_count=bar_count,
                        first_bar_time=first_bar,
                        last_bar_time=last_bar,
                        validated_at=get_current_time()
                    )
                    stmt = stmt.on_conflict_do_update(
                        index_elements=["symbol", "date"],
                        set_={
                            "bar_count": stmt.excluded.bar_count,
                            "first_bar_time": stmt.excluded.first_bar_time,
                            "last_bar_time": stmt.excluded.last_bar_time,
                            "validated_at": stmt.excluded.validated_at
                        }
                    )
                    await session.execute(stmt)
                
                await session.commit()
                logger.debug("Validation records updated")
                
            except Exception as e:
                logger.error(f"Error updating validation records: {e}")
                await session.rollback()


# Global ingestion service instance
_ingestion_service: Optional[RealtimeIngestionService] = None


def get_ingestion_service() -> Optional[RealtimeIngestionService]:
    """Get the global ingestion service instance."""
    return _ingestion_service


def initialize_ingestion_service(
    api_key: str,
    batch_interval_seconds: int = 10,
    enable_validation: bool = True
) -> RealtimeIngestionService:
    """
    Initialize and configure the global ingestion service.
    
    Args:
        api_key: Polygon API key
        batch_interval_seconds: Batch insert interval
        enable_validation: Enable validation tracking
        
    Returns:
        Configured RealtimeIngestionService instance
    """
    global _ingestion_service
    
    if _ingestion_service is None:
        _ingestion_service = RealtimeIngestionService(
            api_key=api_key,
            batch_interval_seconds=batch_interval_seconds,
            enable_validation=enable_validation
        )
        logger.debug("Real-time ingestion service initialized")
    
    return _ingestion_service

