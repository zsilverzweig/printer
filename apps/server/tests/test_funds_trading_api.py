"""
Fund Trading Control API Tests

Tests for fund trading control endpoints:
- POST /funds/{id}/start - Start trading
- POST /funds/{id}/stop - Stop trading
- GET /funds/{id}/status - Get trading status
- GET /funds/running/list - List running funds
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import patch, Mock, AsyncMock

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from tests.test_builders import build_fund


@pytest.mark.asyncio
async def test_start_trading_success(async_session):
    """Test starting trading for a fund."""
    fund = build_fund(strategy_id="monkey_darts", status="paused", balance=10000.0)
    async_session.add(fund)
    await async_session.commit()

    mock_engine = AsyncMock()
    mock_engine.start = AsyncMock()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            with patch(
                "app.routers.funds.create_strategy_engine", return_value=mock_engine
            ):
                with patch("app.routers.funds.register_engine"):
                    with patch(
                        "app.routers.realtime.broadcast_trading_activity",
                        new_callable=AsyncMock,
                    ):
                        response = client.post(f"/api/funds/{fund.id}/start")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["status"] == "started"
    assert data["fund_id"] == fund.id
    assert mock_engine.start.called


@pytest.mark.asyncio
async def test_start_trading_requires_strategy(async_session):
    """Test that starting trading fails if no strategy is configured."""
    fund = build_fund(strategy_id=None, status="paused")
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/start")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "strategy" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_start_trading_blocked_if_already_running(async_session):
    """Test that starting an already-running fund returns 400."""
    fund = build_fund(strategy_id="monkey_darts", status="active")
    async_session.add(fund)
    await async_session.commit()

    mock_engine = Mock()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(f"/api/funds/{fund.id}/start")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "already trading" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_stop_trading_success(async_session):
    """Test stopping trading for a fund."""
    fund = build_fund(status="active")
    async_session.add(fund)
    await async_session.commit()

    mock_engine = AsyncMock()
    mock_engine.stop = AsyncMock()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            with patch("app.routers.funds.unregister_engine"):
                response = client.post(f"/api/funds/{fund.id}/stop")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["status"] == "stopped"
    assert data["fund_id"] == fund.id
    assert mock_engine.stop.called


@pytest.mark.asyncio
async def test_stop_trading_when_not_running(async_session):
    """Test stopping a fund that's not running (should still update status)."""
    fund = build_fund(status="paused")
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/stop")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["status"] == "stopped"


@pytest.mark.asyncio
async def test_get_fund_status_not_running(async_session):
    """Test getting status for a fund that's not running."""
    fund = build_fund(status="paused")
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.get(f"/api/funds/{fund.id}/status")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["status"] == "paused"
    assert data["trading"] == False
    assert data["active_positions"] == 0
    assert data["monitored_symbols"] == 0


@pytest.mark.asyncio
async def test_get_fund_status_running_with_positions(async_session):
    """Test getting status for a running fund with active positions."""
    fund = build_fund(status="active")
    async_session.add(fund)
    await async_session.commit()

    # Mock engine with positions
    mock_engine = AsyncMock()
    mock_position = Mock()
    mock_position.symbol = "AAPL"
    mock_position.entry_price = 150.0
    mock_position.current_price = 155.0
    mock_position.quantity = 10.0
    mock_position.unrealized_pnl = 50.0
    mock_position.unrealized_pnl_percent = 3.33
    mock_position.entry_time = datetime.now(timezone.utc)

    mock_engine.get_active_positions = AsyncMock(return_value={"AAPL": mock_position})
    mock_engine.monitored_symbols = ["AAPL", "GOOGL"]

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.get(f"/api/funds/{fund.id}/status")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["trading"] == True
    assert data["active_positions"] == 1
    assert data["monitored_symbols"] == 2
    assert len(data["positions"]) == 1
    assert data["positions"][0]["symbol"] == "AAPL"


@pytest.mark.asyncio
async def test_list_running_funds(async_session):
    """Test listing all currently running funds."""
    # Create multiple funds
    fund1 = build_fund(name="Running Fund 1", status="active")
    fund2 = build_fund(name="Paused Fund", status="paused")
    fund3 = build_fund(name="Running Fund 2", status="active")

    async_session.add_all([fund1, fund2, fund3])
    await async_session.commit()

    # Mock running funds (fund1 and fund3)
    mock_engine = AsyncMock()
    mock_engine.get_active_positions = AsyncMock(return_value={})
    mock_engine.monitored_symbols = []

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch(
            "app.routers.funds.list_running_funds", return_value=[fund1.id, fund3.id]
        ):
            with patch("app.routers.funds.get_engine", return_value=mock_engine):
                response = client.get("/api/funds/running/list")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["count"] == 2
    assert len(data["funds"]) == 2
    fund_names = {f["name"] for f in data["funds"]}
    assert "Running Fund 1" in fund_names
    assert "Running Fund 2" in fund_names
    assert "Paused Fund" not in fund_names
