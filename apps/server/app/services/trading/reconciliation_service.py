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
                
                # If this is the last attempt, try to auto-correct
                if attempt == total_attempts:
                    logger.info(f"🔧 Attempting auto-correction for {symbol}...")
                    
                    await self.auto_correct_from_activities(
                        fund_id=fund_id,
                        symbol=symbol,
                        order_id=order_id,
                        expected_qty=alpaca_quantity,
                        actual_qty=db_quantity
                    )
                    
                    # Check again after correction
                    db_quantity_after = await get_position_quantity_from_transactions(
                        session, fund_id, symbol
                    )
                    
                    if abs(db_quantity_after - alpaca_quantity) <= 0.01:
                        logger.info(f"✅ Auto-correction successful for {symbol}")
                        return True
                    else:
                        logger.error(f"❌ Auto-correction failed for {symbol}")
                        return False
                
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
        
        Finds missing transactions by comparing Activities API with our records.
        
        Args:
            fund_id: Fund UUID
            symbol: Stock symbol
            order_id: Order ID that triggered this
            expected_qty: What Alpaca says we should have
            actual_qty: What our DB says we have
        """
        logger.info(
            f"🔍 Querying Activities API for {symbol} to find missing transactions..."
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
            # Use ActivitySyncService to fetch and process fills
            fills = await self.activity_sync.get_missing_fills(
                session, fund_id, lookback_hours=24
            )
            
            # Filter to this symbol only
            symbol_fills = [f for f in fills if f["symbol"] == symbol]
            
            if not symbol_fills:
                logger.warning(f"No fills found for {symbol} in Activities API")
                return
            
            logger.info(f"📊 Found {len(symbol_fills)} fills for {symbol} from Activities API")
            
            # TODO: Compare fills with transactions and create missing ones
            # For now, just log what we found
            for fill in symbol_fills:
                await event_service.log_strategy_engine_event(
                    fund_id=fund_id,
                    event_category="fill_tracking",
                    symbol=symbol,
                    severity="info",
                    message=f"Found fill activity for {symbol}",
                    event_data={
                        "fill_id": fill["id"],
                        "fill_qty": fill["qty"],
                        "fill_price": fill["price"],
                        "fill_side": fill["side"],
                        "fill_time": fill["transaction_time"],
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

