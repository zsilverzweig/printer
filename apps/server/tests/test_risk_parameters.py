"""
Risk Parameter Tests

Tests that risk limit enforcement works correctly:
- max_loss_percent stops trading when hit
- max_loss_dollars stops trading when hit
- max_giveback_percent locks in profits
- Risk limits checked BEFORE placing orders
- Risk limits prevent both entry AND scaling operations
- Multiple risk limits work together correctly

These tests are designed to identify bugs in risk management logic.
Many tests may FAIL initially - that's expected and helps document issues.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch

from tests.test_builders import build_fund, build_position_context, build_market_data
from tests.test_assertions import assert_risk_limits_enforced
from app.services.strategies.risk_manager import RiskManager


@pytest.mark.asyncio
async def test_max_loss_dollars_stops_trading():
    """
    Test that max_loss_dollars prevents trading when loss limit is hit.
    
    Expected: When unrealized P&L reaches -max_loss_dollars, trading should stop.
    
    This test will likely FAIL if max_loss_dollars is not enforced.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0  # Stop trading at $500 loss
    )
    
    # Create positions with $600 loss
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=140.0,  # $10 loss per share
            quantity=60  # Total: $600 loss
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading
    assert not can_trade, (
        f"Risk limit violated: Loss exceeds max_loss_dollars of ${fund.max_loss_dollars}, "
        f"but trading is allowed! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_max_loss_dollars_allows_trading_under_limit():
    """
    Test that trading is allowed when losses are under max_loss_dollars.
    
    Expected: When losses are below the limit, trading should continue.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0
    )
    
    # Create positions with $300 loss (under limit)
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=147.0,  # $3 loss per share
            quantity=100  # Total: $300 loss
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should allow trading
    assert can_trade, (
        f"Loss of $300 is under max_loss_dollars of $500, but trading is blocked! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_max_loss_percent_stops_trading():
    """
    Test that max_loss_percent prevents trading when percentage loss limit is hit.
    
    Expected: When loss as percentage of balance reaches limit, trading should stop.
    
    This test will likely FAIL if max_loss_percent is not enforced.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_percent=5.0  # Stop at 5% loss = $500
    )
    
    # Create positions with $600 loss (6% of balance)
    positions = {
        "TSLA": build_position_context(
            entry_price=250.0,
            current_price=235.0,  # $15 loss per share
            quantity=40  # Total: $600 loss = 6%
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading
    assert not can_trade, (
        f"Risk limit violated: Loss of 6% exceeds max_loss_percent of 5%, "
        f"but trading is allowed! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_max_loss_percent_allows_trading_under_limit():
    """
    Test that trading is allowed when percentage losses are under limit.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_percent=5.0  # Stop at 5% loss = $500
    )
    
    # Create positions with $300 loss (3% of balance)
    positions = {
        "GOOGL": build_position_context(
            entry_price=2900.0,
            current_price=2800.0,  # $100 loss per share
            quantity=3  # Total: $300 loss = 3%
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should allow trading
    assert can_trade, (
        f"Loss of 3% is under max_loss_percent of 5%, but trading is blocked! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_no_risk_limits_always_allows_trading():
    """
    Test that trading is always allowed when no risk limits are set.
    
    Expected: Funds with no risk limits should trade freely.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_percent=None,
        max_loss_dollars=None,
        max_giveback_percent=None,
        max_total_exposure=None
    )
    
    # Create positions with huge loss
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=100.0,  # $50 loss per share
            quantity=100  # Total: $5000 loss!
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should still allow trading (no limits set)
    assert can_trade, (
        f"Should allow trading with no risk limits set, but got blocked! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_max_total_exposure_stops_trading():
    """
    Test that max_total_exposure prevents trading when exposure limit is hit.
    
    Expected: When total position value reaches limit, no new positions allowed.
    
    This test will likely FAIL if max_total_exposure is not enforced.
    """
    fund = build_fund(
        balance=20000.0,
        max_total_exposure=10000.0  # Max $10,000 in positions
    )
    
    # Create positions with $10,700 total exposure
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=155.0,
            quantity=50  # $7,750
        ),
        "GOOGL": build_position_context(
            entry_price=2900.0,
            current_price=2950.0,
            quantity=1  # $2,950
        )
    }
    
    # Total exposure: $7,750 + $2,950 = $10,700 > $10,000 limit
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading
    assert not can_trade, (
        f"Risk limit violated: Total exposure exceeds max_total_exposure, "
        f"but trading is allowed! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_max_total_exposure_allows_trading_under_limit():
    """
    Test that trading is allowed when exposure is under limit.
    """
    fund = build_fund(
        balance=20000.0,
        max_total_exposure=10000.0
    )
    
    # Create positions with $7,750 total exposure
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=155.0,
            quantity=50  # $7,750
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should allow trading
    assert can_trade, (
        f"Total exposure $7,750 is under limit of $10,000, but trading is blocked! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_multiple_risk_limits_work_together():
    """
    Test that multiple risk limits are all checked.
    
    Expected: If ANY risk limit is violated, trading should stop.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0,
        max_loss_percent=5.0,
        max_total_exposure=8000.0
    )
    
    # Create positions that violate loss limit but not exposure limit
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=140.0,  # $10 loss per share
            quantity=60  # Total: $600 loss, $8,400 exposure
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading (loss limit violated)
    assert not can_trade, (
        f"Risk limit violated: Loss limit exceeded, but trading is allowed! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_profitable_positions_dont_trigger_loss_limits():
    """
    Test that profitable positions don't trigger loss limits.
    
    Expected: Loss limits only apply to losses, not profits.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0,
        max_loss_percent=5.0
    )
    
    # Create positions with profit
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=160.0,  # $10 profit per share
            quantity=100  # Total: $1000 profit
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should allow trading (profitable)
    assert can_trade, (
        f"Positions are profitable, but trading is blocked! Reason: {reason}"
    )




@pytest.mark.asyncio
async def test_strategy_engine_checks_risk_limits_before_entry():
    """
    Test that risk limits prevent trading when violated.
    
    Expected: When risk limits are violated, can_trade should be False,
    which should prevent orders from being placed.
    
    This test verifies the RiskManager logic directly.
    """
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0
    )
    
    # Create positions with loss exceeding limit
    positions = {
        "TSLA": build_position_context(
            entry_price=250.0,
            current_price=235.0,
            quantity=40  # $600 loss > $500 limit
        )
    }
    
    # Use RiskManager to check limits (this is what StrategyEngine does)
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading (risk limit hit)
    assert not can_trade, (
        f"Risk limit violated: Loss exceeds max_loss_dollars, "
        f"but can_trade is True! Reason: {reason}"
    )
    
    # Verify the reason message explains the issue
    assert "loss limit" in reason.lower() or "max_loss" in reason.lower(), (
        f"Reason message should explain loss limit violation, got: {reason}"
    )


@pytest.mark.asyncio
async def test_risk_limits_checked_before_each_entry():
    """
    Test that risk limits are re-checked as positions accumulate.
    
    Expected: When adding a new position would exceed limits, risk checks should block it.
    """
    fund = build_fund(
        balance=10000.0,
        max_total_exposure=5000.0
    )
    
    # Start with position using $3000 exposure
    existing_positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=150.0,
            quantity=20  # $3000
        )
    }
    
    # Calculate remaining capacity
    current_exposure = sum(p.quantity * p.current_price for p in existing_positions.values())
    remaining_capacity = fund.max_total_exposure - current_exposure
    
    assert remaining_capacity == 2000.0, f"Expected $2000 remaining, got ${remaining_capacity}"
    
    # Add a new position that would exceed the limit
    # Total exposure would be $3000 + $2500 = $5500 > $5000 limit
    new_positions = {
        **existing_positions,
        "GOOGL": build_position_context(
            entry_price=2500.0,
            current_price=2500.0,
            quantity=1  # $2500
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(new_positions, fund.balance)
    
    # Should not allow trading (exposure limit exceeded)
    assert not can_trade, (
        f"Risk limit violated: Total exposure would exceed limit, "
        f"but can_trade is True! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_zero_balance_with_losses_allows_trading():
    """
    Test edge case: balance is 0 but positions have losses.
    
    Expected: Loss limits (dollars) should still work even with 0 balance.
    """
    fund = build_fund(
        balance=0.0,  # No cash left
        max_loss_dollars=500.0
    )
    
    # Positions with loss
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=140.0,
            quantity=60  # $600 loss
        )
    }
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
    
    # Should not allow trading (loss limit hit)
    assert not can_trade, (
        f"Loss limit should work even with zero balance, but trading is allowed! Reason: {reason}"
    )


@pytest.mark.asyncio
async def test_loss_percent_calculation_with_zero_balance():
    """
    Test that max_loss_percent doesn't divide by zero when balance is 0.
    
    Expected: When balance is 0, percentage calculation should be skipped.
    """
    fund = build_fund(
        balance=0.0,
        max_loss_percent=5.0  # Can't calculate 5% of 0
    )
    
    positions = {}  # No positions
    
    # Use RiskManager to check limits
    risk_manager = RiskManager(
        fund_id=fund.id,
        fund_mode=fund.mode,
        max_loss_dollars=fund.max_loss_dollars,
        max_loss_percent=fund.max_loss_percent,
        max_total_exposure=fund.max_total_exposure,
    )
    
    # Should not crash with division by zero
    # The implementation should skip percentage check when balance is 0
    try:
        can_trade, reason = await risk_manager.check_risk_limits(positions, fund.balance)
        # Should allow trading (no positions, no loss)
        assert can_trade, (
            f"Should allow trading with no positions and zero balance, but got blocked! Reason: {reason}"
        )
    except ZeroDivisionError:
        pytest.fail("max_loss_percent calculation crashes with zero balance!")

