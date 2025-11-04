"""
Historical market data loading service for TimescaleDB.

Fetches 1-minute candlestick data from Polygon API and stores it in
TimescaleDB hypertables with progress tracking and error handling.

Supports:
- Extended hours data (pre-market, regular, after-hours)
- High-throughput loading with 100 req/sec rate limiting
- Bulk inserts for optimal performance
- Progress tracking using AssetLoadingStatus pattern
- Resume capability on failure
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Dict, List, Optional, Set
from decimal import Decimal

from polygon import RESTClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app import core
from app.models.assets import AssetLoadingStatus
from app.models.market_data import MarketData, SymbolDateValidation
from app.services.core.database import get_async_session
from app.services.screener.screener_snapshot import fetch_snapshot_all
from app.services.backtest.backtest_lookup_service import populate_lookup_for_date, check_lookup_coverage

logger = logging.getLogger("app.historical_data_loader")

# Global task management
_current_task: Optional[asyncio.Task] = None
_cancel_flag = False

# Rate limiting: Limit concurrent Polygon API requests to avoid connection pool exhaustion
CONCURRENT_REQUESTS = 5  # Max concurrent requests to Polygon API

# Timescale configuration: lookback periods and Polygon API parameters
TIMESCALE_CONFIG = {
    '1min': {
        'lookback_days': 30,
        'multiplier': 1,
        'timespan': 'minute'
    },
    '5min': {
        'lookback_days': 60,  # 60 days - powers the screener
        'multiplier': 5,
        'timespan': 'minute'
    },
    '15min': {
        'lookback_days': 60,  # 60 days
        'multiplier': 15,
        'timespan': 'minute'
    },
    '1hour': {
        'lookback_days': 90,  # 3 months
        'multiplier': 1,
        'timespan': 'hour'
    },
    '1day': {
        'lookback_days': 180,  # 6 months
        'multiplier': 1,
        'timespan': 'day'
    }
}


async def start_historical_load_task(
    days: int = 1,
    symbols: Optional[List[str]] = None,
    start_date: Optional[datetime] = None,
    timescales: Optional[List[str]] = None
) -> Dict[str, any]:
    """
    Start the historical data loading background task.
    
    Args:
        days: Number of days of historical data to load (ignored if timescales specified)
        symbols: List of symbols to load (None = all from snapshot)
        start_date: Starting date for historical data (None = use default lookback per timescale)
        timescales: List of timescales to load (None = all: ['1min', '5min', '15min', '1hour', '1day'])
    
    Returns:
        Dict with status_id and message
        
    Raises:
        ValueError: If a task is already running
    """
    global _current_task, _cancel_flag
    
    if _current_task and not _current_task.done():
        raise ValueError("Historical data loading task is already running")
    
    # Reset cancel flag
    _cancel_flag = False
    
    # Default to all configured timescales if none specified
    if timescales is None:
        timescales = ['1min', '5min', '15min', '1hour', '1day']
    
    # Validate timescales
    invalid_timescales = [ts for ts in timescales if ts not in TIMESCALE_CONFIG]
    if invalid_timescales:
        raise ValueError(f"Invalid timescales: {invalid_timescales}. Valid options: {list(TIMESCALE_CONFIG.keys())}")
    
    # Create new status record
    async with get_async_session() as session:
        status = AssetLoadingStatus(
            task_type="historical_data_loading",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow(),
            progress_pct=0.0
        )
        session.add(status)
        await session.commit()
        await session.refresh(status)
        status_id = status.id
    
    # Start background task
    _current_task = asyncio.create_task(
        _run_historical_load_task(status_id, days, symbols, start_date, timescales)
    )
    
    symbol_count = len(symbols) if symbols else "all"
    timescale_str = ", ".join(timescales)
    logger.info(
        f"Loading: {timescale_str} timescales, "
        f"{symbol_count} symbols, status_id={status_id}"
    )
    
    return {
        "status_id": status_id,
        "message": f"Historical data loading started: {timescale_str} for {symbol_count} symbols"
    }


async def cancel_historical_load_task() -> bool:
    """
    Cancel the currently running historical data loading task.
    
    Returns:
        True if task was cancelled, False if no task was running
    """
    global _cancel_flag, _current_task
    
    if not _current_task or _current_task.done():
        return False
    
    _cancel_flag = True
    logger.info("Historical data loading task cancellation requested")
    
    return True


async def get_load_status(status_id: int) -> Optional[Dict]:
    """
    Get the status of a historical data loading task.
    
    Args:
        status_id: ID of the loading status record
        
    Returns:
        Dict with status info or None if not found
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(AssetLoadingStatus).where(AssetLoadingStatus.id == status_id)
        )
        status = result.scalar_one_or_none()
        
        if not status:
            return None
        
        return {
            "status_id": status.id,
            "status": status.status,
            "progress_pct": status.progress_pct or 0.0,
            "tickers_processed": status.processed_tickers or 0,
            "tickers_succeeded": status.tickers_succeeded or 0,
            "tickers_failed": status.failed_tickers or 0,
            "started_at": status.started_at.isoformat() if status.started_at else None,
            "completed_at": status.completed_at.isoformat() if status.completed_at else None,
            "last_updated": status.last_updated.isoformat() if status.last_updated else None,
            "error_message": status.error_message
        }


async def _run_historical_load_task(
    status_id: int,
    days: int,
    symbols: Optional[List[str]],
    start_date: Optional[datetime],
    timescales: List[str]
):
    """
    Main worker function for historical data loading.
    
    Fetches bars at specified timescales from Polygon and stores in TimescaleDB.
    """
    global _cancel_flag
    
    try:
        # Get Polygon client
        if not core.rest_client:
            raise ValueError("Polygon client not initialized")
        
        client = core.rest_client
        
        # Get symbol list
        if symbols is None:
            logger.info("Fetching all symbols from Polygon snapshot")
            try:
                snapshot_data = fetch_snapshot_all(core.API_KEY)
                symbols = [ticker["ticker"] for ticker in snapshot_data if "ticker" in ticker]
                logger.info(f"Found {len(symbols)} symbols from snapshot")
            except Exception as e:
                logger.error(f"Failed to fetch snapshot: {e}")
                await _update_status(
                    status_id,
                    status="failed",
                    error_message=f"Failed to fetch symbols: {str(e)}"
                )
                return
        
        if not symbols:
            logger.warning("No symbols to process")
            await _update_status(status_id, status="completed", progress_pct=100.0)
            return
        
        total_symbols = len(symbols)
        timescale_str = ", ".join(timescales)
        logger.info(f"🚀 Starting load: {total_symbols} symbols for timescales: {timescale_str}")
        
        # Process each timescale sequentially
        for timescale_idx, timescale in enumerate(timescales):
            if _cancel_flag:
                logger.info("Task cancelled before starting timescale")
                await _update_status(status_id, status="cancelled")
                return
            
            config = TIMESCALE_CONFIG[timescale]
            
            # Determine date range for this timescale
            if start_date is None:
                ts_start_date = datetime.now(timezone.utc) - timedelta(days=config['lookback_days'])
            else:
                ts_start_date = start_date
            
            ts_end_date = datetime.now(timezone.utc)
            
            logger.info(f"📅 [{timescale}] Date range: {ts_start_date.strftime('%Y-%m-%d')} to {ts_end_date.strftime('%Y-%m-%d')}")
            
            # Process all symbols directly - rely on ON CONFLICT DO NOTHING for deduplication
            processed = 0
            succeeded = 0
            failed = 0
            failed_symbols = []
            total_bars_inserted = 0
            
            # Semaphore for rate limiting concurrent Polygon API requests
            semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
            
            # Process in batches
            batch_size = 200
            symbols_to_process = len(symbols)
            
            for i in range(0, symbols_to_process, batch_size):
                if _cancel_flag:
                    logger.info("Task cancelled by user")
                    await _update_status(status_id, status="cancelled")
                    return
                
                batch = symbols[i:i + batch_size]
                tasks = [
                    _load_symbol_data(
                        client, symbol, ts_start_date, ts_end_date, timescale, config, semaphore
                    )
                    for symbol in batch
                ]
                
                # Wait for batch to complete
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Collect all bars for batch bulk insert
                all_bars = []
                for symbol, result in zip(batch, results):
                    processed += 1
                    if isinstance(result, Exception):
                        failed += 1
                        failed_symbols.append(symbol)
                        logger.warning(f"❌ [{timescale}] Failed to load {symbol}: {result}")
                    else:
                        # Result is list of bars
                        bars = result if isinstance(result, list) else []
                        if bars:
                            all_bars.extend(bars)
                            succeeded += 1
                            logger.debug(f"✅ [{timescale}] {symbol}: {len(bars)} bars fetched")
                        else:
                            # No data available from Polygon for this date range
                            succeeded += 1
                            logger.debug(f"⚠️  [{timescale}] {symbol}: No data available from Polygon")
                    
                    # Update progress every 200 symbols
                    if processed % 200 == 0:
                        progress_pct = (processed / total_symbols) * 100
                        await _update_status(
                            status_id,
                            progress_pct=progress_pct,
                            tickers_processed=processed,
                            tickers_succeeded=succeeded,
                            tickers_failed=failed
                        )
                
                # Bulk insert all bars from this batch
                if all_bars:
                    await _bulk_insert_bars(all_bars, ts_start_date, ts_end_date, timescale)
                    total_bars_inserted += len(all_bars)
                
                logger.info(
                    f"📊 [{timescale}] Batch complete: {processed}/{symbols_to_process} fetched "
                    f"({succeeded} succeeded, {failed} failed) | "
                    f"{total_bars_inserted} total bars inserted"
                )
            
            # Timescale completed - log summary
            logger.info(
                f"🎉 [{timescale}] Completed: "
                f"{succeeded} symbols fetched, {failed} failed | "
                f"💾 {total_bars_inserted} total bars inserted"
            )
            
            # If we just loaded 1min data, populate lookup tables for all dates in range
            if timescale == '1min' and total_bars_inserted > 0:
                logger.info(f"📊 Populating backtest lookup tables for loaded dates...")
                try:
                    # Iterate through each date in the range and populate lookup if needed
                    current_date = ts_start_date.date()
                    end_date = ts_end_date.date()
                    
                    dates_populated = 0
                    dates_skipped = 0
                    
                    while current_date <= end_date:
                        # Check if lookup already exists
                        coverage = await check_lookup_coverage(current_date)
                        
                        if not coverage["has_data"]:
                            try:
                                await populate_lookup_for_date(current_date, timescale='1min')
                                dates_populated += 1
                                logger.info(f"  ✅ Populated lookup for {current_date}")
                            except Exception as e:
                                logger.warning(f"  ⚠️  Failed to populate lookup for {current_date}: {e}")
                        else:
                            dates_skipped += 1
                        
                        current_date += timedelta(days=1)
                    
                    if dates_populated > 0:
                        logger.info(f"✅ Populated lookup tables for {dates_populated} date(s), {dates_skipped} already existed")
                    else:
                        logger.info(f"✅ All lookup tables already populated ({dates_skipped} dates)")
                except Exception as e:
                    # Don't fail the whole task if lookup population fails
                    logger.warning(f"⚠️  Failed to populate lookup tables: {e}", exc_info=True)
        
        # All timescales completed - final status update
        await _update_status(
            status_id,
            status="completed",
            progress_pct=100.0
        )
        
        logger.info(
            f"🎉 All timescales completed for historical data loading"
        )
        
    except Exception as e:
        logger.error(f"Historical data loading task failed: {e}", exc_info=True)
        await _update_status(
            status_id,
            status="failed",
            error_message=str(e)
        )


async def _load_symbol_data(
    client: RESTClient,
    symbol: str,
    start_date: datetime,
    end_date: datetime,
    timescale: str,
    config: Dict,
    semaphore: asyncio.Semaphore
) -> List[MarketData]:
    """
    Fetch and transform historical data for a single symbol.
    
    Args:
        client: Polygon REST client
        symbol: Ticker symbol
        start_date: Start date for data
        end_date: End date for data
        timescale: Timescale granularity ('1min', '5min', '15min', '1hour', '1day')
        config: Timescale configuration with multiplier and timespan
        semaphore: Rate limiting semaphore to limit concurrent requests
        
    Returns:
        List of MarketData objects (empty list if no data or error)
    """
    # Format dates for Polygon API (YYYY-MM-DD)
    from_date = start_date.strftime("%Y-%m-%d")
    to_date = end_date.strftime("%Y-%m-%d")
    
    async with semaphore:
        try:
            logger.debug(f"🔍 [{timescale}] Fetching {symbol} from {from_date} to {to_date}")
        
            # Run in default executor (polygon client is synchronous)
            loop = asyncio.get_event_loop()
            aggs = await loop.run_in_executor(
                None,
                lambda: list(client.list_aggs(
                    ticker=symbol,
                    multiplier=config['multiplier'],
                    timespan=config['timespan'],
                    from_=from_date,
                    to=to_date,
                    limit=50000  # Max allowed by Polygon
                ))
            )
        
            # Convert to MarketData objects (always use 'regular' session type)
            bars = []
            for agg in aggs:
                # Convert timestamp from milliseconds to datetime
                timestamp = datetime.fromtimestamp(agg.timestamp / 1000, tz=timezone.utc)
                
                bar = MarketData(
                    time=timestamp,
                    symbol=symbol,
                    timescale=timescale,
                    open=float(agg.open),
                    high=float(agg.high),
                    low=float(agg.low),
                    close=float(agg.close),
                    volume=int(agg.volume),
                    vwap=float(agg.vwap) if hasattr(agg, 'vwap') and agg.vwap else None,
                    trade_count=int(agg.transactions) if hasattr(agg, 'transactions') and agg.transactions else None,
                    session_type='regular'
                )
                bars.append(bar)
            
            return bars
        
        except Exception as e:
            logger.error(f"❌ Error loading {symbol}: {e}")
            raise


async def _bulk_insert_bars(
    bars: List[MarketData],
    start_date: datetime,
    end_date: datetime,
    timescale: str
) -> None:
    """
    Bulk insert bars into TimescaleDB with ON CONFLICT DO NOTHING.
    
    Chunks inserts to avoid PostgreSQL parameter limit (32767).
    With 11 fields per bar (including timescale), we can safely insert ~2900 bars at once.
    
    DEADLOCK PREVENTION:
    - Sorts bars by (time, symbol, timescale) before insertion to ensure consistent lock ordering
    - Implements exponential backoff retry for deadlock detection errors
    
    DEDUPLICATION:
    - Removes duplicate bars with the same (time, symbol, timescale) within the batch
    - Keeps the last occurrence of each duplicate (most recent data)
    - Reduces unnecessary DB operations
    
    Also creates/updates validation records for all symbols/date/timescale combinations.
    
    Args:
        bars: List of MarketData objects to insert
        start_date: Start of date range for validation
        end_date: End of date range for validation
        timescale: Timescale granularity
    """
    if not bars:
        return
    
    # Deduplicate bars by (time, symbol, timescale) - keep the last occurrence
    seen_keys = {}
    for bar in bars:
        key = (bar.time, bar.symbol, bar.timescale)
        seen_keys[key] = bar
    
    bars = list(seen_keys.values())
    
    if not bars:
        return
    
    # CRITICAL: Sort bars by (time, symbol, timescale) to ensure consistent lock acquisition order
    # This prevents deadlocks when multiple processes insert overlapping data
    bars = sorted(bars, key=lambda b: (b.time, b.symbol, b.timescale))
    
    # PostgreSQL has a limit of 32767 parameters per query
    # Each bar has 11 fields (including timescale), so we can insert ~2900 bars at once safely
    CHUNK_SIZE = 2900
    
    # Deadlock retry configuration
    MAX_RETRIES = 3
    INITIAL_BACKOFF = 0.1  # 100ms
    
    async with get_async_session() as session:
        for retry_attempt in range(MAX_RETRIES):
            try:
                # Process in chunks
                for i in range(0, len(bars), CHUNK_SIZE):
                    chunk = bars[i:i + CHUNK_SIZE]
                    
                    # Convert objects to dicts for bulk insert
                    values = [
                        {
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
                            "session_type": bar.session_type
                        }
                        for bar in chunk
                    ]
                    
                    # Use PostgreSQL INSERT ... ON CONFLICT DO NOTHING
                    stmt = insert(MarketData).values(values)
                    stmt = stmt.on_conflict_do_nothing(index_elements=["time", "symbol", "timescale"])
                    
                    await session.execute(stmt)
                    
                    if len(bars) > CHUNK_SIZE:
                        logger.debug(f"   Inserted chunk {i//CHUNK_SIZE + 1}: {len(chunk)} bars")
                
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
                    logger.error(f"❌ Bulk insert failed after {retry_attempt + 1} attempts: {e}")
                    raise
        
        # Create/update validation records after successful insert
        if bars:
            # Group bars by symbol to create validation records per symbol
            from collections import defaultdict
            bars_by_symbol = defaultdict(list)
            for bar in bars:
                bars_by_symbol[bar.symbol].append(bar)
            
            for symbol, symbol_bars in bars_by_symbol.items():
                await upsert_validation_for_range(symbol, timescale, start_date, end_date, symbol_bars)


async def upsert_validation_for_range(
    symbol: str,
    timescale: str,
    start_date: datetime,
    end_date: datetime,
    bars: List[MarketData]
) -> None:
    """
    Upsert validation records for a date range using a single SQL query.
    
    Builds date series once, aggregates bar counts from bars list, and executes
    a single bulk upsert for all dates in the range.
    
    Args:
        symbol: Ticker symbol
        timescale: Timescale granularity ('1min', '5min', '15min', '1hour', '1day')
        start_date: Start of range (datetime)
        end_date: End of range (datetime)
        bars: List of bars returned (used to count bars per date)
    """
    from collections import defaultdict
    from sqlalchemy.dialects.postgresql import insert
    
    # Group bars by date to count them
    bars_by_date = defaultdict(list)
    for bar in bars:
        bar_date = bar.time.date()
        bars_by_date[bar_date].append(bar)
    
    # Expected bars varies by timescale (rough estimates for regular trading day)
    expected_bars_map = {
        '1min': 390,
        '5min': 78,
        '15min': 26,
        '1hour': 7,  # 6.5 hours
        '1day': 1
    }
    expected_bars = expected_bars_map.get(timescale, 390)
    
    async with get_async_session() as session:
        # Build validation records for all dates in range using single query
        validation_values = []
        current_date = start_date.date()
        end_date_only = end_date.date()
        
        while current_date < end_date_only:
            # Skip weekends
            if current_date.weekday() < 5:  # Monday=0, Friday=4
                date_bars = bars_by_date.get(current_date, [])
                bar_count = len(date_bars)
                
                # Calculate first/last bar times if we have bars
                first_bar_time = min(b.time for b in date_bars) if date_bars else None
                last_bar_time = max(b.time for b in date_bars) if date_bars else None
                
                validation_values.append({
                    "symbol": symbol.upper(),
                    "date": current_date,
                    "timescale": timescale,
                    "is_complete": (bar_count >= expected_bars * 0.9),  # 90% threshold
                    "bar_count": bar_count,
                    "expected_bars": expected_bars,
                    "first_bar_time": first_bar_time,
                    "last_bar_time": last_bar_time,
                    "validated_at": datetime.now(timezone.utc)
                })
            
            current_date += timedelta(days=1)
        
        if validation_values:
            # Bulk upsert all validation records
            stmt = insert(SymbolDateValidation).values(validation_values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["symbol", "date", "timescale"],
                set_={
                    "bar_count": stmt.excluded.bar_count,
                    "is_complete": stmt.excluded.is_complete,
                    "first_bar_time": stmt.excluded.first_bar_time,
                    "last_bar_time": stmt.excluded.last_bar_time,
                    "validated_at": stmt.excluded.validated_at
                }
            )
            await session.execute(stmt)
            await session.commit()
            logger.debug(f"Upserted {len(validation_values)} validation records for {symbol}: {start_date.date()} to {end_date.date()}")


async def _update_status(
    status_id: int,
    status: Optional[str] = None,
    progress_pct: Optional[float] = None,
    tickers_processed: Optional[int] = None,
    tickers_succeeded: Optional[int] = None,
    tickers_failed: Optional[int] = None,
    error_message: Optional[str] = None
) -> None:
    """Update the loading status record."""
    async with get_async_session() as session:
        # Build dynamic UPDATE statement with only provided fields
        set_clauses = ["last_updated = :last_updated"]
        params = {
            "status_id": status_id,
            "last_updated": datetime.utcnow()
        }
        
        if status is not None:
            set_clauses.append("status = :status")
            params["status"] = status
            if status in ("completed", "failed", "cancelled"):
                set_clauses.append("completed_at = :completed_at")
                params["completed_at"] = datetime.utcnow()
        
        if progress_pct is not None:
            set_clauses.append("progress_pct = :progress_pct")
            params["progress_pct"] = progress_pct
        
        if tickers_processed is not None:
            set_clauses.append("processed_tickers = :processed_tickers")
            params["processed_tickers"] = tickers_processed
        
        if tickers_succeeded is not None:
            set_clauses.append("tickers_succeeded = :tickers_succeeded")
            params["tickers_succeeded"] = tickers_succeeded
        
        if tickers_failed is not None:
            set_clauses.append("failed_tickers = :failed_tickers")
            params["failed_tickers"] = tickers_failed
        
        if error_message is not None:
            set_clauses.append("error_message = :error_message")
            params["error_message"] = error_message
        
        # Build and execute dynamic SQL
        sql = f"""
            UPDATE asset_loading_status 
            SET {', '.join(set_clauses)}
            WHERE id = :status_id
        """
        
        await session.execute(text(sql), params)
        await session.commit()


async def get_database_stats(include_details: bool = False) -> Dict:
    """
    Get comprehensive statistics about the market data database.
    
    Args:
        include_details: If True, includes detailed 1min analysis (slower).
                        If False, only returns fast summary stats.
    
    Returns:
        Dict with total bars, date range, symbol count, coverage analysis, etc.
        Now includes per-timescale statistics.
    """
    async with get_async_session() as session:
        try:
            # Overall stats - use approximate counts and TimescaleDB metadata to avoid full table scans
            # Get approximate row count from pg_class (instant, no table scan)
            result = await session.execute(
                text("""
                    SELECT reltuples::bigint 
                    FROM pg_class 
                    WHERE oid = 'market_data'::regclass
                """)
            )
            total_bars = result.scalar() or 0
            
            # Get min/max time from chunk metadata (fast, no data scan)
            result = await session.execute(
                text("""
                    SELECT 
                        MIN(range_start) as min_time,
                        MAX(range_end) as max_time
                    FROM timescaledb_information.chunks
                    WHERE hypertable_name = 'market_data'
                """)
            )
            date_range = result.first()
            min_date = date_range[0] if date_range and date_range[0] else None
            max_date = date_range[1] if date_range and date_range[1] else None
            
            # Get approximate symbol count from validation table over recent days (small, indexed)
            result = await session.execute(
                text("""
                    SELECT COUNT(DISTINCT symbol)
                    FROM symbol_date_validation
                    WHERE date >= CURRENT_DATE - INTERVAL '7 days'
                """)
            )
            symbol_count = result.scalar() or 0
            
            # Storage size using TimescaleDB functions for accurate hypertable sizing (fast)
            result = await session.execute(
                text("""
                    SELECT 
                        pg_size_pretty(hypertable_size('market_data')) as total_size,
                        pg_size_pretty(
                            (SELECT table_bytes FROM hypertable_detailed_size('market_data'))
                        ) as table_size,
                        pg_size_pretty(
                            (SELECT index_bytes FROM hypertable_detailed_size('market_data'))
                        ) as index_size,
                        pg_size_pretty(
                            (SELECT toast_bytes FROM hypertable_detailed_size('market_data'))
                        ) as toast_size,
                        (SELECT total_bytes FROM hypertable_detailed_size('market_data')) as total_bytes_raw
                """)
            )
            sizes = result.first()
            
            # Per-timescale statistics - fast group over recent window, avoid DISTINCT on large tables
            # 1) bars/min/max from market_data over last 30 days
            md_result = await session.execute(
                text("""
                    SELECT 
                        timescale,
                        COUNT(*) as bar_count,
                        MIN(time) as min_time,
                        MAX(time) as max_time
                    FROM market_data
                    WHERE time >= NOW() - INTERVAL '30 days'
                    GROUP BY timescale
                """)
            )
            md_stats = {row[0]: {"bar_count": int(row[1] or 0), "min_time": row[2], "max_time": row[3]} for row in md_result}

            # 2) symbol_count per timescale from the much smaller validation table (last 30 days)
            sv_result = await session.execute(
                text("""
                    SELECT timescale, COUNT(DISTINCT symbol) as symbol_count
                    FROM symbol_date_validation
                    WHERE date >= CURRENT_DATE - INTERVAL '30 days'
                    GROUP BY timescale
                """)
            )
            sv_symbol_counts = {row[0]: int(row[1] or 0) for row in sv_result}

            # Assemble ordered timescale stats
            order_map = {"1min": 1, "5min": 2, "15min": 3, "1hour": 4, "1day": 5}
            timescale_stats = []
            for ts in sorted(md_stats.keys(), key=lambda k: order_map.get(k, 99)):
                min_time = md_stats[ts]["min_time"]
                max_time = md_stats[ts]["max_time"]
                unique_days = ((max_time - min_time).days + 1) if (min_time and max_time) else 0
                timescale_stats.append({
                    "timescale": ts,
                    "bar_count": md_stats[ts]["bar_count"],
                    "symbol_count": sv_symbol_counts.get(ts, 0),
                    "min_time": min_time.isoformat() if min_time else None,
                    "max_time": max_time.isoformat() if max_time else None,
                    "unique_days": unique_days
                })

            # Density data for GitHub-like heatmap using validation table (fast and indexed)
            density_result = await session.execute(
                text("""
                    SELECT timescale,
                           date,
                           SUM(CASE WHEN is_complete THEN 1 ELSE 0 END) AS complete_symbols,
                           COUNT(*) AS symbol_count
                    FROM symbol_date_validation
                    WHERE date >= CURRENT_DATE - INTERVAL '90 days'
                    GROUP BY timescale, date
                    ORDER BY date ASC
                """)
            )
            density_by_ts: Dict[str, list] = {}
            for row in density_result:
                ts = row[0]
                day = row[1]
                complete = int(row[2] or 0)
                total = int(row[3] or 0)
                if ts not in density_by_ts:
                    density_by_ts[ts] = []
                density_by_ts[ts].append({
                    "date": day.isoformat(),
                    "complete_symbols": complete,
                    "symbol_count": total,
                    "completion_rate": (complete / total * 100.0) if total > 0 else 0.0
                })
            
            # Base response with fast stats
            response = {
                "total_bars": total_bars,
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
                "symbol_count": symbol_count,
                "total_size": sizes[0] if sizes else "0 bytes",
                "table_size": sizes[1] if sizes else "0 bytes",
                "index_size": sizes[2] if sizes else "0 bytes",
                "toast_size": sizes[3] if sizes else "0 bytes",
                "total_bytes_raw": sizes[4] if sizes else 0,
                "timescale_stats": timescale_stats,  # Per-timescale breakdown (fast)
                "timescale_density": [
                    {"timescale": ts, "days": density_by_ts[ts]}
                    for ts in sorted(density_by_ts.keys(), key=lambda k: order_map.get(k, 99))
                ],
            }
            
            return response
            
        except Exception as e:
            logger.error(f"Failed to get database stats: {e}")
            return {
                "total_bars": 0,
                "min_date": None,
                "max_date": None,
                "symbol_count": 0,
                "total_size": "unknown",
                "table_size": "unknown",
                "error": str(e)
            }

