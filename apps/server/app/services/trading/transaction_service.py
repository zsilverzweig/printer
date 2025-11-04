"""
Transaction Service

Centralized service for creating transaction records.
Handles all transaction creation patterns:
- Synthetic/reconciliation transactions
- Transactions from orders (order polling)
- Transactions from Alpaca activities/fills
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Transaction, Fund, Order, Trade
from app.services.core.time_context import get_current_time
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.trading.constants import POSITION_EPSILON, FLOAT_COMPARISON_EPSILON
from app.services.events.event_service import event_service

logger = logging.getLogger(__name__)


async def _validate_trade_id(
    session: AsyncSession,
    trade_id: Optional[str]
) -> Optional[str]:
    """
    Validate that a trade_id exists in the database.
    
    Returns the trade_id if valid, None if invalid or missing.
    """
    if not trade_id:
        return None
    
    trade = await session.get(Trade, trade_id)
    if trade:
        return trade_id
    else:
        logger.warning(
            f"⚠️  Trade {trade_id} not found. "
            f"Creating transaction without trade_id."
        )
        return None


async def _ensure_synthetic_order(
    session: AsyncSession,
    order_id: str,
    fund_id: str,
    symbol: str,
    side: str,
    quantity: float,
    timestamp: datetime
) -> None:
    """
    Ensure a synthetic order exists for reconciliation transactions.
    
    Creates an Order record if it doesn't exist. This is needed because
    Transaction.order_id has a foreign key constraint to orders.id.
    
    Args:
        session: Database session
        order_id: Synthetic order ID (should start with "recon_")
        fund_id: Fund ID
        symbol: Stock symbol
        side: "buy" or "sell"
        quantity: Number of shares
        timestamp: Transaction timestamp (timezone-naive, will be converted)
    """
    # Check if order already exists
    existing_order = await session.get(Order, order_id)
    if existing_order:
        return  # Order already exists
    
    # Convert timestamp to timezone-aware for Order model (which uses DateTime(timezone=True))
    # Order model expects timezone-aware datetime, but we receive timezone-naive from _normalize_timestamp
    if timestamp.tzinfo is None:
        order_timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        order_timestamp = timestamp
    
    # Create synthetic order for reconciliation
    synthetic_order = Order(
        id=order_id,
        alpaca_order_id=None,  # No Alpaca order for synthetic reconciliation
        fund_id=fund_id,
        trade_id=None,  # No trade for synthetic reconciliation
        symbol=symbol,
        side=side,
        quantity=quantity,
        order_type="market",  # Default to market for reconciliation
        estimated_price=None,  # No estimated price for reconciliation
        status="filled",  # Synthetic orders are considered filled
        submitted_at=order_timestamp,
        filled_at=order_timestamp,
        filled_qty=quantity,
        filled_avg_price=None,  # Will be set by transaction price
    )
    session.add(synthetic_order)
    # Flush to ensure order exists before transaction references it (satisfies foreign key constraint)
    await session.flush()
    logger.debug(
        f"Created synthetic order {order_id[:8]}... for reconciliation transaction"
    )


async def _normalize_timestamp(timestamp: Optional[datetime] = None) -> datetime:
    """
    Normalize a timestamp to timezone-naive UTC for database storage.
    
    Uses get_current_time() if no timestamp provided (for backtesting support).
    """
    if timestamp is None:
        timestamp = get_current_time()
    
    # Ensure timezone-aware
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    
    # Convert to timezone-naive UTC for database
    if timestamp.tzinfo:
        timestamp = timestamp.replace(tzinfo=None)
    
    return timestamp


async def _update_fund_balance(
    session: AsyncSession,
    fund_id: str,
    side: str,
    total_value: float,
    symbol: str
) -> None:
    """
    Update fund balance after a transaction.
    
    Buy: cash decreases, Sell: cash increases
    """
    fund = await session.get(Fund, fund_id)
    if fund:
        old_balance = fund.balance
        if side == "buy":
            fund.balance -= total_value
        else:  # sell
            fund.balance += total_value
        
        logger.info(
            f"💰 Fund balance updated: ${old_balance:.2f} → ${fund.balance:.2f} "
            f"(after {side} ${total_value:.2f} for {symbol})"
        )
    else:
        logger.warning(f"⚠️  Fund {fund_id} not found - balance not updated")


async def create_transaction(
    session: AsyncSession,
    fund_id: str,
    symbol: str,
    transaction_type: str,  # "buy" or "sell"
    quantity: float,
    price: float,
    order_id: str,
    timestamp: Optional[datetime] = None,
    notes: Optional[str] = None,
    alpaca_order_id: Optional[str] = None,
    alpaca_fill_id: Optional[str] = None,
    trade_id: Optional[str] = None,
    validate_order: bool = True,
    validate_position: bool = False,
) -> Transaction:
    """
    Create a transaction record (core function).
    
    Used for reconciliation and synthetic transactions (e.g., force-closing positions).
    This is the base function that other specialized functions wrap.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        transaction_type: "buy" or "sell"
        quantity: Number of shares
        price: Price per share
        order_id: Order ID (can be synthetic for reconciliation transactions)
        timestamp: Transaction timestamp (uses get_current_time() if None)
        notes: Optional notes about the transaction
        alpaca_order_id: Optional Alpaca order ID
        alpaca_fill_id: Optional Alpaca fill ID
        trade_id: Optional trade ID (will be validated if provided)
        validate_order: Whether to validate order exists (skip for synthetic orders)
        validate_position: Whether to validate position exists for sells (prevents over-selling)
        
    Returns:
        Created Transaction record
    """
    try:
        # Validate transaction type
        if transaction_type not in ["buy", "sell"]:
            raise ValueError(f"Invalid transaction_type: {transaction_type}. Must be 'buy' or 'sell'")
        
        # Validate quantity
        if quantity <= 0:
            raise ValueError(f"Quantity must be positive, got {quantity}")
        
        # Validate price
        if price <= 0:
            raise ValueError(f"Price must be positive, got {price}")
        
        # Normalize timestamp early (needed for synthetic order creation)
        transaction_timestamp = await _normalize_timestamp(timestamp)
        
        # For synthetic reconciliation orders (starting with "recon_"), ensure the order exists
        # This is required because Transaction.order_id has a foreign key constraint
        if order_id.startswith("recon_"):
            await _ensure_synthetic_order(
                session=session,
                order_id=order_id,
                fund_id=fund_id,
                symbol=symbol,
                side=transaction_type,
                quantity=quantity,
                timestamp=transaction_timestamp
            )
        # Validate order exists (for non-synthetic order_ids)
        elif validate_order:
            order = await session.get(Order, order_id)
            if not order:
                logger.warning(
                    f"⚠️  Order {order_id} not found for transaction creation. "
                    f"Creating transaction anyway (may be synthetic/reconciliation)."
                )
        
        # Validate position for sells (prevent over-selling)
        if validate_position and transaction_type == "sell":
            actual_position = await get_position_quantity_from_transactions(
                session, fund_id, symbol
            )
            
            if quantity > actual_position + POSITION_EPSILON:
                logger.error(
                    f"🚨 OVER-SELL DETECTED: Attempting to sell {quantity} "
                    f"{symbol} but only own {actual_position:.2f}. Capping transaction."
                )
                quantity = max(0.0, actual_position)
            
            if quantity <= FLOAT_COMPARISON_EPSILON:
                logger.error(
                    f"❌ Cannot create sell transaction for {symbol} - "
                    f"no position to sell (actual: {actual_position:.2f})"
                )
                raise ValueError(f"Cannot sell {quantity} shares of {symbol} - position is {actual_position:.2f}")
        
        # Validate trade_id
        validated_trade_id = await _validate_trade_id(session, trade_id)
        
        # Calculate total value
        total_value = quantity * price
        
        # Create transaction record
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=order_id,
            alpaca_order_id=alpaca_order_id,
            alpaca_fill_id=alpaca_fill_id,
            fund_id=fund_id,
            trade_id=validated_trade_id,
            symbol=symbol,
            side=transaction_type,  # "buy" or "sell"
            quantity=quantity,
            price=price,
            total_value=total_value,
            timestamp=transaction_timestamp,
            high_water_mark=price if transaction_type == "buy" else None,
            strategy_state={"notes": notes} if notes else {},
        )
        
        session.add(transaction)
        
        # Update fund balance
        await _update_fund_balance(session, fund_id, transaction_type, total_value, symbol)
        
        logger.info(
            f"💰 Transaction created: {symbol} {transaction_type} "
            f"{quantity} @ ${price:.2f} = ${total_value:.2f} "
            f"(order_id: {order_id[:8]}...)"
        )
        
        return transaction
        
    except Exception as e:
        logger.error(
            f"Error creating transaction for {symbol} {transaction_type}: {e}",
            exc_info=True
        )
        raise


async def create_transaction_from_order(
    session: AsyncSession,
    order: Order,
    alpaca_order: Any,
    quantity_to_transact: float,
    alpaca_fill_id: Optional[str] = None,
) -> Optional[Transaction]:
    """
    Create a transaction record from an order and Alpaca order object.
    
    NOTE: This method is deprecated. Use create_transaction_from_fill_event() for WebSocket events
    or create_transaction_from_activity() for Activities API reconciliation.
    
    CRITICAL: This method should NOT be used for filled orders without alpaca_fill_id.
    For filled orders, use Activities API reconciliation which has proper fill IDs.
    
    Args:
        session: Database session
        order: Order that was filled
        alpaca_order: Alpaca order object with fill details
        quantity_to_transact: The specific quantity to record (delta for partial fills)
        alpaca_fill_id: Optional Alpaca fill ID
        
    Returns:
        Created Transaction record, or None if skipped
    """
    try:
        # CRITICAL VALIDATION: Prevent creating transactions without alpaca_fill_id
        # This prevents phantom transactions that can't be traced back to Alpaca fills.
        # For filled orders, we must use Activities API reconciliation which has fill IDs.
        if order.status in ["filled", "partially_filled"]:
            logger.warning(
                f"⚠️  Skipping transaction creation for {order.symbol} {order.side} order {order.id[:8]} "
                f"because it's filled but we don't have alpaca_fill_id. "
                f"Activities API reconciliation will handle this with proper fill IDs. "
                f"(Order filled_qty: {alpaca_order.filled_qty}, quantity_to_transact: {quantity_to_transact})"
            )
            
            # Log event for monitoring
            await event_service.log_strategy_engine_event(
                fund_id=order.fund_id,
                event_category="fill_tracking",
                symbol=order.symbol,
                severity="warning",
                message=f"Skipped transaction creation for {order.symbol} - missing alpaca_fill_id",
                event_data={
                    "order_id": order.id,
                    "alpaca_order_id": order.alpaca_order_id,
                    "side": order.side,
                    "order_status": order.status,
                    "filled_qty": float(alpaca_order.filled_qty) if alpaca_order.filled_qty else None,
                    "quantity_to_transact": float(quantity_to_transact),
                    "reason": "missing_alpaca_fill_id",
                    "note": "Activities API reconciliation will create transaction with proper fill ID"
                }
            )
            return None
        
        filled_price = float(alpaca_order.filled_avg_price) if alpaca_order.filled_avg_price else 0.0
        transaction_timestamp = alpaca_order.filled_at if alpaca_order.filled_at else None
        
        # NOTE: This code path should rarely be used now since filled orders
        # are handled by Activities API reconciliation. Only use for special cases
        # where we have a fill ID from another source.
        return await create_transaction(
            session=session,
            fund_id=order.fund_id,
            symbol=order.symbol,
            transaction_type=order.side,
            quantity=quantity_to_transact,
            price=filled_price,
            order_id=order.id,
            timestamp=transaction_timestamp,
            alpaca_order_id=order.alpaca_order_id,
            alpaca_fill_id=alpaca_fill_id,
            trade_id=order.trade_id,
            validate_order=True,
            validate_position=True,  # Validate position for sells to prevent over-selling
        )
        
    except Exception as e:
        logger.error(f"Error creating transaction for order {order.id}: {e}", exc_info=True)
        raise


async def create_transaction_from_activity(
    session: AsyncSession,
    fund_id: str,
    order: Order,
    fill_data: Dict[str, Any],
) -> Optional[Transaction]:
    """
    Create a transaction record from Alpaca activity/fill data.
    
    Used by trading_reconciliation_service.py for syncing from Activities API.
    
    Args:
        session: Database session
        fund_id: Fund ID
        order: Order that this fill belongs to
        fill_data: Dict with fill data from Alpaca Activities API
                  Must contain: id, symbol, side, qty, price, transaction_time
        
    Returns:
        Created Transaction record, or None if skipped
    """
    try:
        fill_id = fill_data.get("id")
        
        # CRITICAL VALIDATION: Ensure we always have a fill_id when creating transactions
        # This prevents phantom transactions that can't be traced back to Alpaca fills.
        if not fill_id:
            logger.error(
                f"❌ Cannot create transaction for {fill_data['symbol']} {fill_data['side']} - "
                f"missing fill_id. This indicates a data integrity issue. "
                f"Skipping transaction creation."
            )
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="fill_tracking",
                symbol=fill_data["symbol"],
                severity="error",
                message=f"Failed to create transaction for {fill_data['symbol']} - missing fill_id",
                event_data={
                    "order_id": order.id if order else None,
                    "alpaca_order_id": fill_data.get("order_id"),
                    "side": fill_data["side"],
                    "quantity": fill_data["qty"],
                    "price": fill_data["price"],
                    "reason": "missing_fill_id",
                }
            )
            return None
        
        # Parse transaction time
        transaction_time = fill_data.get("transaction_time")
        timestamp = None
        if transaction_time:
            if isinstance(transaction_time, str):
                timestamp = datetime.fromisoformat(transaction_time)
            else:
                timestamp = transaction_time
        else:
            logger.warning(f"No transaction_time for fill {fill_id}, using current time")
        
        return await create_transaction(
            session=session,
            fund_id=fund_id,
            symbol=fill_data["symbol"],
            transaction_type=fill_data["side"],
            quantity=fill_data["qty"],
            price=fill_data["price"],
            order_id=order.id,
            timestamp=timestamp,
            alpaca_order_id=order.alpaca_order_id,
            alpaca_fill_id=fill_id,  # REQUIRED: Must have fill_id for all transactions
            trade_id=order.trade_id,
            validate_order=True,
            validate_position=False,  # Activities are source of truth, don't validate position
        )
        
    except Exception as e:
        logger.error(
            f"Error creating transaction from activity for {fill_data.get('symbol', 'unknown')}: {e}",
            exc_info=True
        )
        raise


async def create_transaction_from_fill_event(
    session: AsyncSession,
    order: Order,
    fill_event: Dict[str, Any],
) -> Optional[Transaction]:
    """
    Create a transaction record from WebSocket fill event.
    
    Used by trade_event_handler.py for WebSocket trade_updates events.
    
    Args:
        session: Database session
        order: Order that was filled
        fill_event: Dict with fill data from WebSocket event
                   Must contain: timestamp (ISO format string), price, qty
                   Optional: position_qty (for validation)
        
    Returns:
        Created Transaction record, or None if skipped
        
    Note:
        For partial_fill events, qty is the incremental amount,
        not the total filled_qty. The WebSocket sends each partial fill separately.
    """
    try:
        # Extract fill details
        fill_timestamp_str = fill_event.get("timestamp")
        fill_price = float(fill_event.get("price", 0))
        fill_qty = float(fill_event.get("qty", 0))
        
        if not fill_price or fill_price <= 0:
            logger.error(
                f"❌ Cannot create transaction for {order.symbol} {order.side} - "
                f"invalid price: {fill_price}"
            )
            return None
        
        if not fill_qty or fill_qty <= 0:
            logger.error(
                f"❌ Cannot create transaction for {order.symbol} {order.side} - "
                f"invalid quantity: {fill_qty}"
            )
            return None
        
        # Parse timestamp
        fill_timestamp = None
        if fill_timestamp_str:
            try:
                # Handle ISO format with or without Z
                if fill_timestamp_str.endswith("Z"):
                    fill_timestamp = datetime.fromisoformat(
                        fill_timestamp_str.replace("Z", "+00:00")
                    )
                else:
                    fill_timestamp = datetime.fromisoformat(fill_timestamp_str)
            except Exception as e:
                logger.warning(f"Failed to parse fill timestamp: {e}, using current time")
                fill_timestamp = None
        
        if not fill_timestamp:
            fill_timestamp = get_current_time()
            if fill_timestamp.tzinfo is None:
                fill_timestamp = fill_timestamp.replace(tzinfo=timezone.utc)
        
        return await create_transaction(
            session=session,
            fund_id=order.fund_id,
            symbol=order.symbol,
            transaction_type=order.side,
            quantity=fill_qty,
            price=fill_price,
            order_id=order.id,
            timestamp=fill_timestamp,
            alpaca_order_id=order.alpaca_order_id,
            alpaca_fill_id=None,  # WebSocket doesn't provide fill_id
            trade_id=order.trade_id,
            validate_order=False,  # We already have the order
            validate_position=True,  # Validate position for sells to prevent over-selling
        )
        
    except Exception as e:
        logger.error(
            f"Error creating transaction from fill event for {order.symbol}: {e}",
            exc_info=True
        )
        raise

