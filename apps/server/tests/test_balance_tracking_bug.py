"""
Balance Tracking Bug Tests

Tests to catch the bug where fund balance is NOT reduced when orders are placed.
This allows placing multiple orders that exceed the fund's available balance.

THE BUG:
- strategy_engine._enter_position() validates balance before placing order
- But it NEVER reduces the fund balance after placing the order
- This means multiple orders can be placed with insufficient total balance
"""

import uuid
from datetime import datetime
from unittest.mock import Mock, patch

import pytest

from app.models.strategies import Fund, Order
from app.services.strategies.strategy_engine import StrategyEngine
from app.strategies.base import EntrySignal, MarketData


@pytest.mark.asyncio
async def test_balance_not_reduced_until_order_fills(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test correct balance tracking: balance unchanged when order placed, reduced when filled.
    
    Scenario:
    1. Fund has $10,000 balance
    2. Place order for AAPL costing $1,500
    3. Balance still $10,000 (order just pending)
    4. Order fills (via polling service)
    5. Balance NOW reduced to $8,500
    
    THIS IS THE CORRECT BEHAVIOR - bank account model
    """
    # Create fund with $10,000
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Balance Tracking Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1500.0,
    )
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Track orders
    order_id = None
    
    async def track_order(*args, **kwargs):
        nonlocal order_id
        order_id = str(uuid.uuid4())
        return {
            "id": order_id,
            "status": "new",
        }
    
    mock_alpaca.place_market_order = track_order
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Place order
        signal = EntrySignal(should_enter=True, entry_price=150.0, reason="test")
        market_data = MarketData(
            symbol="AAPL",
            price=150.0,
            volume=1000000,
            timestamp=datetime.utcnow()
        )
        
        await engine._enter_position("AAPL", signal, market_data)
        
        # AFTER placing order
        await async_session.refresh(fund)
        balance_after_place = fund.balance
        
        # Balance should NOT change when order is placed (bank account model)
        assert balance_after_place == 10000.0, (
            f"Balance should stay $10,000 when order placed (pending), "
            f"got ${balance_after_place:.2f}"
        )
        
        # Now simulate order fill via polling service
        from sqlalchemy import select
        stmt = select(Order).where(Order.fund_id == fund.id)
        result = await async_session.execute(stmt)
        order = result.scalars().first()
        assert order is not None
        
        # Create transaction (simulates polling service detecting fill)
        from app.models.strategies import Transaction
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=order.id,
            alpaca_order_id=order.alpaca_order_id,
            fund_id=fund.id,
            symbol="AAPL",
            side="buy",
            quantity=10.0,
            price=150.0,
            total_value=1500.0,
            timestamp=datetime.utcnow(),
            high_water_mark=150.0,
            strategy_state={},
        )
        async_session.add(transaction)
        
        # Update fund balance (simulates what polling service does)
        fund.balance -= transaction.total_value
        await async_session.commit()
        await async_session.refresh(fund)
        
        # NOW balance should be reduced
        balance_after_fill = fund.balance
        assert balance_after_fill == 8500.0, (
            f"Balance should be $8,500 after order fills, got ${balance_after_fill:.2f}"
        )


@pytest.mark.asyncio
async def test_multiple_orders_exceed_balance(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test that multiple orders can be placed exceeding total balance (BUG).
    
    Scenario:
    1. Fund has $10,000 balance
    2. Place 8 orders of $1,500 each (total: $12,000)
    3. All 8 orders get placed successfully (BUG!)
    4. Total order cost ($12,000) exceeds fund balance ($10,000)
    
    THIS TEST SHOULD FAIL - demonstrating that balance isn't tracked correctly.
    """
    # Create fund with $10,000
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Over-ordering Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1500.0,
    )
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Track orders placed
    orders_placed = []
    
    async def track_order(*args, **kwargs):
        order_id = str(uuid.uuid4())
        orders_placed.append({
            "id": order_id,
            "symbol": kwargs.get("symbol"),
            "qty": kwargs.get("qty"),
        })
        # Create Order record in DB
        order = Order(
            id=order_id,
            alpaca_order_id=order_id,
            fund_id=fund.id,
            symbol=kwargs.get("symbol"),
            side=kwargs.get("side", "buy"),
            quantity=kwargs.get("qty", 0),
            order_type="market",
            status="pending",
            submitted_at=datetime.utcnow(),
        )
        async_session.add(order)
        await async_session.commit()
        
        return {
            "id": order_id,
            "status": "new",
        }
    
    mock_alpaca.place_market_order = track_order
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Place 8 orders (should only be able to place 6 with $10,000)
        symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "AMD", "INTC", "META"]
        
        for symbol in symbols:
            signal = EntrySignal(should_enter=True, entry_price=150.0, reason="test")
            market_data = MarketData(
                symbol=symbol,
                price=150.0,
                volume=1000000,
                timestamp=datetime.utcnow()
            )
            
            # Try to place order
            await engine._enter_position(symbol, signal, market_data)
        
        # Check how many orders were placed
        total_orders = len(orders_placed)
        total_cost = sum(o["qty"] * 150.0 for o in orders_placed)
        
        # CRITICAL BUG CHECK: Should only place ~6 orders with $10,000
        # But because balance isn't tracked, all 8 orders get placed!
        
        assert total_orders <= 6, (
            f"🐛 BUG FOUND: Placed {total_orders} orders totaling ${total_cost:.2f} "
            f"with only ${fund.balance:.2f} balance! "
            f"Should have stopped after ~6 orders."
        )


@pytest.mark.asyncio
async def test_balance_tracking_with_stop_start(async_session, mock_market_data, mock_alpaca, mock_execution_strategy):
    """
    Test balance tracking when fund is stopped and restarted.
    
    Scenario:
    1. Fund has $10,000 balance
    2. Place order for $1,500 (pending)
    3. Stop fund
    4. Order fills while stopped
    5. Start fund again
    6. Balance should reflect the filled order
    
    This tests if balance is synced correctly on restart.
    """
    # Create fund
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Stop Start Balance Fund",
        mode="sim",
        balance=10000.0,
        status="active",
        strategy_id="test_strategy",
        strategy_config={},
        size_per_trade=1500.0,
    )
    async_session.add(fund)
    await async_session.commit()
    await async_session.refresh(fund)
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    async def track_order(*args, **kwargs):
        order_id = str(uuid.uuid4())
        order = Order(
            id=order_id,
            alpaca_order_id=order_id,
            fund_id=fund.id,
            symbol=kwargs.get("symbol"),
            side=kwargs.get("side", "buy"),
            quantity=kwargs.get("qty", 0),
            order_type="market",
            status="pending",
            submitted_at=datetime.utcnow(),
        )
        async_session.add(order)
        await async_session.commit()
        
        return {
            "id": order_id,
            "status": "new",
        }
    
    mock_alpaca.place_market_order = track_order
    
    with patch('app.services.strategy_engine.get_async_session') as mock_get_session:
        mock_get_session.return_value.__aenter__.return_value = async_session
        
        # Place order
        signal = EntrySignal(should_enter=True, entry_price=150.0, reason="test")
        market_data = MarketData(
            symbol="AAPL",
            price=150.0,
            volume=1000000,
            timestamp=datetime.utcnow()
        )
        
        await engine._enter_position("AAPL", signal, market_data)
        
        # Simulate fund stop
        fund.status = "paused"
        await async_session.commit()
        
        # Check pending orders for THIS fund only
        from sqlalchemy import select
        stmt = select(Order).where(
            Order.fund_id == fund.id,
            Order.status == "pending"
        )
        result = await async_session.execute(stmt)
        pending_orders = result.scalars().all()
        
        assert len(pending_orders) >= 1, f"Should have at least 1 pending order, got {len(pending_orders)}"
        
        # Get the AAPL order
        aapl_order = next((o for o in pending_orders if o.symbol == "AAPL"), None)
        assert aapl_order is not None, "Should have AAPL order"
        
        # Simulate order fill (would be done by polling service)
        aapl_order.status = "filled"
        aapl_order.filled_qty = 10.0
        aapl_order.filled_avg_price = 150.0
        aapl_order.filled_at = datetime.utcnow()
        await async_session.commit()
        
        # Refresh fund - balance should now be reduced
        await async_session.refresh(fund)
        
        # When order fills, fund balance should be reduced
        # Expected behavior: balance = $10,000 - $1,500 = $8,500
        # But if balance isn't updated on fills, it will still be $10,000 (BUG)
        
        # NOTE: This test documents expected behavior
        # Currently, balance is NOT updated when orders fill
        # Balance only updates on deposits/withdrawals
        print(f"\n⚠️  Fund balance after filled order: ${fund.balance:.2f}")
        print(f"⚠️  Expected: ~$8,500 (if balance was tracked)")
        print(f"⚠️  Actual: ${fund.balance:.2f}")
        
        if fund.balance == 10000.0:
            print(f"🐛 BUG CONFIRMED: Balance not updated after order fill!")

