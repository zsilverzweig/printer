"""
Fund Money Management API Tests

Tests for fund money management endpoints:
- POST /funds/{id}/transfers - Create deposit/withdrawal
- GET /funds/{id}/transfers - Get transfer history
- GET /funds/{id}/reconcile - Balance reconciliation
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from app.models.strategies import Transfer, Transaction
from tests.test_builders import build_fund


@pytest.mark.asyncio
async def test_create_deposit_success(async_session):
    """Test creating a deposit transfer."""
    fund = build_fund(balance=1000.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    transfer_data = {
        "amount": 5000.0,
        "transfer_type": "deposit",
        "notes": "Initial deposit",
    }

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["amount"] == 5000.0
    assert data["transfer_type"] == "deposit"
    assert data["notes"] == "Initial deposit"
    assert data["new_balance"] == 6000.0  # 1000 + 5000


@pytest.mark.asyncio
async def test_create_withdrawal_success(async_session):
    """Test creating a withdrawal transfer."""
    fund = build_fund(balance=5000.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    transfer_data = {
        "amount": 1000.0,
        "transfer_type": "withdrawal",
        "notes": "Withdraw profits",
    }

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["amount"] == 1000.0
    assert data["transfer_type"] == "withdrawal"
    assert data["new_balance"] == 4000.0  # 5000 - 1000


@pytest.mark.asyncio
async def test_withdrawal_blocked_insufficient_balance(async_session):
    """Test that withdrawal fails if insufficient balance."""
    fund = build_fund(balance=500.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    transfer_data = {"amount": 1000.0, "transfer_type": "withdrawal"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "insufficient" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transfer_negative_amount_rejected(async_session):
    """Test that negative transfer amounts are rejected."""
    fund = build_fund(balance=1000.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    transfer_data = {"amount": -500.0, "transfer_type": "deposit"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "positive" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transfer_invalid_type_rejected(async_session):
    """Test that invalid transfer types are rejected."""
    fund = build_fund(balance=1000.0)
    async_session.add(fund)
    await async_session.commit()

    client = TestClient(app)
    transfer_data = {"amount": 500.0, "transfer_type": "invalid_type"}

    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)

    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.asyncio
async def test_get_transfer_history(async_session):
    """Test retrieving transfer history for a fund."""
    fund = build_fund()
    async_session.add(fund)

    # Create some transfers
    transfer1 = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        amount=1000.0,
        transfer_type="deposit",
        notes="Initial deposit",
        timestamp=datetime.utcnow(),
    )
    transfer2 = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        amount=500.0,
        transfer_type="withdrawal",
        notes="Profit taking",
        timestamp=datetime.utcnow(),
    )

    async_session.add_all([transfer1, transfer2])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/transfers")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 2
    # Should be ordered by timestamp desc (newest first)
    assert data[0]["transfer_type"] in ["deposit", "withdrawal"]


@pytest.mark.asyncio
async def test_reconcile_fund_balance(async_session):
    """Test balance reconciliation endpoint."""
    fund = build_fund(balance=5000.0)
    async_session.add(fund)

    # Create transfer history
    deposit = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        amount=10000.0,
        transfer_type="deposit",
        timestamp=datetime.utcnow(),
    )
    async_session.add(deposit)

    # Create transaction history (buy)
    transaction = Transaction(
        id=str(uuid.uuid4()),
        order_id=str(uuid.uuid4()),
        alpaca_order_id="test-order",
        fund_id=fund.id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.0,
        total_value=1500.0,
        timestamp=datetime.utcnow(),
    )
    async_session.add(transaction)

    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/reconcile")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert "current_balance" in data
    assert "ledger_balance" in data
    assert "discrepancy" in data
    assert "is_synced" in data
    assert "breakdown" in data

    # Ledger should be: 10000 (deposit) - 1500 (buy) = 8500
    assert data["breakdown"]["deposits"] == 10000.0
    assert data["breakdown"]["buys"] == 1500.0


@pytest.mark.asyncio
async def test_get_transfer_history_with_limit(async_session):
    """Test that transfer history respects limit parameter."""
    fund = build_fund()
    async_session.add(fund)

    # Create 10 transfers
    for i in range(10):
        transfer = Transfer(
            id=str(uuid.uuid4()),
            fund_id=fund.id,
            amount=100.0 * i,
            transfer_type="deposit",
            timestamp=datetime.utcnow(),
        )
        async_session.add(transfer)

    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session

        response = client.get(f"/api/funds/{fund.id}/transfers?limit=5")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert len(data) == 5
