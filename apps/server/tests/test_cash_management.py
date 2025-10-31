"""
Cash Management Tests

Tests to ensure the system properly validates cash availability before placing orders,
preventing negative cash balances.

These tests validate:
1. Pending order cost calculation uses correct per-symbol prices
2. Available balance properly accounts for pending orders
3. Orders are blocked when insufficient cash available
4. Normal orders still work when sufficient cash available
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock

import pytest

from app.models.strategies import Fund, Order
from app.services.strategy_engine import StrategyEngine
from app.strategies.base import PositionContext, EntrySignal, MarketData


@pytest.mark.asyncio
async def test_pending_order_cost_uses_correct_prices(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that pending order cost calculation uses the correct price for each symbol.
    
    This is the core fix: previously used the current symbol's price for ALL pending orders,
    which caused incorrect cash validation.
    """
    # Create fund with limited balance
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=5000.0,  # Only $5000 available
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create two pending orders for different symbols at different prices
    # Order 1: AAPL at $150/share, 10 shares = $1500
    order1 = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        estimated_price=150.0,
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    
    # Order 2: TSLA at $250/share, 5 shares = $1250
    order2 = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="TSLA",
        side="buy",
        quantity=5.0,
        order_type="market",
        estimated_price=250.0,
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    
    async_session.add_all([order1, order2])
    await async_session.commit()
    
    # Total pending: $1500 + $1250 = $2750
    # Available balance: $5000 - $2750 = $2250
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Create entry signal for GOOGL at $100/share, want 30 shares = $3000
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=100.0,
        reason="test_entry"
    )
    
    # Create market data for GOOGL
    market_data = MarketData(
        symbol="GOOGL",
        price=100.0,
        timestamp=datetime.utcnow(),
        volume=1000000,
    )
    
    # Mock get_async_session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Try to enter position - should be BLOCKED because:
        # Need: $3000
        # Available: $2250 (after accounting for pending orders)
        await engine._enter_position("GOOGL", entry_signal, market_data)
    
    # Verify NO order was placed (insufficient balance)
    from sqlalchemy import select
    stmt = select(Order).where(
        Order.fund_id == fund.id,
        Order.symbol == "GOOGL"
    )
    result = await async_session.execute(stmt)
    googl_orders = result.scalars().all()
    
    assert len(googl_orders) == 0, "Should not place order when insufficient balance"


@pytest.mark.asyncio
async def test_cash_validation_without_estimated_price(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test cash validation for older orders without estimated_price field.
    
    Should fall back to fetching current price.
    """
    # Create fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=3000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create pending order WITHOUT estimated_price (simulating old order)
    order = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        # estimated_price=None (not set)
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock market data provider to return price for AAPL
    mock_market_data.get_latest_quote = AsyncMock(return_value={
        'price': 150.0,
        'timestamp': datetime.now(timezone.utc)
    })
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Try to enter position for GOOGL at $200/share, 10 shares = $2000
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=200.0,
        reason="test_entry"
    )
    
    market_data = MarketData(
        symbol="GOOGL",
        price=200.0,
        timestamp=datetime.utcnow(),
        volume=1000000,
    )
    
    # Mock get_async_session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Try to enter position
        # Pending AAPL cost: 10 * $150 = $1500 (fetched from mock)
        # Available: $3000 - $1500 = $1500
        # Need: $2000
        # Should be BLOCKED
        await engine._enter_position("GOOGL", entry_signal, market_data)
    
    # Verify market data provider was called to get AAPL price
    mock_market_data.get_latest_quote.assert_called_with("AAPL")
    
    # Verify NO order was placed
    from sqlalchemy import select
    stmt = select(Order).where(
        Order.fund_id == fund.id,
        Order.symbol == "GOOGL"
    )
    result = await async_session.execute(stmt)
    googl_orders = result.scalars().all()
    
    assert len(googl_orders) == 0, "Should not place order when insufficient balance"


@pytest.mark.asyncio
async def test_sufficient_balance_allows_order(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that orders are still placed when sufficient balance is available.
    
    Ensures our fix doesn't break the happy path.
    """
    # Create fund with plenty of balance
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=10000.0,  # Plenty of cash
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create one pending order: AAPL at $100/share, 10 shares = $1000
    order1 = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        estimated_price=100.0,
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order1)
    await async_session.commit()
    
    # Available: $10000 - $1000 = $9000
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Try to enter position for GOOGL at $50/share, 20 shares = $1000
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=50.0,
        reason="test_entry"
    )
    
    market_data = MarketData(
        symbol="GOOGL",
        price=50.0,
        timestamp=datetime.utcnow(),
        volume=1000000,
    )
    
    # Mock get_async_session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Try to enter position - should SUCCEED
        # Need: $1000
        # Available: $9000
        await engine._enter_position("GOOGL", entry_signal, market_data)
    
    await async_session.commit()
    
    # Verify order WAS placed (sufficient balance)
    from sqlalchemy import select
    stmt = select(Order).where(
        Order.fund_id == fund.id,
        Order.symbol == "GOOGL",
        Order.side == "buy"
    )
    result = await async_session.execute(stmt)
    googl_orders = result.scalars().all()
    
    assert len(googl_orders) == 1, "Should place order when sufficient balance"
    assert googl_orders[0].quantity == 20.0
    assert googl_orders[0].estimated_price == 50.0


@pytest.mark.asyncio
async def test_multiple_pending_orders_different_prices(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test cash validation with multiple pending orders at vastly different prices.
    
    This scenario would have caused the bug: cheap and expensive stocks mixed.
    """
    # Create fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create pending orders at very different price points
    orders = [
        # Cheap stock: $5/share, 100 shares = $500
        Order(
            id=str(uuid.uuid4()),
            fund_id=fund.id,
            symbol="PENNY",
            side="buy",
            quantity=100.0,
            order_type="market",
            estimated_price=5.0,
            status="pending",
            submitted_at=datetime.utcnow(),
        ),
        # Mid-range: $150/share, 10 shares = $1500
        Order(
            id=str(uuid.uuid4()),
            fund_id=fund.id,
            symbol="AAPL",
            side="buy",
            quantity=10.0,
            order_type="market",
            estimated_price=150.0,
            status="pending",
            submitted_at=datetime.utcnow(),
        ),
        # Expensive: $1000/share, 5 shares = $5000
        Order(
            id=str(uuid.uuid4()),
            fund_id=fund.id,
            symbol="GOOGL",
            side="buy",
            quantity=5.0,
            order_type="market",
            estimated_price=1000.0,
            status="pending",
            submitted_at=datetime.utcnow(),
        ),
    ]
    
    async_session.add_all(orders)
    await async_session.commit()
    
    # Total pending: $500 + $1500 + $5000 = $7000
    # Available: $10000 - $7000 = $3000
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Try to buy TSLA at $250/share, 20 shares = $5000
    # This should be BLOCKED (need $5000, only have $3000 available)
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=250.0,
        reason="test_entry"
    )
    
    market_data = MarketData(
        symbol="TSLA",
        price=250.0,
        timestamp=datetime.utcnow(),
        volume=1000000,
    )
    
    # Mock get_async_session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        await engine._enter_position("TSLA", entry_signal, market_data)
    
    # Verify NO order was placed
    from sqlalchemy import select
    stmt = select(Order).where(
        Order.fund_id == fund.id,
        Order.symbol == "TSLA"
    )
    result = await async_session.execute(stmt)
    tsla_orders = result.scalars().all()
    
    assert len(tsla_orders) == 0, "Should not place order when insufficient balance after accounting for all pending orders"


@pytest.mark.asyncio
async def test_sell_orders_not_counted_in_pending_cost(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that pending SELL orders don't reduce available balance.
    
    Only pending BUY orders should reserve cash.
    """
    # Create fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        mode="sim",
        balance=5000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create mixed pending orders
    buy_order = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        estimated_price=100.0,  # $1000 reserved
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    
    sell_order = Order(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="GOOGL",
        side="sell",
        quantity=10.0,
        order_type="market",
        estimated_price=200.0,  # Should NOT reduce available balance
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    
    async_session.add_all([buy_order, sell_order])
    await async_session.commit()
    
    # Available balance: $5000 - $1000 (buy only) = $4000
    # (Sell order should not affect available balance)
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Try to buy TSLA at $100/share, 35 shares = $3500
    # Should SUCCEED (have $4000 available)
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=100.0,
        reason="test_entry"
    )
    
    market_data = MarketData(
        symbol="TSLA",
        price=100.0,
        timestamp=datetime.utcnow(),
        volume=1000000,
    )
    
    # Mock get_async_session
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        await engine._enter_position("TSLA", entry_signal, market_data)
    
    await async_session.commit()
    
    # Verify order WAS placed
    from sqlalchemy import select
    stmt = select(Order).where(
        Order.fund_id == fund.id,
        Order.symbol == "TSLA",
        Order.side == "buy"
    )
    result = await async_session.execute(stmt)
    tsla_orders = result.scalars().all()
    
    assert len(tsla_orders) == 1, "Should place order (sell orders don't reserve cash)"

