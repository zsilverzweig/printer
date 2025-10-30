"""
Order Polling Service

Polls Alpaca API to sync order status with database.
Updates order records and creates transaction records when orders fill.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Set

from sqlalchemy import select
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
        
        # Track which orders we've already processed to avoid duplicate transactions
        self._processed_fills: Set[str] = set()
    
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
            new_status = str(alpaca_order.status.value).lower()
            
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
            
            # Skip if status hasn't changed
            if mapped_status == old_status:
                return
            
            logger.info(
                f"🔄 Order status update: {order.symbol} {order.side} "
                f"{order.alpaca_order_id} -> {old_status} → {mapped_status}"
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
            
            # If order is filled, create transaction record
            if mapped_status == "filled" and order.alpaca_order_id not in self._processed_fills:
                await self._create_transaction(session, order, alpaca_order)
                self._processed_fills.add(order.alpaca_order_id)
        
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
    
    async def _create_transaction(
        self,
        session: AsyncSession,
        order: Order,
        alpaca_order
    ) -> None:
        """
        Create a transaction record for a filled order.
        
        Args:
            session: Database session
            order: Order that was filled
            alpaca_order: Alpaca order object with fill details
        """
        try:
            filled_qty = float(alpaca_order.filled_qty) if alpaca_order.filled_qty else order.quantity
            filled_price = float(alpaca_order.filled_avg_price) if alpaca_order.filled_avg_price else 0.0
            
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
                quantity=filled_qty,
                price=filled_price,
                total_value=filled_qty * filled_price,
                timestamp=transaction_timestamp,
                high_water_mark=filled_price if order.side == "buy" else None,
                strategy_state={},
            )
            
            session.add(transaction)
            
            logger.info(
                f"💰 Transaction created: {order.symbol} {order.side} "
                f"{filled_qty} @ ${filled_price:.2f} = ${transaction.total_value:.2f}"
            )
            
            # Broadcast transaction event
            await _broadcast_trading_event({
                "fund_id": str(order.fund_id),
                "event_type": "transaction_created",
                "timestamp": transaction.timestamp.isoformat(),
                "symbol": order.symbol,
                "side": order.side,
                "quantity": filled_qty,
                "price": filled_price,
                "total_value": transaction.total_value,
                "transaction_id": transaction.id,
                "order_id": order.id,
                "message": f"Transaction: {order.side} {filled_qty} {order.symbol} @ ${filled_price:.2f}",
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

