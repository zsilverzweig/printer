"""
Fund CRUD API Tests

Tests for fund Create, Read, Update, Delete operations:
- POST /funds - Create fund
- GET /funds - List funds
- GET /funds/{id} - Get single fund
- PATCH /funds/{id} - Update fund
- POST /funds/{id}/archive - Archive fund
- POST /funds/{id}/unarchive - Unarchive fund
"""

import pytest
import uuid
from unittest.mock import patch, Mock

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from tests.test_builders import build_fund


def test_create_fund_minimal(async_session):
    """Test successful fund creation with minimal required fields."""
    client = TestClient(app)
    fund_data = {
        "name": "Test Fund",
        "description": "A test fund",
        "mode": "sim",
        "strategy_id": "monkey_darts",
        "strategy_config": {},
    }

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post("/api/funds", json=fund_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Verify response structure
    assert "id" in data
    assert data["name"] == "Test Fund"
    assert data["description"] == "A test fund"
    assert data["mode"] == "sim"
    assert data["balance"] == 0.0  # New funds start with 0 balance
    assert data["status"] == "paused"
    assert data["archived"] == False
    assert data["strategy_id"] == "monkey_darts"
    assert "created_at" in data
    assert "updated_at" in data


def test_create_fund_with_full_config(async_session):
    """Test fund creation with all optional parameters."""
    client = TestClient(app)
    fund_data = {
        "name": "Advanced Fund",
        "description": "Fund with all configs",
        "mode": "real",
        "icon": "TrendingUp",
        "icon_color": "#00FF00",
        "strategy_id": "bull_flag",
        "strategy_config": {
            "min_volume": 1000000,
            "trading_start_time": "09:30",
            "trading_end_time": "15:30",
            "timezone": "America/New_York",
            "max_order_age_seconds": 30,
        },
        "max_loss_percent": 5.0,
        "max_loss_dollars": 500.0,
        "max_giveback_percent": 10.0,
        "size_per_trade": 2000.0,
        "min_bet_percent": 1.0,
        "max_bet_percent": 10.0,
        "max_total_exposure": 0.8,
    }

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post("/api/funds", json=fund_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Verify all fields are set correctly
    assert data["name"] == "Advanced Fund"
    assert data["mode"] == "real"
    assert data["icon"] == "TrendingUp"
    assert data["icon_color"] == "#00FF00"
    assert data["max_loss_percent"] == 5.0
    assert data["max_loss_dollars"] == 500.0
    assert data["size_per_trade"] == 2000.0
    assert data["strategy_config"]["trading_start_time"] == "09:30"
    assert data["strategy_config"]["timezone"] == "America/New_York"


def test_list_funds_empty(async_session):
    """Test listing funds when none exist."""
    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get("/api/funds")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_list_funds_excludes_archived_by_default(async_session):
    """Test that archived funds are excluded from list by default."""
    # Create active fund
    active_fund = build_fund(name="Active Fund", archived=False)
    async_session.add(active_fund)

    # Create archived fund
    archived_fund = build_fund(name="Archived Fund", archived=True)
    async_session.add(archived_fund)

    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get("/api/funds")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Should only return active fund
    assert len(data) == 1
    assert data[0]["name"] == "Active Fund"


@pytest.mark.asyncio
async def test_list_funds_includes_archived_when_requested(async_session):
    """Test that archived funds are included when include_archived=true."""
    # Create active fund
    active_fund = build_fund(name="Active Fund", archived=False)
    async_session.add(active_fund)

    # Create archived fund
    archived_fund = build_fund(name="Archived Fund", archived=True)
    async_session.add(archived_fund)

    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get("/api/funds?include_archived=true")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    # Should return both funds
    assert len(data) == 2
    fund_names = {f["name"] for f in data}
    assert "Active Fund" in fund_names
    assert "Archived Fund" in fund_names


@pytest.mark.asyncio
async def test_get_fund_by_id_success(async_session):
    """Test retrieving a specific fund by ID."""
    fund = build_fund(name="Test Fund", balance=5000.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["id"] == fund.id
    assert data["name"] == "Test Fund"
    assert data["balance"] == 5000.0


def test_get_fund_by_id_not_found(async_session):
    """Test 404 when fund doesn't exist."""
    fake_id = str(uuid.uuid4())

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fake_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_update_fund_name_and_description(async_session):
    """Test updating fund name and description."""
    fund = build_fund(name="Old Name", description="Old description")
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    update_data = {"name": "New Name", "description": "New description"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.patch(f"/api/funds/{fund.id}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["name"] == "New Name"
    assert data["description"] == "New description"


@pytest.mark.asyncio
async def test_update_fund_icon_and_color(async_session):
    """Test updating fund UI customization."""
    fund = build_fund(icon=None, icon_color=None)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    update_data = {"icon": "Rocket", "icon_color": "#FF0000"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.patch(f"/api/funds/{fund.id}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["icon"] == "Rocket"
    assert data["icon_color"] == "#FF0000"


@pytest.mark.asyncio
async def test_update_fund_risk_parameters(async_session):
    """Test updating fund risk parameters."""
    fund = build_fund(max_loss_percent=None, max_loss_dollars=None)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    update_data = {
        "max_loss_percent": 10.0,
        "max_loss_dollars": 1000.0,
        "max_giveback_percent": 15.0,
    }

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.patch(f"/api/funds/{fund.id}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["max_loss_percent"] == 10.0
    assert data["max_loss_dollars"] == 1000.0
    assert data["max_giveback_percent"] == 15.0


@pytest.mark.asyncio
async def test_update_fund_balance_when_not_trading(async_session):
    """Test updating balance when fund is not trading."""
    fund = build_fund(balance=1000.0, status="paused")
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    update_data = {"balance": 5000.0}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.patch(f"/api/funds/{fund.id}", json=update_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["balance"] == 5000.0


@pytest.mark.asyncio
async def test_update_fund_balance_blocked_when_trading(async_session):
    """Test that balance cannot be updated while fund is actively trading."""
    fund = build_fund(balance=1000.0, status="active")
    async_session.add(fund)
    await async_session.commit()

    # Mock engine to simulate active trading
    mock_engine = Mock()

    client = TestClient(app)
    update_data = {"balance": 5000.0}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.patch(f"/api/funds/{fund.id}", json=update_data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "trading" in response.json()["detail"].lower()


def test_update_fund_not_found(async_session):
    """Test 404 when updating non-existent fund."""
    fake_id = str(uuid.uuid4())

    client = TestClient(app)
    update_data = {"name": "New Name"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.patch(f"/api/funds/{fake_id}", json=update_data)

    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_archive_fund_success(async_session):
    """Test archiving a fund."""
    fund = build_fund(status="paused", archived=False)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/archive")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["success"] == True
    assert data["archived"] == True


@pytest.mark.asyncio
async def test_archive_fund_blocked_when_trading(async_session):
    """Test that fund cannot be archived while actively trading."""
    fund = build_fund(status="active", archived=False)
    async_session.add(fund)
    await async_session.commit()

    mock_engine = Mock()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(f"/api/funds/{fund.id}/archive")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "trading" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_unarchive_fund_success(async_session):
    """Test unarchiving a fund."""
    fund = build_fund(archived=True)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/unarchive")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["success"] == True
    assert data["archived"] == False
