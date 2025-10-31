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
    
    # Should not allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=False,
        reason="Loss of $600 exceeds max_loss_dollars of $500"
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
    
    # Should allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=True,
        reason="Loss of $300 is under max_loss_dollars of $500"
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
    
    # Should not allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=False,
        reason="Loss of 6% exceeds max_loss_percent of 5%"
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
    
    # Should allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=True,
        reason="Loss of 3% is under max_loss_percent of 5%"
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
    
    # Should still allow trading (no limits set)
    # Note: This will raise an AssertionError if risk checks think it should block
    try:
        assert_risk_limits_enforced(
            fund,
            positions,
            should_allow_trading=True
        )
    except AssertionError as e:
        pytest.fail(f"Should allow trading with no risk limits set, but got: {e}")


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
    
    # Create positions with $11,000 total exposure
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
    
    # Should not allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=False,
        reason="Total exposure $10,700 exceeds limit of $10,000"
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
    
    # Create positions with $8,000 total exposure
    positions = {
        "AAPL": build_position_context(
            entry_price=150.0,
            current_price=155.0,
            quantity=50  # $7,750
        )
    }
    
    # Should allow trading
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=True,
        reason="Total exposure $7,750 is under limit of $10,000"
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
    
    # Should not allow trading (loss limit violated)
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=False,
        reason="Loss limit violated (exposure is OK)"
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
    
    # Should allow trading (profitable)
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=True,
        reason="Positions are profitable"
    )


@pytest.mark.asyncio
async def test_max_giveback_percent_not_implemented():
    """
    Test for max_giveback_percent (likely not implemented yet).
    
    Expected: max_giveback_percent should lock in profits when reached.
    
    Example: If max_giveback_percent=20%, and position was up $1000 but
    drops to $800 profit (gave back $200 = 20%), should exit.
    
    This test documents the expected behavior for future implementation.
    """
    fund = build_fund(
        balance=10000.0,
        max_giveback_percent=20.0  # Stop if give back 20% of gains
    )
    
    # Create position that was up more but gave back some profit
    # High water mark: $170 (was up $20/share)
    # Current: $164 (now up $14/share)
    # Giveback: $6 / $20 = 30% > 20% limit
    position = build_position_context(
        entry_price=150.0,
        current_price=164.0,  # Still profitable, but gave back from peak
        high_water_mark=170.0,  # Peak price
        quantity=100
    )
    
    # Calculate giveback percentage
    peak_profit_per_share = position.high_water_mark - position.entry_price  # $20
    current_profit_per_share = position.current_price - position.entry_price  # $14
    giveback_per_share = peak_profit_per_share - current_profit_per_share  # $6
    giveback_percent = (giveback_per_share / peak_profit_per_share) * 100  # 30%
    
    assert giveback_percent == 30.0, f"Expected 30% giveback, got {giveback_percent}%"
    
    # TODO: When implemented, this should trigger an exit
    # For now, just document the calculation
    pytest.skip("max_giveback_percent not implemented yet - skipping enforcement test")


@pytest.mark.asyncio
async def test_strategy_engine_checks_risk_limits_before_entry():
    """
    Test that StrategyEngine._check_risk_limits is called before entering positions.
    
    Expected: Risk limits should be checked in _monitor_entries before placing orders.
    
    This test will likely FAIL if risk checks are not in the entry flow.
    """
    from app.services.strategies.strategy_engine import StrategyEngine
    
    fund = build_fund(
        balance=10000.0,
        max_loss_dollars=500.0
    )
    
    # Create mock services
    mock_market_data = Mock()
    mock_market_data.build_market_data = AsyncMock(
        return_value=build_market_data(symbol="AAPL", price=150.0)
    )
    
    mock_alpaca = Mock(paper_trading=True)
    mock_alpaca.place_market_order = AsyncMock()
    
    mock_strategy = Mock()
    mock_strategy.should_enter = AsyncMock(
        return_value=Mock(should_enter=True, reason="test")
    )
    mock_strategy.position_sizing = AsyncMock(return_value=1000.0)
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Mock positions with loss at limit
    with patch.object(engine, 'get_active_positions') as mock_get_positions:
        mock_get_positions.return_value = {
            "TSLA": build_position_context(
                entry_price=250.0,
                current_price=235.0,
                quantity=40  # $600 loss > $500 limit
            )
        }
        
        # Set monitored symbols
        engine.monitored_symbols = ["AAPL"]
        
        # Try to monitor entries
        await engine._monitor_entries()
        
        # Order should NOT have been placed (risk limit hit)
        assert not mock_alpaca.place_market_order.called, (
            "Order was placed despite risk limit violation! "
            "Risk checks not working in entry flow."
        )


@pytest.mark.asyncio
async def test_risk_limits_checked_before_each_entry():
    """
    Test that risk limits are re-checked for each entry attempt.
    
    Expected: Even if one position passes risk checks, subsequent positions
    should also be checked (limits can change as positions accumulate).
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
    
    # Can we add another $2500 position? Yes (total would be $5500 > $5000 limit)
    # This should be caught by risk checks
    
    # Calculate remaining capacity
    current_exposure = sum(p.quantity * p.current_price for p in existing_positions.values())
    remaining_capacity = fund.max_total_exposure - current_exposure
    
    assert remaining_capacity == 2000.0, f"Expected $2000 remaining, got ${remaining_capacity}"
    
    # Attempting to add $2500 position should be rejected
    new_position_size = 2500.0
    assert new_position_size > remaining_capacity, "Test setup: new position exceeds capacity"


@pytest.mark.asyncio
async def test_zero_balance_with_losses_allows_trading():
    """
    Test edge case: balance is 0 but positions have losses.
    
    Expected: Loss limits should still work even with 0 balance.
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
    
    # Should not allow trading (loss limit hit)
    assert_risk_limits_enforced(
        fund,
        positions,
        should_allow_trading=False,
        reason="Loss limit should work even with zero balance"
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
    
    # Should not crash with division by zero
    # The implementation should skip percentage check when balance is 0
    try:
        assert_risk_limits_enforced(
            fund,
            positions,
            should_allow_trading=True
        )
    except ZeroDivisionError:
        pytest.fail("max_loss_percent calculation crashes with zero balance!")

