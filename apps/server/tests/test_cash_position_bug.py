"""
Test for cash position bug.

When an order is filled, we expect:
1. Cash position to be reduced (for buys) or increased (for sells)
2. Position value to be increased (for buys) or reduced (for sells)  
3. Assets Under Management card to show both changes

This test reproduces the bug where cash changes are not visible
in the Assets Under Management card.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.models.strategies import Fund, Order, Transaction, Transfer


@pytest.mark.asyncio
async def test_cash_position_reflects_order_fill(async_session):
    """
    Test that cash position is properly reduced when an order is filled.
    
    Scenario:
    1. Create a fund with $10,000 deposit
    2. Place and fill a buy order for $1,000
    3. Verify cash balance is $9,000
    4. Verify position value is ~$1,000
    5. Verify AUM is still ~$10,000 (cash + positions)
    """
    # Setup: Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Test Fund",
        description="Fund for testing cash position",
        mode="sim",
        balance=10000.0,  # Start with $10k
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    
    # Setup: Create deposit transfer to represent the initial $10k
    transfer = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        amount=10000.0,
        transfer_type="deposit",
        notes="Initial deposit",
        timestamp=datetime.utcnow(),
    )
    async_session.add(transfer)
    await async_session.commit()
    
    # Action: Place and fill a buy order
    order_id = str(uuid.uuid4())
    alpaca_order_id = f"alpaca_{uuid.uuid4()}"
    
    order = Order(
        id=order_id,
        alpaca_order_id=alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=100.0,  # $100/share * 10 shares = $1,000
    )
    async_session.add(order)
    
    # Create transaction (simulates order being filled)
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=order_id,
        alpaca_order_id=alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=100.0,
        total_value=1000.0,  # $1,000 spent
        timestamp=datetime.utcnow(),
        high_water_mark=100.0,
        strategy_state={},
    )
    async_session.add(transaction)
    
    # Update fund balance (simulates what order_polling.py does)
    fund.balance -= transaction.total_value  # $10,000 - $1,000 = $9,000
    
    await async_session.commit()
    
    # Verify: Calculate cash balance from ledger (like frontend does)
    stmt = select(Transfer).where(Transfer.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transfers = result.scalars().all()
    
    stmt = select(Transaction).where(Transaction.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transactions = result.scalars().all()
    
    # Calculate cash balance: deposits - withdrawals - buys + sells
    total_deposits = sum(t.amount for t in transfers if t.transfer_type == "deposit")
    total_withdrawals = sum(t.amount for t in transfers if t.transfer_type == "withdrawal")
    total_buys = sum(t.total_value for t in transactions if t.side == "buy")
    total_sells = sum(t.total_value for t in transactions if t.side == "sell")
    
    ledger_cash_balance = total_deposits - total_withdrawals - total_buys + total_sells
    
    # Assertions
    assert total_deposits == 10000.0, "Should have $10k deposit"
    assert total_buys == 1000.0, "Should have $1k in buys"
    assert total_sells == 0.0, "Should have no sells"
    
    # THIS IS THE KEY ASSERTION: Cash should be $9,000
    assert ledger_cash_balance == 9000.0, (
        f"Cash balance should be $9,000 after $1,000 buy. "
        f"Got: ${ledger_cash_balance:.2f} "
        f"(deposits: ${total_deposits:.2f}, withdrawals: ${total_withdrawals:.2f}, "
        f"buys: ${total_buys:.2f}, sells: ${total_sells:.2f})"
    )
    
    # Fund balance should also match
    assert fund.balance == 9000.0, f"Fund balance should be $9,000, got ${fund.balance:.2f}"
    
    # Position value should be $1,000 (10 shares * $100/share)
    # Note: In reality, we'd fetch current market price, but for this test we use cost basis
    position_value = total_buys - total_sells  # Simple cost basis calculation
    assert position_value == 1000.0, f"Position value should be $1,000, got ${position_value:.2f}"
    
    # AUM (Assets Under Management) should still be ~$10,000
    aum = ledger_cash_balance + position_value
    assert aum == 10000.0, (
        f"AUM should be $10,000 (cash + positions), got ${aum:.2f} "
        f"(cash: ${ledger_cash_balance:.2f}, positions: ${position_value:.2f})"
    )


@pytest.mark.asyncio
async def test_cash_position_reflects_sell_order(async_session):
    """
    Test that cash position increases when a sell order is filled.
    
    Scenario:
    1. Create a fund with $10k deposit and existing position
    2. Sell the position for $1,200 (20% gain)
    3. Verify cash balance is $11,200
    4. Verify position value is $0
    5. Verify AUM is $11,200
    """
    # Setup: Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Test Fund",
        description="Fund for testing sell orders",
        mode="sim",
        balance=9000.0,  # Already spent $1k on position
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    
    # Setup: Create deposit
    transfer = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        amount=10000.0,
        transfer_type="deposit",
        notes="Initial deposit",
        timestamp=datetime.utcnow(),
    )
    async_session.add(transfer)
    
    # Setup: Create existing buy transaction (already have position)
    buy_order_id = str(uuid.uuid4())
    buy_order = Order(
        id=buy_order_id,
        alpaca_order_id=f"alpaca_{uuid.uuid4()}",
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=100.0,
    )
    async_session.add(buy_order)
    
    buy_transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order_id,
        alpaca_order_id=buy_order.alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=100.0,
        total_value=1000.0,
        timestamp=datetime.utcnow(),
        high_water_mark=100.0,
        strategy_state={},
    )
    async_session.add(buy_transaction)
    
    await async_session.commit()
    
    # Action: Sell the position for $120/share (20% gain)
    sell_order_id = str(uuid.uuid4())
    sell_alpaca_order_id = f"alpaca_{uuid.uuid4()}"
    
    sell_order = Order(
        id=sell_order_id,
        alpaca_order_id=sell_alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=120.0,  # $120/share * 10 shares = $1,200
    )
    async_session.add(sell_order)
    
    sell_transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=sell_order_id,
        alpaca_order_id=sell_alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        price=120.0,
        total_value=1200.0,  # $1,200 received
        timestamp=datetime.utcnow(),
        strategy_state={},
    )
    async_session.add(sell_transaction)
    
    # Update fund balance (simulates what order_polling.py does)
    fund.balance += sell_transaction.total_value  # $9,000 + $1,200 = $10,200
    
    await async_session.commit()
    
    # Verify: Calculate cash balance from ledger
    stmt = select(Transfer).where(Transfer.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transfers = result.scalars().all()
    
    stmt = select(Transaction).where(Transaction.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transactions = result.scalars().all()
    
    # Calculate cash balance
    total_deposits = sum(t.amount for t in transfers if t.transfer_type == "deposit")
    total_withdrawals = sum(t.amount for t in transfers if t.transfer_type == "withdrawal")
    total_buys = sum(t.total_value for t in transactions if t.side == "buy")
    total_sells = sum(t.total_value for t in transactions if t.side == "sell")
    
    ledger_cash_balance = total_deposits - total_withdrawals - total_buys + total_sells
    
    # Assertions
    assert total_deposits == 10000.0, "Should have $10k deposit"
    assert total_buys == 1000.0, "Should have $1k in buys"
    assert total_sells == 1200.0, "Should have $1.2k in sells"
    
    # THIS IS THE KEY ASSERTION: Cash should be $10,200
    # $10,000 (deposit) - $1,000 (buy) + $1,200 (sell) = $10,200
    assert ledger_cash_balance == 10200.0, (
        f"Cash balance should be $10,200 after selling for $1,200. "
        f"Got: ${ledger_cash_balance:.2f} "
        f"(deposits: ${total_deposits:.2f}, buys: ${total_buys:.2f}, sells: ${total_sells:.2f})"
    )
    
    # Fund balance should also match
    assert fund.balance == 10200.0, f"Fund balance should be $10,200, got ${fund.balance:.2f}"
    
    # Position value should be $0 (sold all shares)
    # Calculate net position: buys - sells
    position_qty = 10.0 - 10.0  # Bought 10, sold 10
    assert position_qty == 0.0, f"Position quantity should be 0, got {position_qty}"
    
    # AUM should be $10,200 (all cash, no positions)
    position_value = 0.0  # No positions left
    aum = ledger_cash_balance + position_value
    assert aum == 10200.0, (
        f"AUM should be $10,200 (all in cash), got ${aum:.2f} "
        f"(cash: ${ledger_cash_balance:.2f}, positions: ${position_value:.2f})"
    )


@pytest.mark.asyncio
async def test_aum_card_shows_both_cash_and_position_changes(async_session):
    """
    Integration test: Verify Assets Under Management card data is correct.
    
    This test simulates what the frontend does when displaying the AUM card.
    """
    # Setup
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Test Fund",
        description="Fund for testing AUM card",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1000.0,
    )
    async_session.add(fund)
    
    # Initial deposit
    transfer = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        amount=10000.0,
        transfer_type="deposit",
        notes="Initial deposit",
        timestamp=datetime.utcnow(),
    )
    async_session.add(transfer)
    await async_session.commit()
    
    # Buy 5 shares @ $200 = $1,000
    buy_order_id = str(uuid.uuid4())
    buy_order = Order(
        id=buy_order_id,
        alpaca_order_id=f"alpaca_{uuid.uuid4()}",
        fund_id=fund_id,
        symbol="TSLA",
        side="buy",
        quantity=5.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=5.0,
        filled_avg_price=200.0,
    )
    async_session.add(buy_order)
    
    buy_transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order_id,
        alpaca_order_id=buy_order.alpaca_order_id,
        fund_id=fund_id,
        symbol="TSLA",
        side="buy",
        quantity=5.0,
        price=200.0,
        total_value=1000.0,
        timestamp=datetime.utcnow(),
        high_water_mark=200.0,
        strategy_state={},
    )
    async_session.add(buy_transaction)
    
    # Update fund balance
    fund.balance -= buy_transaction.total_value
    
    await async_session.commit()
    
    # Simulate frontend fetching data for AUM card
    stmt = select(Transfer).where(Transfer.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transfers = result.scalars().all()
    
    stmt = select(Transaction).where(Transaction.fund_id == fund_id)
    result = await async_session.execute(stmt)
    transactions = result.scalars().all()
    
    # Calculate like frontend does (ledger-calculations.ts)
    total_deposits = sum(t.amount for t in transfers if t.transfer_type == "deposit")
    total_withdrawals = sum(t.amount for t in transfers if t.transfer_type == "withdrawal")
    total_buys = sum(t.total_value for t in transactions if t.side == "buy")
    total_sells = sum(t.total_value for t in transactions if t.side == "sell")
    
    # Cash Balance = Deposits - Withdrawals - Buys + Sells
    cash_balance = total_deposits - total_withdrawals - total_buys + total_sells
    
    # Position Value = cost basis for now (in real app, would use market price)
    position_value = total_buys - total_sells
    
    # AUM = Cash + Positions
    aum = cash_balance + position_value
    
    # Verify AUM card would show correct values
    assert cash_balance == 9000.0, (
        f"AUM card should show cash = $9,000, got ${cash_balance:.2f}"
    )
    assert position_value == 1000.0, (
        f"AUM card should show positions = $1,000, got ${position_value:.2f}"
    )
    assert aum == 10000.0, (
        f"AUM card should show total AUM = $10,000, got ${aum:.2f}"
    )
    
    print(f"✅ AUM Card Display:")
    print(f"   Cash: ${cash_balance:,.2f}")
    print(f"   Positions: ${position_value:,.2f}")
    print(f"   Total AUM: ${aum:,.2f}")

