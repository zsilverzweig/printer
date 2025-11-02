"""
Daily job to calculate and store screener metrics.

Runs daily after market close to calculate all technical indicators
for all active symbols.
"""

import logging
from datetime import date, timedelta
from typing import Optional, List

from sqlalchemy import text, select
from app.models.assets import TickerDetails
from app.services.core.database import get_async_session
from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
from app.services.screener.screener_metrics_storage import upsert_metrics


logger = logging.getLogger("app.screener.metrics.job")


async def get_active_symbols() -> List[str]:
    """Get list of active ticker symbols from ticker_details."""
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(TickerDetails.symbol).where(
                    TickerDetails.active == True,
                    TickerDetails.type.in_(["CS", "ETF"])
                )
            )
            symbols = [row[0] for row in result.all()]
            return symbols
    except Exception as e:
        logger.error(f"Error getting active symbols: {e}", exc_info=True)
        return []


async def run_daily_metrics_calculation(target_date: Optional[date] = None) -> dict:
    """
    Calculate and store metrics for all active symbols.
    
    Args:
        target_date: Date to calculate for (default: yesterday)
        
    Returns:
        Dict with results summary
    """
    calc_date = target_date or (date.today() - timedelta(days=1))
    
    logger.info(f"Starting daily metrics calculation for {calc_date}")
    
    try:
        # Get active symbols
        symbols = await get_active_symbols()
        if not symbols:
            logger.warning("No active symbols found")
            return {"status": "error", "message": "No active symbols"}
        
        logger.info(f"Found {len(symbols)} active symbols")
        
        # Initialize calculator
        calc = TimescaleIndicatorCalculator()
        
        # Process in batches of 1000 to avoid overwhelming the database
        BATCH_SIZE = 1000
        total_calculated = 0
        
        for i in range(0, len(symbols), BATCH_SIZE):
            batch = symbols[i:i+BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(symbols) - 1) // BATCH_SIZE + 1
            
            logger.info(f"Processing batch {batch_num}/{total_batches}: {len(batch)} symbols")
            
            # Calculate metrics for this batch
            metrics = await calc.calculate_all_metrics_batch(batch, calc_date)
            
            if metrics:
                # Store in database
                upserted = await upsert_metrics(metrics, calc_date)
                total_calculated += upserted
                logger.info(f"Batch {batch_num}/{total_batches}: Calculated {len(metrics)}, upserted {upserted}")
            else:
                logger.warning(f"Batch {batch_num}/{total_batches}: No metrics calculated")
        
        logger.info(f"Completed daily calculation: {total_calculated} symbols processed for {calc_date}")
        
        return {
            "status": "completed",
            "date": str(calc_date),
            "total_symbols": len(symbols),
            "calculated": total_calculated
        }
        
    except Exception as e:
        logger.error(f"Error in daily metrics calculation: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}

