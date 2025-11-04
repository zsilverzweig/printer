"""
Backtest Lookup Service.

Service for populating and checking the market_data_backtest_lookup table
which pre-computes "latest bar as-of" data for every trading minute.
"""

import logging
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Dict

from sqlalchemy import text
from app.services.core.database import get_async_session

logger = logging.getLogger(__name__)


async def check_lookup_coverage(target_date: date_type) -> Dict:
    """
    Check if lookup data exists for a date.
    
    Args:
        target_date: Date to check
        
    Returns:
        Dict with has_data, total_rows, symbols, minutes, expected_minutes
    """
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    async with get_async_session() as session:
        result = await session.execute(text("""
            SELECT 
                COUNT(*) as total_rows,
                COUNT(DISTINCT symbol) as symbols,
                COUNT(DISTINCT lookup_time) as minutes
            FROM market_data_backtest_lookup
            WHERE lookup_time >= :start_dt
              AND lookup_time <= :end_dt
              AND timescale = '1min';
        """), {"start_dt": start_dt, "end_dt": end_dt})
        
        row = result.first()
        return {
            "has_data": row[0] > 0,
            "total_rows": row[0],
            "symbols": row[1],
            "minutes": row[2],
            "expected_minutes": 391  # 9:30 to 16:00
        }


async def populate_lookup_for_date(target_date: date_type, timescale: str = '1min') -> Dict:
    """
    Populate lookup table for one date.
    
    Args:
        target_date: Date to populate
        timescale: Timescale to use (default: '1min')
        
    Returns:
        Dict with total_rows, symbols, and size
    """
    logger.info(f"📊 Populating backtest lookup for {target_date} ({timescale})")
    
    # Trading hours: 9:30 AM to 4:00 PM UTC
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    async with get_async_session() as session:
        # Simple approach: Iterate through minutes and populate
        current = start_dt
        minute_count = 0
        
        while current <= end_dt:
            if minute_count % 60 == 0:
                logger.info(f"  Processing {current.strftime('%H:%M')}...")
            
            # Insert rows for this minute
            await session.execute(text("""
                INSERT INTO market_data_backtest_lookup 
                    (symbol, timescale, lookup_time, latest_bar_time, close, open, high, low, volume)
                SELECT 
                    m.symbol,
                    :timescale as timescale,
                    :lookup_time as lookup_time,
                    m.time as latest_bar_time,
                    m.close,
                    m.open,
                    m.high,
                    m.low,
                    m.volume
                FROM (
                    SELECT DISTINCT ON (symbol)
                        symbol, time, close, open, high, low, volume
                    FROM market_data
                    WHERE timescale = :timescale
                      AND time <= :lookup_time
                      AND time >= :start_date
                    ORDER BY symbol, time DESC
                ) m
                ON CONFLICT (symbol, timescale, lookup_time) DO UPDATE
                SET latest_bar_time = EXCLUDED.latest_bar_time,
                    close = EXCLUDED.close,
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    volume = EXCLUDED.volume;
            """), {
                "timescale": timescale,
                "lookup_time": current,
                "start_date": target_date
            })
            
            # Commit every 10 minutes
            if minute_count % 10 == 0:
                await session.commit()
            
            current += timedelta(minutes=1)
            minute_count += 1
        
        await session.commit()
        
        # Get stats
        stats = await session.execute(text("""
            SELECT 
                COUNT(*) as total_rows,
                COUNT(DISTINCT symbol) as symbols,
                pg_size_pretty(pg_total_relation_size('market_data_backtest_lookup')) as size
            FROM market_data_backtest_lookup
            WHERE lookup_time >= :start_dt
              AND lookup_time <= :end_dt;
        """), {"start_dt": start_dt, "end_dt": end_dt})
        
        row = stats.first()
        result = {
            "total_rows": row[0],
            "symbols": row[1],
            "size": row[2]
        }
        logger.info(f"✅ Populated {row[0]:,} rows for {row[1]} symbols ({row[2]})")
        return result
