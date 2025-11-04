#!/usr/bin/env python3
"""
Simple market data loader for yesterday's data.
Loads 1min, 5min, 15min, 1hour, 1day bars and creates validation records.
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from polygon import RESTClient
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
import urllib3
from urllib3.poolmanager import PoolManager

import os
import logging

# Configure urllib3 connection pool globally for concurrent requests
# Patch the PoolManager to use a larger default pool size
_original_connection_from_url = PoolManager.connection_from_url

def _connection_from_url_with_pool(self, url, pool_kwargs=None):
    """Wrapper to set maxsize for connection pools."""
    if pool_kwargs is None:
        pool_kwargs = {}
    pool_kwargs.setdefault('maxsize', 10)  # Default pool size is 1, increase to 10
    return _original_connection_from_url(self, url, pool_kwargs)

PoolManager.connection_from_url = _connection_from_url_with_pool

# Also patch connection_from_host
_original_connection_from_host = PoolManager.connection_from_host

def _connection_from_host_with_pool(self, host, port=None, scheme='http', pool_kwargs=None):
    """Wrapper to set maxsize for connection pools."""
    if pool_kwargs is None:
        pool_kwargs = {}
    pool_kwargs.setdefault('maxsize', 10)
    return _original_connection_from_host(self, host, port, scheme, pool_kwargs)

PoolManager.connection_from_host = _connection_from_host_with_pool

from app.models.market_data import MarketData, SymbolDateValidation
from app.services.core.database import get_async_session, init_db
from app.services.screener.screener_snapshot import fetch_snapshot_all

# Optimize logging: default to INFO for visibility, allow override via env
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOADER_LOG_LEVEL", "INFO"))

# Quiet noisy libraries
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("polygon").setLevel(logging.WARNING)

TIMESCALE_CONFIG = {
    '1min': {'multiplier': 1, 'timespan': 'minute'},
    '5min': {'multiplier': 5, 'timespan': 'minute'},
    '15min': {'multiplier': 15, 'timespan': 'minute'},
    '1hour': {'multiplier': 1, 'timespan': 'hour'},
    '1day': {'multiplier': 1, 'timespan': 'day'}
}

EXPECTED_BARS = {
    '1min': 390,
    '5min': 78,
    '15min': 26,
    '1hour': 7,
    '1day': 1
}


def create_polygon_client(api_key: str) -> RESTClient:
    """
    Create Polygon RESTClient.
    
    Connection pool is configured globally via urllib3 settings above.
    """
    return RESTClient(api_key=api_key)


async def needs_data(symbol: str, date: datetime.date, timescale: str) -> bool:
    """Check if we already have validation for this symbol/date/timescale."""
    async with get_async_session() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(*) FROM symbol_date_validation
                WHERE symbol = :symbol
                  AND date = :date
                  AND timescale = :timescale
                  AND is_complete = true
            """),
            {
                "symbol": symbol.upper(),
                "date": date,
                "timescale": timescale
            }
        )
        return result.scalar() == 0


async def load_symbol_data(
    client: RESTClient,
    symbol: str,
    date: datetime.date,
    timescale: str,
    config: Dict
) -> List[MarketData]:
    """Fetch bars for a symbol/date/timescale from Polygon."""
    from_date = date.strftime("%Y-%m-%d")
    to_date = (date + timedelta(days=1)).strftime("%Y-%m-%d")
    
    try:
        # Run Polygon API call in executor (it's synchronous)
        loop = asyncio.get_event_loop()
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Fetching %s %s from Polygon...", symbol, timescale)
        aggs = await loop.run_in_executor(
            None,
            lambda: list(client.list_aggs(
                ticker=symbol,
                multiplier=config['multiplier'],
                timespan=config['timespan'],
                from_=from_date,
                to=to_date,
                limit=50000
            ))
        )
        
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Polygon returned %s bars for %s %s", len(aggs), symbol, timescale)
        
        # Optimize hot path: bind locals to avoid repeated lookups
        bars = []
        ts_from_ms = datetime.fromtimestamp
        utc = timezone.utc
        append = bars.append
        symbol_upper = symbol.upper()
        
        for agg in aggs:
            timestamp = ts_from_ms(agg.timestamp / 1000, tz=utc)
            append(MarketData(
                time=timestamp,
                symbol=symbol_upper,
                timescale=timescale,
                open=float(agg.open),
                high=float(agg.high),
                low=float(agg.low),
                close=float(agg.close),
                volume=int(agg.volume),
                vwap=float(agg.vwap) if hasattr(agg, 'vwap') and agg.vwap else None,
                trade_count=int(agg.transactions) if hasattr(agg, 'transactions') and agg.transactions else None,
                session_type='regular'
            ))
        
        return bars
    except Exception as e:
        logger.error("Error loading %s %s: %s", symbol, timescale, e)
        return []


async def insert_bars(bars: List[MarketData]) -> None:
    """Bulk insert bars with ON CONFLICT DO NOTHING."""
    if not bars:
        return
    
    original_count = len(bars)
    
    # Deduplicate
    seen = {}
    for bar in bars:
        key = (bar.time, bar.symbol, bar.timescale)
        seen[key] = bar
    bars = list(seen.values())
    
    if len(bars) < original_count and logger.isEnabledFor(logging.DEBUG):
        logger.debug("Deduplicated %s bars to %s unique bars", original_count, len(bars))
    
    # Sort to prevent deadlocks
    bars = sorted(bars, key=lambda b: (b.time, b.symbol, b.timescale))
    
    async with get_async_session() as session:
        # Insert all at once (or in chunks if very large)
        if len(bars) <= 2000:
            # Single insert for smaller batches
            values = [{
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
            } for bar in bars]
            
            stmt = insert(MarketData).values(values)
            stmt = stmt.on_conflict_do_nothing(index_elements=["time", "symbol", "timescale"])
            await session.execute(stmt)
        else:
            # Chunk for very large batches
            for i in range(0, len(bars), 2000):
                chunk = bars[i:i + 2000]
                values = [{
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
                } for bar in chunk]
                
                stmt = insert(MarketData).values(values)
                stmt = stmt.on_conflict_do_nothing(index_elements=["time", "symbol", "timescale"])
                await session.execute(stmt)
        
        await session.commit()
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Inserted %s bars into database", len(bars))


async def create_validation(symbol: str, date: datetime.date, timescale: str, bars: List[MarketData]) -> None:
    """Create validation record for symbol/date/timescale."""
    bar_count = len([b for b in bars if b.time.date() == date])
    expected = EXPECTED_BARS.get(timescale, 390)
    is_complete = bar_count >= expected * 0.9
    
    date_bars = [b for b in bars if b.time.date() == date]
    first_bar = min(b.time for b in date_bars) if date_bars else None
    last_bar = max(b.time for b in date_bars) if date_bars else None
    
    async with get_async_session() as session:
        stmt = insert(SymbolDateValidation).values({
            "symbol": symbol.upper(),
            "date": date,
            "timescale": timescale,
            "is_complete": is_complete,
            "bar_count": bar_count,
            "expected_bars": expected,
            "first_bar_time": first_bar,
            "last_bar_time": last_bar,
            "validated_at": datetime.now(timezone.utc)
        })
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
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Created validation record for %s %s %s", symbol, date, timescale)


async def load_yesterday_data(init_db_flag: bool = True, api_key: Optional[str] = None):
    """
    Load all timescales for yesterday.
    
    Args:
        init_db_flag: If True, initialize database (default True). Set to False if already initialized.
        api_key: Polygon API key. If None, reads from POLYGON_API_KEY env var.
    """
    # Initialize database if needed
    if init_db_flag:
        await init_db()
        if logger.isEnabledFor(logging.INFO):
            logger.info("Database initialized")
    
    # Initialize Polygon client with proper connection pool configuration
    if api_key is None:
        api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        raise ValueError("POLYGON_API_KEY environment variable not set")
    client = create_polygon_client(api_key)
    if logger.isEnabledFor(logging.INFO):
        logger.info("Polygon client initialized with connection pool (10 connections)")
    
    # Get yesterday (skip weekends)
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    while yesterday.weekday() >= 5:  # Skip weekends
        yesterday -= timedelta(days=1)
    
    if logger.isEnabledFor(logging.INFO):
        logger.info("Loading data for %s", yesterday)
    
    # Get all symbols
    if logger.isEnabledFor(logging.INFO):
        logger.info("Fetching symbols from Polygon snapshot...")
    snapshot_data = fetch_snapshot_all(api_key)
    symbols = [ticker["ticker"] for ticker in snapshot_data if "ticker" in ticker]
    if logger.isEnabledFor(logging.INFO):
        logger.info("Found %s symbols", len(symbols))
    
    # Process each timescale in reverse granularity order (largest to smallest)
    # This loads daily data first (fastest, most coverage), then works down to minute data
    for timescale in ['1day', '1hour', '15min', '5min', '1min']:
        config = TIMESCALE_CONFIG[timescale]
        if logger.isEnabledFor(logging.INFO):
            logger.info("")
            logger.info("=" * 60)
            logger.info("Processing %s for %s", timescale, yesterday)
            logger.info("=" * 60)
        
        processed = 0
        succeeded = 0
        failed = 0
        skipped = 0
        
        # Pre-check which symbols need data (single query for efficiency)
        if logger.isEnabledFor(logging.INFO):
            logger.info("Checking which of %s symbols need %s data...", len(symbols), timescale)
        symbols_needing_data = []
        async with get_async_session() as session:
            # Batch check all symbols at once using proper PostgreSQL array syntax
            # Skip symbols that have ANY validation record (complete or incomplete)
            # This means we've already tried to fetch data for them
            symbols_upper = [s.upper() for s in symbols]
            result = await session.execute(
                text("""
                    SELECT symbol
                    FROM symbol_date_validation
                    WHERE symbol = ANY(:symbols)
                      AND date = :date
                      AND timescale = :timescale
                """),
                {
                    "symbols": symbols_upper,
                    "date": yesterday,
                    "timescale": timescale
                }
            )
            existing_symbols = {row[0] for row in result}
            symbols_needing_data = [s for s in symbols if s.upper() not in existing_symbols]
            skipped = len(symbols) - len(symbols_needing_data)
        
        if logger.isEnabledFor(logging.INFO):
            logger.info("Found %s symbols needing data, %s already have data (will skip)",
                       len(symbols_needing_data), skipped)
        
        if not symbols_needing_data:
            if logger.isEnabledFor(logging.INFO):
                logger.info("All symbols already have %s data for %s, skipping this timescale", timescale, yesterday)
            continue
        
        # Process symbols with limited concurrency (3 concurrent requests)
        total_symbols = len(symbols_needing_data)
        semaphore = asyncio.Semaphore(3)  # 3 concurrent requests for ~3x speedup
        if logger.isEnabledFor(logging.INFO):
            logger.info("Processing %s symbols with 3 concurrent requests...", total_symbols)
        
        async def process_symbol(symbol: str, idx: int):
            nonlocal processed, succeeded, failed
            
            async with semaphore:
                processed += 1
                try:
                    if logger.isEnabledFor(logging.DEBUG):
                        logger.debug("Loading %s %s (%s/%s)...", symbol, timescale, idx, total_symbols)
                    bars = await load_symbol_data(client, symbol, yesterday, timescale, config)
                    
                    if bars:
                        if logger.isEnabledFor(logging.DEBUG):
                            logger.debug("%s: Got %s bars, inserting...", symbol, len(bars))
                        await insert_bars(bars)
                        await create_validation(symbol, yesterday, timescale, bars)
                        succeeded += 1
                        if logger.isEnabledFor(logging.DEBUG):
                            logger.debug("%s: %s bars loaded and validated", symbol, len(bars))
                    else:
                        # No data, but mark as validated
                        if logger.isEnabledFor(logging.DEBUG):
                            logger.debug("%s: No data available, marking as validated", symbol)
                        await create_validation(symbol, yesterday, timescale, [])
                        succeeded += 1
                    
                except Exception as e:
                    failed += 1
                    logger.error("%s: Failed - %s", symbol, e)
                
                # Log progress every 100 processed for better visibility
                if processed % 100 == 0 and logger.isEnabledFor(logging.INFO):
                    logger.info("Progress: %s/%s processed (%s succeeded, %s failed, %s skipped)",
                                processed, total_symbols, succeeded, failed, skipped)
        
        # Process all symbols concurrently (with semaphore limiting to 3)
        tasks = [process_symbol(symbol, idx) for idx, symbol in enumerate(symbols_needing_data, 1)]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        if logger.isEnabledFor(logging.INFO):
            logger.info("%s complete: %s succeeded, %s failed, %s skipped",
                       timescale, succeeded, failed, skipped)
    
    if logger.isEnabledFor(logging.INFO):
        logger.info("All done!")


# Make it importable
__all__ = ['load_yesterday_data']

if __name__ == "__main__":
    asyncio.run(load_yesterday_data())

