"""
Ticker State Service - Ticker lifecycle state management.

Tracks ticker states through the strategy execution pipeline:
screened -> setup -> entered -> filled -> exited
"""

import uuid
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import TickerState
from app.services.core.database import get_async_session
from app.types import TickerStateTransitionCode

logger = logging.getLogger(__name__)


# Singleton instance
_ticker_state_service: Optional['TickerStateService'] = None


def get_ticker_state_service() -> 'TickerStateService':
    """Get singleton TickerStateService instance."""
    global _ticker_state_service
    if _ticker_state_service is None:
        _ticker_state_service = TickerStateService()
    return _ticker_state_service


class TickerStateService:
    """Manages ticker lifecycle state tracking."""
    
    async def get_ticker_state(
        self,
        fund_id: str,
        ticker: str
    ) -> Optional[TickerState]:
        """Get current state for a ticker."""
        async with get_async_session() as session:
            stmt = select(TickerState).where(
                and_(
                    TickerState.fund_id == fund_id,
                    TickerState.ticker == ticker.upper()
                )
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
    
    async def get_fund_tickers_by_state(
        self,
        fund_id: str,
        state: Optional[str] = None
    ) -> List[TickerState]:
        """Get all tickers for a fund, optionally filtered by state."""
        async with get_async_session() as session:
            conditions = [TickerState.fund_id == fund_id]
            if state:
                conditions.append(TickerState.current_state == state)
            
            stmt = select(TickerState).where(and_(*conditions)).order_by(
                TickerState.updated_at.desc()
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())
    
    async def transition_ticker(
        self,
        fund_id: str,
        ticker: str,
        to_state: str,
        transition_code: str,
        description: str,
        entry_level_id: Optional[str] = None,
        trade_id: Optional[str] = None
    ) -> TickerState:
        """
        Transition a ticker to a new state with reason.
        
        Args:
            fund_id: Fund ID
            ticker: Ticker symbol
            to_state: Target state ('screened', 'setup', 'entered', 'filled', 'exited', 'removed')
            transition_code: Structured transition code
            description: Human-readable description
            entry_level_id: Optional entry level ID (for 'entered' state)
            trade_id: Optional trade ID (for 'filled' or 'exited' state)
            
        Returns:
            Updated TickerState
        """
        async with get_async_session() as session:
            # Get or create ticker state (load within same session)
            stmt = select(TickerState).where(
                and_(
                    TickerState.fund_id == fund_id,
                    TickerState.ticker == ticker.upper()
                )
            )
            result = await session.execute(stmt)
            state = result.scalar_one_or_none()
            
            if state is None:
                # Create new state
                state_id = str(uuid.uuid4())
                from_state = None
                state = TickerState(
                    id=state_id,
                    fund_id=fund_id,
                    ticker=ticker.upper(),
                    current_state=to_state,
                    state_transitions=[],
                    entry_level_id=entry_level_id,
                    trade_id=trade_id,
                )
                session.add(state)
            else:
                from_state = state.current_state
                state.current_state = to_state
                state.updated_at = datetime.now(timezone.utc)
                
                # Update linked IDs if provided
                if entry_level_id is not None:
                    state.entry_level_id = entry_level_id
                if trade_id is not None:
                    state.trade_id = trade_id
            
            # Add transition record
            transition = {
                "from_state": from_state,
                "to_state": to_state,
                "transition_code": transition_code,
                "description": description,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            
            # Ensure state_transitions is a list
            if not isinstance(state.state_transitions, list):
                state.state_transitions = []
            
            state.state_transitions.append(transition)
            
            await session.commit()
            await session.refresh(state)
            
            logger.debug(
                f"Ticker state transition: {fund_id}/{ticker} "
                f"{from_state} -> {to_state} ({transition_code})"
            )
            
            return state
    
    async def sync_screener_tickers(
        self,
        fund_id: str,
        current_tickers: List[str]
    ) -> None:
        """
        Sync ticker states with current screener results.
        
        - Creates/updates tickers that are in screener (state: 'screened')
        - Marks tickers that dropped out as 'removed'
        - Updates last_screened_at timestamp
        
        Args:
            fund_id: Fund ID
            current_tickers: List of tickers currently passing screener
        """
        current_ticker_set = {t.upper() for t in current_tickers}
        now = datetime.now(timezone.utc)
        
        async with get_async_session() as session:
            # Get all existing ticker states for this fund
            stmt = select(TickerState).where(TickerState.fund_id == fund_id)
            result = await session.execute(stmt)
            existing_states = {ts.ticker: ts for ts in result.scalars().all()}
            
            # Update/create tickers that are in screener
            for ticker in current_tickers:
                ticker_upper = ticker.upper()
                state = existing_states.get(ticker_upper)
                
                if state is None:
                    # New ticker - create state
                    state_id = str(uuid.uuid4())
                    state = TickerState(
                        id=state_id,
                        fund_id=fund_id,
                        ticker=ticker_upper,
                        current_state="screened",
                        state_transitions=[{
                            "from_state": None,
                            "to_state": "screened",
                            "transition_code": TickerStateTransitionCode.SCREENER_PASSED.value,
                            "description": "Ticker passed screener filters",
                            "timestamp": now.isoformat(),
                        }],
                        last_screened_at=now,
                    )
                    session.add(state)
                else:
                    # Existing ticker - update if needed
                    if state.current_state != "screened":
                        # Transition back to screened if it was removed
                        transition = {
                            "from_state": state.current_state,
                            "to_state": "screened",
                            "transition_code": TickerStateTransitionCode.SCREENER_UPDATED.value,
                            "description": "Ticker reappeared in screener",
                            "timestamp": now.isoformat(),
                        }
                        if not isinstance(state.state_transitions, list):
                            state.state_transitions = []
                        state.state_transitions.append(transition)
                        state.current_state = "screened"
                    
                    state.last_screened_at = now
                    state.updated_at = now
            
            # Mark tickers that dropped out (only if they're in 'screened' state)
            for ticker, state in existing_states.items():
                if ticker not in current_ticker_set:
                    # Only transition to removed if currently in 'screened' state
                    # Other states (setup, entered, filled, exited) are preserved
                    if state.current_state == "screened":
                        transition = {
                            "from_state": "screened",
                            "to_state": "removed",
                            "transition_code": TickerStateTransitionCode.DROPPED_FROM_SCREENER.value,
                            "description": "Ticker no longer passes screener filters",
                            "timestamp": now.isoformat(),
                        }
                        if not isinstance(state.state_transitions, list):
                            state.state_transitions = []
                        state.state_transitions.append(transition)
                        state.current_state = "removed"
                        state.updated_at = now
            
            await session.commit()
            
            logger.debug(
                f"Synced screener tickers for fund {fund_id}: "
                f"{len(current_tickers)} in screener, "
                f"{len(existing_states)} existing states"
            )
    
    async def mark_ticker_exited(
        self,
        fund_id: str,
        ticker: str,
        trade_id: str,
        transition_code: str,
        description: str
    ) -> TickerState:
        """
        Mark a ticker as exited (position closed).
        
        Args:
            fund_id: Fund ID
            ticker: Ticker symbol
            trade_id: Trade ID that was closed
            transition_code: Exit reason code
            description: Human-readable description
            
        Returns:
            Updated TickerState
        """
        return await self.transition_ticker(
            fund_id=fund_id,
            ticker=ticker,
            to_state="exited",
            transition_code=transition_code,
            description=description,
            trade_id=trade_id
        )
    
    async def create_or_update_ticker_state(
        self,
        fund_id: str,
        ticker: str,
        state: str,
        transition_code: str,
        description: str,
        entry_level_id: Optional[str] = None
    ) -> TickerState:
        """
        Create or update ticker state (convenience method).
        
        Args:
            fund_id: Fund ID
            ticker: Ticker symbol
            state: Target state
            transition_code: Transition code
            description: Description
            entry_level_id: Optional entry level ID
            
        Returns:
            TickerState
        """
        return await self.transition_ticker(
            fund_id=fund_id,
            ticker=ticker,
            to_state=state,
            transition_code=transition_code,
            description=description,
            entry_level_id=entry_level_id
        )

