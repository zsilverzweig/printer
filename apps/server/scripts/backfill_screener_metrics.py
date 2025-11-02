"""
Backfill screener metrics for all historical data.

Run this script once to populate metrics for all available daily data in the database.
"""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import text
from app.services.core.database import get_async_session
from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
from app.services.screener.screener_metrics_storage import upsert_metrics


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("backfill_metrics")


async def get_earliest_daily_data_date() -> date:
    """Find the earliest date with daily data in market_data."""
    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT MIN(time::date) as earliest_date
                    FROM market_data
                    WHERE timescale = '1day'
                """)
            )
            row = result.fetchone()
            if row and row[0]:
                return row[0]
            
            # Default to 1 year ago if no data
            return date.today() - timedelta(days=365)
    except Exception as e:
        logger.error(f"Error finding earliest date: {e}")
        return date.today() - timedelta(days=365)


async def get_symbols_with_complete_daily_data(target_date: date):
    """
    Get symbols that have complete daily data for the target date.
    
    Uses symbol_date_validation table to find symbols with validated data.
    """
    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT DISTINCT symbol
                    FROM market_data
                    WHERE time::date = :target_date
                      AND timescale = '1day'
                      AND volume > 0
                """),
                {"target_date": target_date}
            )
            symbols = [row[0] for row in result.all()]
            return symbols
    except Exception as e:
        logger.error(f"Error getting symbols for {target_date}: {e}")
        return []


async def backfill_date_range(start_date: date, end_date: date):
    """
    Backfill metrics for a specific date range.
    
    Args:
        start_date: First date to backfill
        end_date: Last date to backfill
    """
    logger.info(f"Backfilling metrics from {start_date} to {end_date}")
    
    calc = TimescaleIndicatorCalculator()
    current_date = start_date
    total_days = (end_date - start_date).days + 1
    processed_days = 0
    
    while current_date <= end_date:
        # Skip weekends (markets closed)
        if current_date.weekday() >= 5:  # Saturday=5, Sunday=6
            current_date += timedelta(days=1)
            continue
        
        try:
            # Get symbols with data for this date
            symbols = await get_symbols_with_complete_daily_data(current_date)
            
            if symbols:
                logger.info(f"{current_date}: Found {len(symbols)} symbols with data")
                
                # Process in batches of 1000
                BATCH_SIZE = 1000
                total_calculated = 0
                
                for i in range(0, len(symbols), BATCH_SIZE):
                    batch = symbols[i:i+BATCH_SIZE]
                    batch_num = i // BATCH_SIZE + 1
                    total_batches = (len(symbols) - 1) // BATCH_SIZE + 1
                    
                    # Calculate metrics
                    metrics = await calc.calculate_all_metrics_batch(batch, current_date)
                    
                    if metrics:
                        # Store in database
                        upserted = await upsert_metrics(metrics, current_date)
                        total_calculated += upserted
                        logger.info(f"{current_date} batch {batch_num}/{total_batches}: Calculated {len(metrics)}, upserted {upserted}")
                
                logger.info(f"{current_date}: ✓ Completed {total_calculated} symbols")
            else:
                logger.info(f"{current_date}: No data (weekend or holiday)")
            
            processed_days += 1
            
            # Progress indicator every 30 days
            if processed_days % 30 == 0:
                pct = (processed_days / total_days) * 100
                logger.info(f"Progress: {pct:.1f}% complete ({processed_days}/{total_days} days)")
            
        except Exception as e:
            logger.error(f"Error processing {current_date}: {e}", exc_info=True)
        
        current_date += timedelta(days=1)
    
    logger.info(f"✅ Backfill complete! Processed {processed_days} days from {start_date} to {end_date}")


async def backfill_all_metrics():
    """Backfill metrics for all available historical daily data."""
    logger.info("Starting full backfill of screener metrics")
    
    # Find date range
    earliest = await get_earliest_daily_data_date()
    latest = date.today() - timedelta(days=1)  # Yesterday
    
    logger.info(f"Date range: {earliest} to {latest} ({(latest - earliest).days} days)")
    
    # Run backfill
    await backfill_date_range(earliest, latest)
    
    logger.info("Full backfill complete!")


async def main():
    """Main entry point for backfill script."""
    import sys
    
    if len(sys.argv) > 1:
        # Custom date range provided
        start_str = sys.argv[1]
        end_str = sys.argv[2] if len(sys.argv) > 2 else start_str
        
        from datetime import datetime
        start_date = datetime.strptime(start_str, "%Y-%m-%d").date()
        end_date = datetime.strptime(end_str, "%Y-%m-%d").date()
        
        await backfill_date_range(start_date, end_date)
    else:
        # Full backfill
        await backfill_all_metrics()


if __name__ == "__main__":
    asyncio.run(main())

