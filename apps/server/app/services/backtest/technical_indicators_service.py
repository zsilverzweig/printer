"""
Technical Indicators Service.

Service for populating and checking the technical_indicators table
which pre-computes technical indicators for intraday timescales.
"""

import logging
from datetime import datetime, timedelta, timezone, date as date_type
from typing import Dict, List, Optional
from decimal import Decimal

from sqlalchemy import text
from app.services.core.database import get_async_session
from app.lib.technical_analysis import (
    calculate_ema,
    calculate_vwap,
    calculate_macd,
    calculate_rsi,
    average_true_range
)

logger = logging.getLogger(__name__)


async def check_indicators_coverage(
    target_date: date_type,
    timescale: str = '1min'
) -> Dict:
    """
    Check if indicator data exists for a date and timescale.
    
    Args:
        target_date: Date to check
        timescale: Timescale to check (default: '1min')
        
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
                COUNT(DISTINCT time) as minutes
            FROM technical_indicators
            WHERE time >= :start_dt
              AND time <= :end_dt
              AND timescale = :timescale;
        """), {"start_dt": start_dt, "end_dt": end_dt, "timescale": timescale})
        
        row = result.first()
        
        # Calculate expected minutes based on timescale
        if timescale == '1min':
            expected_minutes = 391  # 9:30 to 16:00 = 6.5 hours = 390 minutes + 1
        elif timescale == '5min':
            expected_minutes = 79  # ~79 five-minute periods
        elif timescale == '15min':
            expected_minutes = 27  # ~27 fifteen-minute periods
        else:
            expected_minutes = 391
        
        return {
            "has_data": row[0] > 0,
            "total_rows": row[0],
            "symbols": row[1],
            "minutes": row[2],
            "expected_minutes": expected_minutes
        }


async def populate_indicators_for_date(
    target_date: date_type,
    timescale: str = '1min'
) -> Dict:
    """
    Populate technical indicators table for one date and timescale.
    
    Args:
        target_date: Date to populate
        timescale: Timescale to use (default: '1min')
        
    Returns:
        Dict with total_rows, symbols, and size
    """
    logger.info(f"📊 Populating technical indicators for {target_date} ({timescale})")
    
    # Trading hours: 9:30 AM to 4:00 PM UTC
    start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
    end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
    
    # Calculate interval based on timescale
    if timescale == '1min':
        interval_minutes = 1
    elif timescale == '5min':
        interval_minutes = 5
    elif timescale == '15min':
        interval_minutes = 15
    else:
        raise ValueError(f"Unsupported timescale: {timescale}")
    
    async with get_async_session() as session:
        # Get all symbols that have data for this date
        symbols_result = await session.execute(text("""
            SELECT DISTINCT symbol
            FROM market_data
            WHERE timescale = :timescale
              AND time >= :start_dt
              AND time <= :end_dt
            ORDER BY symbol;
        """), {"timescale": timescale, "start_dt": start_dt, "end_dt": end_dt})
        
        symbols = [row[0] for row in symbols_result]
        logger.info(f"  Found {len(symbols)} symbols to process")
        
        total_inserted = 0
        
        # Process each symbol
        for symbol_idx, symbol in enumerate(symbols):
            if (symbol_idx + 1) % 100 == 0:
                logger.info(f"  Processing symbol {symbol_idx + 1}/{len(symbols)}: {symbol}")
            
            # Fetch all bars for this symbol on this date, plus enough history for indicators
            # Need at least 26 bars for EMA26, plus a few more for safety
            history_lookback = timedelta(days=2)  # Get 2 days of history to be safe
            
            bars_result = await session.execute(text("""
                SELECT 
                    time,
                    open,
                    high,
                    low,
                    close,
                    volume
                FROM market_data
                WHERE symbol = :symbol
                  AND timescale = :timescale
                  AND time >= :history_start
                  AND time <= :end_dt
                ORDER BY time ASC;
            """), {
                "symbol": symbol,
                "timescale": timescale,
                "history_start": start_dt - history_lookback,
                "end_dt": end_dt
            })
            
            bars = []
            for row in bars_result:
                bars.append({
                    "timestamp": row[0],
                    "time": row[0],
                    "open": float(row[1]) if row[1] else None,
                    "high": float(row[2]) if row[2] else None,
                    "low": float(row[3]) if row[3] else None,
                    "close": float(row[4]) if row[4] else None,
                    "volume": int(row[5]) if row[5] else 0
                })
            
            if len(bars) < 26:  # Need at least 26 bars for EMA26
                continue
            
            # Calculate indicators for all bars
            ema_12_values = calculate_ema(bars, period=12, price_key="close")
            ema_26_values = calculate_ema(bars, period=26, price_key="close")
            vwap_values = calculate_vwap(bars, reset_daily=True)
            macd_results = calculate_macd(bars, fast_period=12, slow_period=26, signal_period=9)
            rsi_values = calculate_rsi(bars, period=14, price_key="close")
            atr_values = []
            
            # Calculate ATR more efficiently - calculate once for all bars
            # ATR needs at least 14 bars
            if len(bars) >= 15:
                full_atr = average_true_range(bars, period=14)
                # ATR is a single value for the entire series, replicate it
                # Actually, ATR should be calculated per bar using rolling window
                # For now, calculate rolling ATR
                atr_values = []
                for i in range(len(bars)):
                    if i >= 14:
                        # Calculate ATR using last 14 bars
                        atr = average_true_range(bars[max(0, i-13):i+1], period=14)
                        atr_values.append(atr)
                    else:
                        atr_values.append(None)
            else:
                atr_values = [None] * len(bars)
            
            # Filter to only bars within target date
            target_date_bars = []
            for i, bar in enumerate(bars):
                bar_time = bar["time"]
                if isinstance(bar_time, datetime):
                    if bar_time.date() == target_date and bar_time >= start_dt and bar_time <= end_dt:
                        target_date_bars.append((i, bar))
            
            # Prepare batch insert values
            values_to_insert = []
            for bar_idx, bar in target_date_bars:
                bar_time = bar["time"]
                if isinstance(bar_time, datetime):
                    # Only insert if we have at least EMA12 calculated
                    if ema_12_values[bar_idx] is not None or ema_26_values[bar_idx] is not None:
                        values_to_insert.append({
                            "symbol": symbol,
                            "timescale": timescale,
                            "time": bar_time,
                            "ema_12": ema_12_values[bar_idx],
                            "ema_26": ema_26_values[bar_idx],
                            "vwap": vwap_values[bar_idx] if bar_idx < len(vwap_values) else None,
                            "macd_line": macd_results["macd"][bar_idx] if bar_idx < len(macd_results["macd"]) else None,
                            "macd_signal": macd_results["signal"][bar_idx] if bar_idx < len(macd_results["signal"]) else None,
                            "macd_histogram": macd_results["histogram"][bar_idx] if bar_idx < len(macd_results["histogram"]) else None,
                            "rsi_14": rsi_values[bar_idx] if bar_idx < len(rsi_values) else None,
                            "atr_14": atr_values[bar_idx] if bar_idx < len(atr_values) else None
                        })
            
            # Batch insert for this symbol
            if values_to_insert:
                # Use executemany for safer parameterized queries
                # Split into batches to avoid query size limits
                batch_size = 100
                for batch_start in range(0, len(values_to_insert), batch_size):
                    batch = values_to_insert[batch_start:batch_start + batch_size]
                    
                    # Build VALUES clause - symbols come from DB so should be safe
                    values_parts = []
                    for v in batch:
                        # Format values safely
                        ema_12_val = f"{v['ema_12']}" if v['ema_12'] is not None else 'NULL'
                        ema_26_val = f"{v['ema_26']}" if v['ema_26'] is not None else 'NULL'
                        vwap_val = f"{v['vwap']}" if v['vwap'] is not None else 'NULL'
                        macd_line_val = f"{v['macd_line']}" if v['macd_line'] is not None else 'NULL'
                        macd_signal_val = f"{v['macd_signal']}" if v['macd_signal'] is not None else 'NULL'
                        macd_hist_val = f"{v['macd_histogram']}" if v['macd_histogram'] is not None else 'NULL'
                        rsi_val = f"{v['rsi_14']}" if v['rsi_14'] is not None else 'NULL'
                        atr_val = f"{v['atr_14']}" if v['atr_14'] is not None else 'NULL'
                        
                        values_parts.append(f"""(
                            '{v["symbol"].replace("'", "''")}',
                            '{v["timescale"]}',
                            '{v["time"].isoformat()}',
                            {ema_12_val},
                            {ema_26_val},
                            {vwap_val},
                            {macd_line_val},
                            {macd_signal_val},
                            {macd_hist_val},
                            {rsi_val},
                            {atr_val}
                        )""")
                    
                    values_clause = ",\n".join(values_parts)
                    await session.execute(text(f"""
                        INSERT INTO technical_indicators (
                            symbol, timescale, time,
                            ema_12, ema_26, vwap,
                            macd_line, macd_signal, macd_histogram,
                            rsi_14, atr_14
                        )
                        VALUES {values_clause}
                        ON CONFLICT (symbol, timescale, time) DO UPDATE
                        SET
                            ema_12 = EXCLUDED.ema_12,
                            ema_26 = EXCLUDED.ema_26,
                            vwap = EXCLUDED.vwap,
                            macd_line = EXCLUDED.macd_line,
                            macd_signal = EXCLUDED.macd_signal,
                            macd_histogram = EXCLUDED.macd_histogram,
                            rsi_14 = EXCLUDED.rsi_14,
                            atr_14 = EXCLUDED.atr_14,
                            calculated_at = NOW();
                    """))
                    
                    total_inserted += len(batch)
            
            # Commit every 50 symbols
            if (symbol_idx + 1) % 50 == 0:
                await session.commit()
        
        await session.commit()
        
        # Get stats
        stats = await session.execute(text("""
            SELECT 
                COUNT(*) as total_rows,
                COUNT(DISTINCT symbol) as symbols,
                pg_size_pretty(pg_total_relation_size('technical_indicators')) as size
            FROM technical_indicators
            WHERE time >= :start_dt
              AND time <= :end_dt
              AND timescale = :timescale;
        """), {"start_dt": start_dt, "end_dt": end_dt, "timescale": timescale})
        
        row = stats.first()
        result = {
            "total_rows": row[0],
            "symbols": row[1],
            "size": row[2]
        }
        logger.info(f"✅ Populated {row[0]:,} rows for {row[1]} symbols ({row[2]})")
        return result
