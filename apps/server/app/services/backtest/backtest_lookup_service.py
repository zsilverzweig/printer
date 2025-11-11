"""
Backtest Lookup Service.

Service for populating and checking the market_data_backtest_lookup table
which pre-computes "latest bar as-of" data for every trading minute.
"""

import logging
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Dict, List, Tuple

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.services.core.database import get_async_session

logger = logging.getLogger(__name__)

EXPECTED_MINUTES_BY_TIMESCALE: Dict[str, int] = {
    "1min": 391,
}


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
    
    expected_minutes = EXPECTED_MINUTES_BY_TIMESCALE.get(timescale.lower())
    if expected_minutes is None:
        raise ValueError(f"Unsupported timescale '{timescale}' for backtest lookup population")

    async with get_async_session() as session:
        # Fetch validation records and ensure completeness
        try:
            validation_stmt = text("""
                SELECT symbol, bar_count
                FROM symbol_date_validation
                WHERE date = :target_date
                  AND timescale = :timescale
            """)
            validation_result = await session.execute(
                validation_stmt,
                {
                    "target_date": target_date,
                    "timescale": timescale,
                },
            )
            validation_rows: List[Tuple[str, int]] = [
                (row[0], row[1]) for row in validation_result.fetchall()
            ]
        except SQLAlchemyError as exc:
            logger.error("Failed to load validation records: %s", exc, exc_info=True)
            raise

        if not validation_rows:
            raise ValueError(
                f"No validation records found for {target_date} ({timescale}); "
                "cannot populate backtest lookup without validated data."
            )

        incomplete_symbols = [
            symbol for symbol, bar_count in validation_rows if (bar_count or 0) < expected_minutes
        ]
        if incomplete_symbols:
            raise ValueError(
                "Incomplete validation coverage; missing full intraday bars for: "
                + ", ".join(sorted(incomplete_symbols[:10]))
                + (", ..." if len(incomplete_symbols) > 10 else "")
            )

        logger.info(
            "Validation confirmed for %s symbols for %s (%s)",
            len(validation_rows),
            target_date,
            timescale,
        )

        # Simple approach: Iterate through minutes and populate
        current = start_dt
        minute_count = 0
        
        while current <= end_dt:
            if minute_count % 60 == 0:
                logger.info(f"  Processing {current.strftime('%H:%M')}...")
            
            # Insert rows for this minute
            await session.execute(text("""
                INSERT INTO market_data_backtest_lookup 
                    (symbol, timescale, lookup_time, latest_bar_time, close, open, high, low, volume, today_volume)
                SELECT 
                    m.symbol,
                    :timescale as timescale,
                    :lookup_time as lookup_time,
                    m.time as latest_bar_time,
                    m.close,
                    m.open,
                    m.high,
                    m.low,
                    m.volume,
                    m.today_volume
                FROM (
                    SELECT DISTINCT ON (symbol)
                        symbol,
                        time,
                        close,
                        open,
                        high,
                        low,
                        volume,
                        today_volume
                    FROM (
                        SELECT
                            md.symbol,
                            md.time,
                            md.close,
                            md.open,
                            md.high,
                            md.low,
                            md.volume,
                            SUM(md.volume) OVER (
                                PARTITION BY md.symbol
                                ORDER BY md.time
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                            ) AS today_volume
                        FROM market_data md
                        JOIN symbol_date_validation v
                          ON v.symbol = md.symbol
                         AND v.date = :target_date
                         AND v.timescale = :timescale
                        WHERE md.timescale = :timescale
                          AND md.time <= :lookup_time
                          AND md.time >= :start_date
                          AND v.bar_count >= :expected_minutes
                    ) ordered_bars
                    ORDER BY symbol, time DESC
                ) m
                ON CONFLICT (symbol, timescale, lookup_time) DO UPDATE
                SET latest_bar_time = EXCLUDED.latest_bar_time,
                    close = EXCLUDED.close,
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    volume = EXCLUDED.volume,
                    today_volume = EXCLUDED.today_volume;
            """), {
                "timescale": timescale,
                "lookup_time": current,
                "start_date": target_date,
                "target_date": target_date,
                "expected_minutes": expected_minutes,
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
