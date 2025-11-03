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

from sqlalchemy import select

from app.strategies.base import EntryLevel, StopUpdate, MarketDataSnapshot, PositionContext
from app.models.strategies import Fund, Order
from app.services.core.database import get_async_session
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.order_lifecycle import OrderLifecycleManager
from app.services.trading.reconciliation_service import get_reconciliation_service
from app.services.trading.position_tracker import get_position_quantity_from_transactions
from app.services.events.event_broadcasting import (
    broadcast_error,
    broadcast_diagnostic,
    _get_utc_timestamp,
)
from app.services.strategies.position_sizer import PositionSizer
from app.services.strategies.strategy_service import StrategyService
from app.lib.strategy_logger import StrategyLogger

logger = logging.getLogger(__name__)


async def _broadcast_trading_event(event: dict) -> None:
    """Broadcast trading event to WebSocket subscribers."""
    try:
        from app.routers.realtime import broadcast_trading_activity
        await broadcast_trading_activity(event)
    except Exception as e:
        logger.warning(f"Failed to broadcast trading event: {e}")


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
            position_size, quantity = self.position_sizer.calculate_position_size(
                fund_balance=fund_balance,
                size_per_trade=self.fund.size_per_trade,
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
                
                await _broadcast_trading_event({
                    "fund_id": str(self.fund_id),
                    "fund_name": self.fund.name,
                    "event_type": "skip",
                    "timestamp": _get_utc_timestamp(),
                    "symbol": symbol,
                    "reason": "Insufficient position size",
                    "message": f"Cannot buy {symbol}: need ${market_data.price:.2f} but only have ${position_size:.2f}",
                    "details": {
                        "fund_balance": fund_balance,
                        "size_per_trade": self.fund.size_per_trade,
                        "calculated_position_size": position_size,
                        "share_price": market_data.price,
                    }
                })
                return False
            
            actual_cost = quantity * market_data.price
            order_type = signal.order_type
            limit_price = signal.entry_price if order_type == "limit" else None
            
            # CRITICAL: Validate AND create order in SINGLE transaction
            order_id = str(uuid.uuid4())
            submitted_at = datetime.utcnow()
            
            try:
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
                    
                    # Validation passed - create order in SAME transaction
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",
                        fund_id=self.fund_id,
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
                
                logger.info(f"📝 Order record created in DB: {order_id}")
                
                # Broadcast diagnostic
                await broadcast_diagnostic(
                    fund_id=str(self.fund_id),
                    fund_name=self.fund.name,
                    message=f"Preparing to buy {quantity} shares of {symbol}",
                    fund_balance=fund_balance,
                    size_per_trade=self.fund.size_per_trade,
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
                    logger.info(f"✅ Alpaca order placed: {alpaca_order_id}")
                    
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
                        await session.commit()
                    logger.info(f"✅ Order record updated with Alpaca ID: {alpaca_order_id}")
                    
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
                
            except Exception as e:
                logger.error(f"❌ Order creation failed for {symbol}: {e}")
                return False
            
            logger.info(
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
                datetime.utcnow(),
                StopUpdate(current_stop=signal.stop_loss)
            )
            self.strategy_logger.log(symbol, f"Initial stop set: ${signal.stop_loss:.2f}")
            
            # Broadcast trading event
            order_details = {
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "order_submitted",
                "symbol": symbol,
                "side": "buy",
                "quantity": quantity,
                "price": market_data.price,
                "position_size": position_size,
                "order_id": order_id,
                "alpaca_order_id": alpaca_order["id"],
                "timestamp": _get_utc_timestamp(),
                "reason": "entry_level_triggered",
                "entry_confidence": signal.confidence,
                "order_type": order_type,
                "message": f"Buy order submitted: {quantity} shares of {symbol} @ ${market_data.price:.2f} ({order_type})",
            }
            if limit_price:
                order_details["limit_price"] = limit_price
            await _broadcast_trading_event(order_details)
            
            return True
        
        except Exception as e:
            logger.error(f"Error entering position for {symbol}: {e}", exc_info=True)
            
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Entry execution failed",
                "message": f"Failed to enter position in {symbol}: {str(e)}",
            })
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
            async with get_async_session() as session:
                db_position_qty = await get_position_quantity_from_transactions(
                    session, self.fund_id, position.symbol
                )
                
                if db_position_qty < 0.01:
                    logger.warning(
                        f"⚠️ No position in ledger for {position.symbol}. "
                        f"Skipping sell order to prevent over-selling."
                    )
                    return False
                
                # If there's a discrepancy, use ledger quantity as source of truth
                if abs(db_position_qty - position.quantity) > 0.01:
                    logger.warning(
                        f"⚠️ Position quantity mismatch for {position.symbol}: "
                        f"Alpaca reports {position.quantity:.6f}, ledger shows {db_position_qty:.2f}. "
                        f"Using ledger quantity {db_position_qty:.2f} as source of truth."
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
                            "action": "using_ledger_quantity",
                            "exit_reason": signal.exit_reason or "stop_hit",
                            "current_price": float(market_data.price),
                        }
                    )
                    
                    actual_quantity = db_position_qty
                else:
                    actual_quantity = position.quantity
            
            # Cancel any pending buy orders for this symbol
            await self.cancel_pending_orders(position.symbol)
            
            # Create order record
            order_id = str(uuid.uuid4())
            submitted_at = datetime.utcnow()
            
            logger.info(f"📝 Creating sell order record: {position.symbol} sell {actual_quantity} shares")
            
            try:
                # Create order in DB
                async with get_async_session() as session:
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",
                        fund_id=self.fund_id,
                        symbol=position.symbol,
                        side="sell",
                        quantity=actual_quantity,
                        order_type="market",
                        estimated_price=market_data.price,
                        status="pending",
                        submitted_at=submitted_at,
                    )
                    session.add(order_record)
                    await session.commit()
                
                logger.info(f"📝 Sell order record created in DB: {order_id}")
                
                # Place sell order via Alpaca
                try:
                    alpaca_order = await self.alpaca_service.place_market_order(
                        symbol=position.symbol,
                        qty=actual_quantity,
                        side="sell",
                        time_in_force="day"
                    )
                    alpaca_order_id = alpaca_order["id"]
                    logger.info(f"✅ Alpaca sell order placed: {alpaca_order_id}")
                    
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
                        await session.commit()
                    logger.info(f"✅ Sell order record updated with Alpaca ID: {alpaca_order_id}")
                    
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
            
            logger.info(
                f"📤 Sell order submitted to Alpaca: {position.symbol} sell {position.quantity} @ ${market_data.price:.2f} "
                f"(order_id={order_id}, alpaca_id={alpaca_order['id']}, P&L: ${realized_pnl:.2f})"
            )
            
            # Broadcast trading event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "order_submitted",
                "symbol": position.symbol,
                "side": "sell",
                "quantity": position.quantity,
                "price": market_data.price,
                "order_id": order_id,
                "alpaca_order_id": alpaca_order["id"],
                "pnl": realized_pnl,
                "pnl_percent": position.unrealized_pnl_percent,
                "timestamp": _get_utc_timestamp(),
                "reason": signal.exit_reason or "stop_hit",
                "order_type": "market",
                "message": f"Sell order submitted: {position.quantity} shares of {position.symbol} @ ${market_data.price:.2f} (market)",
            })
            
            # Clean up monitoring state
            await self.strategy_service.deactivate_symbol_levels(
                self.fund_id,
                position.symbol,
                "position_closed"
            )
            
            return True
        
        except Exception as e:
            logger.error(f"Error exiting position for {position.symbol}: {e}", exc_info=True)
            
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": position.symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Exit execution failed",
                "message": f"Failed to exit position in {position.symbol}: {str(e)}",
            })
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
                    
                    # Broadcast cancellation event
                    await _broadcast_trading_event({
                        "fund_id": str(self.fund_id),
                        "fund_name": self.fund.name,
                        "event_type": "order_cancelled",
                        "symbol": symbol,
                        "timestamp": _get_utc_timestamp(),
                        "reason": "Exit signal received with pending order",
                        "message": f"Canceled pending {order_side} order for {symbol}",
                        "details": {
                            "order_id": order_id,
                            "side": str(order_side),
                            "quantity": float(order_qty) if order_qty else 0,
                        }
                    })
                    
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
            
            now = datetime.utcnow()
            
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
                            await session.commit()
                        
                        # Broadcast cancellation
                        await _broadcast_trading_event({
                            "type": "order_canceled",
                            "message": f"Canceled stale {order.symbol} order (age: {order_age_seconds:.0f}s)",
                            "data": {
                                "fund_id": self.fund_id,
                                "symbol": order.symbol,
                                "order_id": order.id,
                                "age_seconds": order_age_seconds,
                                "reason": "stale_order"
                            }
                        })
                        
                    except Exception as e:
                        logger.error(f"Error canceling stale order {order.id}: {e}", exc_info=True)
                        
        except Exception as e:
            logger.error(f"Error checking for stale orders: {e}", exc_info=True)

