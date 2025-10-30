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
from app.services.market_data_provider import MarketDataProvider
from app.services.alpaca_service import AlpacaService
from app.models.strategies import Fund, Strategy, PositionContext as PositionContextModel
from app.services.database import get_async_session

logger = logging.getLogger(__name__)


def _get_utc_timestamp() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


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
        strategy_config: Strategy,
        execution_strategy: ExecutionStrategy,
        market_data_provider: MarketDataProvider,
        alpaca_service: AlpacaService,
    ):
        """
        Initialize strategy engine.
        
        Args:
            fund: Fund object with balance and mode
            strategy_config: Strategy configuration from database
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
            f"mode={fund.mode}, status={fund.status}"
        )
        logger.info(
            f"🔧 Strategy config received: "
            f"id={strategy_config.id}, execution_strategy={strategy_config.execution_strategy_id}, "
            f"size_per_trade=${strategy_config.size_per_trade:.2f}, "
            f"max_bet_percent={strategy_config.max_bet_percent}"
        )
        
        self.fund = fund
        self.fund_id = fund.id
        self.strategy_config = strategy_config
        self.execution_strategy = execution_strategy
        self.market_data_provider = market_data_provider
        self.alpaca_service = alpaca_service
        
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
        
        # Active positions
        self.active_positions: Dict[str, PositionContext] = {}
        
        # Monitored candidates
        self.monitored_symbols: List[str] = []
        
        # Running state
        self.is_running = False
        self._monitoring_task: Optional[asyncio.Task] = None
    
    async def start(self) -> None:
        """Start the strategy execution loop."""
        if self.is_running:
            logger.warning("Strategy engine already running")
            return
        
        self.is_running = True
        logger.info(
            f"🚀 Starting strategy engine for fund {self.fund_id} "
            f"(name={self.fund.name}, balance=${self.fund.balance:.2f}, mode={self.fund.mode})"
        )
        logger.info(
            f"📋 Strategy config: execution_strategy={self.strategy_config.execution_strategy_id}, "
            f"size_per_trade=${self.strategy_config.size_per_trade:.2f}, "
            f"max_bet_percent={self.strategy_config.max_bet_percent}"
        )
        
        # Load existing positions from database
        await self._load_positions()
        
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
    
    async def _load_positions(self) -> None:
        """Load existing open positions from database."""
        try:
            async with get_async_session() as session:
                # Query for open positions for this fund
                from sqlalchemy import select
                stmt = select(PositionContextModel).where(
                    PositionContextModel.fund_id == self.fund_id,
                    PositionContextModel.status == "open"
                )
                result = await session.execute(stmt)
                positions = result.scalars().all()
                
                for pos in positions:
                    # Convert to PositionContext
                    position = PositionContext(
                        position_id=pos.id,
                        symbol=pos.symbol,
                        entry_price=pos.entry_price,
                        entry_time=pos.entry_time,
                        quantity=pos.quantity,
                        current_price=pos.entry_price,  # Will be updated
                        unrealized_pnl=0.0,
                        unrealized_pnl_percent=0.0,
                        high_water_mark=pos.high_water_mark,
                        strategy_state=pos.strategy_state or {},
                        has_scaled_out=pos.strategy_state.get("has_scaled_out", False),
                        has_taken_profits=pos.strategy_state.get("has_taken_profits", False),
                        scale_in_count=pos.strategy_state.get("scale_in_count", 0),
                    )
                    
                    self.active_positions[pos.symbol] = position
                    logger.info(f"Loaded position: {pos.symbol} @ {pos.entry_price}")
        
        except Exception as e:
            logger.error(f"Error loading positions: {e}")
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop."""
        while self.is_running:
            try:
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
            from app.services.screener import get_screener_service
            
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
            if self.strategy_config.screening_criteria_id:
                logger.debug(f"🔍 Applying screening criteria: {self.strategy_config.screening_criteria_id}")
                screener_results = await self._apply_screening_filters(screener_results)
                logger.debug(f"🔍 After filtering: {len(screener_results)} candidates")
            
            # Ask strategy which symbols to monitor
            # Pass active position count so strategy can make informed decision
            logger.debug(
                f"🎯 Asking strategy to select symbols "
                f"(candidates={len(screener_results)}, active_positions={len(self.active_positions)})"
            )
            self.monitored_symbols = await self.execution_strategy.get_monitored_symbols(
                screener_results,
                active_position_count=len(self.active_positions)
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
                    f"{len(self.active_positions)} active positions)"
                )
        
        except Exception as e:
            logger.error(f"Error updating candidates: {e}", exc_info=True)
    
    def _is_trading_time(self) -> bool:
        """Check if current time is within trading hours."""
        if not self.strategy_config.trading_start_time:
            return True  # No restrictions
        
        import pytz
        from datetime import time as dt_time
        
        try:
            tz = pytz.timezone(self.strategy_config.timezone or "America/New_York")
            now = datetime.now(tz)
            current_time = now.time()
            
            # Parse times like "09:30"
            start = dt_time(*map(int, self.strategy_config.trading_start_time.split(":")))
            end = dt_time(*map(int, self.strategy_config.trading_end_time.split(":")))
            
            return start <= current_time <= end
        except Exception as e:
            logger.error(f"Error checking trading time: {e}")
            return True  # Default to allowing trades if check fails
    
    def _check_risk_limits(self) -> tuple[bool, str]:
        """
        Check if we can trade based on Strategy risk parameters.
        
        Returns:
            (can_trade, reason) - If can_trade is False, reason contains the error message
        """
        # Calculate daily P&L from positions (memory only)
        daily_pnl = sum(p.unrealized_pnl for p in self.active_positions.values())
        
        # Check daily loss limit (dollars) - only if set
        if (
            self.strategy_config.max_loss_dollars is not None
            and daily_pnl < 0
            and abs(daily_pnl) >= self.strategy_config.max_loss_dollars
        ):
            return False, f"Daily loss limit hit: ${abs(daily_pnl):.2f} >= ${self.strategy_config.max_loss_dollars:.2f}"
        
        # Check daily loss limit (percent) - only if set
        if (
            self.strategy_config.max_loss_percent is not None
            and daily_pnl < 0
            and self.fund.balance > 0
        ):
            loss_percent = (abs(daily_pnl) / self.fund.balance) * 100
            if loss_percent >= self.strategy_config.max_loss_percent:
                return False, f"Daily loss % limit hit: {loss_percent:.1f}% >= {self.strategy_config.max_loss_percent:.1f}%"
        
        # Check total exposure - only if set
        if self.strategy_config.max_total_exposure is not None:
            total_exposure = sum(
                p.quantity * p.current_price 
                for p in self.active_positions.values()
            )
            if total_exposure >= self.strategy_config.max_total_exposure:
                return False, f"Total exposure limit reached: ${total_exposure:.2f} >= ${self.strategy_config.max_total_exposure:.2f}"
        
        return True, ""
    
    async def _monitor_entries(self) -> None:
        """
        Monitor entry conditions for candidate symbols.
        
        Unified approach for all strategies - no special cases!
        Strategy decides which symbols to monitor via get_monitored_symbols().
        """
        # Check trading hours BEFORE monitoring
        if not self._is_trading_time():
            logger.debug("🕐 Outside trading hours, skipping entry monitoring")
            return
        
        # Check risk limits BEFORE monitoring
        can_trade, reason = self._check_risk_limits()
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
        
        for symbol in self.monitored_symbols:
            # Skip if already have a position
            if symbol in self.active_positions:
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
        for symbol, position in list(self.active_positions.items()):
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
                "size_per_trade": self.strategy_config.size_per_trade,
                "max_bet_percent": self.strategy_config.max_bet_percent,
            }
            logger.info(
                f"📊 Risk params: size_per_trade=${risk_params['size_per_trade']:.2f}, "
                f"max_bet_percent={risk_params['max_bet_percent']}"
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
                        "size_per_trade": self.strategy_config.size_per_trade,
                        "max_bet_percent": self.strategy_config.max_bet_percent,
                        "calculated_position_size": position_size,
                        "share_price": market_data.price,
                        "quantity_calculated": position_size / market_data.price,
                        "quantity_truncated": quantity,
                    }
                })
                return
            
            actual_cost = quantity * market_data.price
            logger.info(
                f"✅ Executing buy: {quantity} shares of {symbol} @ ${market_data.price:.2f} "
                f"(cost: ${actual_cost:.2f}, target: ${position_size:.2f})"
            )
            
            # Broadcast pre-trade diagnostic info
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "diagnostic",
                "timestamp": _get_utc_timestamp(),
                "symbol": symbol,
                "message": f"Preparing to buy {quantity} shares of {symbol}",
                "details": {
                    "fund_balance": fund_balance,
                    "size_per_trade": self.strategy_config.size_per_trade,
                    "max_bet_percent": self.strategy_config.max_bet_percent,
                    "calculated_position_size": position_size,
                    "share_price": market_data.price,
                    "quantity": quantity,
                    "actual_cost": actual_cost,
                }
            })
            
            # Place order via Alpaca (quantity-based, whole shares)
            order = await self.alpaca_service.place_market_order(
                symbol=symbol,
                qty=quantity,
                side="buy",
                time_in_force="day"
            )
            
            # Create position context
            position_id = str(uuid.uuid4())
            
            position = PositionContext(
                position_id=position_id,
                symbol=symbol,
                entry_price=market_data.price,
                entry_time=datetime.now(),
                quantity=quantity,
                current_price=market_data.price,
                unrealized_pnl=0.0,
                unrealized_pnl_percent=0.0,
                high_water_mark=market_data.price,
                strategy_state=signal.metadata or {},
            )
            
            # Save to database
            await self._save_position(position)
            
            # Add to active positions
            self.active_positions[symbol] = position
            
            logger.info(f"Position entered: {symbol}, quantity: {quantity:.2f}, size: ${position_size:.2f}")
            
            # Broadcast trading event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "entry",
                "symbol": symbol,
                "quantity": quantity,
                "price": market_data.price,
                "position_size": position_size,
                "timestamp": _get_utc_timestamp(),
                "reason": signal.reason,
            })
        
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
            
            # Cancel any pending buy orders for this symbol to avoid wash trade detection
            await self._cancel_pending_orders(position.symbol)
            
            # Place sell order via Alpaca
            order = await self.alpaca_service.place_market_order(
                symbol=position.symbol,
                qty=position.quantity,
                side="sell",
                time_in_force="day"  # Required for fractional shares
            )
            
            # Calculate P&L
            realized_pnl = position.unrealized_pnl
            
            # Update database
            await self._close_position(position, market_data.price, signal.reason, realized_pnl)
            
            # Remove from active positions
            del self.active_positions[position.symbol]
            
            logger.info(f"Position exited: {position.symbol}, P&L: ${realized_pnl:.2f}")
            
            # Broadcast trading event
            await _broadcast_trading_event({
                "fund_id": str(self.fund_id),
                "fund_name": self.fund.name,
                "event_type": "exit",
                "symbol": position.symbol,
                "quantity": position.quantity,
                "price": market_data.price,
                "pnl": realized_pnl,
                "pnl_percent": position.unrealized_pnl_percent,
                "timestamp": _get_utc_timestamp(),
                "reason": signal.reason,
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
            
            # Update position
            position.quantity -= scale_quantity
            position.has_scaled_out = True
            position.has_taken_profits = True
            position.strategy_state["has_scaled_out"] = True
            position.strategy_state["has_taken_profits"] = True
            
            # Update database
            await self._update_position(position)
            
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
            
            # Update position
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
            
            # Update database
            await self._update_position(position)
            
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
    
    async def _save_position(self, position: PositionContext) -> None:
        """Save new position to database."""
        # TODO: Implement database save
        pass
    
    async def _update_position(self, position: PositionContext) -> None:
        """Update existing position in database."""
        # TODO: Implement database update
        pass
    
    async def _close_position(
        self,
        position: PositionContext,
        exit_price: float,
        exit_reason: str,
        realized_pnl: float
    ) -> None:
        """Close position in database."""
        # TODO: Implement database close
        pass
    
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
        if not self.strategy_config.screening_criteria_id:
            return candidates
        
        try:
            # Load criteria from database
            from app.services.database import get_async_session
            from app.models.strategies import ScreeningCriteria
            
            async with get_async_session() as session:
                criteria = await session.get(ScreeningCriteria, self.strategy_config.screening_criteria_id)
                
                if not criteria:
                    logger.warning(f"ScreeningCriteria {self.strategy_config.screening_criteria_id} not found")
                    return candidates
                
                filtered = []
                for candidate in candidates:
                    # Apply filters from criteria.criteria dict
                    if "min_volume" in criteria.criteria:
                        if candidate.get("today_vol", 0) < criteria.criteria["min_volume"]:
                            continue
                    
                    if "min_price" in criteria.criteria:
                        if candidate.get("price", 0) < criteria.criteria["min_price"]:
                            continue
                    
                    if "max_price" in criteria.criteria:
                        if candidate.get("price", 999999) > criteria.criteria["max_price"]:
                            continue
                    
                    if "min_relative_volume" in criteria.criteria:
                        if candidate.get("rv14", 0) < criteria.criteria["min_relative_volume"]:
                            continue
                    
                    filtered.append(candidate)
                
                logger.info(f"Screening filters applied: {len(filtered)} of {len(candidates)} candidates passed")
                return filtered
        
        except Exception as e:
            logger.error(f"Error applying screening filters: {e}")
            return candidates  # Return unfiltered on error

