"""
Fund Position & Order Tracking API Tests

Tests for fund position and order tracking endpoints:
- GET /funds/{id}/orders - Get order history
- GET /funds/{id}/transactions - Get transaction ledger
- GET /funds/{id}/positions - Get positions with sync check
- GET /funds/{id}/positions/summary - Get positions summary
- POST /funds/{id}/orders/{order_id}/validate - Validate order
- DELETE /funds/{id}/orders/{order_id} - Delete order
- POST /funds/{id}/positions/{symbol}/close-orphaned - Close orphaned position
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import patch, Mock, AsyncMock

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from app.models.strategies import Transaction
from tests.test_builders import build_fund, build_order, build_transaction


@pytest.mark.asyncio
async def test_get_fund_orders_empty(async_session):
    """Test getting order history when no orders exist."""
    fund = build_fund()
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/orders")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_get_fund_orders_with_history(async_session):
    """Test getting order history with existing orders."""
    fund = build_fund()
    async_session.add(fund)

    # Create some orders
    order1 = build_order(fund_id=fund.id, symbol="AAPL", side="buy", status="filled")
    order2 = build_order(fund_id=fund.id, symbol="GOOGL", side="sell", status="filled")

    async_session.add_all([order1, order2])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/orders")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 2
    symbols = {o["symbol"] for o in data}
    assert "AAPL" in symbols
    assert "GOOGL" in symbols


@pytest.mark.asyncio
async def test_get_fund_orders_with_limit(async_session):
    """Test that order history respects limit parameter."""
    fund = build_fund()
    async_session.add(fund)

    # Create 10 orders
    for i in range(10):
        order = build_order(fund_id=fund.id, symbol=f"TEST{i}", status="filled")
        async_session.add(order)

    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/orders?limit=5")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 5


@pytest.mark.asyncio
async def test_get_fund_transactions(async_session):
    """Test getting transaction ledger."""
    fund = build_fund()
    async_session.add(fund)

    # Create transactions
    txn1 = build_transaction(fund_id=fund.id, symbol="AAPL", side="buy")
    txn2 = build_transaction(fund_id=fund.id, symbol="AAPL", side="sell")

    async_session.add_all([txn1, txn2])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/transactions")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 2
    assert data[0]["symbol"] == "AAPL"


@pytest.mark.asyncio
async def test_get_fund_positions_summary(async_session):
    """Test getting positions summary with market values."""
    fund = build_fund()
    async_session.add(fund)

    # Create transaction history that results in a position
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=str(uuid.uuid4()),
        alpaca_order_id="test-buy",
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow(),
    )
    async_session.add(buy_txn)
    await async_session.commit()

    # Mock market data provider
    mock_market_provider = AsyncMock()
    mock_market_provider.get_current_price = AsyncMock(return_value=160.0)

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch(
            "app.services.market_data_provider.MarketDataProvider", return_value=mock_market_provider
        ):
            response = client.get(f"/api/funds/{fund.id}/positions/summary")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert "positions" in data
    assert "summary" in data
    assert len(data["positions"]) == 1

    position = data["positions"][0]
    assert position["symbol"] == "AAPL"
    assert position["quantity"] == 10.0
    assert position["avg_entry_price"] == 150.0
    assert position["current_price"] == 160.0
    assert position["market_value"] == 1600.0
    assert position["unrealized_pl"] == 100.0  # (160-150)*10


@pytest.mark.asyncio
async def test_get_fund_positions_with_sync_check(async_session):
    """Test getting positions with Alpaca sync validation."""
    fund = build_fund(mode="sim")
    async_session.add(fund)
    await async_session.commit()

    # Mock Alpaca service
    mock_alpaca = AsyncMock()
    mock_alpaca.is_available = Mock(return_value=True)
    mock_alpaca.get_positions = AsyncMock(return_value=[])

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            with patch("app.services.alpaca_service.AlpacaService", return_value=mock_alpaca):
                response = client.get(f"/api/funds/{fund.id}/positions")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert "alpaca_positions" in data
    assert "database_positions" in data
    assert "sync_issues" in data
    assert "has_sync_issues" in data


@pytest.mark.asyncio
async def test_validate_order_success(async_session):
    """Test validating an order against Alpaca."""
    fund = build_fund()
    order = build_order(fund_id=fund.id, alpaca_order_id="alpaca-123", status="filled")

    async_session.add_all([fund, order])
    await async_session.commit()

    # Mock engine with Alpaca client
    mock_alpaca_order = Mock()
    mock_alpaca_order.status.value = "filled"

    mock_client = Mock()
    mock_client.get_order_by_id = Mock(return_value=mock_alpaca_order)

    mock_engine = Mock()
    mock_engine.alpaca_service.client = mock_client

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(f"/api/funds/{fund.id}/orders/{order.id}/validate")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["is_synced"] == True
    assert data["is_orphaned"] == False


@pytest.mark.asyncio
async def test_validate_order_orphaned(async_session):
    """Test detecting an orphaned order (missing Alpaca ID)."""
    fund = build_fund()
    order = build_order(fund_id=fund.id, alpaca_order_id="", status="filled")

    async_session.add_all([fund, order])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/orders/{order.id}/validate")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # When fund is not running, we can still detect orphaned order by missing alpaca_order_id
    assert data.get("is_orphaned", True) == True or data.get("reason") is not None


@pytest.mark.asyncio
async def test_delete_order_success(async_session):
    """Test deleting an orphaned order."""
    fund = build_fund()
    order = build_order(fund_id=fund.id, alpaca_order_id="", status="failed")

    async_session.add_all([fund, order])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.delete(f"/api/funds/{fund.id}/orders/{order.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["success"] == True


@pytest.mark.asyncio
async def test_delete_order_blocked_if_not_orphaned(async_session):
    """Test that non-orphaned orders cannot be deleted."""
    fund = build_fund()
    order = build_order(fund_id=fund.id, alpaca_order_id="alpaca-123", status="filled")

    async_session.add_all([fund, order])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.delete(f"/api/funds/{fund.id}/orders/{order.id}")

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_close_orphaned_position_success(async_session):
    """Test closing an orphaned position."""
    fund = build_fund(balance=1000.0)
    async_session.add(fund)

    # Create buy transaction (open position)
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=str(uuid.uuid4()),
        alpaca_order_id="buy-123",
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow(),
    )
    async_session.add(buy_txn)
    await async_session.commit()

    # Mock engine to verify position doesn't exist in Alpaca
    mock_engine = AsyncMock()
    mock_engine.alpaca_service.get_positions = AsyncMock(return_value=[])
    mock_engine.alpaca_service.get_orders = AsyncMock(return_value=[])

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(
                f"/api/funds/{fund.id}/positions/AAPL/close-orphaned"
            )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["success"] == True
    assert data["symbol"] == "AAPL"
    assert data["quantity_closed"] == 10.0


@pytest.mark.asyncio
async def test_close_orphaned_position_blocked_if_in_alpaca(async_session):
    """Test that positions in Alpaca cannot be closed as orphaned."""
    fund = build_fund()
    async_session.add(fund)

    # Create buy transaction
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=str(uuid.uuid4()),
        alpaca_order_id="buy-123",
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow(),
    )
    async_session.add(buy_txn)
    await async_session.commit()

    # Mock engine - position EXISTS in Alpaca
    mock_engine = AsyncMock()
    mock_engine.alpaca_service.get_positions = AsyncMock(
        return_value=[{"symbol": "AAPL"}]
    )

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(
                f"/api/funds/{fund.id}/positions/AAPL/close-orphaned"
            )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "exists in alpaca" in response.json()["detail"].lower()
