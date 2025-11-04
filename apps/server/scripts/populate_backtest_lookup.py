#!/usr/bin/env python3
"""
Populate backtest lookup table for a given date.

This pre-computes "latest bar as-of" data for every trading minute,
making backtest queries instant.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone, date as date_type

sys.path.insert(0, '/app')

from app.services.core.database import get_async_session
from sqlalchemy import text


async def populate_date(target_date: date_type, timescale: str = '1min'):
    """Populate lookup table for one date."""
    print(f"📊 Populating backtest lookup for {target_date} ({timescale})")
    
    # Trading hours: 9:30 AM to 4:00 PM UTC
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    async with get_async_session() as session:
        # Simple approach: Iterate through minutes and populate
        current = start_dt
        minute_count = 0
        
        while current <= end_dt:
            if minute_count % 60 == 0:
                print(f"  Processing {current.strftime('%H:%M')}...")
            
            # Insert rows for this minute
            await session.execute(text(f"""
                INSERT INTO market_data_backtest_lookup 
                    (symbol, timescale, lookup_time, latest_bar_time, close, open, high, low, volume)
                SELECT 
                    m.symbol,
                    '{timescale}' as timescale,
                    '{current.isoformat()}' as lookup_time,
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
                    WHERE timescale = '{timescale}'
                      AND time <= '{current.isoformat()}'
                      AND time >= '{target_date.isoformat()}'
                    ORDER BY symbol, time DESC
                ) m
                ON CONFLICT (symbol, timescale, lookup_time) DO UPDATE
                SET latest_bar_time = EXCLUDED.latest_bar_time,
                    close = EXCLUDED.close,
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    volume = EXCLUDED.volume;
            """))
            
            # Commit every 10 minutes
            if minute_count % 10 == 0:
                await session.commit()
            
            current += timedelta(minutes=1)
            minute_count += 1
        
        await session.commit()
        
        # Get stats
        stats = await session.execute(text(f"""
            SELECT 
                COUNT(*) as total_rows,
                COUNT(DISTINCT symbol) as symbols,
                pg_size_pretty(pg_total_relation_size('market_data_backtest_lookup')) as size
            FROM market_data_backtest_lookup
            WHERE lookup_time >= '{start_dt.isoformat()}'
              AND lookup_time <= '{end_dt.isoformat()}';
        """))
        
        row = stats.first()
        print(f"✅ Populated {row[0]:,} rows for {row[1]} symbols ({row[2]})")


async def check_lookup_coverage(target_date: date_type) -> dict:
    """Check if lookup data exists for a date."""
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    async with get_async_session() as session:
        result = await session.execute(text(f"""
            SELECT 
                COUNT(*) as total_rows,
                COUNT(DISTINCT symbol) as symbols,
                COUNT(DISTINCT lookup_time) as minutes
            FROM market_data_backtest_lookup
            WHERE lookup_time >= '{start_dt.isoformat()}'
              AND lookup_time <= '{end_dt.isoformat()}'
              AND timescale = '1min';
        """))
        
        row = result.first()
        return {
            "has_data": row[0] > 0,
            "total_rows": row[0],
            "symbols": row[1],
            "minutes": row[2],
            "expected_minutes": 391  # 9:30 to 16:00
        }


if __name__ == "__main__":
    target = date_type(2025, 11, 3)
    asyncio.run(populate_date(target))
