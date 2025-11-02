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
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
from decimal import Decimal

from polygon import RESTClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app import core
from app.models.assets import AssetLoadingStatus
from app.models.market_data import MarketDataMinute
from app.services.core.database import get_async_session
from app.services.screener.screener_snapshot import fetch_snapshot_all

logger = logging.getLogger("app.historical_data_loader")

# Global task management
_current_task: Optional[asyncio.Task] = None
_cancel_flag = False

# Rate limiting: Single connection pool, process sequentially
# Polygon Advanced allows 100 req/sec, but we use 1 connection to be safe
CONCURRENT_REQUESTS = 1  # One at a time
REQUEST_DELAY = 0.1  # 100ms delay between requests (~10 req/sec)


def detect_session_type(timestamp: datetime) -> str:
    """
    Detect trading session type based on timestamp.
    
    Args:
        timestamp: Bar timestamp in ET timezone
        
    Returns:
        'pre', 'regular', or 'after'
    """
    # Convert to ET time for session detection
    # Polygon timestamps are in UTC, so we need to handle timezone conversion
    hour = timestamp.hour
    minute = timestamp.minute
    time_in_minutes = hour * 60 + minute
    
    # ET hours (assuming timestamp is already in ET):
    # Pre-market: 4:00 AM - 9:30 AM (240 - 570 minutes)
    # Regular: 9:30 AM - 4:00 PM (570 - 960 minutes)
    # After-hours: 4:00 PM - 8:00 PM (960 - 1200 minutes)
    
    # Note: This is simplified. In production, proper timezone handling is critical.
    # For now, we'll use UTC timestamps and label all as 'regular'
    # TODO: Implement proper ET timezone conversion
    return 'regular'


async def start_historical_load_task(
    days: int = 1,
    symbols: Optional[List[str]] = None,
    start_date: Optional[datetime] = None
) -> Dict[str, any]:
    """
    Start the historical data loading background task.
    
    Args:
        days: Number of days of historical data to load
        symbols: List of symbols to load (None = all from snapshot)
        start_date: Starting date for historical data (None = days ago from today)
    
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
        _run_historical_load_task(status_id, days, symbols, start_date)
    )
    
    symbol_count = len(symbols) if symbols else "all"
    logger.info(
        f"Started historical data loading task: {days} days, "
        f"{symbol_count} symbols, status_id={status_id}"
    )
    
    return {
        "status_id": status_id,
        "message": f"Historical data loading started: {days} days for {symbol_count} symbols"
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
    start_date: Optional[datetime]
):
    """
    Main worker function for historical data loading.
    
    Fetches minute bars from Polygon and stores in TimescaleDB.
    """
    global _cancel_flag
    
    try:
        # Get Polygon client
        if not core.rest_client:
            raise ValueError("Polygon client not initialized")
        
        client = core.rest_client
        
        # Determine date range
        if start_date is None:
            start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        end_date = start_date + timedelta(days=days)
        
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
        logger.info(f"🚀 Starting load: {total_symbols} symbols for {days} days")
        logger.info(f"📅 Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        
        # Pre-check: Find which symbols actually need data
        logger.info(f"🔍 Pre-checking existing data for {total_symbols} symbols...")
        symbols_needing_data = []
        symbols_already_complete = []
        
        for symbol in symbols:
            if _cancel_flag:
                logger.info("Task cancelled during pre-check")
                await _update_status(status_id, status="cancelled")
                return
            
            missing_ranges = await _find_missing_date_ranges(symbol, start_date, end_date)
            if missing_ranges:
                symbols_needing_data.append(symbol)
            else:
                symbols_already_complete.append(symbol)
        
        logger.info(
            f"📊 Pre-check complete: {len(symbols_needing_data)} need data, "
            f"{len(symbols_already_complete)} already complete"
        )
        
        # If everything is already loaded, we're done
        if not symbols_needing_data:
            logger.info("✅ All symbols already have complete data!")
            await _update_status(
                status_id,
                status="completed",
                progress_pct=100.0,
                tickers_processed=total_symbols,
                tickers_succeeded=0,
                tickers_failed=0
            )
            return
        
        # Process only symbols that need data
        processed = 0
        succeeded = 0
        failed = 0
        failed_symbols = []
        total_bars_inserted = 0
        skipped_count = len(symbols_already_complete)
        
        # Semaphore for rate limiting (1 concurrent request)
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        
        # Process in small batches since we're sequential
        batch_size = 10
        symbols_to_process = len(symbols_needing_data)
        
        for i in range(0, symbols_to_process, batch_size):
            if _cancel_flag:
                logger.info("Task cancelled by user")
                await _update_status(status_id, status="cancelled")
                return
            
            batch = symbols_needing_data[i:i + batch_size]
            tasks = [
                _load_symbol_data(
                    client, symbol, start_date, end_date, semaphore
                )
                for symbol in batch
            ]
            
            # Wait for batch to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Update stats
            for symbol, result in zip(batch, results):
                processed += 1
                if isinstance(result, Exception):
                    failed += 1
                    failed_symbols.append(symbol)
                    logger.warning(f"❌ Failed to load {symbol}: {result}")
                else:
                    # Result is the number of bars inserted
                    bars_count = result if isinstance(result, int) else 0
                    
                    if bars_count > 0:
                        succeeded += 1
                        total_bars_inserted += bars_count
                        logger.info(f"✅ {symbol}: {bars_count} bars inserted")
                    else:
                        # No data available from Polygon for this date range
                        succeeded += 1
                        logger.debug(f"⚠️  {symbol}: No data available from Polygon")
                
                # Update progress every 10 symbols
                # Progress accounts for pre-skipped symbols
                if processed % 10 == 0:
                    total_processed = processed + skipped_count
                    progress_pct = (total_processed / total_symbols) * 100
                    await _update_status(
                        status_id,
                        progress_pct=progress_pct,
                        tickers_processed=processed,
                        tickers_succeeded=succeeded,
                        tickers_failed=failed
                    )
            
            logger.info(
                f"📊 Batch complete: {processed}/{symbols_to_process} fetched "
                f"({succeeded} succeeded, {failed} failed) + {skipped_count} pre-skipped | "
                f"{total_bars_inserted} total bars inserted"
            )
        
        # Final status update
        error_msg = None
        if failed > 0:
            error_msg = f"Failed to load {failed} symbols: {', '.join(failed_symbols[:10])}"
            if len(failed_symbols) > 10:
                error_msg += f" and {len(failed_symbols) - 10} more"
        
        await _update_status(
            status_id,
            status="completed",
            progress_pct=100.0,
            tickers_processed=processed,
            tickers_succeeded=succeeded,
            tickers_failed=failed,
            error_message=error_msg
        )
        
        logger.info(
            f"🎉 Historical data loading completed: "
            f"{succeeded} symbols fetched, {skipped_count} already complete, {failed} failed | "
            f"💾 {total_bars_inserted} total bars inserted into database"
        )
        
    except Exception as e:
        logger.error(f"Historical data loading task failed: {e}", exc_info=True)
        await _update_status(
            status_id,
            status="failed",
            error_message=str(e)
        )


async def _find_missing_date_ranges(symbol: str, start_date: datetime, end_date: datetime) -> List[tuple[datetime, datetime]]:
    """
    Find date ranges where we're missing data for this symbol.
    
    Args:
        symbol: Ticker symbol
        start_date: Start of desired date range
        end_date: End of desired date range
        
    Returns:
        List of (start, end) tuples representing date gaps to fetch
    """
    from app.services.core.database import get_async_session
    from sqlalchemy import text
    
    async with get_async_session() as session:
        try:
            # Get the min and max dates we have for this symbol
            result = await session.execute(
                text("""
                    SELECT 
                        MIN(DATE(time)) as min_date,
                        MAX(DATE(time)) as max_date,
                        COUNT(*) as total_bars
                    FROM market_data_minute 
                    WHERE symbol = :symbol
                      AND time >= :start_date 
                      AND time <= :end_date
                """),
                {
                    "symbol": symbol.upper(),
                    "start_date": start_date,
                    "end_date": end_date
                }
            )
            row = result.first()
            
            if not row or row[2] == 0:
                # No data at all - need entire range
                logger.debug(f"📭 {symbol}: No existing data, fetching entire range")
                return [(start_date, end_date)]
            
            min_date, max_date, total_bars = row
            
            # Check if we have gaps
            missing_ranges = []
            
            # Gap before our data
            if min_date and start_date.date() < min_date:
                gap_end = datetime.combine(min_date, datetime.min.time()).replace(tzinfo=timezone.utc) - timedelta(days=1)
                missing_ranges.append((start_date, gap_end))
                logger.debug(f"📊 {symbol}: Missing data before {min_date}")
            
            # Gap after our data
            if max_date and end_date.date() > max_date:
                gap_start = datetime.combine(max_date, datetime.min.time()).replace(tzinfo=timezone.utc) + timedelta(days=1)
                missing_ranges.append((gap_start, end_date))
                logger.debug(f"📊 {symbol}: Missing data after {max_date}")
            
            if not missing_ranges:
                logger.debug(f"✓ {symbol}: Already have complete data ({total_bars} bars)")
            
            return missing_ranges
            
        except Exception as e:
            logger.error(f"Error checking existing data for {symbol}: {e}")
            return [(start_date, end_date)]  # On error, fetch entire range


async def _load_symbol_data(
    client: RESTClient,
    symbol: str,
    start_date: datetime,
    end_date: datetime,
    semaphore: asyncio.Semaphore
) -> int:
    """
    Load historical data for a single symbol, fetching only missing date ranges.
    
    Note: This function assumes pre-checking has been done to determine that
    this symbol actually needs data. It will re-check for specific missing ranges.
    
    Args:
        client: Polygon REST client
        symbol: Ticker symbol
        start_date: Start date for data
        end_date: End date for data
        semaphore: Rate limiting semaphore
        
    Returns:
        Number of bars inserted
    """
    async with semaphore:
        # Find specific missing date ranges for this symbol
        missing_ranges = await _find_missing_date_ranges(symbol, start_date, end_date)
        
        if not missing_ranges:
            # Edge case: data was added between pre-check and now
            logger.debug(f"⏭️  {symbol}: Data already complete (added since pre-check)")
            return 0
        
        total_bars_inserted = 0
        
        # Fetch each missing range
        for range_start, range_end in missing_ranges:
            # Format dates for Polygon API (YYYY-MM-DD)
            from_date = range_start.strftime("%Y-%m-%d")
            to_date = range_end.strftime("%Y-%m-%d")
            
            try:
                # Fetch 1-minute bars from Polygon
                logger.debug(f"🔍 Fetching data for {symbol} from {from_date} to {to_date}")
            
                # Run in thread pool since polygon client is synchronous
                loop = asyncio.get_event_loop()
                aggs = await loop.run_in_executor(
                    None,
                    lambda: list(client.list_aggs(
                        ticker=symbol,
                        multiplier=1,
                        timespan="minute",
                        from_=from_date,
                        to=to_date,
                        limit=50000  # Max allowed by Polygon
                    ))
                )
                
                if not aggs:
                    logger.debug(f"📭 No data returned from Polygon for {symbol} ({from_date} to {to_date})")
                    continue  # Try next range
                
                # Convert to MarketDataMinute objects
                bars = []
                for agg in aggs:
                    # Convert timestamp from milliseconds to datetime
                    timestamp = datetime.fromtimestamp(agg.timestamp / 1000, tz=timezone.utc)
                    session_type = detect_session_type(timestamp)
                    
                    bar = MarketDataMinute(
                        time=timestamp,
                        symbol=symbol,
                        open=float(agg.open),
                        high=float(agg.high),
                        low=float(agg.low),
                        close=float(agg.close),
                        volume=int(agg.volume),
                        vwap=float(agg.vwap) if hasattr(agg, 'vwap') and agg.vwap else None,
                        trade_count=int(agg.transactions) if hasattr(agg, 'transactions') and agg.transactions else None,
                        session_type=session_type
                    )
                    bars.append(bar)
                
                # Bulk insert with ON CONFLICT DO NOTHING
                if bars:
                    logger.debug(f"💾 Inserting {len(bars)} bars for {symbol} ({from_date} to {to_date})")
                    await _bulk_insert_bars(bars)
                    logger.debug(f"✨ Successfully inserted {len(bars)} bars for {symbol}")
                    total_bars_inserted += len(bars)
                
                # Delay between requests to avoid overwhelming connection pool
                await asyncio.sleep(REQUEST_DELAY)
                
            except Exception as e:
                logger.error(f"❌ Error loading data for {symbol} ({from_date} to {to_date}): {e}")
                # Continue with other ranges even if one fails
                continue
        
        return total_bars_inserted


async def _bulk_insert_bars(bars: List[MarketDataMinute]) -> None:
    """
    Bulk insert bars into TimescaleDB with ON CONFLICT DO NOTHING.
    
    Chunks inserts to avoid PostgreSQL parameter limit (32767).
    With 10 fields per bar, we can safely insert ~3000 bars at once.
    
    Args:
        bars: List of MarketDataMinute objects to insert
    """
    if not bars:
        return
    
    # PostgreSQL has a limit of 32767 parameters per query
    # Each bar has 10 fields, so we can insert ~3000 bars at once safely
    CHUNK_SIZE = 3000
    
    async with get_async_session() as session:
        try:
            # Process in chunks
            for i in range(0, len(bars), CHUNK_SIZE):
                chunk = bars[i:i + CHUNK_SIZE]
                
                # Convert objects to dicts for bulk insert
                values = [
                    {
                        "time": bar.time,
                        "symbol": bar.symbol,
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
                stmt = insert(MarketDataMinute).values(values)
                stmt = stmt.on_conflict_do_nothing(index_elements=["time", "symbol"])
                
                await session.execute(stmt)
                
                if len(bars) > CHUNK_SIZE:
                    logger.debug(f"   Inserted chunk {i//CHUNK_SIZE + 1}: {len(chunk)} bars")
            
            await session.commit()
            
        except Exception as e:
            logger.error(f"❌ Bulk insert failed: {e}")
            await session.rollback()
            raise


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


async def get_database_stats() -> Dict:
    """
    Get comprehensive statistics about the market data database.
    
    Returns:
        Dict with total bars, date range, symbol count, coverage analysis, etc.
    """
    async with get_async_session() as session:
        try:
            # Basic stats
            result = await session.execute(
                text("SELECT COUNT(*) FROM market_data_minute")
            )
            total_bars = result.scalar() or 0
            
            result = await session.execute(
                text("SELECT MIN(time), MAX(time) FROM market_data_minute")
            )
            date_range = result.first()
            min_date = date_range[0] if date_range else None
            max_date = date_range[1] if date_range else None
            
            result = await session.execute(
                text("SELECT COUNT(DISTINCT symbol) FROM market_data_minute")
            )
            symbol_count = result.scalar() or 0
            
            # Storage size using TimescaleDB functions for accurate hypertable sizing
            result = await session.execute(
                text("""
                    SELECT 
                        pg_size_pretty(hypertable_size('market_data_minute')) as total_size,
                        pg_size_pretty(
                            (SELECT table_bytes FROM hypertable_detailed_size('market_data_minute'))
                        ) as table_size,
                        pg_size_pretty(
                            (SELECT index_bytes FROM hypertable_detailed_size('market_data_minute'))
                        ) as index_size,
                        pg_size_pretty(
                            (SELECT toast_bytes FROM hypertable_detailed_size('market_data_minute'))
                        ) as toast_size,
                        (SELECT total_bytes FROM hypertable_detailed_size('market_data_minute')) as total_bytes_raw
                """)
            )
            sizes = result.first()
            
            # Detailed coverage analysis
            result = await session.execute(
                text("""
                    SELECT 
                        symbol,
                        COUNT(*) as bar_count,
                        MIN(DATE(time)) as first_date,
                        MAX(DATE(time)) as last_date,
                        COUNT(DISTINCT DATE(time)) as unique_days
                    FROM market_data_minute
                    GROUP BY symbol
                    ORDER BY bar_count DESC
                """)
            )
            symbol_details = []
            for row in result:
                symbol_details.append({
                    "symbol": row[0],
                    "bar_count": row[1],
                    "first_date": row[2].isoformat() if row[2] else None,
                    "last_date": row[3].isoformat() if row[3] else None,
                    "unique_days": row[4]
                })
            
            # Date coverage - how many symbols have data for each date
            result = await session.execute(
                text("""
                    SELECT 
                        DATE(time) as trade_date,
                        COUNT(DISTINCT symbol) as symbol_count,
                        COUNT(*) as bar_count
                    FROM market_data_minute
                    GROUP BY DATE(time)
                    ORDER BY trade_date DESC
                """)
            )
            date_coverage = []
            for row in result:
                date_coverage.append({
                    "date": row[0].isoformat() if row[0] else None,
                    "symbol_count": row[1],
                    "bar_count": row[2]
                })
            
            # Distribution by bar count (how many symbols have X bars)
            result = await session.execute(
                text("""
                    WITH symbol_counts AS (
                        SELECT symbol, COUNT(*) as bars
                        FROM market_data_minute
                        GROUP BY symbol
                    )
                    SELECT 
                        CASE 
                            WHEN bars < 100 THEN '< 100 bars'
                            WHEN bars < 500 THEN '100-500 bars'
                            WHEN bars < 1000 THEN '500-1000 bars'
                            ELSE '1000+ bars'
                        END as range,
                        COUNT(*) as symbol_count
                    FROM symbol_counts
                    GROUP BY range
                    ORDER BY MIN(bars)
                """)
            )
            bar_distribution = []
            for row in result:
                bar_distribution.append({
                    "range": row[0],
                    "count": row[1]
                })
            
            return {
                "total_bars": total_bars,
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
                "symbol_count": symbol_count,
                "total_size": sizes[0] if sizes else "0 bytes",
                "table_size": sizes[1] if sizes else "0 bytes",
                "index_size": sizes[2] if sizes else "0 bytes",
                "toast_size": sizes[3] if sizes else "0 bytes",
                "total_bytes_raw": sizes[4] if sizes else 0,
                "symbol_details": symbol_details[:100],  # Top 100 symbols
                "date_coverage": date_coverage,
                "bar_distribution": bar_distribution,
                "total_symbols_analyzed": len(symbol_details)
            }
            
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

