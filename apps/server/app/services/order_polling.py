"""
Order Polling Service

Polls Alpaca API to sync order status with database.
Updates order records and creates transaction records when orders fill.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Set, Dict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Order, Transaction
from app.services.alpaca_service import AlpacaService
from app.services.database import get_async_session

logger = logging.getLogger(__name__)


async def _broadcast_trading_event(event: dict) -> None:
    """Broadcast trading event to WebSocket subscribers."""
    try:
        from app.routers.realtime import broadcast_trading_activity
        await broadcast_trading_activity(event)
    except Exception as e:
        logger.warning(f"Failed to broadcast trading event: {e}")


class OrderPollingService:
    """
    Poll Alpaca for order status updates.
    
    Syncs order status from Alpaca to database and creates
    transaction records when orders are filled.
    """
    
    def __init__(self, alpaca_service: AlpacaService, poll_interval: float = 5.0):
        """
        Initialize order polling service.
        
        Args:
            alpaca_service: Alpaca service for querying order status
            poll_interval: Seconds between polls (default: 5s)
        """
        self.alpaca_service = alpaca_service
        self.poll_interval = poll_interval
        self.is_running = False
        self._polling_task: Optional[asyncio.Task] = None
        
        # Track quantity already transacted per order (for incremental partial fills)
        # Key: order.id, Value: total quantity transacted so far
        self._transacted_quantities: Dict[str, float] = {}
    
    async def start(self) -> None:
        """Start the polling loop."""
        if self.is_running:
            logger.warning("Order polling service already running")
            return
        
        self.is_running = True
        logger.info(f"🔄 Starting order polling service (interval: {self.poll_interval}s)")
        
        self._polling_task = asyncio.create_task(self._polling_loop())
    
    async def stop(self) -> None:
        """Stop the polling loop."""
        logger.info("🛑 Stopping order polling service")
        self.is_running = False
        
        if self._polling_task:
            self._polling_task.cancel()
            try:
                await self._polling_task
            except asyncio.CancelledError:
                pass
    
    async def _polling_loop(self) -> None:
        """Main polling loop."""
        while self.is_running:
            try:
                await self._poll_pending_orders()
                await asyncio.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"Error in order polling loop: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)
    
    async def _poll_pending_orders(self) -> None:
        """Poll all pending orders and update their status."""
        try:
            async with get_async_session() as session:
                # Get all pending orders
                stmt = select(Order).where(Order.status == "pending")
                result = await session.execute(stmt)
                pending_orders = result.scalars().all()
                
                if not pending_orders:
                    logger.debug("📭 No pending orders to poll")
                    return
                
                logger.debug(f"🔄 Polling {len(pending_orders)} pending order(s)")
                
                for order in pending_orders:
                    try:
                        await self._sync_order_status(session, order)
                    except Exception as e:
                        logger.error(
                            f"Error syncing order {order.id} (alpaca: {order.alpaca_order_id}): {e}",
                            exc_info=True
                        )
                
                # Commit all changes
                await session.commit()
        
        except Exception as e:
            logger.error(f"Error polling pending orders: {e}", exc_info=True)
    
    async def _sync_order_status(self, session: AsyncSession, order: Order) -> None:
        """
        Sync a single order's status from Alpaca.
        
        Args:
            session: Database session
            order: Order record to sync
        """
        try:
            # Skip orders with missing alpaca_order_id (orphaned records)
            if not order.alpaca_order_id or order.alpaca_order_id.strip() == "":
                logger.warning(
                    f"⚠️  Order {order.id} has no alpaca_order_id, marking as failed"
                )
                order.status = "failed"
                order.error_message = "Missing Alpaca order ID (orphaned record)"
                return
            
            # Get order status from Alpaca
            alpaca_order = self.alpaca_service.client.get_order_by_id(order.alpaca_order_id)
            
            old_status = order.status
            old_filled_qty = order.filled_qty or 0.0
            new_status = str(alpaca_order.status.value).lower()
            new_filled_qty = float(alpaca_order.filled_qty) if alpaca_order.filled_qty else 0.0
            
            # Map Alpaca statuses to our statuses
            status_map = {
                "new": "pending",
                "accepted": "pending",
                "pending_new": "pending",
                "partially_filled": "partially_filled",
                "filled": "filled",
                "canceled": "canceled",
                "expired": "canceled",
                "replaced": "canceled",
                "pending_cancel": "pending",
                "pending_replace": "pending",
                "rejected": "failed",
                "suspended": "failed",
            }
            
            mapped_status = status_map.get(new_status, new_status)
            
            # Skip if BOTH status AND filled quantity haven't changed
            if mapped_status == old_status and abs(new_filled_qty - old_filled_qty) < 0.0001:
                return
            
            # Log status or quantity changes
            if mapped_status != old_status:
                logger.info(
                    f"🔄 Order status update: {order.symbol} {order.side} "
                    f"{order.alpaca_order_id} -> {old_status} → {mapped_status}"
                )
            elif abs(new_filled_qty - old_filled_qty) >= 0.0001:
                logger.info(
                    f"📊 Order quantity update: {order.symbol} {order.side} "
                    f"{order.alpaca_order_id} -> filled: {old_filled_qty} → {new_filled_qty}"
                )
            
            # Update order status
            order.status = mapped_status
            # Convert timezone-aware datetime to timezone-naive UTC for database storage
            if alpaca_order.filled_at:
                order.filled_at = alpaca_order.filled_at.replace(tzinfo=None) if alpaca_order.filled_at.tzinfo else alpaca_order.filled_at
            else:
                order.filled_at = None
            order.filled_qty = float(alpaca_order.filled_qty) if alpaca_order.filled_qty else None
            order.filled_avg_price = float(alpaca_order.filled_avg_price) if alpaca_order.filled_avg_price else None
            
            # Broadcast status update
            await _broadcast_trading_event({
                "fund_id": str(order.fund_id),
                "event_type": "order_status_update",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "symbol": order.symbol,
                "order_id": order.id,
                "alpaca_order_id": order.alpaca_order_id,
                "old_status": old_status,
                "new_status": mapped_status,
                "message": f"Order {order.symbol} {order.side} status: {old_status} → {mapped_status}",
            })
            
            # If order is filled (fully or partially), check if we need to create a transaction
            # for the incremental fill amount
            if mapped_status in ["filled", "partially_filled"]:
                await self._handle_fill_transaction(session, order, alpaca_order)
        
        except Exception as e:
            # If order not found in Alpaca, mark as failed
            if "order not found" in str(e).lower() or "404" in str(e):
                logger.warning(
                    f"⚠️  Order not found in Alpaca: {order.alpaca_order_id}, marking as failed"
                )
                order.status = "failed"
                order.error_message = "Order not found in Alpaca"
            else:
                raise
    
    async def _handle_fill_transaction(
        self,
        session: AsyncSession,
        order: Order,
        alpaca_order
    ) -> None:
        """
        Handle transaction creation for filled/partially filled orders.
        
        Only creates transactions for the incremental fill amount (delta).
        Supports multiple transactions per order as it fills incrementally.
        
        Args:
            session: Database session
            order: Order that was filled
            alpaca_order: Alpaca order object with fill details
        """
        try:
            # Get current filled quantity from Alpaca
            current_filled = float(alpaca_order.filled_qty) if alpaca_order.filled_qty else 0.0
            
            if current_filled <= 0:
                return  # Nothing to transact
            
            # Get sum of quantities already transacted for this order from database
            stmt = select(func.sum(Transaction.quantity)).where(
                Transaction.order_id == order.id
            )
            result = await session.execute(stmt)
            already_transacted = result.scalar() or 0.0
            
            # Calculate delta - only transact what's new
            delta = current_filled - already_transacted
            
            # Use small epsilon for float comparison
            if delta < 0.0001:
                logger.debug(
                    f"No new fills for {order.symbol} order {order.id[:8]}... "
                    f"(already transacted: {already_transacted}, current filled: {current_filled})"
                )
                return
            
            # Create transaction for the incremental fill
            logger.info(
                f"📊 Incremental fill detected: {order.symbol} {order.side} "
                f"previously transacted: {already_transacted}, "
                f"now filled: {current_filled}, "
                f"delta: {delta}"
            )
            
            await self._create_transaction(session, order, alpaca_order, delta)
            
            # Update our in-memory cache
            self._transacted_quantities[order.id] = current_filled
            
        except Exception as e:
            logger.error(f"Error handling fill transaction for order {order.id}: {e}", exc_info=True)
            raise
    
    async def _create_transaction(
        self,
        session: AsyncSession,
        order: Order,
        alpaca_order,
        quantity_to_transact: float
    ) -> None:
        """
        Create a transaction record for a specific quantity.
        
        Args:
            session: Database session
            order: Order that was filled
            alpaca_order: Alpaca order object with fill details
            quantity_to_transact: The specific quantity to record (delta for partial fills)
        """
        try:
            filled_price = float(alpaca_order.filled_avg_price) if alpaca_order.filled_avg_price else 0.0
            
            # For sells, validate we own enough shares (prevent over-selling)
            if order.side == "sell":
                from app.services.position_tracker import get_position_quantity_from_transactions
                
                actual_position = await get_position_quantity_from_transactions(
                    session, order.fund_id, order.symbol
                )
                
                if quantity_to_transact > actual_position + 0.01:  # Small epsilon for float math
                    logger.error(
                        f"🚨 OVER-SELL DETECTED: Attempting to sell {quantity_to_transact} "
                        f"{order.symbol} but only own {actual_position:.2f}. Capping transaction."
                    )
                    quantity_to_transact = max(0.0, actual_position)
                
                if quantity_to_transact <= 0.001:  # Epsilon check
                    logger.error(
                        f"❌ Cannot create sell transaction for {order.symbol} - "
                        f"no position to sell (actual: {actual_position:.2f})"
                    )
                    return
            
            # Convert timezone-aware datetime to timezone-naive UTC for database
            transaction_timestamp = alpaca_order.filled_at if alpaca_order.filled_at else datetime.now(timezone.utc)
            if transaction_timestamp.tzinfo:
                transaction_timestamp = transaction_timestamp.replace(tzinfo=None)
            
            transaction = Transaction(
                id=str(uuid.uuid4()),
                order_id=order.id,
                alpaca_order_id=order.alpaca_order_id,
                fund_id=order.fund_id,
                symbol=order.symbol,
                side=order.side,
                quantity=quantity_to_transact,  # Use the delta, not full filled_qty
                price=filled_price,
                total_value=quantity_to_transact * filled_price,
                timestamp=transaction_timestamp,
                high_water_mark=filled_price if order.side == "buy" else None,
                strategy_state={},
            )
            
            session.add(transaction)
            
            # Update fund balance (cash position)
            # Buy: cash decreases, Sell: cash increases
            from app.models.strategies import Fund
            fund = await session.get(Fund, order.fund_id)
            if fund:
                old_balance = fund.balance
                if order.side == "buy":
                    fund.balance -= transaction.total_value
                else:  # sell
                    fund.balance += transaction.total_value
                logger.info(
                    f"💰 Fund balance updated: ${old_balance:.2f} → ${fund.balance:.2f} "
                    f"(after {order.side} ${transaction.total_value:.2f})"
                )
            
            logger.info(
                f"💰 Transaction created: {order.symbol} {order.side} "
                f"{quantity_to_transact} @ ${filled_price:.2f} = ${transaction.total_value:.2f}"
            )
            
            # Broadcast transaction event
            await _broadcast_trading_event({
                "fund_id": str(order.fund_id),
                "event_type": "transaction_created",
                "timestamp": transaction.timestamp.isoformat(),
                "symbol": order.symbol,
                "side": order.side,
                "quantity": quantity_to_transact,
                "price": filled_price,
                "total_value": transaction.total_value,
                "transaction_id": transaction.id,
                "order_id": order.id,
                "message": f"Transaction: {order.side} {quantity_to_transact} {order.symbol} @ ${filled_price:.2f}",
            })
        
        except Exception as e:
            logger.error(f"Error creating transaction for order {order.id}: {e}", exc_info=True)
            raise


# Global instance
_global_polling_service: Optional[OrderPollingService] = None


def get_polling_service() -> Optional[OrderPollingService]:
    """Get the global polling service instance."""
    return _global_polling_service


def set_polling_service(service: OrderPollingService) -> None:
    """Set the global polling service instance."""
    global _global_polling_service
    _global_polling_service = service

