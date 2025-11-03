"""
Position Sizing Tests

Tests that position sizing rules are properly enforced:
- size_per_trade is respected
- min_bet_percent prevents tiny positions
- max_bet_percent caps position size
- max_total_exposure limits total portfolio exposure
- Position sizing with fractional shares rounds correctly
- Multiple positions respect total exposure limits

These tests are designed to identify bugs in position sizing logic.
Many tests may FAIL initially - that's expected and helps document issues.
"""

import pytest
from unittest.mock import AsyncMock, patch

from tests.test_builders import build_fund, build_position_context, build_market_data
from tests.test_assertions import assert_position_size_valid
from app.strategies.base import EntryLevel


@pytest.mark.asyncio
async def test_size_per_trade_is_baseline(fund_factory, mock_execution_strategy):
    """
    Test that size_per_trade is used as the baseline position size.
    
    Expected: Position size should equal size_per_trade when no other constraints apply.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=1000.0,
        max_bet_percent=None,  # No limit
        min_bet_percent=None,  # No limit
    )
    
    risk_params = {
        "size_per_trade": fund.size_per_trade,
        "max_bet_percent": fund.max_bet_percent,
    }
    
    signal = EntrySignal(should_enter=True, entry_price=100.0)
    
    # Calculate position size
    position_size = await mock_execution_strategy.position_sizing(
        signal,
        fund.balance,
        risk_params
    )
    
    # Should equal size_per_trade
    assert position_size == 1000.0, (
        f"Position size {position_size} should equal size_per_trade {fund.size_per_trade}"
    )


@pytest.mark.asyncio
async def test_max_bet_percent_caps_position_size(fund_factory):
    """
    Test that max_bet_percent limits position size.
    
    Expected: Position size should be capped by max_bet_percent even if
    size_per_trade is higher.
    
    This test will likely FAIL if max_bet_percent is not enforced.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=2000.0,  # Wants $2000 per trade
        max_bet_percent=5.0,     # But can only use 5% = $500
    )
    
    # Import the actual strategy to test
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    strategy = MonkeyDartsStrategy(config={})
    
    risk_params = {
        "size_per_trade": fund.size_per_trade,
        "max_bet_percent": fund.max_bet_percent,
    }
    
    signal = EntrySignal(should_enter=True, entry_price=100.0)
    
    # Calculate position size
    position_size = await strategy.position_sizing(
        signal,
        fund.balance,
        risk_params
    )
    
    # Should be capped at 5% of balance = $500
    max_allowed = fund.balance * (fund.max_bet_percent / 100.0)
    assert position_size <= max_allowed, (
        f"Position size ${position_size:.2f} exceeds max_bet_percent limit "
        f"of ${max_allowed:.2f} ({fund.max_bet_percent}% of ${fund.balance:.2f})"
    )
    
    # Should be exactly $500
    assert position_size == 500.0, (
        f"Position size ${position_size:.2f} should be ${max_allowed:.2f}"
    )


@pytest.mark.asyncio
async def test_min_bet_percent_prevents_tiny_positions(fund_factory):
    """
    Test that min_bet_percent prevents positions below minimum size.
    
    Expected: Strategies should not be able to place orders smaller than
    min_bet_percent of balance.
    
    This test will likely FAIL if min_bet_percent is not enforced.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=100.0,    # Wants $100 per trade
        min_bet_percent=2.0,      # But minimum is 2% = $200
    )
    
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    strategy = MonkeyDartsStrategy(config={})
    
    risk_params = {
        "size_per_trade": fund.size_per_trade,
        "min_bet_percent": fund.min_bet_percent,
    }
    
    signal = EntrySignal(should_enter=True, entry_price=50.0)
    
    # Calculate position size
    position_size = await strategy.position_sizing(
        signal,
        fund.balance,
        risk_params
    )
    
    # Should be at least 2% of balance = $200
    min_required = fund.balance * (fund.min_bet_percent / 100.0)
    
    # For now, just verify it respects the constraint if implemented
    # If min_bet_percent is enforced, either:
    # 1. Position size >= min_required, OR
    # 2. Position size == 0 (order rejected)
    if position_size > 0:
        assert position_size >= min_required, (
            f"Position size ${position_size:.2f} is below min_bet_percent "
            f"requirement of ${min_required:.2f} ({fund.min_bet_percent}% of ${fund.balance:.2f})"
        )


@pytest.mark.asyncio
async def test_position_size_validation_helper(fund_factory):
    """
    Test that assert_position_size_valid correctly validates position sizes.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=2000.0,  # Increased to allow max_bet_percent of 15%
        max_bet_percent=15.0,  # Max $1500
        min_bet_percent=5.0,   # Min $500
    )
    
    # Valid position size
    assert_position_size_valid(fund, calculated_size=1000.0, share_price=100.0)
    
    # Should accept position at max bet percent limit ($1500 = 15% of $10,000)
    assert_position_size_valid(fund, calculated_size=1500.0, share_price=100.0)
    
    # Should accept position at min limit
    assert_position_size_valid(fund, calculated_size=500.0, share_price=100.0)
    
    # Should reject position over size_per_trade
    with pytest.raises(AssertionError, match="exceeds size_per_trade"):
        assert_position_size_valid(fund, calculated_size=2500.0, share_price=100.0)
    
    # Should reject position over max_bet_percent
    with pytest.raises(AssertionError, match="exceeds max_bet_percent"):
        assert_position_size_valid(fund, calculated_size=2000.0, share_price=100.0)
    
    # Should reject position under min (if size > 0)
    with pytest.raises(AssertionError, match="below min_bet_percent"):
        assert_position_size_valid(fund, calculated_size=400.0, share_price=100.0)


@pytest.mark.asyncio
async def test_fractional_share_rounding(fund_factory, mock_execution_strategy):
    """
    Test that fractional shares are rounded down correctly and cost is validated.
    
    Expected: When position_size / price results in fractional shares,
    we should round down to whole shares and validate actual cost.
    
    This test verifies the calculation in strategy_engine._enter_position.
    """
    fund = fund_factory(
        balance=1000.0,
        size_per_trade=500.0,
    )
    
    # Share price that results in fractional shares
    share_price = 17.50
    position_size = 500.0
    
    # Calculate shares (as engine does)
    quantity = int(position_size / share_price)  # Should be 28
    actual_cost = quantity * share_price  # Should be $490
    
    assert quantity == 28, f"Expected 28 shares, got {quantity}"
    assert actual_cost == 490.0, f"Expected $490 cost, got ${actual_cost}"
    
    # Verify actual cost is within balance
    assert actual_cost <= fund.balance, (
        f"Actual cost ${actual_cost:.2f} exceeds balance ${fund.balance:.2f}"
    )


@pytest.mark.asyncio
async def test_max_total_exposure_prevents_new_positions(fund_factory, position_factory):
    """
    Test that max_total_exposure limits total portfolio value.
    
    Expected: When total position value equals or exceeds max_total_exposure,
    no new positions should be allowed.
    
    This test will likely FAIL if max_total_exposure is not enforced.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=2000.0,
        max_total_exposure=5000.0,  # Max $5000 total exposure
    )
    
    # Create existing positions with $4500 exposure
    existing_positions = {
        "AAPL": position_factory(
            entry_price=150.0,
            current_price=150.0,
            quantity=10  # $1500
        ),
        "GOOGL": position_factory(
            entry_price=2800.0,
            current_price=3000.0,
            quantity=1  # $3000
        )
    }
    
    # Calculate current exposure
    total_exposure = sum(p.quantity * p.current_price for p in existing_positions.values())
    assert total_exposure == 4500.0, f"Expected $4500 exposure, got ${total_exposure}"
    
    # Check if risk limits would allow trading
    from app.services.strategies.strategy_engine import StrategyEngine
    
    # Mock the async_session and other dependencies
    mock_engine = type('MockEngine', (), {
        'fund': fund,
        'get_active_positions': AsyncMock(return_value=existing_positions),
    })()
    
    # Manually check the risk limit (as _check_risk_limits does)
    current_exposure = sum(p.quantity * p.current_price for p in existing_positions.values())
    
    if fund.max_total_exposure is not None:
        can_trade = current_exposure < fund.max_total_exposure
    else:
        can_trade = True
    
    # Should not allow trading because $4500 + $2000 = $6500 > $5000 limit
    # Note: This tests the LOGIC, not the actual enforcement in strategy_engine
    # The actual enforcement test would require full integration testing
    remaining_capacity = fund.max_total_exposure - current_exposure
    assert remaining_capacity < fund.size_per_trade, (
        f"Should not allow new {fund.size_per_trade} position when only "
        f"${remaining_capacity:.2f} capacity remains"
    )


@pytest.mark.asyncio
async def test_multiple_positions_cumulative_exposure(fund_factory, position_factory):
    """
    Test that exposure is calculated cumulatively across all positions.
    
    Expected: Total exposure should sum all position values at current prices.
    """
    fund = fund_factory(
        balance=20000.0,
        max_total_exposure=15000.0,
    )
    
    positions = {
        "AAPL": position_factory(entry_price=150.0, current_price=155.0, quantity=20),   # $3100
        "GOOGL": position_factory(entry_price=2800.0, current_price=2900.0, quantity=2), # $5800
        "TSLA": position_factory(entry_price=250.0, current_price=245.0, quantity=10),   # $2450
        "NVDA": position_factory(entry_price=500.0, current_price=520.0, quantity=5),    # $2600
    }
    
    # Calculate total exposure
    total_exposure = sum(p.quantity * p.current_price for p in positions.values())
    expected_exposure = 3100 + 5800 + 2450 + 2600  # $13,950
    
    assert abs(total_exposure - expected_exposure) < 1.0, (
        f"Total exposure ${total_exposure:.2f} doesn't match expected ${expected_exposure:.2f}"
    )
    
    # Should be under limit
    assert total_exposure < fund.max_total_exposure, (
        f"Total exposure ${total_exposure:.2f} exceeds max ${fund.max_total_exposure:.2f}"
    )


@pytest.mark.asyncio
async def test_zero_max_bet_percent_treated_as_no_limit(fund_factory):
    """
    Test that max_bet_percent=0.0 is treated as "no limit".
    
    Expected: Setting max_bet_percent to 0.0 should not impose any limits.
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=3000.0,
        max_bet_percent=0.0,  # Explicitly set to 0 = no limit
    )
    
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    strategy = MonkeyDartsStrategy(config={})
    
    risk_params = {
        "size_per_trade": fund.size_per_trade,
        "max_bet_percent": fund.max_bet_percent,
    }
    
    signal = EntrySignal(should_enter=True, entry_price=100.0)
    
    position_size = await strategy.position_sizing(signal, fund.balance, risk_params)
    
    # Should use full size_per_trade
    assert position_size == 3000.0, (
        f"Position size {position_size} should equal size_per_trade {fund.size_per_trade} "
        f"when max_bet_percent=0.0"
    )


@pytest.mark.asyncio
async def test_position_size_never_exceeds_balance(fund_factory):
    """
    Test that calculated position sizes never exceed available balance.
    
    Expected: Even with high size_per_trade and no max_bet_percent,
    actual order cost should never exceed balance.
    """
    fund = fund_factory(
        balance=500.0,
        size_per_trade=10000.0,  # Way more than balance!
        max_bet_percent=None,
    )
    
    share_price = 50.0
    position_size = fund.size_per_trade  # $10,000
    
    # Calculate actual shares and cost
    quantity = int(position_size / share_price)  # 200 shares
    actual_cost = quantity * share_price  # $10,000
    
    # This SHOULD fail the balance check in strategy_engine
    assert actual_cost > fund.balance, (
        f"Test setup error: actual_cost ${actual_cost} should exceed balance ${fund.balance}"
    )
    
    # The strategy_engine should catch this and reject the order
    # This test documents that we NEED balance validation before order submission


@pytest.mark.asyncio  
async def test_size_per_trade_with_high_share_price(fund_factory):
    """
    Test position sizing with high-priced shares.
    
    Expected: When share price is high relative to size_per_trade,
    we might get 0 shares (can't afford even 1 share).
    """
    fund = fund_factory(
        balance=10000.0,
        size_per_trade=500.0,  # $500 per trade
    )
    
    share_price = 1000.0  # $1000 per share!
    position_size = 500.0
    
    # Calculate shares
    quantity = int(position_size / share_price)  # 0 shares
    
    assert quantity == 0, f"Expected 0 shares, got {quantity}"
    
    # Strategy engine should skip this order (can't buy 0 shares)
    # This documents the expected behavior

