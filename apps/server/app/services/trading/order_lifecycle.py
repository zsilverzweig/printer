"""
Order Lifecycle Service

Centralize order creation, validation, and lifecycle management patterns.
Handles balance checks, pending order tracking, and order record creation.
"""

import logging
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Fund, Order
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.trading.constants import BALANCE_EPSILON, POSITION_EPSILON, FLOAT_COMPARISON_EPSILON

logger = logging.getLogger(__name__)


class OrderLifecycleManager:
    """Manage order creation, validation, and lifecycle."""
    
    def __init__(self, market_data_provider=None):
        """
        Initialize order lifecycle manager.
        
        Args:
            market_data_provider: Market data provider for price lookups (optional)
        """
        self.market_data_provider = market_data_provider
    
    async def validate_buy_order(
        self,
        session: AsyncSession,
        fund: Fund,
        symbol: str,
        quantity: float,
        estimated_price: float
    ) -> tuple[bool, Optional[str]]:
        """
        Validate buy order has sufficient available balance.
        
        CRITICAL: This now refreshes balance from database to prevent race conditions
        where multiple orders are validated against stale cached balance.
        
        Accounts for pending buy orders to prevent over-commitment of funds.
        
        Args:
            session: Database session
            fund: Fund object
            symbol: Stock symbol
            quantity: Quantity to buy
            estimated_price: Estimated price per share
            
        Returns:
            (is_valid, error_message)
            If is_valid is False, error_message explains why
        """
        try:
            # Calculate order cost
            order_cost = quantity * estimated_price
            
            if order_cost <= 0:
                return False, f"Invalid order cost: ${order_cost:.2f}"
            
            # CRITICAL FIX: Refresh balance from database with row-level lock
            # SELECT FOR UPDATE prevents other concurrent orders from validating
            # against the same balance, eliminating race conditions
            stmt = select(Fund).where(Fund.id == fund.id).with_for_update()
            result = await session.execute(stmt)
            db_fund = result.scalar_one_or_none()
            
            if not db_fund:
                return False, f"Fund {fund.id} not found in database"
            
            current_balance = db_fund.balance
            cached_balance = fund.balance
            
            if abs(current_balance - cached_balance) > BALANCE_EPSILON:
                logger.warning(
                    f"💰 Balance mismatch detected: cached=${cached_balance:.2f}, db=${current_balance:.2f}, "
                    f"diff=${current_balance - cached_balance:.2f}"
                )
            
            # Calculate pending exposure
            pending_exposure = await self.calculate_pending_exposure(
                session, fund.id
            )
            
            # Calculate available balance using REFRESHED balance from DB
            available_balance = current_balance - pending_exposure
            
            logger.info(
                f"💰 Balance check for {symbol}: "
                f"current=${current_balance:.2f}, pending=${pending_exposure:.2f}, "
                f"available=${available_balance:.2f}, need=${order_cost:.2f}"
            )
            
            # Check if we have enough
            if order_cost > available_balance:
                return False, (
                    f"Insufficient available balance: need ${order_cost:.2f}, "
                    f"have ${available_balance:.2f} available "
                    f"(current: ${current_balance:.2f}, pending: ${pending_exposure:.2f})"
                )
            
            # Additional safety: Check if balance would go negative
            if current_balance - order_cost < 0:
                return False, (
                    f"Order would create negative balance: "
                    f"current=${current_balance:.2f}, order=${order_cost:.2f}, "
                    f"result=${current_balance - order_cost:.2f}"
                )
            
            logger.info(
                f"✅ Buy order validation passed: {symbol} {quantity} @ ${estimated_price:.2f} = ${order_cost:.2f} "
                f"(available: ${available_balance:.2f})"
            )
            return True, None
            
        except Exception as e:
            logger.error(f"Error validating buy order for {symbol}: {e}", exc_info=True)
            return False, f"Validation error: {str(e)}"
    
    async def calculate_pending_exposure(
        self,
        session: AsyncSession,
        fund_id: str
    ) -> float:
        """
        Calculate total exposure from pending buy orders.
        
        Uses stored estimated_price from order records to calculate
        the total amount reserved by pending orders.
        
        Args:
            session: Database session
            fund_id: Fund ID
            
        Returns:
            Total dollar amount reserved by pending orders
        """
        try:
            # Get all pending buy orders for this fund
            stmt = select(Order).where(
                Order.fund_id == fund_id,
                Order.side == "buy",
                Order.status == "pending"
            )
            result = await session.execute(stmt)
            pending_orders = result.scalars().all()
            
            if not pending_orders:
                return 0.0
            
            total_exposure = 0.0
            
            for order in pending_orders:
                # Use stored estimated_price if available
                if order.estimated_price and order.estimated_price > 0:
                    order_cost = order.quantity * order.estimated_price
                    total_exposure += order_cost
                    logger.debug(
                        f"Pending order: {order.symbol} {order.quantity} @ ${order.estimated_price:.2f} = ${order_cost:.2f}"
                    )
                else:
                    # If no estimated price, try to get current price
                    if self.market_data_provider:
                        try:
                            quote = await self.market_data_provider.get_latest_quote(order.symbol)
                            price = quote.get('price', 0.0) if quote else 0.0
                            if price > 0:
                                order_cost = order.quantity * price
                                total_exposure += order_cost
                                logger.debug(
                                    f"Pending order: {order.symbol} {order.quantity} @ ${price:.2f} (fetched) = ${order_cost:.2f}"
                                )
                            else:
                                # Conservative estimate if we can't get price
                                conservative_estimate = order.quantity * 1000.0
                                total_exposure += conservative_estimate
                                logger.warning(
                                    f"No price for pending order {order.symbol}, using conservative estimate: ${conservative_estimate:.2f}"
                                )
                        except Exception as e:
                            logger.warning(f"Error fetching price for {order.symbol}: {e}")
                            # Conservative estimate
                            conservative_estimate = order.quantity * 1000.0
                            total_exposure += conservative_estimate
                    else:
                        # No market data provider, use conservative estimate
                        conservative_estimate = order.quantity * 1000.0
                        total_exposure += conservative_estimate
                        logger.warning(
                            f"No market data provider, using conservative estimate for {order.symbol}: ${conservative_estimate:.2f}"
                        )
            
            logger.debug(
                f"Total pending exposure for fund {fund_id[:8]}: ${total_exposure:.2f} "
                f"from {len(pending_orders)} pending orders"
            )
            
            return total_exposure
            
        except Exception as e:
            logger.error(f"Error calculating pending exposure for fund {fund_id}: {e}", exc_info=True)
            # Return 0 on error to avoid blocking trades
            return 0.0
    
    async def create_order_record(
        self,
        session: AsyncSession,
        fund_id: str,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str,
        estimated_price: Optional[float] = None
    ) -> Order:
        """
        Create order record BEFORE submitting to broker.
        
        This ensures we track the order in our system even if the
        broker submission fails.
        
        Args:
            session: Database session
            fund_id: Fund ID
            symbol: Stock symbol
            side: "buy" or "sell"
            quantity: Quantity to trade
            order_type: Order type (e.g., "market", "limit")
            estimated_price: Estimated price for cost calculation (optional)
            
        Returns:
            Created Order object
        """
        try:
            order_id = str(uuid.uuid4())
            submitted_at = datetime.utcnow()
            
            order = Order(
                id=order_id,
                alpaca_order_id="",  # Will be filled after broker returns
                fund_id=fund_id,
                symbol=symbol,
                side=side,
                quantity=quantity,
                order_type=order_type,
                estimated_price=estimated_price,
                status="pending",
                submitted_at=submitted_at,
            )
            
            session.add(order)
            await session.commit()
            await session.refresh(order)
            
            logger.info(
                f"Order record created: {order_id[:8]}... {symbol} {side} {quantity} @ ${estimated_price:.2f if estimated_price else 0:.2f}"
            )
            
            return order
            
        except Exception as e:
            logger.error(f"Error creating order record for {symbol}: {e}", exc_info=True)
            raise
    
    async def link_broker_order(
        self,
        session: AsyncSession,
        order_id: str,
        broker_order_id: str
    ) -> None:
        """
        Link our order to broker order ID.
        
        Updates the order record with the ID returned by the broker.
        
        Args:
            session: Database session
            order_id: Our internal order ID
            broker_order_id: ID from broker (e.g., Alpaca order ID)
        """
        try:
            stmt = select(Order).where(Order.id == order_id)
            result = await session.execute(stmt)
            order = result.scalar_one()
            
            order.alpaca_order_id = broker_order_id
            await session.commit()
            
            logger.info(f"Linked order {order_id[:8]}... to broker order {broker_order_id}")
            
        except Exception as e:
            logger.error(
                f"Error linking order {order_id} to broker order {broker_order_id}: {e}",
                exc_info=True
            )
            raise
    
    async def handle_order_failure(
        self,
        session: AsyncSession,
        order_id: str,
        error_message: str,
        cancel_broker_order: Optional[Callable] = None,
        broker_order_id: Optional[str] = None
    ) -> None:
        """
        Handle order creation failures with cleanup.
        
        Marks the order as failed and optionally cancels the broker order
        if it was already placed.
        
        Args:
            session: Database session
            order_id: Our internal order ID
            error_message: Error message to store
            cancel_broker_order: Optional async function to cancel broker order
            broker_order_id: Broker order ID to cancel (if any)
        """
        try:
            stmt = select(Order).where(Order.id == order_id)
            result = await session.execute(stmt)
            order = result.scalar_one()
            
            order.status = "failed"
            order.error_message = error_message
            await session.commit()
            
            logger.warning(f"Order {order_id[:8]}... marked as failed: {error_message}")
            
            # Cancel broker order if exists and cancellation function provided
            if cancel_broker_order and broker_order_id:
                try:
                    await cancel_broker_order(broker_order_id)
                    logger.info(f"Cancelled broker order {broker_order_id}")
                except Exception as cancel_error:
                    logger.error(
                        f"Failed to cancel broker order {broker_order_id}: {cancel_error}",
                        exc_info=True
                    )
            
        except Exception as e:
            logger.error(
                f"Error handling order failure for {order_id}: {e}",
                exc_info=True
            )
    
    async def validate_sell_order(
        self,
        session: AsyncSession,
        fund_id: str,
        symbol: str,
        quantity: float
    ) -> tuple[bool, Optional[str]]:
        """
        Validate sell order has sufficient position.
        
        Uses position tracker to verify we own enough shares to sell.
        
        Args:
            session: Database session
            fund_id: Fund ID
            symbol: Stock symbol
            quantity: Quantity to sell
            
        Returns:
            (is_valid, error_message)
        """
        try:
            current_position = await get_position_quantity_from_transactions(
                session, fund_id, symbol
            )
            
            if current_position < FLOAT_COMPARISON_EPSILON:
                return False, f"No position to sell (current: {current_position:.4f})"
            
            if quantity > current_position + POSITION_EPSILON:
                return False, (
                    f"Insufficient position: attempting to sell {quantity:.2f} "
                    f"but only own {current_position:.2f}"
                )
            
            logger.debug(
                f"Sell order validation passed: {symbol} {quantity} "
                f"(current position: {current_position:.2f})"
            )
            return True, None
            
        except Exception as e:
            logger.error(f"Error validating sell order for {symbol}: {e}", exc_info=True)
            return False, f"Validation error: {str(e)}"


