"""
Order Executor Service

Handles all order execution logic for buy and sell orders.
MOVED from StrategyEngine for better organization.
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional

from app.services.core.time_context import get_current_time, get_backtest_id

from sqlalchemy import select

from app.strategies.base import EntryLevel, StopUpdate, MarketDataSnapshot, PositionContext
from app.models.strategies import Fund, Order, Transaction, Trade
from app.services.core.database import get_async_session
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.order_lifecycle import OrderLifecycleManager
from app.services.trading.reconciliation_service import get_reconciliation_service
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.trading.constants import POSITION_EPSILON
from app.services.events.event_broadcasting import (
    broadcast_error,
    broadcast_diagnostic,
    broadcast_scale_out,
)
from app.services.strategies.position_sizer import PositionSizer
from app.services.strategies.strategy_service import StrategyService
from app.services.analytics.trade_builder import TradeBuilder
from app.lib.strategy_logger import StrategyLogger
from app.services.strategies.ticker_state_service import get_ticker_state_service
from app.types import TickerStateTransitionCode

logger = logging.getLogger(__name__)


class OrderExecutor:
    """
    Executes buy and sell orders via Alpaca.
    
    Handles order validation, Alpaca API calls, reconciliation scheduling,
    and state persistence.
    """
    
    def __init__(
        self,
        fund: Fund,
        alpaca_service: AlpacaService,
        position_sizer: PositionSizer,
        strategy_service: StrategyService,
        strategy_logger: StrategyLogger,
        order_lifecycle: OrderLifecycleManager,
        risk_manager,  # RiskManager instance
    ):
        """
        Initialize order executor.
        
        Args:
            fund: Fund configuration
            alpaca_service: Alpaca trading service
            position_sizer: Position sizing service
            strategy_service: Strategy persistence service
            strategy_logger: Logging service
            order_lifecycle: Order lifecycle manager
            risk_manager: Risk management service
        """
        self.fund = fund
        self.fund_id = fund.id
        self.alpaca_service = alpaca_service
        self.position_sizer = position_sizer
        self.strategy_service = strategy_service
        self.strategy_logger = strategy_logger
        self.order_lifecycle = order_lifecycle
        self.risk_manager = risk_manager
        self.ticker_state_service = get_ticker_state_service()
    
    async def execute_buy_order(
        self,
        symbol: str,
        signal: EntryLevel,
        market_data: MarketDataSnapshot
    ) -> bool:
        """
        Execute a buy order.
        
        Args:
            symbol: Ticker symbol
            signal: Entry level with entry_price, stop_loss, confidence
            market_data: Current market data
            
        Returns:
            True if order placed successfully, False otherwise
        """
        try:
            # Safety check: Verify trading mode
            self.risk_manager.verify_trading_mode(self.alpaca_service.paper_trading)
            
            # Skip if price is invalid
            if market_data.price <= 0:
                logger.warning(f"Skipping entry for {symbol}: invalid price {market_data.price}")
                return False
            
            self.strategy_logger.log(symbol, f"Entering position @ ${signal.entry_price:.2f}")
            
            # Calculate position size
            fund_balance = self.fund.balance
            # Use fund override if set, otherwise use default (1000.0)
            size_per_trade = self.fund.size_per_trade if self.fund.size_per_trade is not None else 1000.0
            position_size, quantity = self.position_sizer.calculate_position_size(
                fund_balance=fund_balance,
                size_per_trade=size_per_trade,
                confidence=signal.confidence,
                current_price=market_data.price,
                min_bet_percent=self.fund.min_bet_percent,
                max_bet_percent=self.fund.max_bet_percent,
            )
            
            self.strategy_logger.log(
                symbol,
                f"Position size: ${position_size:.2f} ({quantity} shares @ ${market_data.price:.2f})"
            )
            
            # Skip if can't afford 1 share
            if quantity < 1:
                logger.warning(
                    f"❌ Skipping entry for {symbol}: position size ${position_size:.2f} "
                    f"can't buy 1 share at ${market_data.price:.2f}"
                )
                return False
            
            actual_cost = quantity * market_data.price
            order_type = signal.order_type
            limit_price = signal.entry_price if order_type == "limit" else None
            order_price_snapshot = float(market_data.price)
            
            # CRITICAL: Validate AND create order in SINGLE transaction
            order_id = str(uuid.uuid4())
            trade_id = str(uuid.uuid4())  # Generate new trade_id for opening position
            submitted_at = get_current_time()
            
            try:
                backtest_id = get_backtest_id()
                async with get_async_session() as session:
                    # Validate with row-level lock
                    is_valid, error_msg = await self.order_lifecycle.validate_buy_order(
                        session=session,
                        fund=self.fund,
                        symbol=symbol,
                        quantity=quantity,
                        estimated_price=market_data.price
                    )
                    
                    if not is_valid:
                        logger.warning(f"❌ BALANCE VALIDATION FAILED: {error_msg}")
                        await broadcast_error(
                            fund_id=str(self.fund_id),
                            fund_name=self.fund.name,
                            symbol=symbol,
                            error_type="insufficient_balance",
                            message=error_msg or "Insufficient balance"
                        )
                        return False
                    
                    # Validation passed - create order and trade in SAME transaction
                    # Create Trade record immediately so transactions can link to it
                    trade_record = Trade(
                        id=trade_id,
                        fund_id=self.fund_id,
                        symbol=symbol,
                        backtest_id=backtest_id,
                        entry_order_id=order_id,
                        entry_time=submitted_at,
                        entry_price=market_data.price,  # Will be updated with actual fill price
                        entry_quantity=quantity,  # Will be updated with actual fill quantity
                        order_price_at_submission=order_price_snapshot,
                        strategy_id=self.fund.strategy_id,
                        screening_criteria_id=self.fund.screening_criteria_id,
                        status="pending",  # Will change to "open" when filled
                        trade_metadata={}
                    )
                    session.add(trade_record)
                    
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",
                        fund_id=self.fund_id,
                        trade_id=trade_id,  # Link to new trade
                        backtest_id=backtest_id,
                        symbol=symbol,
                        side="buy",
                        quantity=quantity,
                        order_type=order_type,
                        estimated_price=market_data.price,
                        status="pending",
                        submitted_at=submitted_at,
                    )
                    session.add(order_record)
                    await session.commit()
                
                logger.debug(f"📝 Order and Trade records created: order_id={order_id[:8]}..., trade_id={trade_id[:8]}...")
                
                
                # Broadcast diagnostic
                await broadcast_diagnostic(
                    fund_id=str(self.fund_id),
                    fund_name=self.fund.name,
                    message=f"Preparing to buy {quantity} shares of {symbol}",
                    fund_balance=fund_balance,
                    size_per_trade=size_per_trade,
                    max_bet_percent=self.fund.max_bet_percent,
                    calculated_position_size=position_size,
                    share_price=market_data.price,
                    quantity=quantity,
                    actual_cost=actual_cost,
                    order_type=order_type,
                    limit_price=limit_price,
                )
                
                # Place order via Alpaca
                try:
                    if order_type == "limit" and limit_price:
                        alpaca_order = await self.alpaca_service.place_limit_order(
                            symbol=symbol,
                            qty=quantity,
                            limit_price=limit_price,
                            side="buy",
                            time_in_force="day"
                        )
                    else:
                        alpaca_order = await self.alpaca_service.place_market_order(
                            symbol=symbol,
                            qty=quantity,
                            side="buy",
                            time_in_force="day"
                        )
                    alpaca_order_id = alpaca_order["id"]
                    logger.debug(f"✅ Alpaca order placed: {alpaca_order_id}")
                    
                except Exception as alpaca_error:
                    # Alpaca call failed - mark order as failed
                    logger.error(f"❌ Alpaca order placement failed: {alpaca_error}")
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.status = "failed"
                        order_record.error_message = f"Alpaca API error: {str(alpaca_error)}"
                        await session.commit()
                    return False
                
                # Update order record with Alpaca order ID
                try:
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.alpaca_order_id = alpaca_order_id
                        if backtest_id:
                            order_record.backtest_id = backtest_id
                        await session.commit()
                    logger.debug(f"✅ Order record updated with Alpaca ID: {alpaca_order_id}")
                    
                except Exception as db_error:
                    # DB update failed but Alpaca order exists - CRITICAL
                    logger.error(
                        f"❌ CRITICAL: DB update failed after Alpaca order placed! "
                        f"Attempting to cancel Alpaca order {alpaca_order_id}: {db_error}"
                    )
                    try:
                        await self.alpaca_service.cancel_order(alpaca_order_id)
                        logger.warning(f"✅ Successfully cancelled orphaned Alpaca order: {alpaca_order_id}")
                    except Exception as cancel_error:
                        logger.error(
                            f"❌ FAILED TO CANCEL ORPHANED ALPACA ORDER: {alpaca_order_id}! "
                            f"Manual cleanup required. Cancel error: {cancel_error}"
                        )
                    return False
                
                # Transition ticker lifecycle to ordered
                try:
                    await self.ticker_state_service.transition_ticker(
                        fund_id=self.fund_id,
                        ticker=symbol,
                        to_state="ordered",
                        transition_code=TickerStateTransitionCode.ENTRY_ORDER_PLACED.value,
                        description=(
                            f"Order submitted: {quantity:.2f} shares @ ${order_price_snapshot:.2f}"
                        ),
                        trade_id=trade_id
                    )
                except Exception as state_error:
                    logger.warning(
                        f"Failed to transition ticker {symbol} to ordered state: {state_error}"
                    )
                
            except Exception as e:
                logger.error(f"❌ Order creation failed for {symbol}: {e}")
                return False
            
            logger.debug(
                f"📤 Order submitted to Alpaca: {symbol} buy {quantity} @ ${market_data.price:.2f} "
                f"(order_id={order_id}, alpaca_id={alpaca_order['id']})"
            )
            
            # Schedule automatic reconciliation
            reconciliation_service = get_reconciliation_service()
            if reconciliation_service:
                asyncio.create_task(
                    reconciliation_service.schedule_order_reconciliation(
                        order_id=order_id,
                        fund_id=str(self.fund_id),
                        symbol=symbol
                    )
                )
                logger.debug(f"🔄 Scheduled reconciliation checks for {symbol} order")
            
            # Persist initial stop to DB
            await self.strategy_service.persist_management_state(
                self.fund_id,
                symbol,
                signal.entry_price,
                get_current_time(),
                StopUpdate(
                    current_stop=signal.stop_loss,
                    metadata={
                        **(signal.metadata.get("initial_management_state", {}) if signal.metadata else {}),
                        "current_stop": signal.stop_loss,
                    }
                )
            )
            self.strategy_logger.log(symbol, f"Initial stop set: ${signal.stop_loss:.2f}")
            
            # Broadcast trading event
            return True
        
        except Exception as e:
            logger.error(f"Error entering position for {symbol}: {e}", exc_info=True)
            return False
    
    async def execute_sell_order(
        self,
        position: PositionContext,
        signal: StopUpdate,
        market_data: MarketDataSnapshot
    ) -> bool:
        """
        Execute a sell order.
        
        Args:
            position: Position to exit
            signal: Stop update with exit reason
            market_data: Current market data
            
        Returns:
            True if order placed successfully, False otherwise
        """
        try:
            # Safety check: Verify trading mode
            self.risk_manager.verify_trading_mode(self.alpaca_service.paper_trading)
            
            self.strategy_logger.log(
                position.symbol,
                f"Exiting position @ ${market_data.price:.2f} (reason: {signal.exit_reason or 'stop_hit'})"
            )
            
            # Verify position exists in ledger (prevent over-selling)
            # Calculate actual quantity to sell (use minimum of ledger and Alpaca to prevent over-selling)
            available_quantity = position.quantity
            sell_quantity = position.quantity
            
            async with get_async_session() as session:
                db_position_qty = await get_position_quantity_from_transactions(
                    session, self.fund_id, position.symbol
                )
                
                if db_position_qty < POSITION_EPSILON:
                    logger.warning(
                        f"⚠️ No position in ledger for {position.symbol}. "
                        f"Skipping sell order to prevent over-selling."
                    )
                    return False
                
                # Determine available quantity based on ledger and Alpaca data
                available_quantity = min(db_position_qty, position.quantity)
                if abs(db_position_qty - position.quantity) > POSITION_EPSILON:
                    logger.warning(
                        f"⚠️ Position quantity mismatch for {position.symbol}: "
                        f"Alpaca reports {position.quantity:.6f}, ledger shows {db_position_qty:.2f}. "
                        f"Using minimum quantity {available_quantity:.2f} to prevent over-selling."
                    )
                    
                    # Log discrepancy
                    from app.services.events.event_service import event_service
                    await event_service.log_strategy_engine_event(
                        fund_id=self.fund_id,
                        event_category="position_sync",
                        symbol=position.symbol,
                        severity="warning",
                        message=f"Position quantity mismatch detected for {position.symbol}",
                        event_data={
                            "alpaca_quantity": float(position.quantity),
                            "ledger_quantity": float(db_position_qty),
                            "discrepancy": float(position.quantity - db_position_qty),
                            "action": "using_minimum_quantity",
                            "available_quantity": float(available_quantity),
                            "scale_out_percent": float(signal.scale_out_percent or 0.0),
                            "exit_reason": signal.exit_reason or "stop_hit",
                            "current_price": float(market_data.price),
                        }
                    )
                actual_quantity = available_quantity
                
                # Apply scale-out percent if requested
                if signal.scale_out_percent and signal.scale_out_percent > 0:
                    fraction = max(0.0, min(signal.scale_out_percent, 100.0)) / 100.0
                    scaled_quantity = available_quantity * fraction
                    actual_quantity = min(available_quantity, scaled_quantity)
                
                # Guard against rounding down to zero
                if actual_quantity < POSITION_EPSILON:
                    logger.warning(
                        f"⚠️ Calculated sell quantity too small for {position.symbol}: {actual_quantity:.4f}. "
                        f"Skipping sell order."
                    )
                    return False
                
                # Round to 4 decimal places for fractional shares support
                actual_quantity = round(actual_quantity, 4)
                
                # Persist calculated quantity for later checks
                sell_quantity = actual_quantity
            
            # Final validation: ensure we have a valid quantity to sell
            if sell_quantity < POSITION_EPSILON:
                logger.warning(
                    f"⚠️ Insufficient quantity to sell for {position.symbol}: "
                    f"calculated quantity {sell_quantity:.2f} is too small. "
                    f"Skipping sell order."
                )
                return False
            
            # Cancel any pending buy orders for this symbol
            await self.cancel_pending_orders(position.symbol)
            
            # Look up the open trade for this symbol to link the exit order
            trade_id = None
            try:
                async with get_async_session() as session:
                    trade_builder = TradeBuilder(session)
                    open_trade = await trade_builder.get_open_trade_for_symbol(
                        fund_id=self.fund_id,
                        symbol=position.symbol
                    )
                    if open_trade:
                        trade_id = open_trade.id
                        logger.info(f"📊 Found open trade {trade_id} for {position.symbol}")
                    else:
                        logger.warning(
                            f"⚠️  No open trade found for {position.symbol}. "
                            f"Exit order will not be linked to a trade."
                        )
            except Exception as e:
                logger.warning(f"Error looking up trade for {position.symbol}: {e}")
            
            # Create order record
            order_id = str(uuid.uuid4())
            submitted_at = get_current_time()
            
            logger.debug(f"📝 Creating sell order record: {position.symbol} sell {actual_quantity} shares")
            
            try:
                backtest_id = get_backtest_id()
                # Create order in DB
                async with get_async_session() as session:
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",
                        fund_id=self.fund_id,
                        trade_id=trade_id,  # Link to existing trade
                        backtest_id=backtest_id,
                        symbol=position.symbol,
                        side="sell",
                        quantity=sell_quantity,
                        order_type="market",
                        estimated_price=market_data.price,
                        status="pending",
                        submitted_at=submitted_at,
                    )
                    session.add(order_record)
                    await session.commit()
                
                logger.debug(f"📝 Sell order record created in DB: {order_id}")
                
                # Place sell order via Alpaca
                try:
                    alpaca_order = await self.alpaca_service.place_market_order(
                        symbol=position.symbol,
                        qty=sell_quantity,
                        side="sell",
                        time_in_force="day"
                    )
                    alpaca_order_id = alpaca_order["id"]
                    logger.debug(f"✅ Alpaca sell order placed: {alpaca_order_id}")
                    
                except Exception as alpaca_error:
                    # Alpaca call failed - mark order as failed
                    logger.error(f"❌ Alpaca sell order placement failed: {alpaca_error}")
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.status = "failed"
                        order_record.error_message = f"Alpaca API error: {str(alpaca_error)}"
                        await session.commit()
                    return False
                
                # Update order record with Alpaca order ID
                try:
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.alpaca_order_id = alpaca_order_id
                        if backtest_id:
                            order_record.backtest_id = backtest_id
                        await session.commit()
                    logger.debug(f"✅ Sell order record updated with Alpaca ID: {alpaca_order_id}")
                    
                    # Schedule reconciliation
                    reconciliation_service = get_reconciliation_service()
                    if reconciliation_service:
                        asyncio.create_task(
                            reconciliation_service.schedule_order_reconciliation(
                                order_id=order_id,
                                fund_id=str(self.fund_id),
                                symbol=position.symbol
                            )
                        )
                        logger.debug(f"🔄 Scheduled reconciliation checks for {position.symbol} sell order")
                    
                except Exception as db_error:
                    # DB update failed but Alpaca order exists - CRITICAL
                    logger.error(
                        f"❌ CRITICAL: DB update failed after Alpaca sell order placed! "
                        f"Attempting to cancel Alpaca order {alpaca_order_id}: {db_error}"
                    )
                    try:
                        await self.alpaca_service.cancel_order(alpaca_order_id)
                        logger.warning(f"✅ Successfully cancelled orphaned Alpaca sell order: {alpaca_order_id}")
                    except Exception as cancel_error:
                        logger.error(
                            f"❌ FAILED TO CANCEL ORPHANED ALPACA SELL ORDER: {alpaca_order_id}! "
                            f"Manual cleanup required. Cancel error: {cancel_error}"
                        )
                    return False
                
            except Exception as e:
                logger.error(f"❌ Sell order creation failed for {position.symbol}: {e}")
                return False
            
            # Calculate P&L
            realized_pnl = position.unrealized_pnl
            
            logger.debug(
                f"📤 Sell order submitted to Alpaca: {position.symbol} sell {sell_quantity} @ ${market_data.price:.2f} "
                f"(order_id={order_id}, alpaca_id={alpaca_order['id']}, P&L: ${realized_pnl:.2f})"
            )
            
            sold_entire_position = abs(sell_quantity - available_quantity) < POSITION_EPSILON
            
            if signal.scale_out_percent and signal.scale_out_percent > 0 and not sold_entire_position:
                await broadcast_scale_out(
                    fund_id=str(self.fund_id),
                    fund_name=self.fund.name,
                    symbol=position.symbol,
                    quantity=sell_quantity,
                    price=market_data.price,
                    percent=signal.scale_out_percent,
                    reason=signal.exit_reason,
                )
            
            if sold_entire_position:
                # Clean up monitoring state only when fully exiting
                await self.strategy_service.deactivate_symbol_levels(
                    self.fund_id,
                    position.symbol,
                    "position_closed"
                )
            
            return True
        
        except Exception as e:
            logger.error(f"Error exiting position for {position.symbol}: {e}", exc_info=True)
            return False
    
    async def cancel_pending_orders(self, symbol: str) -> None:
        """
        Cancel any pending orders for a symbol.
        
        Called before placing exit orders to avoid wash trade detection.
        
        Args:
            symbol: Symbol to cancel orders for
        """
        try:
            logger.debug(f"🔍 Checking for pending orders for {symbol}")
            
            open_orders = await self.alpaca_service.get_open_orders(symbol=symbol)
            
            if not open_orders:
                logger.debug(f"✓ No pending orders for {symbol}")
                return
            
            logger.info(f"⚠️  Found {len(open_orders)} pending order(s) for {symbol}, canceling...")
            
            for order in open_orders:
                try:
                    order_id = order.id
                    order_side = order.side
                    order_qty = order.qty
                    
                    logger.info(
                        f"🗑️  Canceling pending {order_side} order: "
                        f"{order_qty} shares of {symbol} (order_id={order_id})"
                    )
                    
                    await self.alpaca_service.cancel_order(order_id)
                    logger.info(f"✅ Canceled order {order_id}")
                    
                except Exception as e:
                    logger.error(f"Error canceling order {order_id}: {e}", exc_info=True)
            
        except Exception as e:
            logger.error(f"Error checking/canceling pending orders for {symbol}: {e}", exc_info=True)
    
    async def cancel_stale_orders(self, max_age_seconds: int, pending_orders: list) -> None:
        """
        Cancel pending buy orders that exceed max age.
        
        Args:
            max_age_seconds: Maximum order age in seconds
            pending_orders: List of pending orders to check
        """
        try:
            if not pending_orders:
                return
            
            now = get_current_time()
            
            for order in pending_orders:
                # Calculate order age
                order_age_seconds = (now - order.submitted_at).total_seconds()
                
                # Cancel if older than max age
                if order_age_seconds > max_age_seconds:
                    logger.info(
                        f"🚫 Canceling stale order: {order.symbol} (age: {order_age_seconds:.0f}s, "
                        f"order_id={order.id}, alpaca_id={order.alpaca_order_id})"
                    )
                    
                    try:
                        # Cancel with Alpaca
                        if order.alpaca_order_id:
                            await self.alpaca_service.cancel_order(order.alpaca_order_id)
                            logger.info(f"✅ Alpaca order canceled: {order.alpaca_order_id}")
                        
                        # Update database
                        async with get_async_session() as session:
                            order.status = "canceled"
                            order.error_message = f"Canceled: stale order (age: {order_age_seconds:.0f}s)"
                            session.add(order)
                            
                            expired_trade_id = order.trade_id
                            if expired_trade_id:
                                trade = await session.get(Trade, expired_trade_id)
                                if trade:
                                    trade.status = "expired"
                                    trade.updated_at = get_current_time()
                                    session.add(trade)
                            
                            await session.commit()
                        
                        if order.trade_id:
                            try:
                                await self.ticker_state_service.transition_ticker(
                                    fund_id=self.fund_id,
                                    ticker=order.symbol,
                                    to_state="screened",
                                    transition_code=TickerStateTransitionCode.ORDER_CANCELED_STALE.value,
                                    description=(
                                        f"Order expired after {order_age_seconds:.0f}s without fill"
                                    ),
                                    clear_entry_level=True,
                                    clear_trade_id=True
                                )
                            except Exception as state_error:
                                logger.warning(
                                    f"Failed to reset ticker {order.symbol} after stale cancellation: {state_error}"
                                )
                        
                    except Exception as e:
                        logger.error(f"Error canceling stale order {order.id}: {e}", exc_info=True)
                        
        except Exception as e:
            logger.error(f"Error checking for stale orders: {e}", exc_info=True)

