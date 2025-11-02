"""
Storage service for pre-calculated screener metrics.

Handles efficient bulk upsert and retrieval of metrics from screener_metrics table.
"""

import logging
from datetime import date
from typing import Dict, List

from sqlalchemy import text
from app.services.core.database import get_async_session


logger = logging.getLogger("app.screener.metrics.storage")


async def upsert_metrics(metrics: Dict[str, Dict], target_date: date) -> int:
    """
    Bulk upsert metrics to database using efficient INSERT ON CONFLICT.
    
    Args:
        metrics: Dict mapping symbol to metrics dict
        target_date: Date these metrics are for
        
    Returns:
        Number of rows upserted
    """
    if not metrics:
        return 0
    
    try:
        async with get_async_session() as session:
            # Build VALUES clause for bulk insert
            values_parts = []
            for symbol, m in metrics.items():
                values_parts.append(f"""(
                    '{symbol}',
                    '{target_date}',
                    {m.get('rv14') or 'NULL'},
                    {m.get('rv30') or 'NULL'},
                    {m.get('rv60') or 'NULL'},
                    {m.get('high_90d') or 'NULL'},
                    {m.get('low_90d') or 'NULL'},
                    {m.get('sma_20') or 'NULL'},
                    {m.get('sma_50') or 'NULL'},
                    {m.get('sma_200') or 'NULL'},
                    {m.get('rsi_14') or 'NULL'},
                    {m.get('macd_line') or 'NULL'},
                    {m.get('macd_signal') or 'NULL'},
                    {m.get('macd_histogram') or 'NULL'},
                    {m.get('bb_upper') or 'NULL'},
                    {m.get('bb_middle') or 'NULL'},
                    {m.get('bb_lower') or 'NULL'},
                    {m.get('atr_14') or 'NULL'},
                    {m.get('volume_ma_20') or 'NULL'},
                    {m.get('volume_trend') and f"'{m['volume_trend']}'" or 'NULL'}
                )""")
            
            values_clause = ",\n".join(values_parts)
            
            # Single bulk upsert query
            await session.execute(
                text(f"""
                    INSERT INTO screener_metrics (
                        symbol, date,
                        rv14, rv30, rv60,
                        high_90d, low_90d,
                        sma_20, sma_50, sma_200,
                        rsi_14,
                        macd_line, macd_signal, macd_histogram,
                        bb_upper, bb_middle, bb_lower,
                        atr_14,
                        volume_ma_20, volume_trend
                    )
                    VALUES {values_clause}
                    ON CONFLICT (symbol, date) 
                    DO UPDATE SET
                        rv14 = EXCLUDED.rv14,
                        rv30 = EXCLUDED.rv30,
                        rv60 = EXCLUDED.rv60,
                        high_90d = EXCLUDED.high_90d,
                        low_90d = EXCLUDED.low_90d,
                        sma_20 = EXCLUDED.sma_20,
                        sma_50 = EXCLUDED.sma_50,
                        sma_200 = EXCLUDED.sma_200,
                        rsi_14 = EXCLUDED.rsi_14,
                        macd_line = EXCLUDED.macd_line,
                        macd_signal = EXCLUDED.macd_signal,
                        macd_histogram = EXCLUDED.macd_histogram,
                        bb_upper = EXCLUDED.bb_upper,
                        bb_middle = EXCLUDED.bb_middle,
                        bb_lower = EXCLUDED.bb_lower,
                        atr_14 = EXCLUDED.atr_14,
                        volume_ma_20 = EXCLUDED.volume_ma_20,
                        volume_trend = EXCLUDED.volume_trend,
                        calculated_at = NOW()
                """)
            )
            
            await session.commit()
            
            logger.info(f"Upserted {len(metrics)} metrics for {target_date}")
            return len(metrics)
            
    except Exception as e:
        logger.error(f"Error upserting metrics: {e}", exc_info=True)
        return 0


async def get_metrics(symbols: List[str], target_date: date) -> Dict[str, Dict]:
    """
    Retrieve metrics for multiple symbols efficiently.
    
    Args:
        symbols: List of ticker symbols
        target_date: Date to retrieve metrics for
        
    Returns:
        Dict mapping symbol to metrics dict
    """
    if not symbols:
        return {}
    
    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        symbol,
                        rv14, rv30, rv60,
                        high_90d, low_90d,
                        sma_20, sma_50, sma_200,
                        rsi_14,
                        macd_line, macd_signal, macd_histogram,
                        bb_upper, bb_middle, bb_lower,
                        atr_14,
                        volume_ma_20, volume_trend
                    FROM screener_metrics
                    WHERE symbol = ANY(:symbols)
                      AND date = :target_date
                """),
                {"symbols": symbols, "target_date": target_date}
            )
            
            metrics = {}
            for row in result:
                metrics[row[0]] = {
                    "rv14": float(row[1]) if row[1] else 0.0,
                    "rv30": float(row[2]) if row[2] else 0.0,
                    "rv60": float(row[3]) if row[3] else 0.0,
                    "high_90d": float(row[4]) if row[4] else None,
                    "low_90d": float(row[5]) if row[5] else None,
                    "sma_20": float(row[6]) if row[6] else None,
                    "sma_50": float(row[7]) if row[7] else None,
                    "sma_200": float(row[8]) if row[8] else None,
                    "rsi_14": float(row[9]) if row[9] else None,
                    "macd_line": float(row[10]) if row[10] else None,
                    "macd_signal": float(row[11]) if row[11] else None,
                    "macd_histogram": float(row[12]) if row[12] else None,
                    "bb_upper": float(row[13]) if row[13] else None,
                    "bb_middle": float(row[14]) if row[14] else None,
                    "bb_lower": float(row[15]) if row[15] else None,
                    "atr_14": float(row[16]) if row[16] else None,
                    "volume_ma_20": float(row[17]) if row[17] else None,
                    "volume_trend": row[18]
                }
            
            return metrics
            
    except Exception as e:
        logger.error(f"Error retrieving metrics: {e}", exc_info=True)
        return {}


async def get_metrics_coverage() -> Dict:
    """
    Get statistics about metrics coverage.
    
    Returns:
        Dict with coverage statistics
    """
    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT 
                        COUNT(DISTINCT symbol) as symbol_count,
                        COUNT(DISTINCT date) as date_count,
                        MIN(date) as earliest_date,
                        MAX(date) as latest_date,
                        COUNT(*) as total_rows
                    FROM screener_metrics
                """)
            )
            
            row = result.fetchone()
            if row:
                return {
                    "symbol_count": row[0],
                    "date_count": row[1],
                    "earliest_date": str(row[2]) if row[2] else None,
                    "latest_date": str(row[3]) if row[3] else None,
                    "total_rows": row[4]
                }
            
            return {}
            
    except Exception as e:
        logger.error(f"Error getting coverage stats: {e}", exc_info=True)
        return {}

