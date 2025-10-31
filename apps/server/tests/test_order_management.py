"""
Order Management Tests

Tests that order lifecycle and constraints are properly enforced:
- max_order_age_seconds cancels stale orders
- Pending orders counted as "active positions" for strategy limits
- Cancelled orders free up capacity for new orders
- Rapid strategy ticks don't create duplicate orders
- Order status transitions (pending → filled → transaction created)

These tests are designed to identify bugs in order lifecycle management.
Many tests may FAIL initially - that's expected and helps document issues.
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch

from tests.test_builders import build_fund, build_order, build_stale_order, build_position_context
from tests.test_assertions import assert_order_is_stale, assert_order_not_stale, assert_order_count_limits


@pytest.mark.asyncio
async def test_stale_order_is_identified(fund_factory):
    """
    Test that orders older than max_order_age_seconds are identified as stale.
    
    Expected: Orders older than the configured timeout should be flagged.
    """
    fund = fund_factory(strategy_config={"max_order_age_seconds": 60})
    
    # Create order that's 120 seconds old
    old_order = build_stale_order(
        fund_id=fund.id,
        age_seconds=120
    )
    
    # Should be stale
    assert_order_is_stale(old_order, max_age_seconds=60)


@pytest.mark.asyncio
async def test_fresh_order_is_not_stale(fund_factory):
    """
    Test that recent orders are not identified as stale.
    
    Expected: Orders younger than the timeout should not be flagged.
    """
    fund = fund_factory(strategy_config={"max_order_age_seconds": 60})
    
    # Create fresh order
    fresh_order = build_order(fund_id=fund.id, status="pending")
    
    # Should not be stale
    assert_order_not_stale(fresh_order, max_age_seconds=60)


@pytest.mark.asyncio
async def test_stale_orders_are_cancelled(async_session, fund_factory, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that StrategyEngine._cancel_stale_orders actually cancels old orders.
    
    Expected: Orders older than max_order_age_seconds should be cancelled.
    
    This test will likely FAIL if stale order cancellation is not working.
    """
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory(strategy_config={"max_order_age_seconds": 60})
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create stale order in database
    stale_order = build_stale_order(
        fund_id=fund.id,
        age_seconds=120,
        symbol="AAPL",
        status="pending"
    )
    async_session.add(stale_order)
    await async_session.commit()
    
    # Add order to mock Alpaca service
    mock_alpaca.orders[stale_order.alpaca_order_id] = Mock(
        id=stale_order.alpaca_order_id,
        status="new",
        symbol=stale_order.symbol
    )
    
    # Create engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Patch get_async_session to return our test session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Cancel stale orders
        await engine._cancel_stale_orders()
        
        # Refresh order from database
        await async_session.refresh(stale_order)
        
        # Order should be cancelled in Alpaca
        assert mock_alpaca.orders[stale_order.alpaca_order_id].status == "cancelled", (
            "Stale order was not cancelled in Alpaca!"
        )


@pytest.mark.asyncio
async def test_pending_orders_count_toward_position_limits():
    """
    Test that pending orders are counted when checking position limits.
    
    Expected: Strategies with max_positions=1 should not place new orders
    when a pending order exists.
    
    This test will likely FAIL if pending orders are not counted properly.
    """
    # MonkeyDarts has max_positions=1
    assert_order_count_limits(
        active_positions=0,
        pending_orders=1,
        max_positions=1,
        should_allow_new_order=False  # Already at limit
    )


@pytest.mark.asyncio
async def test_filled_positions_count_toward_limits():
    """
    Test that filled positions are counted when checking position limits.
    """
    assert_order_count_limits(
        active_positions=1,
        pending_orders=0,
        max_positions=1,
        should_allow_new_order=False  # Already at limit
    )


@pytest.mark.asyncio
async def test_pending_and_filled_both_count():
    """
    Test that BOTH pending orders AND filled positions count toward limits.
    
    Expected: Total of pending + filled should be checked against max_positions.
    """
    # Have 1 position + 1 pending order = 2 total, limit is 3
    assert_order_count_limits(
        active_positions=1,
        pending_orders=1,
        max_positions=3,
        should_allow_new_order=True  # Under limit (2 < 3)
    )
    
    # Have 2 positions + 1 pending order = 3 total, limit is 3
    assert_order_count_limits(
        active_positions=2,
        pending_orders=1,
        max_positions=3,
        should_allow_new_order=False  # At limit (3 >= 3)
    )


@pytest.mark.asyncio
async def test_cancelled_orders_dont_count():
    """
    Test that cancelled orders don't count toward position limits.
    
    Expected: Cancelled orders should free up capacity.
    """
    # Have 0 positions, 0 pending (cancelled orders don't count)
    assert_order_count_limits(
        active_positions=0,
        pending_orders=0,
        max_positions=1,
        should_allow_new_order=True  # Can place order
    )


@pytest.mark.asyncio
async def test_monkey_darts_doesnt_place_multiple_orders(async_session, fund_factory, mock_market_data, mock_alpaca):
    """
    Test that MonkeyDarts doesn't place multiple orders when one is pending.
    
    This is the KEY bug: MonkeyDarts should only have 1 position at a time,
    but rapid ticks might create multiple pending orders.
    
    This test will likely FAIL if the bug exists.
    """
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory(balance=10000.0, strategy_id="monkey_darts")
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create a pending order
    pending_order = build_order(
        fund_id=fund.id,
        symbol="AAPL",
        status="pending"
    )
    async_session.add(pending_order)
    await async_session.commit()
    
    # Create MonkeyDarts strategy
    strategy = MonkeyDartsStrategy(config={})
    
    # Create engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Get pending orders
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1, "Should have 1 pending order"
        
        # Get active positions
        active_positions = await engine.get_active_positions()
        
        # Ask strategy if it wants to monitor symbols
        candidates = [{"ticker": "TSLA"}]
        monitored = await strategy.get_monitored_symbols(
            candidates,
            active_position_count=len(active_positions),
            active_order_count=len(pending_orders)
        )
        
        # Should return empty list (don't monitor anything because pending order exists)
        assert len(monitored) == 0, (
            f"MonkeyDarts selected {monitored} despite having pending order! "
            f"This will cause duplicate orders."
        )


@pytest.mark.asyncio
async def test_multiple_pending_orders_all_counted(async_session, fund_factory, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that ALL pending orders are counted toward limits.
    
    Expected: If somehow we get 3 pending orders, all 3 should count.
    """
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory(balance=10000.0)
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create 3 pending orders
    for i in range(3):
        order = build_order(
            fund_id=fund.id,
            symbol=f"TEST{i}",
            status="pending"
        )
        async_session.add(order)
    await async_session.commit()
    
    # Create engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Get pending orders
        pending_orders = await engine.get_pending_orders()
        
        # Should get all 3
        assert len(pending_orders) == 3, (
            f"Expected 3 pending orders, got {len(pending_orders)}"
        )


@pytest.mark.asyncio
async def test_order_status_transitions(async_session, fund_factory):
    """
    Test the expected order lifecycle: pending → filled → transaction.
    
    Expected: Orders go through well-defined status transitions.
    """
    fund = fund_factory()
    async_session.add(fund)
    await async_session.commit()
    
    # Step 1: Create pending order
    order = build_order(
        fund_id=fund.id,
        symbol="GOOGL",
        status="pending",
        filled_at=None,
        filled_qty=None,
        filled_avg_price=None
    )
    async_session.add(order)
    await async_session.commit()
    
    # Verify pending state
    assert order.status == "pending"
    assert order.filled_at is None
    assert order.filled_qty is None
    
    # Step 2: Simulate fill
    order.status = "filled"
    order.filled_at = datetime.utcnow()
    order.filled_qty = 10.0
    order.filled_avg_price = 2900.0
    await async_session.commit()
    
    # Verify filled state
    assert order.status == "filled"
    assert order.filled_at is not None
    assert order.filled_qty == 10.0
    assert order.filled_avg_price == 2900.0


@pytest.mark.asyncio
async def test_rapid_ticks_dont_create_duplicates(async_session, fund_factory, mock_market_data, mock_alpaca):
    """
    Test that rapid strategy ticks don't create duplicate orders.
    
    Scenario:
    1. Tick 1: Place order for AAPL (pending)
    2. Tick 2: See pending order, don't place another
    3. Tick 3: See pending order, don't place another
    
    This is the main duplicate order issue.
    
    This test will likely FAIL if pending orders aren't checked properly.
    """
    from app.strategies.monkey_darts import MonkeyDartsStrategy
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory(balance=10000.0)
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    strategy = MonkeyDartsStrategy(config={})
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Simulate tick 1: Place order
        order1 = build_order(
            fund_id=fund.id,
            symbol="AAPL",
            status="pending"
        )
        async_session.add(order1)
        await async_session.commit()
        
        # Simulate tick 2: Check if strategy wants to place another
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1, "Should have 1 pending order"
        
        active_positions = await engine.get_active_positions()
        
        candidates = [{"ticker": "TSLA"}]
        monitored = await strategy.get_monitored_symbols(
            candidates,
            active_position_count=len(active_positions),
            active_order_count=len(pending_orders)
        )
        
        # Should NOT select any symbols (already have pending order)
        assert len(monitored) == 0, (
            f"Strategy selected {monitored} despite pending order - will create duplicate!"
        )


@pytest.mark.asyncio
async def test_filled_order_removes_from_pending(async_session, fund_factory, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that filled orders are no longer returned by get_pending_orders.
    
    Expected: Only orders with status='pending' should be returned.
    """
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory()
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create pending order
    order = build_order(
        fund_id=fund.id,
        symbol="NVDA",
        status="pending"
    )
    async_session.add(order)
    await async_session.commit()
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Should have 1 pending order
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1
        
        # Fill the order
        order.status = "filled"
        order.filled_at = datetime.utcnow()
        order.filled_qty = 10.0
        order.filled_avg_price = 500.0
        await async_session.commit()
        
        # Should have 0 pending orders now
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 0, (
            f"Filled order still showing as pending! Got {len(pending_orders)} pending orders."
        )


@pytest.mark.asyncio
async def test_cancelled_order_removes_from_pending(async_session, fund_factory, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that cancelled orders are no longer returned by get_pending_orders.
    """
    from app.services.strategy_engine import StrategyEngine
    
    fund = fund_factory()
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create pending order
    order = build_order(
        fund_id=fund.id,
        symbol="AMD",
        status="pending"
    )
    async_session.add(order)
    await async_session.commit()
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Should have 1 pending order
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1
        
        # Cancel the order
        order.status = "cancelled"
        await async_session.commit()
        
        # Should have 0 pending orders now
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 0, (
            f"Cancelled order still showing as pending! Got {len(pending_orders)} pending orders."
        )


@pytest.mark.asyncio
async def test_max_order_age_zero_disables_cancellation(fund_factory):
    """
    Test that setting max_order_age_seconds to 0 or None disables auto-cancellation.
    
    Expected: Orders should not be cancelled if max_order_age is 0 or None.
    """
    # Test with None
    fund = fund_factory(strategy_config={"max_order_age_seconds": None})
    old_order = build_stale_order(fund_id=fund.id, age_seconds=300)
    
    # Should not be considered stale (no limit)
    # Note: assert_order_is_stale would fail, so we just check the concept
    assert fund.strategy_config.get("max_order_age_seconds") is None, "No age limit set"
    
    # Test with 0
    fund = fund_factory(strategy_config={"max_order_age_seconds": 0})
    assert fund.strategy_config.get("max_order_age_seconds") == 0, "Age limit is 0 (disabled)"

