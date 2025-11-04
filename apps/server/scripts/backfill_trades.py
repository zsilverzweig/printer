"""
Trade Backfill Script

One-time script to populate Trade table from historical transactions.
Uses FIFO matching to reconstruct trades and assign trade_ids.

Usage:
    python scripts/backfill_trades.py [--dry-run] [--fund-id FUND_ID]
"""

import asyncio
import argparse
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.services.core.database import get_async_session
from app.services.analytics.trade_builder import TradeBuilder
from app.models.strategies import Fund

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def backfill_all_funds(dry_run: bool = False):
    """Backfill trades for all funds."""
    async with get_async_session() as session:
        try:
            # Get all funds
            result = await session.execute(
                select(Fund).where(Fund.archived == False)
            )
            funds = result.scalars().all()
            
            if not funds:
                logger.warning("No funds found to backfill")
                return
            
            logger.info(f"Found {len(funds)} funds to process")
            
            # Process each fund
            total_stats = {
                "funds_processed": 0,
                "trades_created": 0,
                "transactions_processed": 0,
                "orders_updated": 0
            }
            
            for fund in funds:
                logger.info(f"\n{'='*60}")
                logger.info(f"Processing fund: {fund.name} ({fund.id})")
                logger.info(f"{'='*60}")
                
                trade_builder = TradeBuilder(session)
                stats = await trade_builder.backfill_trades_for_fund(
                    fund_id=fund.id,
                    dry_run=dry_run
                )
                
                # Accumulate stats
                total_stats["funds_processed"] += 1
                total_stats["trades_created"] += stats["trades_created"]
                total_stats["transactions_processed"] += stats["transactions_processed"]
                total_stats["orders_updated"] += stats["orders_updated"]
                
                logger.info(
                    f"Fund {fund.name}: "
                    f"{stats['trades_created']} trades created, "
                    f"{stats['transactions_processed']} transactions processed"
                )
            
            # Commit if not dry run
            if not dry_run:
                await session.commit()
                logger.info("\n✅ Changes committed to database")
            else:
                logger.info("\n⚠️  DRY RUN - No changes made to database")
            
            # Print summary
            logger.info(f"\n{'='*60}")
            logger.info("BACKFILL SUMMARY")
            logger.info(f"{'='*60}")
            logger.info(f"Funds processed: {total_stats['funds_processed']}")
            logger.info(f"Trades created: {total_stats['trades_created']}")
            logger.info(f"Transactions updated: {total_stats['transactions_processed']}")
            logger.info(f"Orders updated: {total_stats['orders_updated']}")
            logger.info(f"{'='*60}\n")
            
        except Exception as e:
            logger.error(f"Error during backfill: {e}", exc_info=True)
            await session.rollback()
            raise


async def backfill_single_fund(fund_id: str, dry_run: bool = False):
    """Backfill trades for a single fund."""
    async with get_async_session() as session:
        try:
            # Get the fund
            result = await session.execute(
                select(Fund).where(Fund.id == fund_id)
            )
            fund = result.scalar_one_or_none()
            
            if not fund:
                logger.error(f"Fund {fund_id} not found")
                return
            
            logger.info(f"Processing fund: {fund.name} ({fund.id})")
            
            # Backfill trades
            trade_builder = TradeBuilder(session)
            stats = await trade_builder.backfill_trades_for_fund(
                fund_id=fund.id,
                dry_run=dry_run
            )
            
            # Commit if not dry run
            if not dry_run:
                await session.commit()
                logger.info("\n✅ Changes committed to database")
            else:
                logger.info("\n⚠️  DRY RUN - No changes made to database")
            
            # Print summary
            logger.info(f"\n{'='*60}")
            logger.info("BACKFILL SUMMARY")
            logger.info(f"{'='*60}")
            logger.info(f"Fund: {fund.name}")
            logger.info(f"Trades created: {stats['trades_created']}")
            logger.info(f"Transactions updated: {stats['transactions_processed']}")
            logger.info(f"Orders updated: {stats['orders_updated']}")
            logger.info(f"Symbols processed: {stats['symbols_processed']}")
            logger.info(f"{'='*60}\n")
            
        except Exception as e:
            logger.error(f"Error during backfill: {e}", exc_info=True)
            await session.rollback()
            raise


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Backfill Trade records from historical transactions'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Run without making changes to database'
    )
    parser.add_argument(
        '--fund-id',
        type=str,
        help='Process only a specific fund ID'
    )
    
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("TRADE BACKFILL SCRIPT")
    logger.info("="*60)
    logger.info(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.fund_id:
        logger.info(f"Fund ID: {args.fund_id}")
    else:
        logger.info("Processing: All funds")
    logger.info("="*60 + "\n")
    
    if args.fund_id:
        asyncio.run(backfill_single_fund(args.fund_id, args.dry_run))
    else:
        asyncio.run(backfill_all_funds(args.dry_run))
    
    logger.info("\n✨ Backfill complete!")


if __name__ == "__main__":
    main()

