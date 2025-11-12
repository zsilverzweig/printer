"""
Backtest Lookup Service.

Service for populating and checking the market_data_backtest_lookup table
which pre-computes "latest bar as-of" data for every trading minute.
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Dict, List, Tuple, Optional

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.services.core.database import get_async_session

logger = logging.getLogger(__name__)


async def check_lookup_coverage(target_date: date_type) -> Dict:
    """
    Check if lookup data exists for a date.
    
    Args:
        target_date: Date to check
        
    Returns:
        Dict with has_data, total_rows, symbols, minutes
    """
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    async with get_async_session() as session:
        result = await session.execute(text("""
            SELECT 
                COUNT(*) AS total_rows,
                COUNT(DISTINCT symbol) AS symbols,
                COUNT(DISTINCT lookup_time) AS minutes
            FROM market_data_backtest_lookup
            WHERE lookup_time >= :start_dt
              AND lookup_time <= :end_dt
              AND timescale = '1min';
        """), {"start_dt": start_dt, "end_dt": end_dt})
        
        row = result.first()
        total_rows = row[0] or 0
        return {
            "has_data": total_rows > 0,
            "total_rows": total_rows,
            "symbols": row[1] or 0,
            "minutes": row[2] or 0,
        }


async def populate_lookup_for_date(
    target_date: date_type,
    timescale: str = '1min',
    max_minutes: Optional[int] = None,
) -> Dict:
    """
    Populate lookup table for one date.
    
    Args:
        target_date: Date to populate
        timescale: Timescale to use (default: '1min')
        
    Returns:
        Dict with total_rows, symbols, and size
    """
    logger.info(f"📊 Populating backtest lookup for {target_date} ({timescale})")
    
    # Validate timescale is supported
    if timescale.lower() != '1min':
        raise ValueError(f"Unsupported timescale '{timescale}' for backtest lookup population")

    coverage = await check_lookup_coverage(target_date)

    if coverage.get("has_data", False):
        logger.info(
            "Lookup already populated for %s (%s); skipping population.",
            target_date,
            timescale,
        )
        return {
            "total_rows": coverage.get("total_rows", 0),
            "symbols": coverage.get("symbols", 0),
            "minute_count": coverage.get("minutes", 0),
            "skipped": True,
            "reason": "lookup_exists",
        }

    # Trading hours: 9:30 AM to 4:00 PM UTC
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
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
            if max_minutes is not None and minute_count >= max_minutes:
                logger.debug(
                    "  ↳ Reached max_minutes=%d, stopping early at %s",
                    max_minutes,
                    current.strftime("%H:%M"),
                )
                break
            if minute_count % 60 == 0:
                logger.info(f"  Processing {current.strftime('%H:%M')}...")
            logger.debug(
                "  ↳ Begin minute %s (minute %d)",
                current.strftime("%H:%M"),
                minute_count + 1,
            )
            
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
                            COALESCE(md.volume, 0) AS volume,
                            SUM(COALESCE(md.volume, 0)) OVER (
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
            })
            logger.debug(
                "  ↳ Completed minute %s (minute %d)",
                current.strftime("%H:%M"),
                minute_count + 1,
            )
            
            # Commit every 10 minutes
            if minute_count % 10 == 0:
                await session.commit()
                logger.debug("  ↳ Intermediate commit at %s", current.strftime("%H:%M"))
            
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
