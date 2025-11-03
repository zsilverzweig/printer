"""
Strategy Execution Engine.

Orchestrates the execution of trading strategies including:
- Candidate screening
- Entry/exit monitoring
- Position management
- Order execution via Alpaca
- State tracking
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import logging
import asyncio
import uuid

from app.strategies.base import (
    ExecutionStrategy,
    MarketData,
    PositionContext,
    EntrySignal,
    ExitSignal,
    ScaleSignal,
)
from app.strategies.registry import get_strategy
from app.services.market.market_data_provider import MarketDataProvider
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.reconciliation_service import get_reconciliation_service
from app.services.trading.position_tracker import (
    get_position_quantity_from_transactions,
    get_position_context,
)
from app.services.trading.order_lifecycle import OrderLifecycleManager
from app.services.events.event_broadcasting import (
    broadcast_order_submitted,
    broadcast_error,
    broadcast_diagnostic,
    _get_utc_timestamp,
)
from app.models.strategies import Fund, Order, Transaction
from app.services.core.database import get_async_session
from sqlalchemy import select, and_
from app.types import ScreenerCriteria

logger = logging.getLogger(__name__)


async def _broadcast_trading_event(event: dict) -> None:
    """Broadcast trading event to WebSocket subscribers."""
    try:
        from app.routers.realtime import broadcast_trading_activity
        await broadcast_trading_activity(event)
    except Exception as e:
        logger.warning(f"Failed to broadcast trading event: {e}")


class StrategyEngine:
    """
    Orchestrates strategy execution for a fund.
    
    Responsibilities:
    - Load strategy configuration
    - Monitor screener results
    - Subscribe to real-time data for candidates
    - Check entry/exit conditions
    - Execute trades via Alpaca
    - Track position state
    """
    
    def __init__(
        self,
        fund: Fund,
        execution_strategy: ExecutionStrategy,
        market_data_provider: MarketDataProvider,
        alpaca_service: AlpacaService,
    ):
        """
        Initialize strategy engine.
        
        Args:
            fund: Fund object with all configuration (strategy, risk params, position sizing)
            execution_strategy: Instantiated execution strategy
            market_data_provider: Market data provider
            alpaca_service: Alpaca trading service (must match fund mode)
        
        Raises:
            ValueError: If fund mode doesn't match Alpaca service mode
        """
        logger.info(f"🔧 StrategyEngine.__init__ called for fund {fund.id}")
        logger.info(
            f"🔧 Fund object received: "
            f"id={fund.id}, name={fund.name}, balance=${fund.balance:.2f}, "
            f"mode={fund.mode}, status={fund.status}, strategy={fund.strategy_id}"
        )
        logger.info(
            f"🔧 Strategy config: "
            f"strategy_id={fund.strategy_id}, "
            f"size_per_trade=${fund.size_per_trade:.2f}, "
            f"max_bet_percent={fund.max_bet_percent}"
        )
        
        self.fund = fund
        self.fund_id = fund.id
        self.execution_strategy = execution_strategy
        self.market_data_provider = market_data_provider
        self.alpaca_service = alpaca_service
        
        # Initialize order lifecycle manager
        self.order_lifecycle = OrderLifecycleManager(market_data_provider=market_data_provider)
        
        # Verify fund mode matches Alpaca service mode
        fund_is_paper = (fund.mode == "sim")
        if fund_is_paper != alpaca_service.paper_trading:
            raise ValueError(
                f"Fund mode mismatch! Fund is '{fund.mode}' but "
                f"Alpaca service is in {'paper' if alpaca_service.paper_trading else 'real'} mode. "
                f"This is a safety check to prevent accidental real trading."
            )
        
        logger.info(
            f"✅ StrategyEngine initialized for fund {fund.id} "
            f"(mode: {fund.mode}, balance: ${fund.balance:.2f})"
        )
        
        # Monitored candidates
        self.monitored_symbols: List[str] = []
        
        # Running state
        self.is_running = False
        self._monitoring_task: Optional[asyncio.Task] = None
        
        # Position cache (refreshed from Alpaca on each check)
        self._position_cache: Dict[str, PositionContext] = {}
        self._last_position_refresh: Optional[datetime] = None
    
    async def refresh_fund_balance(self) -> None:
        """
        Refresh fund balance from database.
        
        Call this after transfers or other balance-changing operations
        to ensure engine has up-to-date balance for trading decisions.
        """
        try:
            async with get_async_session() as session:
                fund = await session.get(Fund, self.fund_id)
                if fund:
                    old_balance = self.fund.balance
                    self.fund.balance = fund.balance
                    logger.info(
                        f"💰 Refreshed balance for fund {self.fund_id}: "
                        f"${old_balance:.2f} → ${fund.balance:.2f}"
                    )
                else:
                    logger.warning(f"Could not refresh balance - fund {self.fund_id} not found")
        except Exception as e:
            logger.error(f"Error refreshing fund balance: {e}", exc_info=True)
    
    async def start(self) -> None:
        """Start the strategy execution loop."""
        if self.is_running:
            logger.warning("Strategy engine already running")
            return
        
        self.is_running = True
        
        # Refresh fund balance from database to ensure we have the latest value
        await self.refresh_fund_balance()
        
        logger.info(
            f"🚀 Starting strategy engine for fund {self.fund_id} "
            f"(name={self.fund.name}, balance=${self.fund.balance:.2f}, mode={self.fund.mode})"
        )
        logger.info(
            f"📋 Strategy config: strategy_id={self.fund.strategy_id}, "
            f"size_per_trade=${self.fund.size_per_trade:.2f}, "
            f"max_bet_percent={self.fund.max_bet_percent}"
        )
        
        # Log risk management settings
        max_order_age = self.fund.max_order_age_seconds or 60
        logger.info(
            f"⏱️  Risk management: max_order_age={max_order_age}s "
            f"(orders older than this will be auto-canceled)"
        )
        
        # Sync initial positions from Alpaca
        await self._refresh_positions_from_alpaca()
        
        # Start monitoring loop
        self._monitoring_task = asyncio.create_task(self._monitoring_loop())
    
    async def stop(self) -> None:
        """Stop the strategy execution loop."""
        logger.info(f"Stopping strategy engine for fund {self.fund_id}")
        self.is_running = False
        
        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
    
    async def _refresh_positions_from_alpaca(self) -> None:
        """
        Refresh position cache from Alpaca.
        
        Queries Alpaca for current positions and filters to only positions
        that belong to this fund (based on transaction history).
        """
        try:
            logger.debug(f"📊 Querying active positions from Alpaca for fund {self.fund_id}")
            
            # Get ALL positions from Alpaca
            alpaca_positions = await self.alpaca_service.get_positions()
            
            # Clear cache
            self._position_cache.clear()
            
            logger.debug(f"📊 Alpaca reports {len(alpaca_positions)} total position(s) in account")
            
            # Get symbols that belong to this fund (have buy transactions)
            fund_symbols = await self._get_fund_symbols()
            logger.debug(
                f"📊 This fund has transactions for: {fund_symbols if fund_symbols else 'none'}"
            )
            
            for alpaca_pos in alpaca_positions:
                symbol = alpaca_pos["symbol"]
                
                # FILTER: Only include positions that belong to this fund
                if symbol not in fund_symbols:
                    logger.debug(
                        f"📊 Skipping {symbol} - not owned by this fund "
                        f"(belongs to different fund/strategy)"
                    )
                    continue
                
                # Get buy transactions for this symbol to calculate entry info
                entry_price, entry_time, strategy_state, high_water_mark = await self._get_position_details(symbol)
                
                # Create PositionContext from Alpaca + our data
                position = PositionContext(
                    position_id=symbol,  # Use symbol as ID since we query from Alpaca
                    symbol=symbol,
                    entry_price=entry_price,
                    entry_time=entry_time,
                    quantity=alpaca_pos["qty"],
                    current_price=alpaca_pos["current_price"],
                    unrealized_pnl=alpaca_pos["unrealized_pl"],
                    unrealized_pnl_percent=alpaca_pos["unrealized_plpc"] * 100,
                    high_water_mark=high_water_mark or alpaca_pos["current_price"],
                    strategy_state=strategy_state,
                    has_scaled_out=strategy_state.get("has_scaled_out", False),
                    has_taken_profits=strategy_state.get("has_taken_profits", False),
                    scale_in_count=strategy_state.get("scale_in_count", 0),
                )
                
                self._position_cache[symbol] = position
                logger.debug(
                    f"📊 Position loaded: {symbol} - {alpaca_pos['qty']} shares @ "
                    f"${entry_price:.2f}, current ${alpaca_pos['current_price']:.2f}, "
                    f"P&L: ${alpaca_pos['unrealized_pl']:.2f}"
                )
            
            self._last_position_refresh = datetime.utcnow()
            
            if self._position_cache:
                logger.info(
                    f"📊 Synced {len(self._position_cache)} position(s) from Alpaca for this fund: "
                    f"{list(self._position_cache.keys())}"
                )
            else:
                logger.debug("📊 No active positions for this fund")
        
        except Exception as e:
            logger.error(f"Error refreshing positions from Alpaca: {e}", exc_info=True)
    
    async def _get_fund_symbols(self) -> set[str]:
        """
        Get all symbols that have open positions for this fund.
        
        Identifies symbols by checking if we have more buy transactions than sell transactions.
        
        Returns:
            Set of symbols that belong to this fund
        """
        try:
            async with get_async_session() as session:
                # Get all transactions for this fund, grouped by symbol
                stmt = select(
                    Transaction.symbol,
                    Transaction.side,
                    Transaction.quantity
                ).where(
                    Transaction.fund_id == self.fund_id
                ).order_by(Transaction.timestamp.asc())
                
                result = await session.execute(stmt)
                transactions = result.all()
                
                # Calculate net position for each symbol
                position_tracker = {}
                for symbol, side, quantity in transactions:
                    if symbol not in position_tracker:
                        position_tracker[symbol] = 0
                    
                    if side == "buy":
                        position_tracker[symbol] += quantity
                    else:  # sell
                        position_tracker[symbol] -= quantity
                
                # Return symbols with net positive positions
                fund_symbols = {
                    symbol for symbol, qty in position_tracker.items()
                    if qty > 0.001  # Use small threshold to handle floating point
                }
                
                return fund_symbols
        
        except Exception as e:
            logger.error(f"Error getting fund symbols: {e}", exc_info=True)
            return set()
    
    async def _get_position_details(self, symbol: str) -> tuple[float, datetime, dict, Optional[float]]:
        """
        Get position entry details from transaction history.
        
        Uses shared position_tracker service.
        
        Args:
            symbol: Symbol to get details for
            
        Returns:
            (entry_price, entry_time, strategy_state, high_water_mark)
        """
        try:
            async with get_async_session() as session:
                context = await get_position_context(session, self.fund_id, symbol)
                
                if context is None:
                    # No position history
                    return 0.0, datetime.utcnow(), {}, None
                
                return (
                    context["entry_price"],
                    context["entry_time"],
                    context["strategy_state"],
                    context["high_water_mark"]
                )
        
        except Exception as e:
            logger.error(f"Error getting position details for {symbol}: {e}", exc_info=True)
            return 0.0, datetime.utcnow(), {}, None
    
    async def get_active_positions(self) -> Dict[str, PositionContext]:
        """
        Get current active positions from cache.
        
        Note: Cache is explicitly refreshed at strategic points (e.g., start of 
        candidate selection) rather than time-based to ensure consistent state
        during a monitoring cycle.
        
        Returns:
            Dictionary mapping symbol to PositionContext
        """
        return self._position_cache
    
    async def get_pending_orders(self) -> List[Order]:
        """
        Get pending orders for this fund from database.
        
        Returns:
            List of pending Order objects
        """
        async with get_async_session() as session:
            stmt = select(Order).where(
                Order.fund_id == self.fund_id,
                Order.status == "pending"
            )
            result = await session.execute(stmt)
            return result.scalars().all()
    
    async def _cancel_stale_orders(self) -> None:
        """
        Cancel pending buy orders that exceed the configured max age.
        
        Prevents orders from sitting unfilled and clogging up the system.
        This is especially important for strategies with time windows or
        that need to move quickly.
        
        The timeout is configurable via fund.max_order_age_seconds.
        """
        try:
            # Get the configured timeout (default 60 seconds if not set)
            max_age_seconds = self.fund.max_order_age_seconds or 60
            
            async with get_async_session() as session:
                # Get all pending buy orders for this fund
                stmt = select(Order).where(
                    Order.fund_id == self.fund_id,
                    Order.side == "buy",
                    Order.status == "pending"
                )
                result = await session.execute(stmt)
                pending_orders = result.scalars().all()
                
                if not pending_orders:
                    return
                
                now = datetime.utcnow()
                
                for order in pending_orders:
                    # Calculate order age
                    order_age_seconds = (now - order.submitted_at).total_seconds()
                    
                    # Cancel if older than configured max age
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
                            order.status = "canceled"
                            order.error_message = f"Canceled: stale order (age: {order_age_seconds:.0f}s)"
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
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop."""
        while self.is_running:
            try:
                # Cancel stale orders
                await self._cancel_stale_orders()
                
                # Update monitored candidates from screener
                await self._update_candidates()
                
                # Monitor entry conditions for candidates
                await self._monitor_entries()
                
                # Monitor exit conditions for positions
                await self._monitor_exits()
                
                # Wait before next iteration (e.g., every 5 seconds)
                await asyncio.sleep(5)
            
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)
                await asyncio.sleep(5)
    
    async def _update_candidates(self) -> None:
        """Update list of monitored symbols from screener."""
        try:
            from app.services.screener.screener import get_screener_service
            from app.types import ScreenerCriteria
            from app.types import ScreenerCriteria
            
            # Get global screener service
            screener = get_screener_service()
            if not screener or not screener.cached_payload:
                logger.debug("Screener not ready or no data, using empty candidates")
                self.monitored_symbols = []
                return
            
            # Get screener results
            screener_results = screener.cached_payload
            logger.debug(f"📊 Screener has {len(screener_results)} total candidates")
            
            # Optional: Apply ScreeningCriteria filters
            if self.fund.screening_criteria_id:
                logger.debug(f"🔍 Applying screening criteria: {self.fund.screening_criteria_id}")
                screener_results = await self._apply_screening_filters(screener_results)
                logger.debug(f"🔍 After filtering: {len(screener_results)} candidates")
            
            # CRITICAL: Force position refresh BEFORE asking strategy to select
            # This ensures we have up-to-date position counts after order fills
            await self._refresh_positions_from_alpaca()
            
            # Ask strategy which symbols to monitor
            # Pass active position count AND pending order count so strategy can make informed decision
            active_positions = await self.get_active_positions()
            pending_orders = await self.get_pending_orders()
            logger.debug(
                f"🎯 Asking strategy to select symbols "
                f"(candidates={len(screener_results)}, active_positions={len(active_positions)}, "
                f"pending_orders={len(pending_orders)})"
            )
            self.monitored_symbols = await self.execution_strategy.get_monitored_symbols(
                screener_results,
                active_position_count=len(active_positions),
                active_order_count=len(pending_orders)
            )
            
            if self.monitored_symbols:
                logger.info(
                    f"📡 Monitoring symbols: {self.monitored_symbols} "
                    f"({len(self.monitored_symbols)} of {len(screener_results)} candidates)"
                )
            else:
                logger.debug(
                    f"📡 No symbols to monitor "
                    f"({len(screener_results)} candidates available, "
                    f"{len(active_positions)} active positions, "
                    f"{len(pending_orders)} pending orders)"
                )
        
        except Exception as e:
            logger.error(f"Error updating candidates: {e}", exc_info=True)
    
    def _is_trading_time(self) -> bool:
        """Check if current time is within trading hours."""
        if not self.fund.trading_start_time:
            return True  # No restrictions
        
        import pytz
        from datetime import time as dt_time
        
        try:
            tz = pytz.timezone(self.fund.timezone or "America/New_York")
            now = datetime.now(tz)
            current_time = now.time()
            
            # Parse times like "09:30"
            start = dt_time(*map(int, self.fund.trading_start_time.split(":")))
            end = dt_time(*map(int, self.fund.trading_end_time.split(":")))
            
            return start <= current_time <= end
        except Exception as e:
            logger.error(f"Error checking trading time: {e}")
            return True  # Default to allowing trades if check fails
    
    async def _check_risk_limits(self) -> tuple[bool, str]:
        """
        Check if we can trade based on Strategy risk parameters.
        
        Returns:
            (can_trade, reason) - If can_trade is False, reason contains the error message
        """
        # Get current positions
        active_positions = await self.get_active_positions()
        
        # Calculate daily P&L from positions
        daily_pnl = sum(p.unrealized_pnl for p in active_positions.values())
        
        # Check daily loss limit (dollars) - only if set
        if (
            self.fund.max_loss_dollars is not None
            and daily_pnl < 0
            and abs(daily_pnl) >= self.fund.max_loss_dollars
        ):
            return False, f"Daily loss limit hit: ${abs(daily_pnl):.2f} >= ${self.fund.max_loss_dollars:.2f}"
        
        # Check daily loss limit (percent) - only if set
        if (
            self.fund.max_loss_percent is not None
            and daily_pnl < 0
            and self.fund.balance > 0
        ):
            loss_percent = (abs(daily_pnl) / self.fund.balance) * 100
            if loss_percent >= self.fund.max_loss_percent:
                return False, f"Daily loss % limit hit: {loss_percent:.1f}% >= {self.fund.max_loss_percent:.1f}%"
        
        # Check total exposure - only if set
        if self.fund.max_total_exposure is not None:
            total_exposure = sum(
                p.quantity * p.current_price 
                for p in active_positions.values()
            )
            if total_exposure >= self.fund.max_total_exposure:
                return False, f"Total exposure limit reached: ${total_exposure:.2f} >= ${self.fund.max_total_exposure:.2f}"
        
        return True, ""
    
    async def _monitor_entries(self) -> None:
        """
        Monitor entry conditions for candidate symbols.
        
        Unified approach for all strategies - no special cases!
        Strategy decides which symbols to monitor via get_monitored_symbols().
        """
        # Check trading hours BEFORE monitoring
        if not self._is_trading_time():
            logger.info("🕐 Outside trading hours, skipping entry monitoring")
            return
        
        # Check risk limits BEFORE monitoring
        can_trade, reason = await self._check_risk_limits()
        if not can_trade:
            logger.warning(f"⚠️  Cannot enter new positions: {reason}")
            
            # Broadcast warning event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "warning",
                "timestamp": _get_utc_timestamp(),
                "reason": "Risk limit check",
                "message": f"Cannot enter new positions: {reason}",
            })
            return
        
        if not self.monitored_symbols:
            logger.debug("📭 No symbols to monitor for entries")
            return
        
        logger.debug(f"👀 Checking entry conditions for {len(self.monitored_symbols)} symbols")
        
        # Get current positions to avoid duplicate entries
        active_positions = await self.get_active_positions()
        
        for symbol in self.monitored_symbols:
            # Skip if already have a position
            if symbol in active_positions:
                logger.debug(f"⏭️  Skipping {symbol} - already have position")
                continue
            
            try:
                logger.debug(f"📈 Getting market data for {symbol}")
                # Get current market data
                market_data = await self.market_data_provider.build_market_data(symbol)
                logger.debug(f"📈 {symbol} price: ${market_data.price:.2f}")
                
                # Check entry conditions
                logger.debug(f"🤔 Checking if strategy wants to enter {symbol}")
                entry_signal = await self.execution_strategy.should_enter(symbol, market_data)
                
                if entry_signal.should_enter:
                    logger.info(f"✅ Entry signal received for {symbol}")
                    await self._enter_position(symbol, entry_signal, market_data)
                else:
                    logger.debug(f"❌ No entry signal for {symbol}")
            
            except Exception as e:
                logger.error(f"Error monitoring entry for {symbol}: {e}", exc_info=True)
    
    async def _monitor_exits(self) -> None:
        """Monitor exit conditions for active positions."""
        # Refresh positions to get latest state before checking exits
        await self._refresh_positions_from_alpaca()
        
        # Get current positions from cache
        active_positions = await self.get_active_positions()
        
        for symbol, position in list(active_positions.items()):
            try:
                # Get current market data
                market_data = await self.market_data_provider.build_market_data(symbol)
                
                # Update position with current price
                position.current_price = market_data.price
                position.unrealized_pnl = (market_data.price - position.entry_price) * position.quantity
                position.unrealized_pnl_percent = ((market_data.price - position.entry_price) / position.entry_price) * 100
                
                # Update high water mark
                if market_data.price > position.high_water_mark:
                    position.high_water_mark = market_data.price
                
                # Check scaling conditions
                await self._check_scaling(position, market_data)
                
                # Check exit conditions
                exit_signal = await self.execution_strategy.should_exit(position, market_data)
                
                if exit_signal.should_exit:
                    await self._exit_position(position, exit_signal, market_data)
            
            except Exception as e:
                logger.error(f"Error monitoring exit for {symbol}: {e}")
    
    async def _check_scaling(self, position: PositionContext, market_data: MarketData) -> None:
        """Check for scaling opportunities."""
        try:
            # Check scale out
            scale_out_signal = await self.execution_strategy.should_scale_out(position, market_data)
            if scale_out_signal:
                await self._scale_out_position(position, scale_out_signal, market_data)
            
            # Check scale in
            scale_in_signal = await self.execution_strategy.should_scale_in(position, market_data)
            if scale_in_signal:
                await self._scale_in_position(position, scale_in_signal, market_data)
        
        except Exception as e:
            logger.error(f"Error checking scaling for {position.symbol}: {e}")
    
    async def _enter_position(
        self, 
        symbol: str, 
        signal: EntrySignal,
        market_data: MarketData
    ) -> None:
        """Enter a new position."""
        try:
            # Safety check: Verify we're still in the correct trading mode
            self._verify_trading_mode()
            
            # Skip if price is invalid/zero
            if market_data.price <= 0:
                logger.warning(f"Skipping entry for {symbol}: invalid price {market_data.price}")
                return
            
            logger.info(
                f"[{self.fund.mode.upper()}] Entering position: {symbol} @ {signal.entry_price} "
                f"(reason: {signal.reason})"
            )
            
            # Get fund balance
            fund_balance = self.fund.balance
            logger.info(
                f"💰 Fund balance from memory: ${fund_balance:.2f} "
                f"(fund_id={self.fund_id}, mode={self.fund.mode})"
            )
            
            # Calculate position size
            risk_params = {
                "size_per_trade": self.fund.size_per_trade,
                "max_bet_percent": self.fund.max_bet_percent,
                "min_bet_percent": self.fund.min_bet_percent,
            }
            logger.info(
                f"📊 Risk params: size_per_trade=${risk_params['size_per_trade']:.2f}, "
                f"max_bet_percent={risk_params['max_bet_percent']}, "
                f"min_bet_percent={risk_params['min_bet_percent']}"
            )
            
            position_size = await self.execution_strategy.position_sizing(
                signal,
                fund_balance,
                risk_params
            )
            logger.info(f"💵 Calculated position size: ${position_size:.2f}")
            
            # Calculate whole shares to buy
            quantity = int(position_size / market_data.price)
            logger.info(
                f"🧮 Position calculation: ${position_size:.2f} / ${market_data.price:.2f} = "
                f"{quantity} shares (truncated from {position_size / market_data.price:.4f})"
            )
            
            # Skip if we can't afford even 1 share
            if quantity < 1:
                logger.warning(
                    f"❌ Skipping entry for {symbol}: position size ${position_size:.2f} "
                    f"can't buy 1 share at ${market_data.price:.2f}"
                )
                
                # Broadcast skip event with full diagnostic details
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
                        "max_bet_percent": self.fund.max_bet_percent,
                        "calculated_position_size": position_size,
                        "share_price": market_data.price,
                        "quantity_calculated": position_size / market_data.price,
                        "quantity_truncated": quantity,
                    }
                })
                return
            
            actual_cost = quantity * market_data.price
            
            # Determine order type from signal (before validation)
            order_type = signal.order_type if signal.order_type else "market"
            limit_price = signal.limit_price if order_type == "limit" else None
            
            # CRITICAL: Validate AND create order in a SINGLE transaction
            # This keeps the row lock from validation through order creation,
            # preventing race conditions where multiple orders validate simultaneously
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
                        
                        # Broadcast error using event broadcasting service
                        await broadcast_error(
                            fund_id=str(self.fund_id),
                            fund_name=self.fund.name,
                            symbol=symbol,
                            error_type="insufficient_balance",
                            message=error_msg or "Insufficient balance"
                        )
                        return
                    
                    # Validation passed - create order in SAME transaction (lock still held)
                    logger.info(
                        f"✅ Executing buy: {quantity} shares of {symbol} @ ${market_data.price:.2f} "
                        f"(cost: ${actual_cost:.2f}, target: ${position_size:.2f}, balance: ${fund_balance:.2f}, type: {order_type})"
                    )
                    
                    logger.info(f"📝 Creating order record: {symbol} buy {quantity} shares (type: {order_type})")
                    if limit_price:
                        logger.info(f"   Limit price: ${limit_price:.2f}")
                    
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",  # Will be filled after Alpaca returns
                        fund_id=self.fund_id,
                        symbol=symbol,
                        side="buy",
                        quantity=quantity,
                        order_type=order_type,
                        estimated_price=market_data.price,  # Store price for cash validation
                        status="pending",
                        submitted_at=submitted_at,
                    )
                    session.add(order_record)
                    await session.commit()  # Commit both validation lock and order creation
                
                logger.info(f"📝 Order record created in DB: {order_id}")
                
                # Broadcast pre-trade diagnostic info
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
                
                alpaca_order_id = None
                order_creation_failed = False
                
                # Place order via Alpaca (quantity-based, whole shares)
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
                    # Alpaca call failed - mark order as failed in DB
                    logger.error(f"❌ Alpaca order placement failed: {alpaca_error}")
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.status = "failed"
                        order_record.error_message = f"Alpaca API error: {str(alpaca_error)}"
                        await session.commit()
                    raise
                
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
                    # Cancel the Alpaca order to prevent orphaned position
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
                    raise
                
            except Exception as e:
                order_creation_failed = True
                logger.error(f"❌ Order creation failed for {symbol}: {e}")
                raise
            
            logger.info(
                f"📤 Order submitted to Alpaca: {symbol} buy {quantity} @ ${market_data.price:.2f} "
                f"(order_id={order_id}, alpaca_id={alpaca_order['id']})"
            )
            logger.info(
                f"⏳ Order awaiting fill confirmation from polling service "
                f"(will create transaction when filled)"
            )
            
            # Schedule automatic reconciliation (Fibonacci backoff)
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
                "reason": signal.reason,
                "order_type": order_type,
                "message": f"Buy order submitted: {quantity} shares of {symbol} @ ${market_data.price:.2f} ({order_type})",
            }
            if limit_price:
                order_details["limit_price"] = limit_price
            await _broadcast_trading_event(order_details)
        
        except Exception as e:
            logger.error(f"Error entering position for {symbol}: {e}", exc_info=True)
            
            # Broadcast error event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Entry execution failed",
                "message": f"Failed to enter position in {symbol}: {str(e)}",
            })
    
    async def _exit_position(
        self, 
        position: PositionContext,
        signal: ExitSignal,
        market_data: MarketData
    ) -> None:
        """Exit a position."""
        try:
            # Safety check: Verify we're still in the correct trading mode
            self._verify_trading_mode()
            
            logger.info(
                f"[{self.fund.mode.upper()}] Exiting position: {position.symbol} @ {market_data.price} "
                f"(reason: {signal.reason})"
            )
            
            # Verify position exists in our transaction ledger (prevent over-selling)
            # Use ledger quantity as source of truth instead of Alpaca's reported quantity
            async with get_async_session() as session:
                from app.services.trading.position_tracker import get_position_quantity_from_transactions
                
                db_position_qty = await get_position_quantity_from_transactions(
                    session, self.fund_id, position.symbol
                )
                
                if db_position_qty < 0.01:  # epsilon for float comparison
                    logger.warning(
                        f"⚠️ No position in ledger for {position.symbol}. "
                        f"Skipping sell order to prevent over-selling."
                    )
                    return
                
                # If there's a discrepancy, use the ledger quantity as source of truth
                if abs(db_position_qty - position.quantity) > 0.01:
                    logger.warning(
                        f"⚠️ Position quantity mismatch for {position.symbol}: "
                        f"Alpaca reports {position.quantity:.6f}, ledger shows {db_position_qty:.2f}. "
                        f"Using ledger quantity {db_position_qty:.2f} as source of truth."
                    )
                    
                    # Log this discrepancy to event system for audit trail
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
                            "exit_reason": signal.reason,
                            "current_price": float(market_data.price),
                        }
                    )
                    
                    # Update position quantity to match ledger
                    actual_quantity = db_position_qty
                else:
                    actual_quantity = position.quantity
            
            # Cancel any pending buy orders for this symbol to avoid wash trade detection
            await self._cancel_pending_orders(position.symbol)
            
            # Create order record BEFORE submitting to Alpaca
            order_id = str(uuid.uuid4())
            submitted_at = datetime.utcnow()
            
            logger.info(f"📝 Creating sell order record: {position.symbol} sell {actual_quantity} shares")
            
            alpaca_order_id = None
            order_creation_failed = False
            
            try:
                # Create Order record in database
                async with get_async_session() as session:
                    order_record = Order(
                        id=order_id,
                        alpaca_order_id="",  # Will be filled after Alpaca returns
                        fund_id=self.fund_id,
                        symbol=position.symbol,
                        side="sell",
                        quantity=actual_quantity,
                        order_type="market",
                        estimated_price=market_data.price,  # Store price for reference
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
                    # Alpaca call failed - mark order as failed in DB
                    logger.error(f"❌ Alpaca sell order placement failed: {alpaca_error}")
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.status = "failed"
                        order_record.error_message = f"Alpaca API error: {str(alpaca_error)}"
                        await session.commit()
                    raise
                
                # Update order record with Alpaca order ID
                try:
                    async with get_async_session() as session:
                        stmt = select(Order).where(Order.id == order_id)
                        result = await session.execute(stmt)
                        order_record = result.scalar_one()
                        order_record.alpaca_order_id = alpaca_order_id
                        await session.commit()
                    logger.info(f"✅ Sell order record updated with Alpaca ID: {alpaca_order_id}")
                    
                    # Schedule automatic reconciliation (Fibonacci backoff)
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
                    # Cancel the Alpaca order to prevent orphaned position
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
                    raise
                
            except Exception as e:
                order_creation_failed = True
                logger.error(f"❌ Sell order creation failed for {position.symbol}: {e}")
                raise
            
            # Calculate P&L
            realized_pnl = position.unrealized_pnl
            
            logger.info(
                f"📤 Sell order submitted to Alpaca: {position.symbol} sell {position.quantity} @ ${market_data.price:.2f} "
                f"(order_id={order_id}, alpaca_id={alpaca_order['id']}, P&L: ${realized_pnl:.2f})"
            )
            logger.info(
                f"⏳ Order awaiting fill confirmation from polling service "
                f"(will create transaction when filled, position will be removed from Alpaca)"
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
                "reason": signal.reason,
                "order_type": "market",  # Currently exits always use market orders
                "message": f"Sell order submitted: {position.quantity} shares of {position.symbol} @ ${market_data.price:.2f} (market)",
            })
        
        except Exception as e:
            logger.error(f"Error exiting position for {position.symbol}: {e}", exc_info=True)
            
            # Broadcast error event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": position.symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Exit execution failed",
                "message": f"Failed to exit position in {position.symbol}: {str(e)}",
            })
    
    async def _scale_out_position(
        self,
        position: PositionContext,
        signal: ScaleSignal,
        market_data: MarketData
    ) -> None:
        """Scale out of a position (take partial profits)."""
        try:
            # Safety check: Verify we're still in the correct trading mode
            self._verify_trading_mode()
            
            scale_quantity = position.quantity * (signal.percent / 100.0)
            
            logger.info(
                f"[{self.fund.mode.upper()}] Scaling out: {position.symbol}, "
                f"{signal.percent}% ({scale_quantity:.2f} shares)"
            )
            
            # Place partial sell order
            order = await self.alpaca_service.place_market_order(
                symbol=position.symbol,
                qty=scale_quantity,
                side="sell",
                time_in_force="day"  # Required for fractional shares
            )
            
            logger.info(f"✅ Scale out order placed: {order['id']}")
            
            # Schedule automatic reconciliation (Fibonacci backoff)
            reconciliation_service = get_reconciliation_service()
            if reconciliation_service:
                asyncio.create_task(
                    reconciliation_service.schedule_order_reconciliation(
                        order_id=str(order['id']),
                        fund_id=str(self.fund_id),
                        symbol=position.symbol
                    )
                )
                logger.debug(f"🔄 Scheduled reconciliation checks for {position.symbol} scale-out order")
            
            # Update position in memory
            position.quantity -= scale_quantity
            position.has_scaled_out = True
            position.has_taken_profits = True
            position.strategy_state["has_scaled_out"] = True
            position.strategy_state["has_taken_profits"] = True
            
            # Note: Position state is tracked through transactions, not persisted separately
            
            # Broadcast trading event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "scale_out",
                "symbol": position.symbol,
                "quantity": scale_quantity,
                "price": market_data.price,
                "percent": signal.percent,
                "timestamp": _get_utc_timestamp(),
                "reason": signal.reason,
            })
        
        except Exception as e:
            logger.error(f"Error scaling out of {position.symbol}: {e}")
            
            # Broadcast error event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": position.symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Scale out failed",
                "message": f"Failed to scale out of {position.symbol}: {str(e)}",
            })
    
    async def _scale_in_position(
        self,
        position: PositionContext,
        signal: ScaleSignal,
        market_data: MarketData
    ) -> None:
        """Scale into a position (add to it)."""
        try:
            # Safety check: Verify we're still in the correct trading mode
            self._verify_trading_mode()
            
            additional_size = position.quantity * signal.multiplier
            
            logger.info(
                f"[{self.fund.mode.upper()}] Scaling in: {position.symbol}, "
                f"{signal.multiplier}x ({additional_size:.2f} shares)"
            )
            
            # Place additional buy order
            order = await self.alpaca_service.place_market_order(
                symbol=position.symbol,
                qty=additional_size,
                side="buy",
                time_in_force="day"  # Required for fractional shares
            )
            
            logger.info(f"✅ Scale in order placed: {order['id']}")
            
            # Schedule automatic reconciliation (Fibonacci backoff)
            reconciliation_service = get_reconciliation_service()
            if reconciliation_service:
                asyncio.create_task(
                    reconciliation_service.schedule_order_reconciliation(
                        order_id=str(order['id']),
                        fund_id=str(self.fund_id),
                        symbol=position.symbol
                    )
                )
                logger.debug(f"🔄 Scheduled reconciliation checks for {position.symbol} scale-in order")
            
            # Update position in memory
            old_quantity = position.quantity
            position.quantity += additional_size
            position.scale_in_count += 1
            position.strategy_state["scale_in_count"] = position.scale_in_count
            
            # Adjust average entry price
            total_cost = (position.entry_price * old_quantity) + (market_data.price * additional_size)
            position.entry_price = total_cost / position.quantity
            
            # Adjust stop to breakeven if requested
            if signal.adjust_stop_to_breakeven:
                position.strategy_state["breakeven_stop"] = position.entry_price
            
            # Note: Position state is tracked through transactions, not persisted separately
            
            # Broadcast trading event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "scale_in",
                "symbol": position.symbol,
                "quantity": additional_size,
                "price": market_data.price,
                "multiplier": signal.multiplier,
                "timestamp": _get_utc_timestamp(),
                "reason": signal.reason,
            })
        
        except Exception as e:
            logger.error(f"Error scaling into {position.symbol}: {e}")
            
            # Broadcast error event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "error",
                "symbol": position.symbol,
                "timestamp": _get_utc_timestamp(),
                "reason": "Scale in failed",
                "message": f"Failed to scale into {position.symbol}: {str(e)}",
            })
    
    
    async def _cancel_pending_orders(self, symbol: str) -> None:
        """
        Cancel any pending orders for a symbol.
        
        This is called before placing exit orders to avoid wash trade detection
        when there are pending buy orders.
        
        Args:
            symbol: Symbol to cancel orders for
        """
        try:
            logger.debug(f"🔍 Checking for pending orders for {symbol}")
            
            # Get all open orders for this symbol
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
    
    def _verify_trading_mode(self) -> None:
        """
        Verify that fund mode still matches Alpaca service mode.
        
        This is a safety check called before every trade execution to ensure
        we never accidentally execute real trades with a sim fund or vice versa.
        
        Raises:
            RuntimeError: If modes don't match
        """
        fund_is_paper = (self.fund.mode == "sim")
        if fund_is_paper != self.alpaca_service.paper_trading:
            error_msg = (
                f"CRITICAL: Trading mode mismatch detected! "
                f"Fund mode is '{self.fund.mode}' but Alpaca service is in "
                f"{'paper' if self.alpaca_service.paper_trading else 'real'} trading mode. "
                f"Trade execution blocked for safety."
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)
    
    async def _apply_screening_filters(
        self,
        candidates: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Apply ScreeningCriteria filters if configured."""
        if not self.fund.screening_criteria_id:
            logger.debug(f"[FUND {self.fund.id}] No screening criteria configured, using {len(candidates)} candidates as-is")
            return candidates
        
        logger.info(f"[FUND {self.fund.id}] 🔍 Applying screening filters to {len(candidates)} candidates...")
        
        try:
            # Load criteria from database
            from app.services.core.database import get_async_session
            from app.models.strategies import ScreeningCriteria
            from app.services.screener.screener import get_screener_service
            
            async with get_async_session() as session:
                criteria = await session.get(ScreeningCriteria, self.fund.screening_criteria_id)
                
                if not criteria:
                    logger.warning(f"ScreeningCriteria {self.fund.screening_criteria_id} not found")
                    return candidates
                
                # Log which screener is being used
                screener_name = criteria.name or "Unnamed"
                logger.info(
                    f"[FUND {self.fund.id}] Using screener: '{screener_name}' (ID: {criteria.id})"
                )
                
                params = criteria.criteria or {}
                
                # Log key filter parameters for visibility
                key_filters = []
                if params.get("min_price") or params.get("max_price"):
                    price_range = f"${params.get('min_price', 0):.2f}-${params.get('max_price', '∞')}"
                    key_filters.append(f"price={price_range}")
                if params.get("min_volume"):
                    key_filters.append(f"vol>={params['min_volume']:,}")
                if params.get("min_relative_volume"):
                    key_filters.append(f"RV>={params['min_relative_volume']:.1f}x")
                if params.get("limit"):
                    key_filters.append(f"limit={params['limit']}")
                
                if key_filters:
                    logger.info(
                        f"[FUND {self.fund.id}] Screener filters: {', '.join(key_filters)}"
                    )

                # Use screener service to compute live results with the same logic as the UI/API
                screener = get_screener_service()
                if not screener:
                    logger.warning(f"[FUND {self.fund.id}] Screener service not available; returning unfiltered candidates")
                    return candidates

                try:
                    criteria_model = ScreenerCriteria(**params)
                except Exception:
                    # If validation fails, fallback to dict-based path
                    criteria_model = None

                if criteria_model is not None:
                    results = await screener.compute_live_from_criteria(criteria_model)
                else:
                    results = await screener.compute_live_with_criteria(params)

                logger.info(
                    f"[FUND {self.fund.id}] Screener '{screener_name}' returned {len(results)} matching stocks (from {len(candidates)} candidates)"
                )
                return results
        
        except Exception as e:
            logger.error(f"[FUND {self.fund.id}] Error applying screening filters: {e}", exc_info=True)
            return candidates  # Return unfiltered on error

