"""
Strategy Service - Persistent level management.

Handles persistence and recovery of entry/exit levels for strategies.
All monitoring state survives restarts.
"""

import uuid
import logging
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime

from app.services.core.time_context import get_current_time
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitoring_state import StrategyMonitoringState
from app.services.core.database import get_async_session
from app.strategies.base import EntryLevel, StopUpdate

logger = logging.getLogger(__name__)


def _merge_metadata(
    existing: Optional[Dict[str, Any]],
    new: Optional[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """
    Merge strategy metadata dictionaries with shallow-nested support.
    
    Args:
        existing: Existing metadata stored in DB
        new: Incoming metadata from strategy update
        
    Returns:
        Merged metadata dictionary (or None if both inputs are None)
    """
    if not existing and not new:
        return None
    
    merged: Dict[str, Any] = dict(existing or {})
    
    if new:
        for key, value in new.items():
            if (
                isinstance(value, dict)
                and isinstance(merged.get(key), dict)
            ):
                merged[key] = {**merged[key], **value}
            else:
                merged[key] = value
    
    return merged


class StrategyService:
    """Manages persistent strategy state and level monitoring."""
    
    async def persist_entry_level(
        self,
        fund_id: str,
        symbol: str,
        level: EntryLevel
    ) -> str:
        """
        Save entry level to DB.
        
        Args:
            fund_id: Fund ID
            symbol: Ticker symbol
            level: Entry level from strategy
            
        Returns:
            State ID
        """
        state_id = str(uuid.uuid4())
        
        async with get_async_session() as session:
            state = StrategyMonitoringState(
                id=state_id,
                fund_id=fund_id,
                symbol=symbol,
                state_type="entry_level",
                is_active=True,
                
                # Entry level fields
                entry_price=level.entry_price,
                stop_loss=level.stop_loss,
                confidence=level.confidence,
                order_type=level.order_type,
                limit_price=level.entry_price if level.order_type == "limit" else None,
                
                # Strategy metadata
                strategy_metadata=level.metadata or {},
            )
            
            session.add(state)
            await session.commit()
            
            logger.debug(
                f"Persisted entry level: {symbol} @ ${level.entry_price:.2f} "
                f"(stop: ${level.stop_loss:.2f}, state_id: {state_id})"
            )
        
        return state_id
    
    async def persist_management_state(
        self,
        fund_id: str,
        symbol: str,
        position_entry_price: float,
        position_entry_time: datetime,
        stop_update: StopUpdate
    ) -> str:
        """
        Save or update management state for open position.
        
        Args:
            fund_id: Fund ID
            symbol: Ticker symbol
            position_entry_price: Original entry price
            position_entry_time: When position was opened
            stop_update: Stop update from strategy
            
        Returns:
            State ID
        """
        async with get_async_session() as session:
            # Check if management state already exists for this position
            stmt = select(StrategyMonitoringState).where(
                and_(
                    StrategyMonitoringState.fund_id == fund_id,
                    StrategyMonitoringState.symbol == symbol,
                    StrategyMonitoringState.state_type == "exit_level",
                    StrategyMonitoringState.is_active == True
                )
            )
            result = await session.execute(stmt)
            state = result.scalar_one_or_none()
            
            if state:
                # Update existing
                state.current_stop_loss = stop_update.current_stop
                state.updated_at = get_current_time()
                state.strategy_metadata = _merge_metadata(
                    state.strategy_metadata,
                    stop_update.metadata
                )
                state_id = state.id
                logger.debug(f"Updated management state: {symbol} stop=${stop_update.current_stop:.2f}")
            else:
                # Create new
                state_id = str(uuid.uuid4())
                state = StrategyMonitoringState(
                    id=state_id,
                    fund_id=fund_id,
                    symbol=symbol,
                    state_type="exit_level",
                    is_active=True,
                    
                    # Exit level fields
                    position_entry_price=position_entry_price,
                    position_entry_time=position_entry_time,
                    current_stop_loss=stop_update.current_stop,
                    strategy_metadata=_merge_metadata({}, stop_update.metadata),
                )
                session.add(state)
                logger.debug(f"Created management state: {symbol} stop=${stop_update.current_stop:.2f}")
            
            await session.commit()
        
        return state_id
    
    async def get_active_entry_levels(
        self,
        fund_id: str
    ) -> List[StrategyMonitoringState]:
        """
        Get all active entry levels for fund.
        
        Args:
            fund_id: Fund ID
            
        Returns:
            List of active entry level states
        """
        async with get_async_session() as session:
            stmt = select(StrategyMonitoringState).where(
                and_(
                    StrategyMonitoringState.fund_id == fund_id,
                    StrategyMonitoringState.state_type == "entry_level",
                    StrategyMonitoringState.is_active == True
                )
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())
    
    async def get_active_exit_levels(
        self,
        fund_id: str
    ) -> Dict[str, StrategyMonitoringState]:
        """
        Get all active exit levels (stops) for fund.
        
        Args:
            fund_id: Fund ID
            
        Returns:
            Dict mapping symbol -> exit level state
        """
        async with get_async_session() as session:
            stmt = select(StrategyMonitoringState).where(
                and_(
                    StrategyMonitoringState.fund_id == fund_id,
                    StrategyMonitoringState.state_type == "exit_level",
                    StrategyMonitoringState.is_active == True
                )
            )
            result = await session.execute(stmt)
            states = result.scalars().all()
            
            return {state.symbol: state for state in states}
    
    async def check_entry_triggered(
        self,
        state: StrategyMonitoringState,
        current_price: float,
        last_price: Optional[float] = None
    ) -> bool:
        """
        Check if entry level was triggered.
        
        Args:
            state: Entry level state
            current_price: Current market price
            last_price: Previous price (for crossover detection)
            
        Returns:
            True if triggered
        """
        entry_price = state.entry_price
        
        if entry_price is None:
            return False
        
        # For market orders or first check: trigger if at or below entry
        if last_price is None or state.order_type == "market":
            return current_price <= entry_price
        
        # For limit orders: detect crossover from above to at/below
        return last_price > entry_price >= current_price
    
    async def check_stop_hit(
        self,
        state: StrategyMonitoringState,
        current_price: float
    ) -> bool:
        """
        Check if stop loss was hit.
        
        Args:
            state: Exit level state
            current_price: Current market price
            
        Returns:
            True if stop hit
        """
        stop_loss = state.current_stop_loss
        
        if stop_loss is None:
            return False
        
        return current_price <= stop_loss
    
    async def mark_triggered(
        self,
        state_id: str,
        trigger_price: float
    ):
        """
        Mark level as triggered.
        
        Args:
            state_id: State ID
            trigger_price: Price at which level was triggered
        """
        async with get_async_session() as session:
            state = await session.get(StrategyMonitoringState, state_id)
            if state:
                state.mark_triggered(trigger_price)
                await session.commit()
                logger.debug(f"Marked state {state_id} as triggered @ ${trigger_price:.2f}")
    
    async def deactivate_level(
        self,
        state_id: str,
        reason: str
    ):
        """
        Deactivate a monitoring level.
        
        Args:
            state_id: State ID
            reason: Reason for deactivation
        """
        async with get_async_session() as session:
            state = await session.get(StrategyMonitoringState, state_id)
            if state:
                state.deactivate(reason)
                await session.commit()
                logger.debug(f"Deactivated state {state_id}: {reason}")
    
    async def deactivate_symbol_levels(
        self,
        fund_id: str,
        symbol: str,
        reason: str
    ):
        """
        Deactivate all levels for a symbol.
        
        Called when position is closed or symbol removed from monitoring.
        
        Args:
            fund_id: Fund ID
            symbol: Ticker symbol
            reason: Reason for deactivation
        """
        async with get_async_session() as session:
            stmt = select(StrategyMonitoringState).where(
                and_(
                    StrategyMonitoringState.fund_id == fund_id,
                    StrategyMonitoringState.symbol == symbol,
                    StrategyMonitoringState.is_active == True
                )
            )
            result = await session.execute(stmt)
            states = result.scalars().all()
            
            for state in states:
                state.deactivate(reason)
            
            await session.commit()
            
            logger.debug(f"Deactivated {len(states)} level(s) for {symbol}: {reason}")
    
    async def recover_fund_state(
        self,
        fund_id: str
    ) -> Tuple[List[StrategyMonitoringState], Dict[str, StrategyMonitoringState]]:
        """
        Recover all active levels after restart.
        
        Args:
            fund_id: Fund ID
            
        Returns:
            (entry_levels, exit_levels) - Lists of active monitoring states
        """
        entry_levels = await self.get_active_entry_levels(fund_id)
        exit_levels = await self.get_active_exit_levels(fund_id)
        
        logger.debug(
            f"Recovered state for fund {fund_id}: "
            f"{len(entry_levels)} entry level(s), {len(exit_levels)} exit level(s)"
        )
        
        return entry_levels, exit_levels


# Global instance
_strategy_service = StrategyService()


def get_strategy_service() -> StrategyService:
    """Get global StrategyService instance."""
    return _strategy_service

