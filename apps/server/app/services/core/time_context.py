"""
Time Context for Backtesting.

Provides a global-but-async-safe time injection system using contextvars.
This allows backtests to run concurrently with live funds without interference.

Usage:
    # In backtest code:
    set_backtest_context("backtest-123", datetime(2024, 11, 3, 9, 30))
    
    # In any service:
    current_time = get_current_time()  # Returns backtest time or real time
    
    if is_backtest_mode():
        # Special backtest handling
        pass
"""

from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

# Global context variable for backtest time
# Uses ContextVar to ensure each async task has isolated context
_backtest_context: ContextVar[Optional['BacktestContext']] = ContextVar(
    'backtest_context', 
    default=None
)


class BacktestContext:
    """
    Context for backtest execution.
    
    Contains the backtest ID and current simulated time.
    Each async task running a backtest will have its own isolated context.
    """
    
    def __init__(self, backtest_id: str, current_time: datetime):
        """
        Initialize backtest context.
        
        Args:
            backtest_id: Unique identifier for this backtest run
            current_time: Simulated current time for the backtest (will be made timezone-aware if naive)
        """
        self.backtest_id = backtest_id
        # Ensure timezone-aware
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=timezone.utc)
        self.current_time = current_time
        self.is_backtest = True
    
    def __repr__(self) -> str:
        return f"BacktestContext(id={self.backtest_id}, time={self.current_time})"


def get_current_time() -> datetime:
    """
    Get current time, respecting backtest context.
    
    This is the primary function that services should use instead of
    datetime.utcnow() or datetime.now().
    
    Returns timezone-aware UTC datetime for consistency with database.
    
    Returns:
        Current backtest time if in backtest mode (timezone-aware), 
        otherwise real UTC time (timezone-aware)
    """
    ctx = _backtest_context.get()
    if ctx:
        # Ensure backtest time is timezone-aware
        if ctx.current_time.tzinfo is None:
            ctx.current_time = ctx.current_time.replace(tzinfo=timezone.utc)
        return ctx.current_time
    return datetime.now(timezone.utc)


def set_backtest_context(backtest_id: str, current_time: datetime) -> None:
    """
    Set backtest context for current async task.
    
    This must be called at the start of backtest execution to establish
    the simulated time context. The context is automatically isolated to
    the current async task and its children.
    
    Args:
        backtest_id: Unique identifier for this backtest run
        current_time: Simulated current time
    """
    _backtest_context.set(BacktestContext(backtest_id, current_time))


def update_backtest_time(current_time: datetime) -> None:
    """
    Update the current time in an existing backtest context.
    
    Used to advance time during backtest execution.
    Raises ValueError if not in backtest mode.
    
    Args:
        current_time: New simulated current time (will be made timezone-aware if naive)
    """
    ctx = _backtest_context.get()
    if not ctx:
        raise ValueError("Cannot update time: not in backtest mode")
    # Ensure timezone-aware
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    ctx.current_time = current_time


def clear_backtest_context() -> None:
    """
    Clear backtest context for current async task.
    
    Call this when backtest completes to return to normal operation.
    """
    _backtest_context.set(None)


def get_backtest_context() -> Optional[BacktestContext]:
    """
    Get current backtest context if in backtest mode.
    
    Returns:
        BacktestContext if in backtest mode, None otherwise
    """
    return _backtest_context.get()


def is_backtest_mode() -> bool:
    """
    Check if currently in backtest mode.
    
    Returns:
        True if in backtest mode, False for live operation
    """
    return _backtest_context.get() is not None


def get_backtest_id() -> Optional[str]:
    """
    Get current backtest ID if in backtest mode.
    
    Returns:
        Backtest ID string if in backtest mode, None otherwise
    """
    ctx = _backtest_context.get()
    return ctx.backtest_id if ctx else None

