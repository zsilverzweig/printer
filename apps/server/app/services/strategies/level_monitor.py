"""
Level Monitor Service

Monitors entry and exit levels, triggers orders when levels hit.
Handles position management updates from strategies.
"""

import logging
from typing import Dict, Any

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.services.market.market_data_provider import MarketDataProvider
from app.services.strategies.strategy_service import StrategyService
from app.lib.strategy_logger import StrategyLogger

logger = logging.getLogger(__name__)


class LevelMonitor:
    """
    Monitors entry and exit levels, triggers orders when hit.
    """
    
    def __init__(
        self,
        fund_id: str,
        strategy: ExecutionStrategy,
        strategy_service: StrategyService,
        market_data_provider: MarketDataProvider,
        strategy_logger: StrategyLogger,
        risk_manager,  # RiskManager instance
    ):
        """
        Initialize level monitor.
        
        Args:
            fund_id: Fund ID
            strategy: Execution strategy
            strategy_service: Strategy persistence service
            market_data_provider: Market data provider
            strategy_logger: Logging service
            risk_manager: Risk management service
        """
        self.fund_id = fund_id
        self.strategy = strategy
        self.strategy_service = strategy_service
        self.market_data_provider = market_data_provider
        self.strategy_logger = strategy_logger
        self.risk_manager = risk_manager
        
        # Track last price for crossover detection
        self._last_prices: Dict[str, float] = {}
    
    async def check_entry_triggers(self, order_executor) -> None:
        """
        Check if any entry levels have been triggered.
        
        Queries DB for active entry levels and checks if current price crossed entry.
        
        Args:
            order_executor: OrderExecutor instance for placing orders
        """
        try:
            # Get all active entry levels from DB
            entry_levels = await self.strategy_service.get_active_entry_levels(self.fund_id)
            
            if not entry_levels:
                return
            
            logger.debug(f"Checking {len(entry_levels)} active entry level(s)")
            
            for state in entry_levels:
                symbol = state.symbol
                
                try:
                    # Get current price
                    market_data = await self.market_data_provider.build_market_data(symbol)
                    current_price = market_data.price
                    
                    # Update last price
                    last_price = self._last_prices.get(symbol)
                    self._last_prices[symbol] = current_price
                    
                    # Check if triggered
                    triggered = await self.strategy_service.check_entry_triggered(
                        state,
                        current_price,
                        last_price
                    )
                    
                    if triggered:
                        self.strategy_logger.entry_triggered(symbol, current_price, state.entry_price)
                        
                        # Mark as triggered in DB
                        await self.strategy_service.mark_triggered(state.id, current_price)
                        
                        # Create EntryLevel from state
                        entry_level = EntryLevel(
                            entry_price=state.entry_price,
                            stop_loss=state.stop_loss,
                            confidence=state.confidence,
                            order_type=state.order_type,
                            metadata=state.strategy_metadata
                        )
                        
                        # Execute buy order via OrderExecutor
                        await order_executor.execute_buy_order(symbol, entry_level, market_data)
                
                except Exception as e:
                    logger.error(f"Error checking entry trigger for {symbol}: {e}", exc_info=True)
        
        except Exception as e:
            logger.error(f"Error checking entry triggers: {e}", exc_info=True)
    
    async def check_stop_triggers(self, positions: Dict[str, PositionContext], order_executor) -> None:
        """
        Check if any stops have been hit.
        
        Queries DB for active exit levels and checks if price hit stop.
        
        Args:
            positions: Active positions
            order_executor: OrderExecutor instance for placing orders
        """
        try:
            # Get all active exit levels from DB
            exit_levels = await self.strategy_service.get_active_exit_levels(self.fund_id)
            
            if not exit_levels:
                return
            
            logger.debug(f"Checking {len(exit_levels)} active stop(s)")
            
            for symbol, state in exit_levels.items():
                if symbol not in positions:
                    # Position closed but state still active - clean up
                    await self.strategy_service.deactivate_level(state.id, "position closed")
                    continue
                
                try:
                    position = positions[symbol]
                    
                    # Get current price
                    market_data = await self.market_data_provider.build_market_data(symbol)
                    current_price = market_data.price
                    
                    # Check if stop hit
                    stop_hit = await self.strategy_service.check_stop_hit(state, current_price)
                    
                    if stop_hit:
                        # Determine exit reason
                        exit_reason = "stop_loss"
                        if current_price > position.entry_price:
                            exit_reason = "profit_stop"
                        
                        self.strategy_logger.log(
                            symbol,
                            f"🛑 Stop hit @ ${current_price:.2f} (stop: ${state.current_stop_loss:.2f})"
                        )
                        
                        # Mark as triggered
                        await self.strategy_service.mark_triggered(state.id, current_price)
                        
                        # Execute sell order via OrderExecutor
                        stop_update = StopUpdate(
                            current_stop=state.current_stop_loss,
                            force_exit=True,
                            exit_reason=exit_reason
                        )
                        await order_executor.execute_sell_order(position, stop_update, market_data)
                
                except Exception as e:
                    logger.error(f"Error checking stop trigger for {symbol}: {e}", exc_info=True)
        
        except Exception as e:
            logger.error(f"Error checking stop triggers: {e}", exc_info=True)
    
    async def update_position_management(self, positions: Dict[str, PositionContext], order_executor) -> None:
        """
        Update position management - call strategy to update stops.
        
        Calls strategy.manage_position() for each open position and persists updated stops.
        Applies profit protection on top of strategy's stop.
        
        Args:
            positions: Active positions
        """
        try:
            if not positions:
                return
            
            logger.debug(f"Updating management for {len(positions)} position(s)")
            
            exit_levels = await self.strategy_service.get_active_exit_levels(self.fund_id)
            
            for symbol, position in positions.items():
                try:
                    exit_state = exit_levels.get(symbol) if exit_levels else None
                    
                    # Get current market data
                    market_data = await self.market_data_provider.build_market_data(symbol)
                    
                    # Update position with current price
                    position.current_price = market_data.price
                    position.unrealized_pnl = (market_data.price - position.entry_price) * position.quantity
                    position.unrealized_pnl_percent = ((market_data.price - position.entry_price) / position.entry_price) * 100
                    
                    # Merge strategy metadata from monitoring state with position state
                    merged_strategy_state: Dict[str, Any] = {}
                    if position.strategy_state:
                        merged_strategy_state.update(position.strategy_state)
                    if exit_state and exit_state.strategy_metadata:
                        merged_strategy_state.update(exit_state.strategy_metadata)
                    if exit_state and exit_state.current_stop_loss is not None:
                        merged_strategy_state["current_stop"] = exit_state.current_stop_loss
                    position.strategy_state = merged_strategy_state
                    
                    # Call strategy's management
                    stop_update = await self.strategy.manage_position(position, market_data)
                    
                    # Check for force exit (handled separately by caller)
                    if stop_update.force_exit:
                        self.strategy_logger.log(symbol, f"Strategy requests exit: {stop_update.exit_reason}")
                        await order_executor.execute_sell_order(position, stop_update, market_data)
                        continue
                    
                    # Handle scale outs (partial exits)
                    if stop_update.scale_out_percent and stop_update.scale_out_percent > 0:
                        self.strategy_logger.log(
                            symbol,
                            f"Strategy requests scale out: {stop_update.scale_out_percent:.2f}% "
                            f"(reason: {stop_update.exit_reason or 'target_hit'})"
                        )
                        await order_executor.execute_sell_order(position, stop_update, market_data)
                    
                    strategy_stop = stop_update.current_stop
                    
                    # Calculate profit protection stop
                    protection_stop = self.risk_manager.calculate_profit_protection_stop(
                        position.entry_price,
                        market_data.price
                    )
                    
                    # Use the higher of the two (most protective)
                    final_stop = max(strategy_stop, protection_stop)
                    
                    # Log if engine raised the stop
                    if final_stop > strategy_stop:
                        self.strategy_logger.stop_updated(
                            symbol,
                            strategy_stop,
                            final_stop,
                            "50% profit protection"
                        )
                    
                    # Persist to DB
                    await self.strategy_service.persist_management_state(
                        self.fund_id,
                        symbol,
                        position.entry_price,
                        position.entry_time,
                        StopUpdate(
                            current_stop=final_stop,
                            metadata={**stop_update.metadata, "current_stop": final_stop}
                        )
                    )
                
                except Exception as e:
                    logger.error(f"Error updating management for {symbol}: {e}", exc_info=True)
        
        except Exception as e:
            logger.error(f"Error in position management update: {e}", exc_info=True)

