"""
Activity-Based Position Sync Service

Uses Alpaca's Activities API as the source of truth for position reconciliation.
The Activities API shows actual fills that occurred, including fractional shares
and partial fills, which is more reliable than polling order status.
"""

import logging
import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Transaction, Order
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.position_tracker import get_all_positions_from_transactions
from app.services.events.event_service import event_service

logger = logging.getLogger(__name__)


class ActivitySyncService:
    """
    Syncs positions using Alpaca's Activities API.
    
    Activities API provides the SOURCE OF TRUTH for what actually filled,
    including exact quantities and fractional shares.
    """
    
    def __init__(self, alpaca_service: AlpacaService):
        self.alpaca_service = alpaca_service
    
    async def reconcile_fund_positions(
        self,
        session: AsyncSession,
        fund_id: str,
        lookback_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Reconcile positions for a fund against Alpaca's records.
        
        Compares:
        1. DB transactions (our ledger)
        2. Alpaca positions (their current state)
        3. Alpaca activities (their fill history)
        
        Returns summary of discrepancies found and actions taken.
        """
        logger.info(f"🔄 Starting position reconciliation for fund {fund_id[:8]}...")
        
        # Get our positions from transaction ledger
        db_positions = await get_all_positions_from_transactions(session, fund_id)
        logger.info(f"📊 DB shows {len(db_positions)} positions: {dict(db_positions)}")
        
        # Get Alpaca's current positions
        alpaca_positions = await self.alpaca_service.get_positions()
        alpaca_dict = {pos["symbol"]: float(pos["qty"]) for pos in alpaca_positions}
        logger.info(f"📊 Alpaca shows {len(alpaca_dict)} positions: {alpaca_dict}")
        
        # Find discrepancies
        all_symbols = set(db_positions.keys()) | set(alpaca_dict.keys())
        discrepancies = []
        
        for symbol in all_symbols:
            db_qty = db_positions.get(symbol, 0.0)
            alpaca_qty = alpaca_dict.get(symbol, 0.0)
            
            if abs(db_qty - alpaca_qty) > 0.01:  # Epsilon for float comparison
                discrepancy = {
                    "symbol": symbol,
                    "db_quantity": db_qty,
                    "alpaca_quantity": alpaca_qty,
                    "difference": db_qty - alpaca_qty,
                }
                discrepancies.append(discrepancy)
                
                logger.warning(
                    f"⚠️  Position mismatch for {symbol}: "
                    f"DB={db_qty:.6f}, Alpaca={alpaca_qty:.6f}, "
                    f"diff={db_qty - alpaca_qty:+.6f}"
                )
                
                # Log to events system
                await event_service.log_strategy_engine_event(
                    fund_id=fund_id,
                    event_category="position_sync",
                    symbol=symbol,
                    severity="error",
                    message=f"Position quantity mismatch detected for {symbol}",
                    event_data={
                        "db_quantity": float(db_qty),
                        "alpaca_quantity": float(alpaca_qty),
                        "discrepancy": float(db_qty - alpaca_qty),
                        "reconciliation_attempted": True,
                    }
                )
        
        if not discrepancies:
            logger.info("✅ All positions in sync!")
            return {
                "status": "in_sync",
                "discrepancies": [],
                "total_discrepancies": 0,
                "corrections_applied": 0,
            }
        
        logger.warning(f"❌ Found {len(discrepancies)} position discrepancies")
        
        # Auto-correct each discrepancy
        corrections_applied = 0
        for disc in discrepancies:
            try:
                await self.auto_correct_position(
                    session=session,
                    fund_id=fund_id,
                    symbol=disc["symbol"],
                    expected_qty=disc["alpaca_quantity"],
                    actual_qty=disc["db_quantity"]
                )
                corrections_applied += 1
            except Exception as e:
                logger.error(f"Failed to auto-correct {disc['symbol']}: {e}", exc_info=True)
        
        return {
            "status": "out_of_sync",
            "discrepancies": discrepancies,
            "total_discrepancies": len(discrepancies),
            "corrections_applied": corrections_applied,
        }
    
    async def get_missing_fills(
        self,
        session: AsyncSession,
        fund_id: str,
        lookback_hours: int = 24
    ) -> List[Dict[str, Any]]:
        """
        Query Alpaca's Activities API for fills that might be missing from our DB.
        
        This catches:
        - Partial fills we missed
        - Fills that occurred during downtime
        - Fractional share adjustments
        """
        if not self.alpaca_service.is_available():
            logger.warning("Alpaca service not available, cannot fetch activities")
            return []
        
        try:
            # Calculate lookback time
            after_time = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
            after_str = after_time.isoformat()
            
            logger.info(f"📥 Fetching FILL activities since {after_str}")
            
            # Get fill activities from Alpaca using the service method
            activities = await self.alpaca_service.get_account_activities(
                activity_types="FILL",
                after=after_str,
                limit=100
            )
            
            logger.info(f"📥 Retrieved {len(activities)} fill activities from Alpaca")
            
            # Get all our orders for this fund
            orders_stmt = select(Order).where(Order.fund_id == fund_id)
            orders_result = await session.execute(orders_stmt)
            fund_orders = {order.alpaca_order_id: order for order in orders_result.scalars().all()}
            
            # Find fills that match our orders
            relevant_fills = []
            for activity in activities:
                # Activities are already dicts from get_account_activities
                order_id = activity.get("order_id")
                
                if order_id and order_id in fund_orders:
                    fill_data = {
                        "id": activity["id"],
                        "order_id": order_id,
                        "symbol": activity["symbol"],
                        "side": activity["side"],
                        "qty": activity["qty"],
                        "price": activity["price"],
                        "transaction_time": activity["transaction_time"],
                    }
                    relevant_fills.append(fill_data)
            
            logger.info(f"📊 Found {len(relevant_fills)} fills for this fund's orders")
            
            return relevant_fills
            
        except Exception as e:
            logger.error(f"Error fetching activities: {e}", exc_info=True)
            return []
    
    async def auto_correct_position(
        self,
        session: AsyncSession,
        fund_id: str,
        symbol: str,
        expected_qty: float,
        actual_qty: float
    ) -> Dict[str, Any]:
        """
        Auto-correct position by querying Activities API and creating missing transactions.
        
        This is the SOURCE OF TRUTH correction mechanism. If our ledger doesn't match
        Alpaca, we query their Activities API to find what we missed and create the
        appropriate Transaction records.
        
        Args:
            session: Database session
            fund_id: Fund UUID
            symbol: Stock symbol to correct
            expected_qty: What Alpaca says we should have
            actual_qty: What our DB says we have
        
        Returns:
            Dict with correction details and transactions created
        """
        logger.info(
            f"🔧 Auto-correcting {symbol}: "
            f"expected={expected_qty:.6f}, actual={actual_qty:.6f}, "
            f"diff={expected_qty - actual_qty:+.6f}"
        )
        
        await event_service.log_strategy_engine_event(
            fund_id=fund_id,
            event_category="position_sync",
            symbol=symbol,
            severity="warning",
            message=f"Starting auto-correction for {symbol}",
            event_data={
                "expected_quantity": float(expected_qty),
                "actual_quantity": float(actual_qty),
                "discrepancy": float(expected_qty - actual_qty),
            }
        )
        
        # Get all fills for this symbol from Activities API
        fills = await self.get_missing_fills(session, fund_id, lookback_hours=24)
        symbol_fills = [f for f in fills if f["symbol"] == symbol]
        
        if not symbol_fills:
            logger.warning(f"No fills found for {symbol} in Activities API")
            
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="position_sync",
                symbol=symbol,
                severity="error",
                message=f"Auto-correction failed: No fills found in Activities API for {symbol}",
                event_data={
                    "expected_quantity": float(expected_qty),
                    "actual_quantity": float(actual_qty),
                }
            )
            
            return {
                "success": False,
                "reason": "no_fills_found",
                "transactions_created": 0,
            }
        
        # Get existing transactions for this symbol to avoid duplicates
        txns_stmt = select(Transaction).join(Order).where(
            Transaction.symbol == symbol,
            Order.fund_id == fund_id
        )
        txns_result = await session.execute(txns_stmt)
        existing_transactions = txns_result.scalars().all()
        existing_fill_ids = {txn.alpaca_fill_id for txn in existing_transactions if txn.alpaca_fill_id}
        
        logger.info(f"📊 Found {len(symbol_fills)} fills, {len(existing_fill_ids)} already in DB")
        
        # Create transactions for fills we don't have yet
        transactions_created = 0
        for fill in symbol_fills:
            fill_id = fill["id"]
            
            if fill_id in existing_fill_ids:
                logger.debug(f"Skipping fill {fill_id} (already exists)")
                continue
            
            # Find the order this fill belongs to
            order_stmt = select(Order).where(Order.alpaca_order_id == fill["order_id"])
            order_result = await session.execute(order_stmt)
            order = order_result.scalar_one_or_none()
            
            if not order:
                logger.warning(f"Order {fill['order_id']} not found for fill {fill_id}")
                continue
            
            # Create transaction for this fill
            # Parse transaction time - it's an ISO format string from get_account_activities
            transaction_time = fill.get("transaction_time")
            if transaction_time:
                if isinstance(transaction_time, str):
                    timestamp = datetime.fromisoformat(transaction_time)
                else:
                    timestamp = transaction_time
            else:
                # Fallback to current time if not provided
                timestamp = datetime.now(timezone.utc)
                logger.warning(f"No transaction_time for fill {fill_id}, using current time")
            
            transaction = Transaction(
                id=str(uuid.uuid4()),
                order_id=order.id,
                alpaca_order_id=order.alpaca_order_id,
                alpaca_fill_id=fill_id,
                fund_id=fund_id,
                trade_id=order.trade_id,  # Inherit trade_id from order
                symbol=fill["symbol"],
                side=fill["side"],
                quantity=fill["qty"],
                price=fill["price"],
                total_value=fill["qty"] * fill["price"],
                timestamp=timestamp,
                high_water_mark=fill["price"] if fill["side"] == "buy" else None,
                strategy_state={},
            )
            
            session.add(transaction)
            transactions_created += 1
            
            logger.info(
                f"✅ Created transaction for {symbol}: "
                f"{fill['side']} {fill['qty']} @ ${fill['price']}"
            )
            
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="fill_tracking",
                symbol=symbol,
                severity="info",
                message=f"Created missing transaction for {symbol} from Activities API",
                event_data={
                    "fill_id": fill_id,
                    "quantity": fill["qty"],
                    "price": fill["price"],
                    "side": fill["side"],
                    "transaction_time": fill["transaction_time"],
                }
            )
        
        # Commit the new transactions
        if transactions_created > 0:
            await session.commit()
            logger.info(f"✅ Created {transactions_created} missing transactions for {symbol}")
            
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="position_sync",
                symbol=symbol,
                severity="info",
                message=f"Auto-correction completed for {symbol}",
                event_data={
                    "transactions_created": transactions_created,
                    "fills_found": len(symbol_fills),
                    "fills_already_in_db": len(existing_fill_ids),
                    "expected_quantity": float(expected_qty),
                    "previous_quantity": float(actual_qty),
                }
            )
        else:
            # No new transactions created - all fills were already in DB
            # Log details of what we found for diagnostic purposes
            fill_details = [
                {
                    "fill_id": fill["id"],
                    "side": fill["side"],
                    "qty": fill["qty"],
                    "price": fill["price"],
                    "time": fill["transaction_time"],
                    "already_in_db": fill["id"] in existing_fill_ids,
                }
                for fill in symbol_fills
            ]
            
            logger.warning(
                f"⚠️  No missing transactions found for {symbol}: "
                f"all {len(symbol_fills)} fills already exist in DB. "
                f"Position may be out of sync due to transaction calculation or data corruption. "
                f"Fills: {fill_details}"
            )
            
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="position_sync",
                symbol=symbol,
                severity="warning",
                message=f"All fills for {symbol} already exist in DB but position still out of sync",
                event_data={
                    "fills_found": len(symbol_fills),
                    "fills_already_in_db": len(existing_fill_ids),
                    "expected_quantity": float(expected_qty),
                    "actual_quantity": float(actual_qty),
                    "discrepancy": float(expected_qty - actual_qty),
                    "fills": fill_details,
                    "suggestion": "Check transaction ledger calculation or data integrity"
                }
            )
        
        return {
            "success": True,
            "transactions_created": transactions_created,
            "fills_checked": len(symbol_fills),
            "fills_already_existed": len(symbol_fills) - transactions_created,
        }
    
    async def sync_from_activities(
        self,
        session: AsyncSession,
        fund_id: str,
        lookback_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Sync transactions from Alpaca's Activities API.
        
        This is the most reliable way to ensure our transaction ledger
        matches what actually happened in Alpaca.
        """
        logger.info(f"🔄 Syncing transactions from Activities API...")
        
        # Get missing fills
        fills = await self.get_missing_fills(session, fund_id, lookback_hours)
        
        if not fills:
            logger.info("✅ No fills found (or activities API unavailable)")
            return {"fills_processed": 0, "transactions_created": 0}
        
        # TODO: Compare fills with our transactions and create missing ones
        # This requires more complex logic to avoid duplicates
        
        logger.info(f"📊 Found {len(fills)} fills to process")
        
        return {
            "fills_found": len(fills),
            "fills_processed": 0,  # TODO: implement processing
            "transactions_created": 0,
        }


async def reconcile_on_startup(
    session: AsyncSession,
    fund_id: str,
    alpaca_service: AlpacaService
) -> None:
    """
    Run position reconciliation when a fund starts.
    
    This catches any discrepancies that built up while the fund was stopped.
    """
    logger.info(f"🚀 Running startup reconciliation for fund {fund_id[:8]}")
    
    sync_service = ActivitySyncService(alpaca_service)
    result = await sync_service.reconcile_fund_positions(session, fund_id)
    
    if result["status"] == "out_of_sync":
        logger.error(
            f"❌ Fund {fund_id[:8]} started with {result['total_discrepancies']} "
            f"position discrepancies. Check strategy_engine_events for details."
        )
    else:
        logger.info(f"✅ Fund {fund_id[:8]} positions verified in sync")

