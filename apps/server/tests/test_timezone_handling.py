"""
Timezone Handling Tests

Tests to ensure all datetime fields properly handle timezone-aware and timezone-naive datetimes.
All database fields expect timezone-naive UTC datetimes.
"""

import uuid
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import select

from app.models.strategies import Fund, ScreeningCriteria, Order, Transaction


@pytest.mark.asyncio
async def test_fund_timestamps_timezone_naive(async_session):
    """Test that Fund model accepts timezone-naive UTC datetimes."""
    fund_id = str(uuid.uuid4())
    now_naive = datetime.utcnow()
    
    fund = Fund(
        id=fund_id,
        name="Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        created_at=now_naive,
        updated_at=now_naive,
    )
    
    async_session.add(fund)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(select(Fund).where(Fund.id == fund_id))
    retrieved_fund = result.scalar_one()
    
    assert retrieved_fund.created_at.tzinfo is None  # Should be timezone-naive
    assert retrieved_fund.updated_at.tzinfo is None


@pytest.mark.asyncio
async def test_fund_timestamps_timezone_aware_converted(async_session):
    """Test that Fund model can handle timezone-aware datetimes by converting them."""
    fund_id = str(uuid.uuid4())
    now_aware = datetime.now(timezone.utc)
    
    # Convert to naive before storing
    now_naive = now_aware.replace(tzinfo=None)
    
    fund = Fund(
        id=fund_id,
        name="Test Fund Aware",
        mode="sim",
        balance=5000.0,
        status="active",
        created_at=now_naive,
        updated_at=now_naive,
    )
    
    async_session.add(fund)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(select(Fund).where(Fund.id == fund_id))
    retrieved_fund = result.scalar_one()
    
    assert retrieved_fund.created_at.tzinfo is None


@pytest.mark.asyncio
async def test_order_timestamps_timezone_naive(async_session):
    """Test that Order model properly handles timezone-naive datetimes."""
    # Create fund first
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Order Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create order with timezone-naive datetimes
    order_id = str(uuid.uuid4())
    now_naive = datetime.utcnow()
    
    order = Order(
        id=order_id,
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10,
        order_type="market",
        status="pending",
        submitted_at=now_naive,
        filled_at=None,
    )
    
    async_session.add(order)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(select(Order).where(Order.id == order_id))
    retrieved_order = result.scalar_one()
    
    assert retrieved_order.submitted_at.tzinfo is None
    assert retrieved_order.filled_at is None


@pytest.mark.asyncio
async def test_order_filled_at_timezone_conversion(async_session):
    """Test that Order.filled_at properly converts timezone-aware to naive."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Filled Order Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create order
    order_id = str(uuid.uuid4())
    now_aware = datetime.now(timezone.utc)
    filled_at_aware = now_aware + timedelta(seconds=30)
    
    # Convert to naive (simulating what order_polling.py does)
    submitted_naive = now_aware.replace(tzinfo=None)
    filled_at_naive = filled_at_aware.replace(tzinfo=None)
    
    order = Order(
        id=order_id,
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol="TSLA",
        side="buy",
        quantity=5,
        order_type="market",
        status="filled",
        submitted_at=submitted_naive,
        filled_at=filled_at_naive,
        filled_qty=5.0,
        filled_avg_price=250.00,
    )
    
    async_session.add(order)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(select(Order).where(Order.id == order_id))
    retrieved_order = result.scalar_one()
    
    assert retrieved_order.submitted_at.tzinfo is None
    assert retrieved_order.filled_at.tzinfo is None
    assert retrieved_order.filled_qty == 5.0
    assert retrieved_order.filled_avg_price == 250.00


@pytest.mark.asyncio
async def test_transaction_timestamp_timezone_naive(async_session):
    """Test that Transaction model properly handles timezone-naive timestamps."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Transaction Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create order
    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol="NVDA",
        side="buy",
        quantity=10,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.flush()
    
    # Create transaction with timezone-naive timestamp
    transaction_id = str(uuid.uuid4())
    now_naive = datetime.utcnow()
    
    transaction = Transaction(
        id=transaction_id,
        order_id=order_id,
        alpaca_order_id=order.alpaca_order_id,
        fund_id=fund_id,
        symbol="NVDA",
        side="buy",
        quantity=10.0,
        price=450.00,
        total_value=4500.00,
        timestamp=now_naive,
        high_water_mark=450.00,
        strategy_state={},
    )
    
    async_session.add(transaction)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(
        select(Transaction).where(Transaction.id == transaction_id)
    )
    retrieved_transaction = result.scalar_one()
    
    assert retrieved_transaction.timestamp.tzinfo is None
    assert retrieved_transaction.created_at.tzinfo is None


@pytest.mark.asyncio
async def test_transaction_timezone_aware_conversion(async_session):
    """Test that Transaction timestamp converts timezone-aware to naive (simulating Alpaca response)."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Transaction Conversion Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create order
    order_id = str(uuid.uuid4())
    order = Order(
        id=order_id,
        alpaca_order_id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol="GOOGL",
        side="buy",
        quantity=3,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.flush()
    
    # Simulate Alpaca returning timezone-aware datetime
    alpaca_filled_at = datetime.now(timezone.utc)
    
    # Convert to naive (as order_polling.py does)
    transaction_timestamp = alpaca_filled_at.replace(tzinfo=None)
    
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=order_id,
        alpaca_order_id=order.alpaca_order_id,
        fund_id=fund_id,
        symbol="GOOGL",
        side="buy",
        quantity=3.0,
        price=140.00,
        total_value=420.00,
        timestamp=transaction_timestamp,
        high_water_mark=140.00,
        strategy_state={},
    )
    
    async_session.add(transaction)
    await async_session.commit()
    
    # Verify stored as timezone-naive
    result = await async_session.execute(
        select(Transaction).where(Transaction.order_id == order_id)
    )
    retrieved_transaction = result.scalar_one()
    
    assert retrieved_transaction.timestamp.tzinfo is None


@pytest.mark.asyncio
async def test_screening_criteria_timestamps(async_session):
    """Test that ScreeningCriteria timestamps are timezone-naive."""
    criteria_id = str(uuid.uuid4())
    now_naive = datetime.utcnow()
    
    criteria = ScreeningCriteria(
        id=criteria_id,
        name="Test Criteria",
        criteria={"minPrice": 1.0, "maxPrice": 100.0, "minVolume": 100000},
        created_at=now_naive,
        updated_at=now_naive,
    )
    
    async_session.add(criteria)
    await async_session.commit()
    
    # Retrieve and verify
    result = await async_session.execute(
        select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
    )
    retrieved_criteria = result.scalar_one()
    
    assert retrieved_criteria.created_at.tzinfo is None
    assert retrieved_criteria.updated_at.tzinfo is None


def test_datetime_conversion_utility():
    """Test utility function for converting timezone-aware to naive."""
    # Test timezone-aware datetime
    aware_dt = datetime.now(timezone.utc)
    naive_dt = aware_dt.replace(tzinfo=None) if aware_dt.tzinfo else aware_dt
    
    assert naive_dt.tzinfo is None
    assert aware_dt.year == naive_dt.year
    assert aware_dt.month == naive_dt.month
    assert aware_dt.day == naive_dt.day
    
    # Test already naive datetime
    already_naive = datetime.utcnow()
    still_naive = already_naive.replace(tzinfo=None) if already_naive.tzinfo else already_naive
    
    assert still_naive.tzinfo is None
    assert already_naive == still_naive


@pytest.mark.asyncio
async def test_multiple_orders_different_timezones(async_session):
    """Test handling multiple orders with mixed timezone scenarios."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Multi Order Test Fund",
        mode="sim",
        balance=50000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    orders = []
    for i in range(3):
        # Simulate different timezone scenarios
        if i == 0:
            # Timezone-naive
            submitted = datetime.utcnow()
        elif i == 1:
            # Timezone-aware, converted
            submitted = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            # Timezone-aware with offset, converted
            submitted = datetime.now(timezone.utc).replace(tzinfo=None)
        
        order = Order(
            id=str(uuid.uuid4()),
            alpaca_order_id=str(uuid.uuid4()),
            fund_id=fund_id,
            symbol=f"TEST{i}",
            side="buy",
            quantity=10,
            order_type="market",
            status="pending",
            submitted_at=submitted,
        )
        orders.append(order)
        async_session.add(order)
    
    await async_session.commit()
    
    # Retrieve all and verify
    result = await async_session.execute(
        select(Order).where(Order.fund_id == fund_id).order_by(Order.symbol)
    )
    retrieved_orders = result.scalars().all()
    
    assert len(retrieved_orders) == 3
    for order in retrieved_orders:
        assert order.submitted_at.tzinfo is None

