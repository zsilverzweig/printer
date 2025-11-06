"""
Trade Event Handler

Processes Alpaca trade_updates WebSocket events and drives the order → transaction → position → trade flow.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Order, Transaction, Trade
from app.services.core.database import get_async_session
from app.services.trading.transaction_service import create_transaction_from_fill_event
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.events.event_service import event_service
from app.services.analytics.trade_builder import TradeBuilder

logger = logging.getLogger(__name__)


class TradeEventHandler:
    """
    Single handler for all Alpaca trade_updates WebSocket events.
    Drives the entire order → transaction → position → trade flow.
    """
    
    async def handle_trade_update(self, event_data: dict) -> None:
        """
        Process incoming trade_updates WebSocket event.
        
        Handles all event types:
        - new: Update Order record status
        - fill: Create transaction, update order, update trade
        - partial_fill: Create incremental transaction
        - canceled/rejected: Update Order record
        
        Args:
            event_data: Event data from WebSocket trade_updates stream
                       Must contain: event, order (with alpaca order details)
        """
        event_type = event_data.get("event")
        order_data = event_data.get("order", {})
        
        if not event_type or not order_data:
            logger.warning(f"Invalid trade_update event: missing event type or order data")
            return
        
        alpaca_order_id = str(order_data.get("id", ""))
        if not alpaca_order_id:
            logger.warning(f"Invalid trade_update event: missing order ID")
            return
        
        logger.debug(
            f"📨 Processing trade_update event: {event_type} for order {alpaca_order_id[:8]}..."
        )
        
        try:
            if event_type == "new":
                await self._handle_new_order(order_data)
            elif event_type == "fill":
                await self._handle_fill(event_data)
            elif event_type == "partial_fill":
                await self._handle_partial_fill(event_data)
            elif event_type in ["canceled", "expired", "rejected", "replaced"]:
                await self._handle_canceled(order_data, event_type)
            else:
                logger.debug(f"Unhandled event type: {event_type}")
                
        except Exception as e:
            logger.error(
                f"Error handling trade_update event {event_type} for order {alpaca_order_id}: {e}",
                exc_info=True
            )
    
    async def _handle_new_order(self, order_data: dict) -> None:
        """
        Handle 'new' event - order has been routed to exchanges.
        
        Updates Order record status to 'pending'.
        """
        alpaca_order_id = str(order_data.get("id", ""))
        
        async with get_async_session() as session:
            # Find order by alpaca_order_id
            stmt = select(Order).where(Order.alpaca_order_id == alpaca_order_id)
            result = await session.execute(stmt)
            order = result.scalar_one_or_none()
            
            if not order:
                logger.warning(
                    f"⚠️  Order not found in DB for alpaca_order_id {alpaca_order_id[:8]}..."
                )
                return
            
            # Update order status
            old_status = order.status
            order.status = "pending"
            
            # Parse submitted_at if available
            submitted_at_str = order_data.get("submitted_at")
            if submitted_at_str:
                try:
                    submitted_at = datetime.fromisoformat(submitted_at_str.replace("Z", "+00:00"))
                    order.submitted_at = submitted_at
                except Exception as e:
                    logger.warning(f"Failed to parse submitted_at: {e}")
            
            await session.commit()
            
            logger.debug(
                f"🆕 Order status updated: {order.symbol} {order.side} "
                f"{old_status} → pending"
            )
            
            # Emit event
            await event_service.log_strategy_engine_event(
                fund_id=order.fund_id,
                event_category="fill_tracking",
                symbol=order.symbol,
                severity="info",
                message=f"Order routed to exchanges: {order.symbol} {order.side}",
                event_data={
                    "order_id": order.id,
                    "alpaca_order_id": alpaca_order_id,
                    "side": order.side,
                    "status": "pending",
                }
            )
    
    async def _handle_fill(self, event_data: dict) -> None:
        """
        Handle 'fill' event - order has been completely filled.
        
        1. Find Order by alpaca_order_id
        2. Update Order record (status=filled, filled_qty, filled_avg_price)
        3. Create Transaction using event data (price, qty, timestamp)
        4. Update Trade record (if applicable)
        5. Emit event for monitoring
        """
        order_data = event_data.get("order", {})
        alpaca_order_id = str(order_data.get("id", ""))
        
        # Extract fill details from event
        fill_price = float(event_data.get("price", 0))
        fill_qty = float(event_data.get("qty", 0))
        fill_timestamp_str = event_data.get("timestamp")
        
        if not fill_price or not fill_qty:
            logger.warning(
                f"Invalid fill event: missing price or qty for order {alpaca_order_id[:8]}..."
            )
            return
        
        async with get_async_session() as session:
            # Find order by alpaca_order_id
            stmt = select(Order).where(Order.alpaca_order_id == alpaca_order_id)
            result = await session.execute(stmt)
            order = result.scalar_one_or_none()
            
            if not order:
                logger.warning(
                    f"⚠️  Order not found in DB for alpaca_order_id {alpaca_order_id[:8]}..."
                )
                return
            
            # Check if we've already processed this fill (prevent duplicates)
            # Calculate how much we've already transacted
            stmt = select(Transaction).where(Transaction.order_id == order.id)
            txns_result = await session.execute(stmt)
            existing_txns = txns_result.scalars().all()
            already_transacted = sum(txn.quantity for txn in existing_txns)
            remaining_qty = fill_qty - already_transacted
            
            if remaining_qty <= 0.0001:  # Already fully transacted
                logger.debug(
                    f"Fill event already processed for order {order.id[:8]}... "
                    f"(already transacted: {already_transacted}, fill qty: {fill_qty})"
                )
                # Still update order status if needed
                if order.status != "filled":
                    order.status = "filled"
                    order.filled_qty = float(order_data.get("filled_qty", fill_qty))
                    order.filled_avg_price = float(order_data.get("filled_avg_price", fill_price))
                    if fill_timestamp_str:
                        try:
                            order.filled_at = datetime.fromisoformat(
                                fill_timestamp_str.replace("Z", "+00:00")
                            )
                        except Exception:
                            pass
                    await session.commit()
                return
            
            # Parse timestamp
            fill_timestamp = None
            if fill_timestamp_str:
                try:
                    fill_timestamp = datetime.fromisoformat(
                        fill_timestamp_str.replace("Z", "+00:00")
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse fill timestamp: {e}")
                    fill_timestamp = None
            
            # CRITICAL: For buy orders, create Trade record BEFORE creating transaction
            # This ensures the transaction can be linked to the trade via _validate_trade_id
            if order.side == "buy" and order.trade_id:
                trade = await session.get(Trade, order.trade_id)
                if not trade:
                    # Trade doesn't exist yet - we'll create it after transaction is created
                    # But we need to ensure the transaction can still be created
                    # For now, we'll create a placeholder trade or allow transaction without trade_id
                    # Actually, let's create the trade structure but we need the transaction first
                    # So we'll handle this after transaction creation
                    pass
            
            # Create transaction for the remaining quantity
            fill_event = {
                "timestamp": fill_timestamp_str or datetime.now(timezone.utc).isoformat(),
                "price": fill_price,
                "qty": remaining_qty,  # Only transact what hasn't been transacted yet
            }
            
            transaction = await create_transaction_from_fill_event(
                session=session,
                order=order,
                fill_event=fill_event,
            )
            
            if transaction:
                logger.debug(
                    f"💰 Transaction created: {order.symbol} {order.side} "
                    f"{remaining_qty} @ ${fill_price:.2f}"
                )
            else:
                logger.warning(f"⚠️  Transaction creation skipped for order {order.id[:8]}...")
                return
            
            # Update order record
            order.status = "filled"
            order.filled_qty = float(order_data.get("filled_qty", fill_qty))
            order.filled_avg_price = float(order_data.get("filled_avg_price", fill_price))
            if fill_timestamp:
                order.filled_at = fill_timestamp
            
            # Update Trade record if applicable (should already exist, just update it)
            if order.trade_id and transaction:
                await self._update_trade_record(session, order, transaction)
                
                # Ensure transaction is linked to trade (should already be, but double-check)
                if transaction.trade_id != order.trade_id:
                    transaction.trade_id = order.trade_id
                    logger.debug(f"Linked transaction {transaction.id[:8]}... to trade {order.trade_id[:8]}...")
            
            await session.commit()
            
            # Only log important fills at INFO level
            logger.info(
                f"✅ Order filled: {order.symbol} {order.side} "
                f"{order.filled_qty} @ ${order.filled_avg_price:.2f}"
            )
            
            # Emit event
            await event_service.log_strategy_engine_event(
                fund_id=order.fund_id,
                event_category="fill_tracking",
                symbol=order.symbol,
                severity="info",
                message=f"Order filled: {order.symbol} {order.side}",
                event_data={
                    "order_id": order.id,
                    "alpaca_order_id": alpaca_order_id,
                    "side": order.side,
                    "filled_qty": float(order.filled_qty),
                    "filled_avg_price": float(order.filled_avg_price),
                    "transaction_id": transaction.id if transaction else None,
                }
            )
    
    async def _handle_partial_fill(self, event_data: dict) -> None:
        """
        Handle 'partial_fill' event - order has been partially filled.
        
        1. Find Order by alpaca_order_id
        2. Create Transaction for incremental fill amount
        3. Update Order.filled_qty
        4. Emit event
        """
        order_data = event_data.get("order", {})
        alpaca_order_id = str(order_data.get("id", ""))
        
        # Extract fill details from event
        fill_price = float(event_data.get("price", 0))
        fill_qty = float(event_data.get("qty", 0))  # Incremental qty for this partial fill
        fill_timestamp_str = event_data.get("timestamp")
        
        if not fill_price or not fill_qty:
            logger.warning(
                f"Invalid partial_fill event: missing price or qty for order {alpaca_order_id[:8]}..."
            )
            return
        
        async with get_async_session() as session:
            # Find order by alpaca_order_id
            stmt = select(Order).where(Order.alpaca_order_id == alpaca_order_id)
            result = await session.execute(stmt)
            order = result.scalar_one_or_none()
            
            if not order:
                logger.warning(
                    f"⚠️  Order not found in DB for alpaca_order_id {alpaca_order_id[:8]}..."
                )
                return
            
            # Check if we've already processed this fill (prevent duplicates)
            # For partial fills, we check if a transaction with this exact qty/price exists
            stmt = select(Transaction).where(Transaction.order_id == order.id)
            txns_result = await session.execute(stmt)
            existing_txns = txns_result.scalars().all()
            
            # Check if this exact partial fill was already processed
            for txn in existing_txns:
                if abs(txn.quantity - fill_qty) < 0.0001 and abs(txn.price - fill_price) < 0.01:
                    logger.debug(
                        f"Partial fill already processed for order {order.id[:8]}... "
                        f"(qty: {fill_qty}, price: {fill_price})"
                    )
                    # Still update order filled_qty if needed
                    new_filled_qty = float(order_data.get("filled_qty", 0))
                    if new_filled_qty and (not order.filled_qty or abs(order.filled_qty - new_filled_qty) > 0.0001):
                        order.filled_qty = new_filled_qty
                        order.status = "partially_filled"
                        await session.commit()
                    return
            
            # Parse timestamp
            fill_timestamp = None
            if fill_timestamp_str:
                try:
                    fill_timestamp = datetime.fromisoformat(
                        fill_timestamp_str.replace("Z", "+00:00")
                    )
                except Exception as e:
                    logger.warning(f"Failed to parse fill timestamp: {e}")
                    fill_timestamp = None
            
            # Create transaction for this partial fill
            fill_event = {
                "timestamp": fill_timestamp_str or datetime.now(timezone.utc).isoformat(),
                "price": fill_price,
                "qty": fill_qty,
            }
            
            transaction = await create_transaction_from_fill_event(
                session=session,
                order=order,
                fill_event=fill_event,
            )
            
            if transaction:
                logger.debug(
                    f"📊 Partial fill: {order.symbol} {order.side} "
                    f"{fill_qty} @ ${fill_price:.2f}"
                )
            else:
                logger.warning(f"⚠️  Transaction creation skipped for partial fill")
            
            # Update order record
            order.status = "partially_filled"
            order.filled_qty = float(order_data.get("filled_qty", fill_qty))
            order.filled_avg_price = float(order_data.get("filled_avg_price", fill_price))
            if fill_timestamp:
                order.filled_at = fill_timestamp
            
            # Update Trade record if applicable (should already exist, just update it)
            if order.trade_id and transaction:
                await self._update_trade_record(session, order, transaction)
                
                # Ensure transaction is linked to trade (should already be, but double-check)
                if transaction.trade_id != order.trade_id:
                    transaction.trade_id = order.trade_id
                    logger.debug(f"Linked transaction {transaction.id[:8]}... to trade {order.trade_id[:8]}...")
            
            await session.commit()
            
            # Emit event
            await event_service.log_strategy_engine_event(
                fund_id=order.fund_id,
                event_category="fill_tracking",
                symbol=order.symbol,
                severity="info",
                message=f"Partial fill: {order.symbol} {order.side}",
                event_data={
                    "order_id": order.id,
                    "alpaca_order_id": alpaca_order_id,
                    "side": order.side,
                    "partial_fill_qty": float(fill_qty),
                    "partial_fill_price": float(fill_price),
                    "total_filled_qty": float(order.filled_qty),
                    "transaction_id": transaction.id if transaction else None,
                }
            )
    
    async def _handle_canceled(self, order_data: dict, event_type: str) -> None:
        """
        Handle 'canceled', 'expired', 'rejected', or 'replaced' events.
        
        Updates Order record status.
        """
        alpaca_order_id = str(order_data.get("id", ""))
        
        async with get_async_session() as session:
            # Find order by alpaca_order_id
            stmt = select(Order).where(Order.alpaca_order_id == alpaca_order_id)
            result = await session.execute(stmt)
            order = result.scalar_one_or_none()
            
            if not order:
                logger.warning(
                    f"⚠️  Order not found in DB for alpaca_order_id {alpaca_order_id[:8]}..."
                )
                return
            
            # Map event types to status
            status_map = {
                "canceled": "canceled",
                "expired": "canceled",
                "rejected": "failed",
                "replaced": "canceled",
            }
            new_status = status_map.get(event_type, "canceled")
            
            old_status = order.status
            order.status = new_status
            
            # Parse canceled_at/expired_at/failed_at if available
            canceled_at_str = order_data.get("canceled_at") or order_data.get("expired_at") or order_data.get("failed_at")
            if canceled_at_str:
                try:
                    canceled_at = datetime.fromisoformat(canceled_at_str.replace("Z", "+00:00"))
                    order.filled_at = canceled_at  # Reuse filled_at for tracking
                except Exception:
                    pass
            
            await session.commit()
            
            logger.debug(
                f"❌ Order {event_type}: {order.symbol} {order.side} "
                f"{old_status} → {new_status}"
            )
            
            # Emit event
            await event_service.log_strategy_engine_event(
                fund_id=order.fund_id,
                event_category="fill_tracking",
                symbol=order.symbol,
                severity="warning" if event_type == "rejected" else "info",
                message=f"Order {event_type}: {order.symbol} {order.side}",
                event_data={
                    "order_id": order.id,
                    "alpaca_order_id": alpaca_order_id,
                    "side": order.side,
                    "event_type": event_type,
                    "status": new_status,
                }
            )
    
    async def _update_trade_record(
        self,
        session: AsyncSession,
        order: Order,
        transaction: Transaction
    ) -> None:
        """
        Update Trade record after transaction creation.
        
        Trade should already exist (created when order was placed).
        Updates it with actual fill data and changes status from "pending" to "open" when filled.
        """
        try:
            if not order.trade_id:
                return
            
            # Get existing Trade record (should exist since it's created when order is placed)
            trade = await session.get(Trade, order.trade_id)
            
            if not trade:
                logger.warning(
                    f"⚠️  Trade {order.trade_id} not found for {order.symbol} {order.side}. "
                    f"This should not happen - trade should be created when order is placed."
                )
                # Fallback: create trade if it doesn't exist (for backward compatibility)
                trade_builder = TradeBuilder(session)
                if order.side == "buy":
                    await trade_builder.create_trade_from_entry(
                        trade_id=order.trade_id,
                        fund_id=order.fund_id,
                        symbol=order.symbol,
                        entry_order_id=order.id,
                        entry_transactions=[transaction],
                        strategy_id=getattr(order, 'strategy_id', None),
                    )
                    logger.debug(f"🆕 Created Trade record {order.trade_id} for {order.symbol} (fallback)")
                return
            
            # Update existing Trade record
            if order.side == "buy":
                # Update entry data with actual fill prices/quantities
                # Calculate average entry price from all entry transactions
                from sqlalchemy import select
                stmt = select(Transaction).where(
                    Transaction.trade_id == order.trade_id,
                    Transaction.side == "buy"
                )
                result = await session.execute(stmt)
                entry_transactions = result.scalars().all()
                
                if entry_transactions:
                    total_qty = sum(txn.quantity for txn in entry_transactions)
                    total_cost = sum(txn.total_value for txn in entry_transactions)
                    avg_price = total_cost / total_qty if total_qty > 0 else transaction.price
                    entry_time = min(txn.timestamp for txn in entry_transactions)
                    
                    trade.entry_price = avg_price
                    trade.entry_quantity = total_qty
                    trade.entry_time = entry_time
                    
                    # Change status from "pending" to "open" when first filled
                    if trade.status == "pending":
                        trade.status = "open"
                        logger.debug(f"✅ Trade {order.trade_id[:8]}... opened: {order.symbol} {total_qty} @ ${avg_price:.2f}")
                
            elif order.side == "sell" and trade.status == "open":
                # Check if position is closed
                position_qty = await get_position_quantity_from_transactions(
                    session, order.fund_id, order.symbol
                )
                
                if position_qty < 0.001:  # Position closed
                    # Close the trade
                    trade_builder = TradeBuilder(session)
                    await trade_builder.close_trade(
                        trade_id=order.trade_id,
                        exit_order_id=order.id,
                        exit_transactions=[transaction],
                    )
                    logger.info(f"🔒 Trade closed: {order.symbol} trade_id={order.trade_id[:8]}...")
                else:
                    # Partial close - update trade but keep it open
                    logger.debug(f"Partial close for Trade {order.trade_id} (position still open)")
                        
        except Exception as e:
            logger.error(f"Error updating Trade record: {e}", exc_info=True)
