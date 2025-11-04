#!/usr/bin/env python3
"""
Market data loader for comprehensive data coverage.

Loads:
- Yesterday's data (all timescales)
- Today's data (all timescales) - up to current time
- 7 days of hourly bars
- 5min/15min for last 7 days
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from polygon import RESTClient
from sqlalchemy import text
import logging

# Import core utilities
# Add scripts directory to path so we can import the core module
_scripts_dir = os.path.dirname(__file__)
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

import market_data_loader_core
from market_data_loader_core import (
    create_polygon_client,
    load_symbol_data,
    insert_bars,
    create_validation,
    TIMESCALE_CONFIG,
    logger
)

from app.services.core.database import get_async_session, init_db
from app.services.screener.screener_snapshot import fetch_snapshot_all


async def load_date_range_data(
    client: RESTClient,
    symbols: List[str],
    start_date: datetime.date,
    end_date: datetime.date,
    timescales: List[str]
):
    """
    Load data for a date range and timescales.
    
    Args:
        client: Polygon REST client
        symbols: List of symbols to load
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        timescales: List of timescales to load (e.g., ['1hour', '5min'])
    """
    # Generate date range (skip weekends)
    dates = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday=0, Friday=4
            dates.append(current)
        current += timedelta(days=1)
    
    if not dates:
        if logger.isEnabledFor(logging.INFO):
            logger.info("No trading days in date range")
        return
    
    if logger.isEnabledFor(logging.INFO):
        logger.info("Loading %s timescales for %s dates (%s to %s)",
                   len(timescales), len(dates), start_date, end_date)
    
    # Process each timescale
    for timescale in timescales:
        config = TIMESCALE_CONFIG[timescale]
        if logger.isEnabledFor(logging.INFO):
            logger.info("")
            logger.info("Processing %s...", timescale)
        
        processed = 0
        succeeded = 0
        failed = 0
        skipped = 0
        
        # Pre-check which symbols/dates need data
        symbols_needing_data = []
        async with get_async_session() as session:
            for symbol in symbols:
                symbol_upper = symbol.upper()
                # Check which dates need data for this symbol
                result = await session.execute(
                    text("""
                        SELECT DISTINCT date
                        FROM symbol_date_validation
                        WHERE symbol = :symbol
                          AND date BETWEEN :start_date AND :end_date
                          AND timescale = :timescale
                    """),
                    {
                        "symbol": symbol_upper,
                        "start_date": start_date,
                        "end_date": end_date,
                        "timescale": timescale
                    }
                )
                existing_dates = {row[0] for row in result}
                missing_dates = [d for d in dates if d not in existing_dates]
                if missing_dates:
                    symbols_needing_data.append((symbol, missing_dates))
        
        total_symbol_dates = sum(len(dates) for _, dates in symbols_needing_data)
        if logger.isEnabledFor(logging.INFO):
            logger.info("Found %s symbol-date combinations needing data (%s skipped)",
                       total_symbol_dates, len(symbols) * len(dates) - total_symbol_dates)
        
        if not symbols_needing_data:
            if logger.isEnabledFor(logging.INFO):
                logger.info("All symbols already have %s data for date range, skipping", timescale)
            continue
        
        # Process with limited concurrency
        semaphore = asyncio.Semaphore(3)
        
        async def process_symbol_date(symbol: str, date: datetime.date):
            nonlocal processed, succeeded, failed
            
            async with semaphore:
                processed += 1
                try:
                    bars = await load_symbol_data(client, symbol, date, timescale, config)
                    if bars:
                        await insert_bars(bars)
                        await create_validation(symbol, date, timescale, bars)
                        succeeded += 1
                    else:
                        await create_validation(symbol, date, timescale, [])
                        succeeded += 1
                except Exception as e:
                    failed += 1
                    logger.error("%s %s %s: Failed - %s", symbol, date, timescale, e)
                
                if processed % 100 == 0 and logger.isEnabledFor(logging.INFO):
                    logger.info("Progress: %s/%s processed (%s succeeded, %s failed)",
                               processed, total_symbol_dates, succeeded, failed)
        
        # Create tasks for all symbol-date combinations
        tasks = []
        for symbol, dates_list in symbols_needing_data:
            for date in dates_list:
                tasks.append(process_symbol_date(symbol, date))
        
        await asyncio.gather(*tasks, return_exceptions=True)
        
        if logger.isEnabledFor(logging.INFO):
            logger.info("%s complete: %s succeeded, %s failed, %s skipped",
                       timescale, succeeded, failed, skipped)


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
    
    # Get yesterday (skip weekends)
    yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
    while yesterday.weekday() >= 5:  # Skip weekends
        yesterday -= timedelta(days=1)
    
    # Get all symbols
    snapshot_data = fetch_snapshot_all(api_key)
    symbols = [ticker["ticker"] for ticker in snapshot_data if "ticker" in ticker]
    
    # Process each timescale in reverse granularity order (largest to smallest)
    # This loads daily data first (fastest, most coverage), then works down to minute data
    timescales_processed = []
    timescales_skipped = []
    
    for timescale in ['1day', '1hour', '15min', '5min', '1min']:
        config = TIMESCALE_CONFIG[timescale]
        
        processed = 0
        succeeded = 0
        failed = 0
        skipped = 0
        
        # Pre-check which symbols need data (single query for efficiency)
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
        
        if not symbols_needing_data:
            timescales_skipped.append(timescale)
            continue
        
        timescales_processed.append(timescale)
        if logger.isEnabledFor(logging.INFO):
            logger.info("Loading %s data for %s (%s symbols need data, %s already exist)",
                       timescale, yesterday, len(symbols_needing_data), skipped)
        
        # Process symbols with limited concurrency (3 concurrent requests)
        total_symbols = len(symbols_needing_data)
        semaphore = asyncio.Semaphore(3)  # 3 concurrent requests for ~3x speedup
        
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
            logger.info("✓ %s: %s succeeded, %s failed", timescale, succeeded, failed)
    
    # Summary
    if logger.isEnabledFor(logging.INFO):
        if timescales_processed:
            logger.info("✓ Market data loaded: %s", ", ".join(timescales_processed))
        if timescales_skipped:
            logger.info("✓ Already complete: %s", ", ".join(timescales_skipped))


async def load_comprehensive_data(init_db_flag: bool = True, api_key: Optional[str] = None):
    """
    Load comprehensive market data:
    - All timescales from yesterday
    - All timescales from today (up to current time)
    - 7 days of hourly bars
    - 5min/15min for last 7 days
    
    Args:
        init_db_flag: If True, initialize database (default True). Set to False if already initialized.
        api_key: Polygon API key. If None, reads from POLYGON_API_KEY env var.
    """
    # Initialize database if needed
    if init_db_flag:
        await init_db()
        if logger.isEnabledFor(logging.INFO):
            logger.info("Database initialized")
    
    # Initialize Polygon client
    if api_key is None:
        api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        raise ValueError("POLYGON_API_KEY environment variable not set")
    client = create_polygon_client(api_key)
    
    # Get symbols
    if logger.isEnabledFor(logging.INFO):
        logger.info("Fetching symbols from Polygon snapshot...")
    snapshot_data = fetch_snapshot_all(api_key)
    symbols = [ticker["ticker"] for ticker in snapshot_data if "ticker" in ticker]
    if logger.isEnabledFor(logging.INFO):
        logger.info("Found %s symbols", len(symbols))
    
    today = datetime.now(timezone.utc).date()
    
    # Phase 1: Load yesterday's data (all timescales)
    if logger.isEnabledFor(logging.INFO):
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 1: Loading yesterday's data (all timescales)")
        logger.info("=" * 60)
    yesterday = today - timedelta(days=1)
    while yesterday.weekday() >= 5:  # Skip weekends
        yesterday -= timedelta(days=1)
    
    await load_date_range_data(
        client, symbols, yesterday, yesterday, 
        timescales=['1day', '1hour', '15min', '5min', '1min']
    )
    
    # Phase 2: Load today's data (all timescales) - up to current time
    if logger.isEnabledFor(logging.INFO):
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 2: Loading today's data (all timescales)")
        logger.info("=" * 60)
    
    # Only load today if it's a weekday
    if today.weekday() < 5:
        await load_date_range_data(
            client, symbols, today, today,
            timescales=['1day', '1hour', '15min', '5min', '1min']
        )
    else:
        if logger.isEnabledFor(logging.INFO):
            logger.info("Today is a weekend, skipping today's data")
    
    # Phase 3: Load 7 days of hourly bars
    if logger.isEnabledFor(logging.INFO):
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 3: Loading 7 days of hourly bars")
        logger.info("=" * 60)
    start_date = today - timedelta(days=7)
    await load_date_range_data(
        client, symbols, start_date, yesterday - timedelta(days=1),
        timescales=['1hour']
    )
    
    # Phase 4: Load 5min/15min for last 7 days
    if logger.isEnabledFor(logging.INFO):
        logger.info("")
        logger.info("=" * 60)
        logger.info("Phase 4: Loading 5min/15min for last 7 days")
        logger.info("=" * 60)
    start_date = today - timedelta(days=7)
    await load_date_range_data(
        client, symbols, start_date, yesterday - timedelta(days=1),
        timescales=['15min', '5min']
    )
    
    if logger.isEnabledFor(logging.INFO):
        logger.info("")
        logger.info("=" * 60)
        logger.info("✅ Comprehensive data loading complete!")
        logger.info("=" * 60)


# Make it importable
__all__ = ['load_yesterday_data', 'load_comprehensive_data']

if __name__ == "__main__":
    asyncio.run(load_yesterday_data())
