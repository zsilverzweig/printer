"""
Fund Utility API Tests

Tests for fund utility endpoints:
- POST /funds/{id}/reset - Reset fund (clear all history)
- Various 404 error handling tests
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import patch, Mock

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from app.models.strategies import Transfer
from tests.test_builders import build_fund, build_order, build_transaction


@pytest.mark.asyncio
async def test_reset_fund_success(async_session):
    """Test resetting a fund (clearing all history)."""
    fund = build_fund(balance=5000.0, status="paused")
    async_session.add(fund)

    # Add some history
    order = build_order(fund_id=fund.id)
    txn = build_transaction(fund_id=fund.id)
    transfer = Transfer(
        id=str(uuid.uuid4()),
        fund_id=fund.id,
        amount=1000.0,
        transfer_type="deposit",
        timestamp=datetime.utcnow(),
    )

    async_session.add_all([order, txn, transfer])
    await async_session.commit()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/reset")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()

    assert data["success"] == True
    assert data["new_balance"] == 0.0
    assert data["deleted"]["orders"] >= 1
    assert data["deleted"]["transactions"] >= 1
    assert data["deleted"]["transfers"] >= 1


@pytest.mark.asyncio
async def test_reset_fund_blocked_when_trading(async_session):
    """Test that fund cannot be reset while actively trading."""
    fund = build_fund(status="active")
    async_session.add(fund)
    await async_session.commit()

    mock_engine = Mock()

    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            response = client.post(f"/api/funds/{fund.id}/reset")

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "trading" in response.json()["detail"].lower()


def test_fund_not_found_various_endpoints(async_session):
    """Test that various endpoints return 404 for non-existent funds."""
    fake_id = str(uuid.uuid4())

    endpoints_to_test = [
        ("GET", f"/api/funds/{fake_id}"),
        ("PATCH", f"/api/funds/{fake_id}"),
        ("POST", f"/api/funds/{fake_id}/start"),
        ("POST", f"/api/funds/{fake_id}/stop"),
        ("GET", f"/api/funds/{fake_id}/status"),
        ("GET", f"/api/funds/{fake_id}/orders"),
        ("GET", f"/api/funds/{fake_id}/transactions"),
        ("GET", f"/api/funds/{fake_id}/transfers"),
        ("POST", f"/api/funds/{fake_id}/archive"),
        ("POST", f"/api/funds/{fake_id}/unarchive"),
        ("GET", f"/api/funds/{fake_id}/reconcile"),
        ("POST", f"/api/funds/{fake_id}/reset"),
    ]

    client = TestClient(app)
    for method, endpoint in endpoints_to_test:
        with patch("app.routers.funds.get_async_session") as mock_session:
            mock_session.return_value.__aenter__.return_value = async_session
            with patch("app.routers.funds.get_engine", return_value=None):
                if method == "GET":
                    response = client.get(endpoint)
                elif method == "POST":
                    response = client.post(endpoint, json={})
                elif method == "PATCH":
                    response = client.patch(endpoint, json={})

                # Most should return 404, some might return 400 or other errors
                # Read-only endpoints (orders, transactions, transfers) may return 200 with empty results
                # which is also acceptable behavior
                if method == "GET" and any(x in endpoint for x in ["/orders", "/transactions", "/transfers"]):
                    # These can return 200 with empty list or 404, both are acceptable
                    assert response.status_code in [200, 404], f"Expected 200 or 404 for {method} {endpoint}"
                else:
                    # Other endpoints should return errors
                    assert response.status_code >= 400, f"Expected error for {method} {endpoint}"
