"""
Over-Selling Prevention Tests

Tests to ensure the system prevents selling more shares than owned,
which would create phantom profits.

These tests validate:
1. Position calculation from transaction history
2. Transaction creation caps over-sell attempts
3. Pre-trade validation blocks over-sell orders
4. Normal sells still work correctly
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import Mock, patch, AsyncMock

import pytest

from app.models.strategies import Fund, Order, Transaction
from app.services.trading.position_tracker import (
    get_position_quantity_from_transactions,
    get_all_positions_from_transactions
)
from app.services.trading.transaction_service import create_transaction
from app.services.strategies.strategy_engine import StrategyEngine
from app.strategies.base import PositionContext, StopUpdate, MarketDataSnapshot
from tests.test_builders import build_market_data


async def create_test_transaction(
    session,
    fund_id: str,
    symbol: str,
    side: str,
    quantity: float,
    price: float
) -> Transaction:
    """Helper to create a transaction with its associated order and update fund balance."""
    from app.models.strategies import Fund
    
    # Create order first
    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        fund_id=fund_id,
        symbol=symbol,
        side=side,
        quantity=quantity,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
    )
    session.add(order)
    await session.commit()
    
    # Update fund balance
    fund = await session.get(Fund, fund_id)
    if fund:
        total_value = quantity * price
        if side == "buy":
            fund.balance -= total_value
        else:  # sell
            fund.balance += total_value
        await session.commit()
    
    # Create transaction
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=order_id,
        fund_id=fund_id,
        symbol=symbol,
        side=side,
        quantity=quantity,
        price=price,
        total_value=quantity * price,
        timestamp=datetime.utcnow(),
    )
    return transaction


@pytest.mark.asyncio
async def test_position_calculation_from_transactions(async_session):
    """
    Test that position calculation correctly sums buys and subtracts sells.
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
    
    # Create transactions using helper
    buy1 = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 100.0, 150.0)
    buy2 = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 50.0, 155.0)
    sell1 = await create_test_transaction(async_session, fund.id, "AAPL", "sell", 30.0, 160.0)
    
    async_session.add_all([buy1, buy2, sell1])
    await async_session.commit()
    
    # Calculate position
    position_qty = await get_position_quantity_from_transactions(
        async_session, fund.id, "AAPL"
    )
    
    # Should be 100 + 50 - 30 = 120
    assert position_qty == 120.0, f"Expected 120.0, got {position_qty}"


@pytest.mark.asyncio
async def test_position_calculation_multiple_symbols(async_session):
    """
    Test position calculation for multiple symbols.
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
    
    # Create transactions for multiple symbols
    txn1 = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 100.0, 150.0)
    txn2 = await create_test_transaction(async_session, fund.id, "GOOGL", "buy", 20.0, 2800.0)
    txn3 = await create_test_transaction(async_session, fund.id, "AAPL", "sell", 50.0, 155.0)
    
    async_session.add_all([txn1, txn2, txn3])
    await async_session.commit()
    
    # Get all positions
    positions = await get_all_positions_from_transactions(async_session, fund.id)
    
    assert "AAPL" in positions
    assert "GOOGL" in positions
    assert positions["AAPL"] == 50.0  # 100 - 50
    assert positions["GOOGL"] == 20.0


@pytest.mark.asyncio
async def test_transaction_creation_caps_oversell(async_session, mock_alpaca):
    """
    Test that transaction creation caps quantity when attempting to sell more than owned.
    
    This is the critical fix: even if Alpaca says we sold 50 shares,
    if we only own 10, we should only create a transaction for 10.
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
    
    # Create initial buy transaction (own 10 shares)
    buy_txn = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 10.0, 150.0)
    async_session.add(buy_txn)
    await async_session.commit()
    
    # Create sell order (attempting to sell 50 shares, but we only own 10)
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="sell",
        quantity=50.0,
        order_type="market",
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Attempt to create transaction with over-sell (50 shares when only 10 owned)
    # This should be capped to 10 shares by validate_position=True
    from app.services.trading.transaction_service import create_transaction
    
    transaction = await create_transaction(
        session=async_session,
        fund_id=fund.id,
        symbol=order.symbol,
        transaction_type=order.side,
        quantity=50.0,  # Attempting to sell 50 shares
        price=160.0,
        order_id=order.id,
        timestamp=datetime.now(timezone.utc),
        alpaca_order_id=order.alpaca_order_id,
        validate_order=False,  # Order already exists
        validate_position=True,  # This should cap the quantity to available position
    )
    
    await async_session.commit()
    
    # Verify transaction was created with capped quantity (10 shares, not 50)
    from sqlalchemy import select
    stmt = select(Transaction).where(Transaction.order_id == order.id)
    result = await async_session.execute(stmt)
    transaction = result.scalar_one()
    
    assert transaction.quantity == 10.0, f"Expected quantity 10.0, got {transaction.quantity}"
    assert transaction.total_value == 10.0 * 160.0, "Total value should reflect capped quantity"
    
    # Verify balance was only credited for 10 shares, not 50
    await async_session.refresh(fund)
    expected_balance = 10000.0 - 1500.0 + (10.0 * 160.0)  # Initial - buy + capped sell
    assert abs(fund.balance - expected_balance) < 0.01, (
        f"Expected balance {expected_balance}, got {fund.balance}"
    )


@pytest.mark.asyncio
async def test_transaction_creation_with_no_position(async_session, mock_alpaca):
    """
    Test that transaction creation is skipped when attempting to sell with no position.
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
    
    # NO buy transactions - we own 0 shares
    
    # Create sell order (attempting to sell 10 shares, but we own 0)
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        order_type="market",
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Attempt to create transaction with no position (should raise ValueError)
    # This should raise an error because we're trying to sell with 0 position
    with pytest.raises(ValueError, match="Cannot sell.*position is"):
        await create_transaction(
            session=async_session,
            fund_id=fund.id,
            symbol=order.symbol,
            transaction_type=order.side,
            quantity=10.0,  # Attempting to sell 10 shares with 0 position
            price=160.0,
            order_id=order.id,
            timestamp=datetime.now(timezone.utc),
            alpaca_order_id=order.alpaca_order_id,
            validate_order=False,
            validate_position=True,  # This should prevent the transaction
        )
    
    await async_session.commit()
    
    # Verify NO transaction was created
    from sqlalchemy import select
    stmt = select(Transaction).where(Transaction.order_id == order.id)
    result = await async_session.execute(stmt)
    transaction = result.scalar_one_or_none()
    
    assert transaction is None, "No transaction should have been created"
    
    # Verify balance unchanged
    await async_session.refresh(fund)
    assert fund.balance == 10000.0, "Balance should be unchanged"


@pytest.mark.asyncio
async def test_exit_position_validates_before_order(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that execute_sell_order validates position exists before placing order.
    
    This prevents the over-sell from even happening at the order placement stage.
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
    
    # NO transactions - we own 0 shares
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Create a position context claiming we own 100 shares (but DB says 0)
    position = PositionContext(
        symbol="AAPL",
        quantity=100.0,
        entry_price=150.0,
        current_price=160.0,
        entry_time=datetime.utcnow(),
        unrealized_pnl=1000.0,
        unrealized_pnl_percent=6.67,
        strategy_state={},
    )
    
    # Create exit signal (StopUpdate with force_exit=True)
    exit_signal = StopUpdate(
        current_stop=160.0,
        force_exit=True,
        exit_reason="test_exit"
    )
    
    # Create market data
    market_data = build_market_data(
        symbol="AAPL",
        price=160.0,
    )
    
    # Mock get_async_session to use our test session (for both order_executor and strategy_engine)
    with patch('app.services.strategies.order_executor.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Call execute_sell_order - should return False without placing order
        result = await engine.order_executor.execute_sell_order(position, exit_signal, market_data)
    
    # Should return False (no position in ledger)
    assert result is False, "execute_sell_order should return False when no position exists"
    
    # Verify NO order was placed
    from sqlalchemy import select
    stmt = select(Order).where(Order.fund_id == fund.id)
    result_query = await async_session.execute(stmt)
    orders = result_query.scalars().all()
    
    assert len(orders) == 0, "No order should have been placed"


@pytest.mark.asyncio
async def test_normal_sell_proceeds(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that normal sells still work when position exists and matches.
    
    This ensures our fix doesn't break the happy path.
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
    
    # Create buy transaction - we own 100 shares
    buy_txn = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 100.0, 150.0)
    async_session.add(buy_txn)
    await async_session.commit()
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Create position context for 100 shares (matches DB)
    position = PositionContext(
        symbol="AAPL",
        quantity=100.0,
        entry_price=150.0,
        current_price=160.0,
        entry_time=datetime.utcnow(),
        unrealized_pnl=1000.0,
        unrealized_pnl_percent=6.67,
        strategy_state={},
    )
    
    # Create exit signal (StopUpdate with force_exit=True)
    exit_signal = StopUpdate(
        current_stop=160.0,
        force_exit=True,
        exit_reason="test_exit"
    )
    
    # Create market data
    market_data = build_market_data(
        symbol="AAPL",
        price=160.0,
    )
    
    # Mock get_async_session to use our test session (for both order_executor and strategy_service)
    with patch('app.services.strategies.order_executor.get_async_session') as mock_get_session_executor, \
         patch('app.services.strategies.strategy_service.get_async_session') as mock_get_session_service:
        mock_get_session_executor.return_value.__aenter__.return_value = async_session
        mock_get_session_service.return_value.__aenter__.return_value = async_session
        
        # Call execute_sell_order - should place order successfully
        result = await engine.order_executor.execute_sell_order(position, exit_signal, market_data)
    
    await async_session.commit()
    
    # Should return True (order placed successfully)
    assert result is True, "execute_sell_order should return True when position exists"
    
    # Verify sell order WAS placed (there should be 2 orders total: 1 buy from setup, 1 sell from execute_sell_order)
    from sqlalchemy import select
    stmt = select(Order).where(Order.fund_id == fund.id, Order.side == "sell")
    result_query = await async_session.execute(stmt)
    sell_orders = result_query.scalars().all()
    
    assert len(sell_orders) == 1, "Sell order should have been placed"
    assert sell_orders[0].symbol == "AAPL"
    assert sell_orders[0].side == "sell"
    assert sell_orders[0].quantity == 100.0


@pytest.mark.asyncio
async def test_partial_sell_with_position_deficit(async_session, mock_alpaca):
    """
    Test that when attempting to sell more than owned, only the owned amount is transacted.
    
    Example: Own 10 shares, try to sell 15, should only sell 10.
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
    
    # Create buy transaction - we own 10 shares
    buy_txn = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 10.0, 150.0)
    async_session.add(buy_txn)
    await async_session.commit()
    
    # Create sell order attempting 15 shares
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund.id,
        symbol="AAPL",
        side="sell",
        quantity=15.0,
        order_type="market",
        status="pending",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    # Attempt to create transaction for 15 shares when only 10 owned
    # Should be capped to 10 shares
    transaction = await create_transaction(
        session=async_session,
        fund_id=fund.id,
        symbol=order.symbol,
        transaction_type=order.side,
        quantity=15.0,  # Attempting to sell 15 shares
        price=160.0,
        order_id=order.id,
        timestamp=datetime.now(timezone.utc),
        alpaca_order_id=order.alpaca_order_id,
        validate_order=False,
        validate_position=True,  # This should cap to 10 shares
    )
    
    await async_session.commit()
    
    # Verify transaction created for only 10 shares
    from sqlalchemy import select
    stmt = select(Transaction).where(Transaction.order_id == order.id)
    result = await async_session.execute(stmt)
    transaction = result.scalar_one()
    
    assert transaction.quantity == 10.0, f"Should cap at 10 shares, got {transaction.quantity}"
    
    # Verify balance reflects only 10 shares sold
    await async_session.refresh(fund)
    expected_balance = 10000.0 - 1500.0 + (10.0 * 160.0)
    assert abs(fund.balance - expected_balance) < 0.01, (
        f"Balance should reflect 10 shares sold, not 15. Expected {expected_balance}, got {fund.balance}"
    )


@pytest.mark.asyncio
async def test_position_calculation_with_no_transactions(async_session):
    """
    Test position calculation returns 0 when no transactions exist.
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
    
    # No transactions created
    
    # Calculate position
    position_qty = await get_position_quantity_from_transactions(
        async_session, fund.id, "AAPL"
    )
    
    assert position_qty == 0.0, f"Expected 0.0, got {position_qty}"


@pytest.mark.asyncio
async def test_position_calculation_closed_position(async_session):
    """
    Test position calculation returns 0 when position was fully sold.
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
    
    # Buy and then sell same quantity
    buy_txn = await create_test_transaction(async_session, fund.id, "AAPL", "buy", 100.0, 150.0)
    sell_txn = await create_test_transaction(async_session, fund.id, "AAPL", "sell", 100.0, 160.0)
    
    async_session.add_all([buy_txn, sell_txn])
    await async_session.commit()
    
    # Calculate position
    position_qty = await get_position_quantity_from_transactions(
        async_session, fund.id, "AAPL"
    )
    
    assert position_qty == 0.0, f"Closed position should be 0.0, got {position_qty}"

