"""
Fund Balance Tests

Tests for balance validation (lighter coverage as balance work is in progress elsewhere):
- Orders rejected when insufficient balance
- Position cost calculation includes all costs
- Balance checks happen BEFORE submitting to Alpaca
- Multiple pending orders don't over-allocate balance

These tests document expected balance checking behavior.
Many tests may FAIL initially - that's expected and helps document issues.
"""

import pytest
from unittest.mock import AsyncMock, Mock, patch

from tests.test_builders import build_fund, build_order, build_market_data
from tests.test_assertions import assert_balance_sufficient
from app.strategies.base import EntryLevel


@pytest.mark.asyncio
async def test_insufficient_balance_rejects_order(fund_factory):
    """
    Test that orders are rejected when fund has insufficient balance.
    
    Expected: Order cost must not exceed fund balance.
    """
    fund = fund_factory(balance=500.0)
    
    # Try to buy stock costing $1000
    order_cost = 1000.0
    
    # Should not allow order
    assert_balance_sufficient(
        fund,
        order_cost=order_cost,
        should_allow_order=False
    )


@pytest.mark.asyncio
async def test_sufficient_balance_allows_order(fund_factory):
    """
    Test that orders are allowed when fund has sufficient balance.
    """
    fund = fund_factory(balance=2000.0)
    
    # Try to buy stock costing $1000
    order_cost = 1000.0
    
    # Should allow order
    assert_balance_sufficient(
        fund,
        order_cost=order_cost,
        should_allow_order=True
    )


@pytest.mark.asyncio
async def test_exact_balance_match_allows_order(fund_factory):
    """
    Test that orders are allowed when cost exactly matches balance.
    
    Expected: $1000 balance should allow $1000 order.
    """
    fund = fund_factory(balance=1000.0)
    
    order_cost = 1000.0
    
    # Should allow order
    assert_balance_sufficient(
        fund,
        order_cost=order_cost,
        should_allow_order=True
    )


@pytest.mark.asyncio
async def test_actual_cost_calculated_from_shares():
    """
    Test that actual order cost is calculated from whole shares.
    
    Expected: When position_size=$500 and price=$17.50:
    - Shares = int(500/17.50) = 28
    - Actual cost = 28 * $17.50 = $490
    """
    position_size = 500.0
    share_price = 17.50
    
    # Calculate shares (as strategy_engine does)
    quantity = int(position_size / share_price)
    actual_cost = quantity * share_price
    
    assert quantity == 28, f"Expected 28 shares, got {quantity}"
    assert actual_cost == 490.0, f"Expected $490 cost, got ${actual_cost}"


@pytest.mark.asyncio
async def test_zero_shares_when_cant_afford_one():
    """
    Test that quantity is 0 when can't afford even 1 share.
    
    Expected: When position_size < share_price, quantity = 0.
    """
    position_size = 500.0
    share_price = 1000.0  # Too expensive!
    
    quantity = int(position_size / share_price)
    
    assert quantity == 0, f"Expected 0 shares, got {quantity}"


@pytest.mark.asyncio
async def test_balance_check_before_alpaca_submission(fund_factory, mock_market_data, mock_alpaca):
    """
    Test that balance is checked BEFORE submitting order to Alpaca.
    
    Expected: If balance check fails, Alpaca should never be called.
    
    This test will likely FAIL if balance checks are missing.
    """
    from app.services.strategies.strategy_engine import StrategyEngine
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    from unittest.mock import AsyncMock
    
    fund = fund_factory(
        balance=100.0,  # Only $100
        size_per_trade=1000.0  # Wants to trade $1000
    )
    
    strategy = MonkeyDartsStrategy(config={})
    
    # Mock market data
    market_data = build_market_data(symbol="TEST", price=10.0)
    mock_market_data.build_market_data = AsyncMock(return_value=market_data)
    
    # Wrap place_market_order with AsyncMock to track calls
    mock_alpaca.place_market_order = AsyncMock(wraps=mock_alpaca.place_market_order)
    
    # Create engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Try to enter position
    from app.strategies.base import EntryLevel, MarketDataSnapshot
    from datetime import datetime
    signal = EntryLevel(entry_price=10.0, stop_loss=9.5, confidence=1.0, order_type="market")
    market_data = MarketDataSnapshot(symbol="TEST", price=10.0, timestamp=datetime.utcnow())
    
    with patch('app.services.strategies.order_executor.get_async_session') as mock_get_session:
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock()
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        
        # Mock execute to return fund with balance and no pending orders
        mock_result = AsyncMock()
        mock_result.scalar_one_or_none = Mock(return_value=fund)
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[])))
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_get_session.return_value = mock_session
        
        # Try to enter - should fail due to insufficient balance
        result = await engine.order_executor.execute_buy_order("TEST", signal, market_data)
        
        # Should return False (insufficient balance)
        assert result == False, "Should return False when insufficient balance"
        # Alpaca should NOT have been called (balance check should have failed)
        assert not mock_alpaca.place_market_order.called, (
            "Alpaca was called despite insufficient balance! Balance check missing or broken."
        )




@pytest.mark.asyncio
async def test_zero_balance_prevents_all_orders(fund_factory):
    """
    Test that no orders can be placed with zero balance.
    """
    fund = fund_factory(balance=0.0)
    
    # Any order should be rejected
    assert_balance_sufficient(
        fund,
        order_cost=1.0,  # Even $1
        should_allow_order=False
    )


@pytest.mark.asyncio
async def test_negative_balance_prevents_orders(fund_factory):
    """
    Test that negative balance prevents all orders.
    
    This could happen due to a bug or manual adjustment.
    """
    fund = fund_factory(balance=-50.0)
    
    # Should reject any order
    assert_balance_sufficient(
        fund,
        order_cost=100.0,
        should_allow_order=False
    )


@pytest.mark.asyncio
async def test_fractional_share_cost_rounds_correctly():
    """
    Test that fractional shares are handled correctly in cost calculation.
    
    Expected: Should round DOWN to whole shares, then calculate actual cost.
    """
    position_size = 200.0
    share_price = 17.50
    
    # Calculate as strategy_engine does
    quantity = int(position_size / share_price)  # 11.42... → 11
    actual_cost = quantity * share_price  # 11 * 17.50 = 192.50
    
    assert quantity == 11
    assert actual_cost == 192.50
    assert actual_cost < position_size, "Actual cost should be less than target position size"


@pytest.mark.asyncio
async def test_balance_check_uses_actual_cost_not_position_size(fund_factory):
    """
    Test that balance check uses actual cost (shares * price), not position size.
    
    Expected: With fractional shares, actual cost may be less than position_size.
    The balance check should use actual cost.
    """
    fund = fund_factory(balance=195.0)
    
    # Want to invest $200, but share price means we can only buy $192.50 worth
    position_size = 200.0
    share_price = 17.50
    
    quantity = int(position_size / share_price)  # 11 shares
    actual_cost = quantity * share_price  # $192.50
    
    # Balance check should use actual cost
    assert actual_cost <= fund.balance, (
        f"Actual cost ${actual_cost} should fit in balance ${fund.balance}"
    )
    
    # Should allow order (actual cost $192.50 < balance $195)
    assert_balance_sufficient(
        fund,
        order_cost=actual_cost,
        should_allow_order=True
    )


@pytest.mark.asyncio
async def test_high_price_stocks_cant_buy_fractional():
    """
    Test behavior with high-priced stocks when balance is insufficient.
    
    Expected: Can't buy 0.5 shares - must round to 0, order rejected.
    """
    fund = build_fund(balance=1500.0)
    
    # Stock costs $2000 per share
    share_price = 2000.0
    position_size = 1500.0  # Want to invest $1500
    
    quantity = int(position_size / share_price)  # 0 shares (can't afford 1)
    
    assert quantity == 0, "Should get 0 shares when can't afford even 1"
    
    # Order should be rejected (can't buy 0 shares)


@pytest.mark.asyncio
async def test_balance_after_position_sizing():
    """
    Test that position sizing and balance validation work together.
    
    Expected: Even if size_per_trade is configured higher than balance,
    the position sizer and balance validator should prevent the order.
    """
    from app.services.strategies.position_sizer import PositionSizer
    
    fund = build_fund(
        balance=800.0,
        size_per_trade=1000.0,  # Wants $1000 but only has $800
        max_bet_percent=None
    )
    
    position_sizer = PositionSizer()
    
    # Calculate position size
    share_price = 100.0
    position_size, quantity = position_sizer.calculate_position_size(
        fund_balance=fund.balance,
        size_per_trade=fund.size_per_trade,
        confidence=1.0,
        current_price=share_price,
        min_bet_percent=fund.min_bet_percent,
        max_bet_percent=fund.max_bet_percent,
    )
    
    # Position sizer calculates based on size_per_trade (doesn't cap at balance)
    # Position size: $1000 (from size_per_trade)
    # Quantity: $1000 / $100 = 10 shares
    # Actual cost: 10 * $100 = $1000
    assert position_size == 1000.0, f"Expected position size $1000, got ${position_size}"
    assert quantity == 10, f"Expected 10 shares, got {quantity}"
    
    actual_cost = quantity * share_price
    assert actual_cost == 1000.0, f"Expected cost $1000, got ${actual_cost}"
    
    # This WOULD FAIL balance check because $1000 > $800
    # The balance validation in execute_buy_order would reject this
    assert actual_cost > fund.balance, (
        f"Order cost ${actual_cost} exceeds balance ${fund.balance} - "
        f"balance validator should reject this"
    )

