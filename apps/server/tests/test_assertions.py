"""
Test Assertions - Helper functions for complex test validations.

Provides assertion helpers that encapsulate common validation patterns for:
- Risk limit enforcement
- Position sizing calculations
- Trading hour restrictions
- Order count limits

These make tests more readable and DRY.
"""

from datetime import datetime, time as dt_time
from typing import Optional, Dict, Any
import pytz

from app.models.strategies import Fund, Order
from app.strategies.base import PositionContext


def assert_risk_limits_enforced(
    fund: Fund,
    positions: Dict[str, PositionContext],
    should_allow_trading: bool,
    reason: Optional[str] = None
) -> None:
    """
    Assert that risk limits are properly enforced.
    
    Calculates current P&L and exposure, then checks if trading should be
    allowed based on fund risk parameters.
    
    Args:
        fund: Fund instance with risk parameters
        positions: Dictionary of active positions
        should_allow_trading: Whether trading should be allowed
        reason: Optional reason for assertion failure
        
    Raises:
        AssertionError: If risk limits are not properly enforced
        
    Example:
        >>> fund = build_fund(max_loss_dollars=100.0)
        >>> positions = {"AAPL": build_position_context(unrealized_pnl=-150.0)}
        >>> assert_risk_limits_enforced(fund, positions, should_allow_trading=False)
    """
    # Calculate daily P&L
    daily_pnl = sum(p.unrealized_pnl for p in positions.values())
    
    # Check max_loss_dollars
    if fund.max_loss_dollars is not None and daily_pnl < 0:
        loss = abs(daily_pnl)
        if loss >= fund.max_loss_dollars:
            assert not should_allow_trading, (
                f"Risk limit violated: Loss ${loss:.2f} exceeds max_loss_dollars "
                f"${fund.max_loss_dollars:.2f}, but trading is still allowed! {reason or ''}"
            )
            return
    
    # Check max_loss_percent
    if fund.max_loss_percent is not None and daily_pnl < 0 and fund.balance > 0:
        loss_percent = (abs(daily_pnl) / fund.balance) * 100
        if loss_percent >= fund.max_loss_percent:
            assert not should_allow_trading, (
                f"Risk limit violated: Loss {loss_percent:.1f}% exceeds max_loss_percent "
                f"{fund.max_loss_percent:.1f}%, but trading is still allowed! {reason or ''}"
            )
            return
    
    # Check max_total_exposure
    if fund.max_total_exposure is not None:
        total_exposure = sum(p.quantity * p.current_price for p in positions.values())
        if total_exposure >= fund.max_total_exposure:
            assert not should_allow_trading, (
                f"Risk limit violated: Total exposure ${total_exposure:.2f} exceeds "
                f"max_total_exposure ${fund.max_total_exposure:.2f}, but trading is still allowed! "
                f"{reason or ''}"
            )
            return
    
    # If we get here and should_allow_trading is False, something is wrong
    if not should_allow_trading:
        raise AssertionError(
            f"Trading should not be allowed but no risk limit was violated. "
            f"P&L: ${daily_pnl:.2f}, Balance: ${fund.balance:.2f}. {reason or ''}"
        )


def assert_position_size_valid(
    fund: Fund,
    calculated_size: float,
    share_price: float,
    expected_min: Optional[float] = None,
    expected_max: Optional[float] = None,
) -> None:
    """
    Assert that a calculated position size respects fund constraints.
    
    Args:
        fund: Fund instance with sizing parameters
        calculated_size: Calculated position size in dollars
        share_price: Price per share
        expected_min: Expected minimum size (optional)
        expected_max: Expected maximum size (optional)
        
    Raises:
        AssertionError: If position size violates constraints
        
    Example:
        >>> fund = build_fund(size_per_trade=1000.0, max_bet_percent=5.0, balance=10000.0)
        >>> assert_position_size_valid(fund, calculated_size=500.0, share_price=100.0)
    """
    # Check against size_per_trade
    assert calculated_size <= fund.size_per_trade, (
        f"Position size ${calculated_size:.2f} exceeds size_per_trade "
        f"${fund.size_per_trade:.2f}"
    )
    
    # Check against max_bet_percent
    if fund.max_bet_percent is not None and fund.max_bet_percent > 0:
        max_allowed = fund.balance * (fund.max_bet_percent / 100.0)
        assert calculated_size <= max_allowed, (
            f"Position size ${calculated_size:.2f} exceeds max_bet_percent limit "
            f"of ${max_allowed:.2f} ({fund.max_bet_percent}% of ${fund.balance:.2f})"
        )
    
    # Check against min_bet_percent
    if fund.min_bet_percent is not None and fund.min_bet_percent > 0:
        min_required = fund.balance * (fund.min_bet_percent / 100.0)
        # Only check if we're trying to place an order (size > 0)
        if calculated_size > 0:
            assert calculated_size >= min_required, (
                f"Position size ${calculated_size:.2f} is below min_bet_percent "
                f"requirement of ${min_required:.2f} ({fund.min_bet_percent}% of ${fund.balance:.2f})"
            )
    
    # Check expected bounds if provided
    if expected_min is not None:
        assert calculated_size >= expected_min, (
            f"Position size ${calculated_size:.2f} is below expected minimum ${expected_min:.2f}"
        )
    
    if expected_max is not None:
        assert calculated_size <= expected_max, (
            f"Position size ${calculated_size:.2f} exceeds expected maximum ${expected_max:.2f}"
        )
    
    # Validate that calculated shares don't exceed balance
    quantity = int(calculated_size / share_price)
    actual_cost = quantity * share_price
    assert actual_cost <= fund.balance, (
        f"Actual order cost ${actual_cost:.2f} ({quantity} shares @ ${share_price:.2f}) "
        f"exceeds fund balance ${fund.balance:.2f}"
    )


def assert_trading_hours_respected(
    fund: Fund,
    current_time: datetime,
    should_allow_trading: bool,
) -> None:
    """
    Assert that trading hours are properly enforced.
    
    Args:
        fund: Fund instance with trading hour configuration
        current_time: Current time to check
        should_allow_trading: Whether trading should be allowed at this time
        
    Raises:
        AssertionError: If trading hours are not properly enforced
        
    Example:
        >>> from datetime import datetime
        >>> import pytz
        >>> fund = build_fund(
        ...     trading_start_time="09:30",
        ...     trading_end_time="16:00",
        ...     timezone="America/New_York"
        ... )
        >>> ny_tz = pytz.timezone("America/New_York")
        >>> morning = ny_tz.localize(datetime(2024, 1, 15, 10, 0))  # 10 AM
        >>> assert_trading_hours_respected(fund, morning, should_allow_trading=True)
    """
    # If no trading hours configured, trading is always allowed
    if not fund.trading_start_time or not fund.trading_end_time:
        assert should_allow_trading, (
            "No trading hours configured, but trading is not allowed"
        )
        return
    
    # Get timezone
    tz = pytz.timezone(fund.timezone or "America/New_York")
    
    # Localize current time to fund timezone
    if current_time.tzinfo is None:
        # If naive, assume UTC and convert
        current_time = pytz.UTC.localize(current_time).astimezone(tz)
    else:
        current_time = current_time.astimezone(tz)
    
    # Parse trading hours
    start_hour, start_minute = map(int, fund.trading_start_time.split(":"))
    end_hour, end_minute = map(int, fund.trading_end_time.split(":"))
    
    start_time = dt_time(start_hour, start_minute)
    end_time = dt_time(end_hour, end_minute)
    
    # Check if current time is within trading window
    current_time_only = current_time.time()
    is_within_hours = start_time <= current_time_only <= end_time
    
    if should_allow_trading:
        assert is_within_hours, (
            f"Time {current_time_only} is outside trading hours "
            f"({start_time} to {end_time} {tz}), but trading is allowed"
        )
    else:
        assert not is_within_hours, (
            f"Time {current_time_only} is within trading hours "
            f"({start_time} to {end_time} {tz}), but trading is not allowed"
        )


def assert_order_count_limits(
    active_positions: int,
    pending_orders: int,
    max_positions: int,
    should_allow_new_order: bool,
) -> None:
    """
    Assert that order count limits are properly enforced.
    
    Validates that strategies properly count both filled positions AND pending
    orders when deciding whether to place new orders.
    
    Args:
        active_positions: Number of filled positions
        pending_orders: Number of pending orders
        max_positions: Maximum allowed positions for strategy
        should_allow_new_order: Whether new orders should be allowed
        
    Raises:
        AssertionError: If order limits are not properly enforced
        
    Example:
        >>> # MonkeyDarts with 1 pending order
        >>> assert_order_count_limits(
        ...     active_positions=0,
        ...     pending_orders=1,
        ...     max_positions=1,
        ...     should_allow_new_order=False
        ... )
    """
    total_active = active_positions + pending_orders
    
    if should_allow_new_order:
        assert total_active < max_positions, (
            f"Should allow new orders but already at limit: "
            f"{active_positions} positions + {pending_orders} pending orders "
            f"= {total_active} >= {max_positions} max"
        )
    else:
        assert total_active >= max_positions, (
            f"Should not allow new orders but under limit: "
            f"{active_positions} positions + {pending_orders} pending orders "
            f"= {total_active} < {max_positions} max"
        )


def assert_balance_sufficient(
    fund: Fund,
    order_cost: float,
    should_allow_order: bool,
) -> None:
    """
    Assert that balance checks are properly enforced.
    
    Args:
        fund: Fund instance with balance
        order_cost: Cost of the order being placed
        should_allow_order: Whether order should be allowed
        
    Raises:
        AssertionError: If balance checks are not properly enforced
        
    Example:
        >>> fund = build_fund(balance=1000.0)
        >>> assert_balance_sufficient(fund, order_cost=1500.0, should_allow_order=False)
    """
    has_sufficient_balance = order_cost <= fund.balance
    
    if should_allow_order:
        assert has_sufficient_balance, (
            f"Order cost ${order_cost:.2f} exceeds fund balance ${fund.balance:.2f}, "
            f"but order is allowed"
        )
    else:
        assert not has_sufficient_balance, (
            f"Order cost ${order_cost:.2f} is within fund balance ${fund.balance:.2f}, "
            f"but order is not allowed"
        )


def assert_order_is_stale(
    order: Order,
    max_age_seconds: int,
    current_time: Optional[datetime] = None,
) -> None:
    """
    Assert that an order is considered stale based on age.
    
    Args:
        order: Order to check
        max_age_seconds: Maximum allowed age in seconds
        current_time: Current time (defaults to now)
        
    Raises:
        AssertionError: If order age is not greater than max age
        
    Example:
        >>> from datetime import datetime, timedelta
        >>> order = build_stale_order(age_seconds=120)
        >>> assert_order_is_stale(order, max_age_seconds=60)
    """
    if current_time is None:
        current_time = datetime.utcnow()
    
    age_seconds = (current_time - order.submitted_at).total_seconds()
    
    assert age_seconds > max_age_seconds, (
        f"Order age {age_seconds:.0f}s is not greater than max age {max_age_seconds}s. "
        f"Order is not stale."
    )


def assert_order_not_stale(
    order: Order,
    max_age_seconds: int,
    current_time: Optional[datetime] = None,
) -> None:
    """
    Assert that an order is NOT considered stale based on age.
    
    Args:
        order: Order to check
        max_age_seconds: Maximum allowed age in seconds
        current_time: Current time (defaults to now)
        
    Raises:
        AssertionError: If order age is greater than max age
        
    Example:
        >>> order = build_order()  # Fresh order
        >>> assert_order_not_stale(order, max_age_seconds=60)
    """
    if current_time is None:
        current_time = datetime.utcnow()
    
    age_seconds = (current_time - order.submitted_at).total_seconds()
    
    assert age_seconds <= max_age_seconds, (
        f"Order age {age_seconds:.0f}s exceeds max age {max_age_seconds}s. "
        f"Order is stale."
    )

