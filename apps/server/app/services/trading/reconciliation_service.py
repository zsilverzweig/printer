"""
Position Reconciliation Service

Automatically validates position sync after every order placement using
Fibonacci backoff retry logic. Auto-corrects discrepancies by querying
Alpaca's Activities API.
"""

import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.activity_sync import ActivitySyncService
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.core.database import get_async_session
from app.services.events.event_service import event_service

logger = logging.getLogger(__name__)

# Fibonacci sequence for retry delays (in seconds)
FIBONACCI_DELAYS = [1, 1, 2, 3, 5, 8, 13]


class ReconciliationService:
    """
    Service for automatic position reconciliation.
    
    Runs background checks after order placement to ensure
    positions stay in sync with Alpaca.
    """
    
    def __init__(self, alpaca_service: AlpacaService):
        self.alpaca_service = alpaca_service
        self.activity_sync = ActivitySyncService(alpaca_service)
    
    async def schedule_order_reconciliation(
        self,
        order_id: str,
        fund_id: str,
        symbol: str
    ) -> None:
        """
        Schedule Fibonacci backoff reconciliation checks for an order.
        
        This is called automatically after every order placement.
        Runs in background and doesn't block the order flow.
        
        Args:
            order_id: Database order ID
            fund_id: Fund UUID
            symbol: Stock symbol
        """
        # Log that reconciliation is scheduled
        await event_service.log_strategy_engine_event(
            fund_id=fund_id,
            event_category="fill_tracking",
            symbol=symbol,
            severity="info",
            message=f"Scheduled reconciliation checks for {symbol} order",
            event_data={
                "order_id": order_id,
                "checks_scheduled": len(FIBONACCI_DELAYS),
                "total_duration_seconds": sum(FIBONACCI_DELAYS),
            }
        )
        
        # Run Fibonacci backoff checks
        for attempt, delay in enumerate(FIBONACCI_DELAYS, 1):
            # Wait for this Fibonacci delay
            await asyncio.sleep(delay)
            
            # Check if position is synced
            is_synced = await self.reconcile_symbol(
                fund_id=fund_id,
                symbol=symbol,
                order_id=order_id,
                attempt=attempt,
                total_attempts=len(FIBONACCI_DELAYS)
            )
            
            if is_synced:
                logger.info(
                    f"✅ Position synced for {symbol} after attempt {attempt} "
                    f"(delay: {delay}s)"
                )
                break
        else:
            # All attempts exhausted and still not synced
            logger.error(
                f"❌ Position sync failed for {symbol} after {len(FIBONACCI_DELAYS)} attempts "
                f"({sum(FIBONACCI_DELAYS)} seconds total)"
            )
            
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="position_sync",
                symbol=symbol,
                severity="error",
                message=f"Position sync failed for {symbol} after all reconciliation attempts",
                event_data={
                    "order_id": order_id,
                    "attempts": len(FIBONACCI_DELAYS),
                    "total_duration_seconds": sum(FIBONACCI_DELAYS),
                }
            )
    
    async def reconcile_symbol(
        self,
        fund_id: str,
        symbol: str,
        order_id: Optional[str] = None,
        attempt: Optional[int] = None,
        total_attempts: Optional[int] = None
    ) -> bool:
        """
        Check if a symbol's position matches Alpaca and auto-correct if needed.
        
        Args:
            fund_id: Fund UUID
            symbol: Stock symbol to check
            order_id: Optional order ID for logging
            attempt: Current attempt number
            total_attempts: Total number of attempts
        
        Returns:
            True if position is synced (or was corrected), False if still mismatched
        """
        try:
            async with get_async_session() as session:
                # Get position from our transaction ledger
                db_quantity = await get_position_quantity_from_transactions(
                    session, fund_id, symbol
                )
                
                # Get position from Alpaca
                alpaca_positions = await self.alpaca_service.get_positions()
                alpaca_dict = {pos["symbol"]: float(pos["qty"]) for pos in alpaca_positions}
                alpaca_quantity = alpaca_dict.get(symbol, 0.0)
                
                # Check if they match (with epsilon for float comparison)
                discrepancy = abs(db_quantity - alpaca_quantity)
                
                if discrepancy <= 0.01:
                    # Positions match!
                    logger.debug(
                        f"✓ Position synced for {symbol}: "
                        f"DB={db_quantity:.6f}, Alpaca={alpaca_quantity:.6f}"
                    )
                    
                    # Log successful sync (only on final attempt or if this is manual)
                    if attempt and attempt == total_attempts:
                        await event_service.log_strategy_engine_event(
                            fund_id=fund_id,
                            event_category="position_sync",
                            symbol=symbol,
                            severity="info",
                            message=f"Position synced for {symbol}",
                            event_data={
                                "order_id": order_id,
                                "db_quantity": float(db_quantity),
                                "alpaca_quantity": float(alpaca_quantity),
                                "attempt": attempt,
                            }
                        )
                    
                    return True
                
                # Positions don't match - log the check
                logger.warning(
                    f"⚠️  Position mismatch for {symbol} (attempt {attempt}/{total_attempts}): "
                    f"DB={db_quantity:.6f}, Alpaca={alpaca_quantity:.6f}, "
                    f"diff={discrepancy:.6f}"
                )
                
                # Only log event after 3+ attempts to reduce noise from temporary sync delays
                if attempt >= 3:
                    await event_service.log_strategy_engine_event(
                        fund_id=fund_id,
                        event_category="position_sync",
                        symbol=symbol,
                        severity="warning",
                        message=f"Position mismatch detected for {symbol} (attempt {attempt}/{total_attempts})",
                        event_data={
                            "order_id": order_id,
                            "db_quantity": float(db_quantity),
                            "alpaca_quantity": float(alpaca_quantity),
                            "discrepancy": float(discrepancy),
                            "attempt": attempt,
                            "total_attempts": total_attempts,
                        }
                    )
                
                # If this is NOT the last attempt, return False to trigger retry
                if attempt != total_attempts:
                    return False
                
                # Last attempt - try to auto-correct
                logger.info(f"🔧 Attempting auto-correction for {symbol}...")
                
                await self.auto_correct_from_activities(
                    fund_id=fund_id,
                    symbol=symbol,
                    order_id=order_id,
                    expected_qty=alpaca_quantity,
                    actual_qty=db_quantity
                )
            
            # After auto-correction, verify with a fresh session
            # This is important because auto_correct_from_activities uses its own session
            # and commits transactions - we need a fresh session to see those changes
            if attempt == total_attempts:
                async with get_async_session() as fresh_session:
                    db_quantity_after = await get_position_quantity_from_transactions(
                        fresh_session, fund_id, symbol
                    )
                    
                    if abs(db_quantity_after - alpaca_quantity) <= 0.01:
                        logger.info(f"✅ Auto-correction successful for {symbol}")
                        
                        await event_service.log_strategy_engine_event(
                            fund_id=fund_id,
                            event_category="position_sync",
                            symbol=symbol,
                            severity="info",
                            message=f"Position successfully reconciled for {symbol}",
                            event_data={
                                "order_id": order_id,
                                "db_quantity_before": float(db_quantity),
                                "db_quantity_after": float(db_quantity_after),
                                "alpaca_quantity": float(alpaca_quantity),
                                "attempt": attempt,
                            }
                        )
                        
                        return True
                    else:
                        # Position still out of sync - get diagnostic info
                        from sqlalchemy import select
                        from app.models.strategies import Transaction, Order
                        
                        txns_stmt = select(Transaction).join(Order).where(
                            Transaction.symbol == symbol,
                            Order.fund_id == fund_id
                        ).order_by(Transaction.timestamp)
                        txns_result = await fresh_session.execute(txns_stmt)
                        transactions = txns_result.scalars().all()
                        
                        # Log transaction details for debugging
                        txn_details = [
                            {
                                "id": txn.id,
                                "side": txn.side,
                                "quantity": float(txn.quantity),
                                "price": float(txn.price),
                                "timestamp": txn.timestamp.isoformat(),
                                "alpaca_fill_id": txn.alpaca_fill_id,
                            }
                            for txn in transactions
                        ]
                        
                        logger.error(
                            f"❌ Auto-correction incomplete for {symbol}: "
                            f"DB={db_quantity_after:.6f}, Alpaca={alpaca_quantity:.6f}, "
                            f"diff={abs(db_quantity_after - alpaca_quantity):.6f}. "
                            f"Found {len(transactions)} transactions in DB."
                        )
                        
                        await event_service.log_strategy_engine_event(
                            fund_id=fund_id,
                            event_category="position_sync",
                            symbol=symbol,
                            severity="error",
                            message=f"Auto-correction incomplete for {symbol} - position still out of sync",
                            event_data={
                                "order_id": order_id,
                                "db_quantity_before": float(db_quantity),
                                "db_quantity_after": float(db_quantity_after),
                                "alpaca_quantity": float(alpaca_quantity),
                                "remaining_discrepancy": float(abs(db_quantity_after - alpaca_quantity)),
                                "attempt": attempt,
                                "transactions_count": len(transactions),
                                "transactions": txn_details,
                            }
                        )
                        
                        return False
                
        except Exception as e:
            logger.error(f"Error reconciling {symbol}: {e}", exc_info=True)
            return False
    
    async def auto_correct_from_activities(
        self,
        fund_id: str,
        symbol: str,
        order_id: Optional[str],
        expected_qty: float,
        actual_qty: float
    ) -> None:
        """
        Auto-correct position by querying Alpaca's Activities API.
        
        Finds missing transactions by comparing Activities API with our records
        and creates the missing transactions.
        
        Args:
            fund_id: Fund UUID
            symbol: Stock symbol
            order_id: Order ID that triggered this
            expected_qty: What Alpaca says we should have
            actual_qty: What our DB says we have
        """
        logger.info(
            f"🔍 Auto-correcting {symbol} using Activities API: "
            f"expected={expected_qty:.6f}, actual={actual_qty:.6f}"
        )
        
        await event_service.log_strategy_engine_event(
            fund_id=fund_id,
            event_category="position_sync",
            symbol=symbol,
            severity="info",
            message=f"Starting auto-correction for {symbol} from Activities API",
            event_data={
                "order_id": order_id,
                "expected_quantity": float(expected_qty),
                "actual_quantity": float(actual_qty),
                "discrepancy": float(expected_qty - actual_qty),
            }
        )
        
        async with get_async_session() as session:
            # Use ActivitySyncService's auto_correct_position method
            # This method properly creates missing transactions from fills
            try:
                result = await self.activity_sync.auto_correct_position(
                    session=session,
                    fund_id=fund_id,
                    symbol=symbol,
                    expected_qty=expected_qty,
                    actual_qty=actual_qty
                )
                
                if result["success"]:
                    logger.info(
                        f"✅ Auto-correction successful for {symbol}: "
                        f"created {result['transactions_created']} transactions"
                    )
                else:
                    logger.warning(
                        f"⚠️  Auto-correction returned unsuccessful for {symbol}: "
                        f"{result.get('reason', 'unknown')}"
                    )
                    
                    # CORNER CASE: If Alpaca shows position is closed (qty=0) but DB shows open,
                    # and we can't find fills to reconcile, trust Alpaca and force-close the position
                    if expected_qty == 0.0 and actual_qty != 0.0 and result.get("reason") == "no_fills_found":
                        logger.warning(
                            f"⚠️  CORNER CASE: Alpaca shows {symbol} closed but DB shows open. "
                            f"Force-closing position to match Alpaca (closing {actual_qty} shares)."
                        )
                        
                        await event_service.log_strategy_engine_event(
                            fund_id=fund_id,
                            event_category="position_sync",
                            symbol=symbol,
                            severity="warning",
                            message=f"Force-closing orphaned position for {symbol} (Alpaca shows closed, no fills found)",
                            event_data={
                                "order_id": order_id,
                                "db_quantity": float(actual_qty),
                                "alpaca_quantity": float(expected_qty),
                                "action": "force_close",
                                "reason": "alpaca_shows_closed_no_activities_found",
                            }
                        )
                        
                        # Import here to avoid circular dependency
                        from app.services.trading.transaction_service import create_transaction
                        
                        # Create a synthetic closing transaction to zero out the position
                        # Use a nominal price since we're just reconciling the position
                        # Generate a short order_id (max 36 chars for DB constraint)
                        # Format: "recon_SYMBOL_YYYYMMDDHHMMSS" (e.g., "recon_DDD_20251104172920")
                        now = datetime.utcnow()
                        short_timestamp = now.strftime("%Y%m%d%H%M%S")  # 14 chars
                        synthetic_order_id = f"recon_{symbol}_{short_timestamp}"  # Max ~25 chars
                        
                        await create_transaction(
                            session=session,
                            fund_id=fund_id,
                            symbol=symbol,
                            transaction_type="sell",
                            quantity=abs(actual_qty),
                            price=1.0,  # Nominal price - position is already closed in Alpaca
                            order_id=synthetic_order_id,
                            notes=f"Force-close reconciliation: Alpaca closed, DB had {actual_qty} shares"
                        )
                        
                        logger.info(f"✅ Force-closed {symbol} position in DB to match Alpaca")
                
            except Exception as e:
                logger.error(f"Failed to auto-correct {symbol}: {e}", exc_info=True)
                
                await event_service.log_strategy_engine_event(
                    fund_id=fund_id,
                    event_category="position_sync",
                    symbol=symbol,
                    severity="error",
                    message=f"Auto-correction failed for {symbol}",
                    event_data={
                        "order_id": order_id,
                        "error": str(e),
                    }
                )


# Global instance will be created with alpaca_service
_reconciliation_service: Optional[ReconciliationService] = None


def get_reconciliation_service() -> Optional[ReconciliationService]:
    """Get the global reconciliation service instance."""
    return _reconciliation_service


def set_reconciliation_service(service: ReconciliationService) -> None:
    """Set the global reconciliation service instance."""
    global _reconciliation_service
    _reconciliation_service = service

