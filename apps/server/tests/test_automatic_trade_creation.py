"""
Test Automatic Trade Creation and Closing

Tests that trades are automatically created and closed when transactions are created,
without manual intervention. This tests the production flow where:
- Buy transactions automatically create Trade records
- Sell transactions automatically close Trade records when position is fully closed
"""

import uuid
import pytest
from datetime import datetime
from sqlalchemy import select

from app.models.strategies import Fund, Order, Transaction, Trade
from app.services.trading.trading_reconciliation_service import auto_update_trades_for_symbol


@pytest.mark.asyncio
async def test_trade_automatically_created_on_buy_transaction(async_session):
    """
    Test that when a buy transaction is created (e.g., from Alpaca fill),
    a Trade record is automatically created without manual intervention.
    
    This simulates the real flow:
    1. Order is placed with trade_id
    2. Order fills and transaction is created
    3. Trade record should be automatically created
    """
    # Create test fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Auto Trade Test Fund",
        mode="sim",
        balance=100000.0,
        status="active",
        strategy_id="test_strategy",
        size_per_trade=1000.0
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Step 1: Order is placed with trade_id (simulates order_executor)
    trade_id = str(uuid.uuid4())
    buy_order_id = str(uuid.uuid4())
    
    buy_order = Order(
        id=buy_order_id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=150.0,
        alpaca_order_id="alpaca_order_123"
    )
    async_session.add(buy_order)
    await async_session.commit()
    
    # Step 2: Transaction is created from fill (simulates activity_sync)
    # This is what happens when reconciliation service creates a transaction
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        alpaca_order_id=buy_order.alpaca_order_id,
        alpaca_fill_id="fill_123",
        fund_id=fund.id,
        trade_id=trade_id,  # Inherited from order
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(buy_txn)
    await async_session.commit()
    
    # Step 3: Call auto-update to create Trade record
    # This simulates what happens automatically in production after transactions are committed
    await auto_update_trades_for_symbol(async_session, fund.id, "AAPL")
    
    # Step 4: Trade record should now be automatically created
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    trade = result.scalar_one_or_none()
    
    # Trade should now be created automatically
    assert trade is not None, "Trade record should be automatically created when buy transaction is created"
    assert trade.status == "open"
    assert trade.entry_price == 150.0
    assert trade.entry_quantity == 10.0
    assert trade.symbol == "AAPL"


@pytest.mark.asyncio
async def test_trade_automatically_closed_on_sell_transaction(async_session):
    """
    Test that when a sell transaction is created and position is fully closed,
    the Trade record is automatically closed with P&L calculated.
    
    This simulates the real flow:
    1. Buy transaction creates open Trade
    2. Sell transaction closes position
    3. Trade should be automatically closed
    """
    # Create test fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Auto Close Test Fund",
        mode="sim",
        balance=100000.0,
        status="active",
        strategy_id="test_strategy",
        size_per_trade=1000.0
    )
    async_session.add(fund)
    
    # Create open trade manually (since auto-creation isn't implemented yet)
    # In the real system, this would have been created automatically
    trade_id = str(uuid.uuid4())
    buy_order_id = str(uuid.uuid4())
    
    buy_order = Order(
        id=buy_order_id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=150.0,
        alpaca_order_id="alpaca_order_456"
    )
    async_session.add(buy_order)
    
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(buy_txn)
    
    # Manually create the trade (simulating what should happen automatically)
    from app.services.analytics.trade_builder import TradeBuilder
    trade_builder = TradeBuilder(async_session)
    trade = await trade_builder.create_trade_from_entry(
        trade_id=trade_id,
        fund_id=fund.id,
        symbol="AAPL",
        entry_order_id=buy_order.id,
        entry_transactions=[buy_txn]
    )
    await async_session.commit()
    
    # Now simulate sell transaction being created (from activity_sync)
    sell_order_id = str(uuid.uuid4())
    sell_order = Order(
        id=sell_order_id,
        fund_id=fund.id,
        trade_id=trade_id,  # Same trade_id
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=10.0,
        filled_avg_price=160.0,
        alpaca_order_id="alpaca_order_789"
    )
    async_session.add(sell_order)
    
    # Sell transaction is created (this is what activity_sync does)
    sell_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=sell_order.id,
        alpaca_order_id=sell_order.alpaca_order_id,
        alpaca_fill_id="fill_789",
        fund_id=fund.id,
        trade_id=trade_id,  # Same trade_id
        symbol="AAPL",
        side="sell",
        quantity=10.0,
        price=160.0,
        total_value=1600.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(sell_txn)
    await async_session.commit()
    
    # Call auto-update to close Trade record
    # This simulates what happens automatically in production after transactions are committed
    await auto_update_trades_for_symbol(async_session, fund.id, "AAPL")
    
    # Trade should be automatically closed after sell transaction is created
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    updated_trade = result.scalar_one_or_none()
    
    # Trade should now be closed automatically
    assert updated_trade is not None, "Trade should exist"
    assert updated_trade.status == "closed", "Trade should be automatically closed when sell transaction closes position"
    assert updated_trade.exit_price == 160.0, "Exit price should be set"
    assert updated_trade.exit_quantity == 10.0, "Exit quantity should be set"
    assert updated_trade.realized_pnl == pytest.approx(100.0, abs=0.1), "P&L should be calculated: (160-150)*10"
    assert updated_trade.realized_pnl_percent == pytest.approx(6.67, abs=0.1), "P&L% should be calculated"
    assert updated_trade.hold_duration_seconds is not None, "Hold duration should be calculated"


@pytest.mark.asyncio
async def test_multiple_fills_create_single_trade(async_session):
    """
    Test that multiple partial fills for the same order create a single Trade
    with the correct weighted average entry price.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Partial Fill Test Fund",
        mode="sim",
        balance=100000.0,
        status="active",
        strategy_id="test_strategy",
        size_per_trade=1000.0
    )
    async_session.add(fund)
    await async_session.commit()
    
    trade_id = str(uuid.uuid4())
    buy_order_id = str(uuid.uuid4())
    
    buy_order = Order(
        id=buy_order_id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=100.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=100.0,
        alpaca_order_id="alpaca_order_partial"
    )
    async_session.add(buy_order)
    await async_session.commit()
    
    # First partial fill: 50 shares @ $200
    txn1 = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=50.0,
        price=200.0,
        total_value=10000.0,
        timestamp=datetime.utcnow(),
        alpaca_fill_id="fill_1"
    )
    async_session.add(txn1)
    await async_session.commit()
    
    # Call auto-update after first transaction
    await auto_update_trades_for_symbol(async_session, fund.id, "TSLA")
    
    # After first transaction, trade should be created with partial quantity
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    trade_after_first = result.scalar_one_or_none()
    
    # Trade should now be created automatically
    assert trade_after_first is not None, "Trade should be created after first fill"
    assert trade_after_first.entry_quantity == 50.0, "Should track partial quantity"
    
    # Second partial fill: 50 shares @ $202
    txn2 = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="TSLA",
        side="buy",
        quantity=50.0,
        price=202.0,
        total_value=10100.0,
        timestamp=datetime.utcnow(),
        alpaca_fill_id="fill_2"
    )
    async_session.add(txn2)
    await async_session.commit()
    
    # Call auto-update after second transaction  
    await auto_update_trades_for_symbol(async_session, fund.id, "TSLA")
    
    # Trade should be updated with weighted average price
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    final_trade = result.scalar_one_or_none()
    
    # Trade should be updated
    assert final_trade is not None
    assert final_trade.entry_quantity == 100.0, "Should have full quantity"
    assert final_trade.entry_price == pytest.approx(201.0, abs=0.1), "Should calculate weighted average: (10000 + 10100) / 100"


@pytest.mark.asyncio
async def test_position_closed_detection_triggers_trade_close(async_session):
    """
    Test that when a sell transaction is created and the position quantity
    reaches zero, the system automatically detects this and closes the trade.
    """
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Position Close Test Fund",
        mode="sim",
        balance=100000.0,
        status="active",
        strategy_id="test_strategy",
        size_per_trade=1000.0
    )
    async_session.add(fund)
    
    # Setup: Create open trade with buy transaction
    trade_id = str(uuid.uuid4())
    buy_order_id = str(uuid.uuid4())
    
    buy_order = Order(
        id=buy_order_id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="MSFT",
        side="buy",
        quantity=20.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=20.0,
        filled_avg_price=300.0,
        alpaca_order_id="alpaca_buy"
    )
    async_session.add(buy_order)
    
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=buy_order.id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="MSFT",
        side="buy",
        quantity=20.0,
        price=300.0,
        total_value=6000.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(buy_txn)
    
    # Manually create trade (since auto-creation not implemented)
    from app.services.analytics.trade_builder import TradeBuilder
    trade_builder = TradeBuilder(async_session)
    trade = await trade_builder.create_trade_from_entry(
        trade_id=trade_id,
        fund_id=fund.id,
        symbol="MSFT",
        entry_order_id=buy_order.id,
        entry_transactions=[buy_txn]
    )
    await async_session.commit()
    
    # Calculate position quantity before sell
    from app.services.trading.position_tracker import get_position_quantity_from_transactions
    position_qty_before = await get_position_quantity_from_transactions(
        async_session, fund.id, "MSFT"
    )
    assert position_qty_before == 20.0, "Should have 20 shares before sell"
    
    # Sell transaction is created
    sell_order_id = str(uuid.uuid4())
    sell_order = Order(
        id=sell_order_id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="MSFT",
        side="sell",
        quantity=20.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
        filled_qty=20.0,
        filled_avg_price=310.0,
        alpaca_order_id="alpaca_sell"
    )
    async_session.add(sell_order)
    
    sell_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=sell_order.id,
        fund_id=fund.id,
        trade_id=trade_id,
        symbol="MSFT",
        side="sell",
        quantity=20.0,
        price=310.0,
        total_value=6200.0,
        timestamp=datetime.utcnow(),
        alpaca_fill_id="fill_sell"
    )
    async_session.add(sell_txn)
    await async_session.commit()
    
    # Verify position is now closed
    position_qty_after = await get_position_quantity_from_transactions(
        async_session, fund.id, "MSFT"
    )
    assert position_qty_after == 0.0, "Position should be closed"
    
    # Call auto-update after sell transaction
    await auto_update_trades_for_symbol(async_session, fund.id, "MSFT")
    
    # Trade should be automatically closed when position reaches zero
    result = await async_session.execute(
        select(Trade).where(Trade.id == trade_id)
    )
    final_trade = result.scalar_one_or_none()
    
    assert final_trade is not None
    assert final_trade.status == "closed", "Trade should be automatically closed when position quantity reaches zero"
    assert final_trade.exit_price == 310.0
    assert final_trade.realized_pnl == pytest.approx(200.0, abs=0.1), "Should calculate P&L: (310-300)*20"
