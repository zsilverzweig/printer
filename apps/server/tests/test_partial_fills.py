"""
Partial Fill Transaction Tests

Tests for incremental partial fill handling where a single order
can generate multiple transactions as it fills over time.
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import Mock, AsyncMock, patch

from app.models.strategies import Order, Transaction, Fund
from app.services.trading.order_polling import OrderPollingService
from app.services.trading.alpaca_service import AlpacaService
from tests.test_builders import build_fund, build_order


@pytest.mark.asyncio
async def test_partial_fill_creates_transaction(async_session):
    """
    Test that a partial fill creates a transaction for the filled quantity.
    
    Order: 100 shares requested
    Alpaca: 54 shares filled
    Expected: 1 transaction for 54 shares, balance updated
    """
    # Setup fund and order
    fund = build_fund(balance=10000.0)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-1"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    mock_alpaca_order = Mock()
    mock_alpaca_order.status.value = "partially_filled"
    mock_alpaca_order.filled_qty = 54.0
    mock_alpaca_order.filled_avg_price = 10.0
    mock_alpaca_order.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order
    
    # Create polling service and sync order
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Verify transaction created
    from sqlalchemy import select
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    
    assert len(transactions) == 1
    assert transactions[0].quantity == 54.0
    assert transactions[0].price == 10.0
    assert transactions[0].total_value == 540.0
    assert transactions[0].side == "buy"
    
    # Verify balance updated
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 540.0  # 9460.0


@pytest.mark.asyncio
async def test_incremental_fills_create_multiple_transactions(async_session):
    """
    Test that incremental fills create separate transactions for each delta.
    
    Order: 100 shares requested
    Poll 1: 54 filled → transaction 1: 54 shares
    Poll 2: 76 filled → transaction 2: 22 shares (delta)
    Poll 3: 100 filled → transaction 3: 24 shares (delta)
    Expected: 3 transactions, total 100 shares
    """
    # Setup fund and order
    fund = build_fund(balance=10000.0)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-2"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    
    # First poll: 54 shares filled
    mock_alpaca_order_1 = Mock()
    mock_alpaca_order_1.status.value = "partially_filled"
    mock_alpaca_order_1.filled_qty = 54.0
    mock_alpaca_order_1.filled_avg_price = 10.0
    mock_alpaca_order_1.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order_1
    
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Check after first poll
    from sqlalchemy import select
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    assert len(transactions) == 1
    assert transactions[0].quantity == 54.0
    
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 540.0  # 9460.0
    
    # Second poll: 76 shares filled (22 more)
    await async_session.refresh(order)
    mock_alpaca_order_2 = Mock()
    mock_alpaca_order_2.status.value = "partially_filled"
    mock_alpaca_order_2.filled_qty = 76.0
    mock_alpaca_order_2.filled_avg_price = 10.0
    mock_alpaca_order_2.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order_2
    
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Check after second poll
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    assert len(transactions) == 2
    assert transactions[1].quantity == 22.0  # Delta
    
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 760.0  # 9240.0
    
    # Third poll: 100 shares filled (24 more)
    await async_session.refresh(order)
    mock_alpaca_order_3 = Mock()
    mock_alpaca_order_3.status.value = "filled"
    mock_alpaca_order_3.filled_qty = 100.0
    mock_alpaca_order_3.filled_avg_price = 10.0
    mock_alpaca_order_3.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order_3
    
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Check after third poll
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    assert len(transactions) == 3
    assert transactions[2].quantity == 24.0  # Delta
    
    # Verify total
    total_qty = sum(t.quantity for t in transactions)
    assert total_qty == 100.0
    
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 1000.0  # 9000.0


@pytest.mark.asyncio
async def test_partial_fill_then_cancelled(async_session):
    """
    Test that cancelled orders only transact what was actually filled.
    
    Order: 100 shares requested
    Filled: 40 shares
    Status: cancelled
    Expected: 1 transaction for 40 shares only
    """
    # Setup fund and order
    fund = build_fund(balance=10000.0)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-3"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service - partially filled
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    
    mock_alpaca_order_1 = Mock()
    mock_alpaca_order_1.status.value = "partially_filled"
    mock_alpaca_order_1.filled_qty = 40.0
    mock_alpaca_order_1.filled_avg_price = 10.0
    mock_alpaca_order_1.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order_1
    
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Now cancel the order
    await async_session.refresh(order)
    mock_alpaca_order_2 = Mock()
    mock_alpaca_order_2.status.value = "canceled"
    mock_alpaca_order_2.filled_qty = 40.0  # Still 40, no more fills
    mock_alpaca_order_2.filled_avg_price = 10.0
    mock_alpaca_order_2.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order_2
    
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Verify only 1 transaction for 40 shares
    from sqlalchemy import select
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    
    assert len(transactions) == 1
    assert transactions[0].quantity == 40.0
    
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 400.0  # Only 40 shares transacted


@pytest.mark.asyncio
async def test_balance_updates_with_each_partial_fill(async_session):
    """
    Test that fund balance is updated incrementally with each fill.
    
    Tracks balance after each incremental fill.
    """
    # Setup fund and order
    initial_balance = 10000.0
    fund = build_fund(balance=initial_balance)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-4"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    
    fills = [
        (30.0, 10.0),  # 30 shares @ $10 = $300
        (60.0, 10.0),  # 30 more shares @ $10 = $300
        (100.0, 10.0), # 40 more shares @ $10 = $400
    ]
    
    expected_balances = [
        10000.0 - 300.0,  # 9700.0
        9700.0 - 300.0,   # 9400.0
        9400.0 - 400.0,   # 9000.0
    ]
    
    for i, (filled_qty, avg_price) in enumerate(fills):
        await async_session.refresh(order)
        
        mock_alpaca_order = Mock()
        mock_alpaca_order.status.value = "partially_filled" if i < 2 else "filled"
        mock_alpaca_order.filled_qty = filled_qty
        mock_alpaca_order.filled_avg_price = avg_price
        mock_alpaca_order.filled_at = datetime.utcnow()
        mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order
        
        await polling_service._sync_order_status(async_session, order)
        await async_session.commit()
        
        await async_session.refresh(fund)
        assert abs(fund.balance - expected_balances[i]) < 0.01, \
            f"Balance mismatch at fill {i+1}: expected {expected_balances[i]}, got {fund.balance}"


@pytest.mark.asyncio
async def test_no_duplicate_transactions_if_quantity_unchanged(async_session):
    """
    Test that polling the same filled quantity twice doesn't create duplicate transactions.
    
    Order: 100 shares
    Poll 1: 54 filled → transaction created
    Poll 2: 54 filled (no change) → no new transaction
    """
    # Setup fund and order
    fund = build_fund(balance=10000.0)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-5"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    
    mock_alpaca_order = Mock()
    mock_alpaca_order.status.value = "partially_filled"
    mock_alpaca_order.filled_qty = 54.0
    mock_alpaca_order.filled_avg_price = 10.0
    mock_alpaca_order.filled_at = datetime.utcnow()
    mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order
    
    # First poll
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Second poll (same quantity)
    await async_session.refresh(order)
    await polling_service._sync_order_status(async_session, order)
    await async_session.commit()
    
    # Verify only 1 transaction exists
    from sqlalchemy import select
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    
    assert len(transactions) == 1
    assert transactions[0].quantity == 54.0
    
    await async_session.refresh(fund)
    assert fund.balance == 10000.0 - 540.0  # Only charged once


@pytest.mark.asyncio
async def test_partial_sell_incremental_fills(async_session):
    """
    Test incremental fills for sell orders (balance should increase).
    
    Order: Sell 100 shares
    Poll 1: 40 sold → balance increases by $400
    Poll 2: 80 sold → balance increases by $400 more
    Poll 3: 100 sold → balance increases by $200 more
    """
    # Setup fund with initial balance
    fund = build_fund(balance=5000.0)
    async_session.add(fund)
    
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="sell",
        quantity=100,
        status="pending",
        alpaca_order_id="test-order-6"
    )
    async_session.add(order)
    await async_session.commit()
    
    # Mock Alpaca service
    mock_alpaca = Mock(spec=AlpacaService)
    mock_alpaca.client = Mock()
    polling_service = OrderPollingService(mock_alpaca, poll_interval=1.0)
    
    fills = [
        (40.0, 10.0),   # 40 shares @ $10 = $400
        (80.0, 10.0),   # 40 more @ $10 = $400
        (100.0, 10.0),  # 20 more @ $10 = $200
    ]
    
    expected_balances = [
        5000.0 + 400.0,  # 5400.0
        5400.0 + 400.0,  # 5800.0
        5800.0 + 200.0,  # 6000.0
    ]
    
    for i, (filled_qty, avg_price) in enumerate(fills):
        await async_session.refresh(order)
        
        mock_alpaca_order = Mock()
        mock_alpaca_order.status.value = "partially_filled" if i < 2 else "filled"
        mock_alpaca_order.filled_qty = filled_qty
        mock_alpaca_order.filled_avg_price = avg_price
        mock_alpaca_order.filled_at = datetime.utcnow()
        mock_alpaca.client.get_order_by_id.return_value = mock_alpaca_order
        
        await polling_service._sync_order_status(async_session, order)
        await async_session.commit()
        
        await async_session.refresh(fund)
        assert abs(fund.balance - expected_balances[i]) < 0.01, \
            f"Balance mismatch at fill {i+1}: expected {expected_balances[i]}, got {fund.balance}"
    
    # Verify 3 transactions created
    from sqlalchemy import select
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order.id)
    )
    transactions = result.scalars().all()
    
    assert len(transactions) == 3
    assert all(t.side == "sell" for t in transactions)
    total_qty = sum(t.quantity for t in transactions)
    assert total_qty == 100.0

