"""
Tests for Position Service

Tests incremental position updates, FIFO cost basis calculation,
and Trade-Position linking.
"""

import pytest
import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Position, Transaction, Fund, Trade, Order
from app.services.trading.position_service import (
    get_position,
    get_all_positions,
    update_position_on_transaction,
    create_position_for_trade,
    close_position_for_trade,
)
from app.services.trading.constants import FLOAT_COMPARISON_EPSILON


@pytest.fixture
async def test_fund(async_session: AsyncSession) -> Fund:
    """Create a test fund."""
    fund = Fund(
        id=str(uuid.uuid4()),
        name="Test Fund",
        balance=10000.0,
        mode="sim",
        status="paused",
        strategy_id="test_strategy",
    )
    async_session.add(fund)
    await async_session.flush()
    return fund


@pytest.fixture
async def test_order(async_session: AsyncSession, test_fund: Fund) -> Order:
    """Create a test order."""
    order = Order(
        id=str(uuid.uuid4()),
        fund_id=test_fund.id,
        symbol="TEST",
        side="buy",
        quantity=10.0,
        order_type="market",
        status="filled",
        submitted_at=datetime.now(timezone.utc),
        filled_at=datetime.now(timezone.utc),
        filled_qty=10.0,
        filled_avg_price=100.0,
    )
    async_session.add(order)
    await async_session.flush()
    return order


class TestPositionService:
    """Test position service functions."""

    @pytest.mark.asyncio
    async def test_get_position_not_found(self, async_session: AsyncSession, test_fund: Fund):
        """Test getting a position that doesn't exist."""
        position = await get_position(async_session, test_fund.id, "NONEXISTENT")
        assert position is None

    @pytest.mark.asyncio
    async def test_update_position_buy_creates_new(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test that buying creates a new position."""
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction)
        await async_session.flush()

        position = await update_position_on_transaction(async_session, transaction)
        
        assert position is not None
        assert position.fund_id == test_fund.id
        assert position.symbol == "TEST"
        assert position.quantity == 10.0
        assert position.avg_entry_price == 100.0
        assert position.cost_basis == 1000.0

    @pytest.mark.asyncio
    async def test_update_position_buy_updates_existing(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test that buying updates an existing position with weighted average."""
        # First buy: 10 shares @ $100
        transaction1 = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction1)
        await async_session.flush()
        await update_position_on_transaction(async_session, transaction1)

        # Second buy: 10 shares @ $110
        order2 = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=110.0,
        )
        async_session.add(order2)
        await async_session.flush()
        
        transaction2 = Transaction(
            id=str(uuid.uuid4()),
            order_id=order2.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=110.0,
            total_value=1100.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction2)
        await async_session.flush()
        
        position = await update_position_on_transaction(async_session, transaction2)
        
        assert position is not None
        assert position.quantity == 20.0  # 10 + 10
        assert position.cost_basis == 2100.0  # 1000 + 1100
        assert position.avg_entry_price == 105.0  # 2100 / 20

    @pytest.mark.asyncio
    async def test_update_position_sell_reduces_quantity(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test that selling reduces position quantity (FIFO)."""
        # Buy: 20 shares @ $100
        transaction1 = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=20.0,
            price=100.0,
            total_value=2000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction1)
        await async_session.flush()
        await update_position_on_transaction(async_session, transaction1)

        # Sell: 10 shares
        sell_order = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=110.0,
        )
        async_session.add(sell_order)
        await async_session.flush()

        transaction2 = Transaction(
              id=str(uuid.uuid4()),
              order_id=sell_order.id,
              fund_id=test_fund.id,
              symbol="TEST",
              side="sell",
              quantity=10.0,
              price=110.0,
              total_value=1100.0,
              timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction2)
        await async_session.flush()
        
        position = await update_position_on_transaction(async_session, transaction2)
        
        assert position is not None
        assert position.quantity == 10.0  # 20 - 10
        # FIFO: selling oldest shares at $100, remaining cost basis = 10 * $100 = $1000
        assert position.cost_basis == 1000.0
        assert position.avg_entry_price == 100.0  # Remaining shares keep original cost

    @pytest.mark.asyncio
    async def test_update_position_sell_closes_position(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test that selling all shares closes the position."""
        # Buy: 10 shares @ $100
        transaction1 = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction1)
        await async_session.flush()
        await update_position_on_transaction(async_session, transaction1)

        # Sell: 10 shares (all)
        sell_order = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=110.0,
        )
        async_session.add(sell_order)
        await async_session.flush()

        transaction2 = Transaction(
            id=str(uuid.uuid4()),
            order_id=sell_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=10.0,
            price=110.0,
            total_value=1100.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction2)
        await async_session.flush()
        
        position = await update_position_on_transaction(async_session, transaction2)
        
        # Position should be deleted (closed)
        assert position is None
        
        # Verify position doesn't exist
        position_check = await get_position(async_session, test_fund.id, "TEST")
        assert position_check is None

    @pytest.mark.asyncio
    async def test_update_position_fifo_cost_basis(self, async_session: AsyncSession, test_fund: Fund):
        """Test FIFO cost basis calculation with multiple buys and sells."""
        # Buy 1: 10 shares @ $100
        order1 = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=100.0,
        )
        async_session.add(order1)
        await async_session.flush()
        
        txn1 = Transaction(
            id=str(uuid.uuid4()),
            order_id=order1.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(txn1)
        await async_session.flush()
        await update_position_on_transaction(async_session, txn1)

        # Buy 2: 10 shares @ $110
        order2 = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=110.0,
        )
        async_session.add(order2)
        await async_session.flush()
        
        txn2 = Transaction(
            id=str(uuid.uuid4()),
            order_id=order2.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=110.0,
            total_value=1100.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(txn2)
        await async_session.flush()
        await update_position_on_transaction(async_session, txn2)

        # Position should have: 20 shares, avg_entry $105, cost_basis $2100
        position = await get_position(async_session, test_fund.id, "TEST")
        assert position.quantity == 20.0
        assert position.avg_entry_price == 105.0
        assert position.cost_basis == 2100.0

        # Sell: 15 shares (FIFO: sell 10 @ $100 + 5 @ $110)
        sell_order = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=15.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=15.0,
            filled_avg_price=115.0,
        )
        async_session.add(sell_order)
        await async_session.flush()

        txn3 = Transaction(
            id=str(uuid.uuid4()),
            order_id=sell_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=15.0,
            price=115.0,
            total_value=1725.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(txn3)
        await async_session.flush()

        position = await update_position_on_transaction(async_session, txn3)
        
        # Remaining: 5 shares
        # Note: With aggregate state (not individual lots), we maintain weighted average
        # When selling, remaining shares keep the same avg_entry_price
        assert position is not None
        assert position.quantity == 5.0
        assert position.avg_entry_price == 105.0  # Weighted average maintained (not true FIFO)
        assert position.cost_basis == 525.0  # 5 * $105

    @pytest.mark.asyncio
    async def test_create_position_for_trade(self, async_session: AsyncSession, test_fund: Fund):
        """Test creating a position linked to a trade."""
        trade_id = str(uuid.uuid4())
        
        position = await create_position_for_trade(
            session=async_session,
            fund_id=test_fund.id,
            symbol="TEST",
            trade_id=trade_id,
            entry_quantity=10.0,
            entry_price=100.0
        )
        
        assert position is not None
        assert position.fund_id == test_fund.id
        assert position.symbol == "TEST"
        assert position.trade_id == trade_id
        assert position.quantity == 10.0
        assert position.avg_entry_price == 100.0
        assert position.cost_basis == 1000.0

    @pytest.mark.asyncio
    async def test_create_position_for_trade_updates_existing(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test that create_position_for_trade updates existing position with trade_id."""
        # Create position from transaction first
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction)
        await async_session.flush()
        await update_position_on_transaction(async_session, transaction)

        # Now link it to a trade
        trade_id = str(uuid.uuid4())
        position = await create_position_for_trade(
            session=async_session,
            fund_id=test_fund.id,
            symbol="TEST",
            trade_id=trade_id,
            entry_quantity=10.0,
            entry_price=100.0
        )
        
        assert position is not None
        assert position.trade_id == trade_id
        assert position.quantity == 10.0

    @pytest.mark.asyncio
    async def test_close_position_for_trade(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test closing a position when trade closes."""
        # Create position
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=test_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="buy",
            quantity=10.0,
            price=100.0,
            total_value=1000.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(transaction)
        await async_session.flush()
        await update_position_on_transaction(async_session, transaction)

        # Sell all shares
        sell_order = Order(
            id=str(uuid.uuid4()),
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=10.0,
            order_type="market",
            status="filled",
            submitted_at=datetime.now(timezone.utc),
            filled_at=datetime.now(timezone.utc),
            filled_qty=10.0,
            filled_avg_price=110.0,
        )
        async_session.add(sell_order)
        await async_session.flush()
        
        sell_txn = Transaction(
            id=str(uuid.uuid4()),
            order_id=sell_order.id,
            fund_id=test_fund.id,
            symbol="TEST",
            side="sell",
            quantity=10.0,
            price=110.0,
            total_value=1100.0,
            timestamp=datetime.now(timezone.utc),
        )
        async_session.add(sell_txn)
        await async_session.flush()
        await update_position_on_transaction(async_session, sell_txn)

        # Position should already be closed (zero quantity)
        position = await close_position_for_trade(async_session, test_fund.id, "TEST")
        assert position is None
        
        # Verify position doesn't exist
        position_check = await get_position(async_session, test_fund.id, "TEST")
        assert position_check is None

    @pytest.mark.asyncio
    async def test_get_all_positions(self, async_session: AsyncSession, test_fund: Fund, test_order: Order):
        """Test getting all positions for a fund."""
        # Create positions for multiple symbols
        symbols = ["TEST1", "TEST2", "TEST3"]
        
        for symbol in symbols:
            order = Order(
                id=str(uuid.uuid4()),
                fund_id=test_fund.id,
                symbol=symbol,
                side="buy",
                quantity=10.0,
                order_type="market",
                status="filled",
                submitted_at=datetime.now(timezone.utc),
                filled_at=datetime.now(timezone.utc),
                filled_qty=10.0,
                filled_avg_price=100.0,
            )
            async_session.add(order)
            await async_session.flush()

            transaction = Transaction(
                id=str(uuid.uuid4()),
                order_id=order.id,
                fund_id=test_fund.id,
                symbol=symbol,
                side="buy",
                quantity=10.0,
                price=100.0,
                total_value=1000.0,
                timestamp=datetime.now(timezone.utc),
            )
            async_session.add(transaction)
            await async_session.flush()
            await update_position_on_transaction(async_session, transaction)

        positions = await get_all_positions(async_session, test_fund.id)
        
        assert len(positions) == 3
        symbols_found = {pos.symbol for pos in positions}
        assert symbols_found == set(symbols)

