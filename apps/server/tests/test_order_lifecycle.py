"""
Order Lifecycle and Position Management Tests

Tests to ensure proper order lifecycle management and prevent multiple orders
from being placed when a strategy should only have one active position.

These tests focus on the core issue: strategies must consider PENDING orders
as "active positions" to prevent placing multiple orders.
"""

import uuid
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch

import pytest

from app.models.strategies import Fund, Order, Transaction
from app.services.strategy_engine import StrategyEngine


@pytest.mark.asyncio
async def test_pending_order_prevents_new_order(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that a pending buy order prevents placing another order.
    
    This is the CORE issue: MonkeyDarts should only have 1 active position,
    but it's placing multiple orders because it only counts FILLED positions.
    
    Expected behavior:
    1. Place order for AAPL (pending)
    2. Try to place another order
    3. Should be rejected because we have a pending order (active position = 1)
    
    This test will FAIL with current implementation.
    """
    # Create fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create a pending order (not yet filled)
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10,
        order_type="market",
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Mock the strategy engine's database session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # ASSERTION 1: get_pending_orders() should return the pending order
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1, f"Expected 1 pending order, got {len(pending_orders)}"
        assert pending_orders[0].symbol == "AAPL"
        
        # ASSERTION 2: get_active_positions() should return 0 (no filled positions yet)
        active_positions = await engine.get_active_positions()
        assert len(active_positions) == 0, f"Expected 0 filled positions, got {len(active_positions)}"
        
        # ASSERTION 3: THE KEY TEST - When we ask the strategy if it wants to monitor symbols,
        # it should say NO because it sees the pending order
        candidates = [{"ticker": "TSLA"}]
        monitored = await mock_execution_strategy.get_monitored_symbols(
            candidates,
            active_position_count=len(active_positions),
            active_order_count=len(pending_orders)
        )
        assert len(monitored) == 0, (
            f"Strategy should not select symbols when pending order exists! "
            f"Got {monitored} - this means multiple orders would be placed!"
        )


@pytest.mark.asyncio
async def test_multiple_pending_orders_all_counted(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that multiple pending orders are all counted.
    
    If a strategy somehow gets 3 pending orders, all 3 should be counted
    as active positions to prevent placing more.
    
    This test will FAIL if pending orders aren't properly counted.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Multi Order Fund",
        mode="sim",
        balance=50000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create 3 pending orders
    for i in range(3):
        order = Order(
            id=str(uuid.uuid4()),
            alpaca_order_id=str(uuid.uuid4()),
            fund_id=fund.id,
            symbol=f"TEST{i}",
            side="buy",
            quantity=10,
            order_type="market",
            status="pending",
            submitted_at=datetime.utcnow(),
        )
        async_session.add(order)
    
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # ASSERTION 1: get_pending_orders() should return all 3 pending orders
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 3, f"Expected 3 pending orders, got {len(pending_orders)}"
        
        # ASSERTION 2: Strategy should not select symbols when 3 pending orders exist
        candidates = [{"ticker": "TSLA"}]
        monitored = await mock_execution_strategy.get_monitored_symbols(
            candidates,
            active_position_count=0,
            active_order_count=len(pending_orders)
        )
        assert len(monitored) == 0, (
            f"Strategy should not select symbols with 3 pending orders! "
            f"Got {monitored}"
        )


@pytest.mark.asyncio
async def test_filled_order_counts_as_position(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that a filled order creates a transaction and counts as a position.
    
    This should already work, but let's verify.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Filled Order Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create a filled order
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="TSLA",
        side="buy",
        quantity=5,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=5.0,
        filled_avg_price=200.0,
    )
    async_session.add(order)
    
    # Create corresponding transaction
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=order.id,
        alpaca_order_id=order.alpaca_order_id,
        fund_id=fund.id,
        symbol="TSLA",
        side="buy",
        quantity=5.0,
        price=200.0,
        total_value=1000.0,
        timestamp=datetime.utcnow(),
        high_water_mark=200.0,
        strategy_state={},
    )
    async_session.add(transaction)
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Mock Alpaca to return the position
    mock_alpaca.positions["TSLA"] = Mock(
        symbol="TSLA",
        qty=5.0,
        avg_entry_price=200.0,
        current_price=205.0,
        market_value=1025.0,
        unrealized_pl=25.0,
        unrealized_plpc=0.025,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # ASSERTION 1: get_pending_orders() should return 0 (order is filled)
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 0, f"Expected 0 pending orders (filled), got {len(pending_orders)}"
        
        # ASSERTION 2: get_active_positions() should return the filled position from Alpaca
        active_positions = await engine.get_active_positions()
        assert len(active_positions) >= 1, f"Expected 1 active position (filled), got {len(active_positions)}"
        assert "TSLA" in active_positions, "TSLA position should be in active positions"


@pytest.mark.asyncio
async def test_stale_order_cancellation(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that stale orders (older than max_order_age_seconds) are cancelled.
    
    Expected behavior:
    1. Create an order that's 120 seconds old
    2. Fund has max_order_age_seconds=60
    3. Strategy engine should cancel the stale order
    
    This test may FAIL if stale order cancellation isn't working properly.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Stale Order Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={"max_order_age_seconds": 60},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create an old order (2 minutes ago)
    old_time = datetime.utcnow() - timedelta(seconds=120)
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="NVDA",
        side="buy",
        quantity=10,
        order_type="market",
        status="pending",
        submitted_at=old_time,
    )
    async_session.add(order)
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Manually add the order to Alpaca mock
    mock_alpaca.orders[order.alpaca_order_id] = Mock(
        id=order.alpaca_order_id,
        status="new",
        symbol=order.symbol,
        side=order.side,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Call stale order cancellation
        await engine._cancel_stale_orders()
        
        # Refresh order from database
        await async_session.refresh(order)
        
        # ASSERTION: Order should be cancelled in Alpaca
        alpaca_order = mock_alpaca.orders.get(order.alpaca_order_id)
        assert alpaca_order.status == "cancelled", f"Expected order to be cancelled, got status: {alpaca_order.status}"


@pytest.mark.asyncio
async def test_order_lifecycle_full_flow(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test complete order lifecycle: place → pending → filled → transaction.
    
    This tests the happy path to ensure all pieces work together.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Lifecycle Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Step 1: Create a pending order
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="GOOGL",
        side="buy",
        quantity=7,
        order_type="market",
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # ASSERTION 1: Order exists and is pending
    assert order.status == "pending"
    assert order.filled_at is None
    
    # Step 2: Simulate order fill
    order.status = "filled"
    order.filled_at = datetime.utcnow()
    order.filled_qty = 7.0
    order.filled_avg_price = 140.0
    await async_session.commit()
    
    # Step 3: Create transaction
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=order.id,
        alpaca_order_id=order.alpaca_order_id,
        fund_id=fund.id,
        symbol="GOOGL",
        side="buy",
        quantity=7.0,
        price=140.0,
        total_value=980.0,
        timestamp=order.filled_at,
        high_water_mark=140.0,
        strategy_state={},
    )
    async_session.add(transaction)
    await async_session.commit()
    
    # ASSERTION 2: Transaction created and linked to order
    assert transaction.order_id == order.id
    assert transaction.symbol == order.symbol
    assert transaction.quantity == order.filled_qty
    
    # ASSERTION 3: Mock Alpaca to show the filled position
    mock_alpaca.positions["GOOGL"] = Mock(
        symbol="GOOGL",
        qty=7.0,
        avg_entry_price=140.0,
        current_price=145.0,
        market_value=1015.0,
        unrealized_pl=35.0,
        unrealized_plpc=0.025,
    )
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # ASSERTION 4: Order is no longer pending
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 0, "No pending orders after fill"
        
        # ASSERTION 5: Position shows up in Alpaca
        active_positions_dict = await engine.get_active_positions()
        assert len(active_positions_dict) >= 1, "Filled order should count as active position in Alpaca"
        assert "GOOGL" in active_positions_dict, "GOOGL position should be visible"


@pytest.mark.asyncio
async def test_rapid_strategy_ticks_dont_create_multiple_orders(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that rapid strategy execution doesn't create multiple orders.
    
    Scenario:
    1. Strategy runs at T=0, places order for AAPL
    2. Strategy runs at T=1s, sees pending order, doesn't place another
    3. Strategy runs at T=2s, sees pending order, doesn't place another
    
    This is the MAIN issue: rapid ticks creating multiple orders.
    This test will likely FAIL.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Rapid Tick Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={"max_order_age_seconds": 60},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Simulate first tick - places order
        order1 = Order(
            id=str(uuid.uuid4()),
            alpaca_order_id=str(uuid.uuid4()),
            fund_id=fund.id,
            symbol="AAPL",
            side="buy",
            quantity=10,
            order_type="market",
            status="pending",
            submitted_at=datetime.utcnow(),
        )
        async_session.add(order1)
        await async_session.commit()
        
        # ASSERTION 1: Check pending orders after first tick
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 1, f"Expected 1 pending order after first tick, got {len(pending_orders)}"
        
        # ASSERTION 2: Check active positions (should be 0, order not filled yet)
        active_positions = await engine.get_active_positions()
        assert len(active_positions) == 0, f"Expected 0 filled positions, got {len(active_positions)}"
        
        # ASSERTION 3: THE CRITICAL TEST - Strategy should NOT select new symbols
        # because it sees the pending order
        candidates = [{"ticker": "TSLA"}]
        monitored = await mock_execution_strategy.get_monitored_symbols(
            candidates,
            active_position_count=len(active_positions),
            active_order_count=len(pending_orders)
        )
        assert len(monitored) == 0, (
            f"Strategy should NOT select symbols when pending order exists! "
            f"Got {monitored} - this means multiple orders would be placed!"
        )


@pytest.mark.asyncio
async def test_cancelled_order_doesnt_count_as_active(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that cancelled orders don't count as active positions.
    
    A cancelled order should free up the "slot" for a new order.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Cancelled Order Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="monkey_darts",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create a cancelled order
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AMD",
        side="buy",
        quantity=15,
        order_type="market",
        status="cancelled",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Create strategy engine with mocks
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # ASSERTION 1: Cancelled order should NOT show in pending orders
        pending_orders = await engine.get_pending_orders()
        assert len(pending_orders) == 0, f"Expected 0 pending orders (cancelled), got {len(pending_orders)}"
        
        # ASSERTION 2: No active positions from Alpaca
        active_positions = await engine.get_active_positions()
        assert len(active_positions) == 0, f"Expected 0 active positions (cancelled order), got {len(active_positions)}"
        
        # ASSERTION 3: Strategy SHOULD be able to select new symbols (slot is free)
        candidates = [{"ticker": "NVDA"}]
        monitored = await mock_execution_strategy.get_monitored_symbols(
            candidates,
            active_position_count=len(active_positions),
            active_order_count=len(pending_orders)
        )
        assert len(monitored) == 1, (
            f"Strategy SHOULD select symbols when no pending orders/positions exist! "
            f"Got {monitored}"
        )

