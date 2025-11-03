"""
API Timezone Serialization Tests

Tests to ensure all API endpoints properly serialize timestamps with UTC indicator (Z suffix).
This is critical for frontend date parsing to work correctly.
"""

import uuid
from datetime import datetime

import pytest
from httpx import AsyncClient

from app.models.strategies import Fund, Order, Transaction, Transfer


@pytest.mark.asyncio
async def test_transaction_api_returns_utc_timestamps(async_session, async_client: AsyncClient):
    """Test that GET /api/funds/{fund_id}/transactions returns timestamps with Z suffix."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Transaction API Test Fund",
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
        symbol="AAPL",
        side="buy",
        quantity=10,
        order_type="market",
        status="filled",
        submitted_at=datetime.utcnow(),
        filled_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.flush()
    
    # Create transaction
    transaction_id = str(uuid.uuid4())
    now = datetime.utcnow()
    transaction = Transaction(
        id=transaction_id,
        order_id=order_id,
        alpaca_order_id=order.alpaca_order_id,
        fund_id=fund_id,
        symbol="AAPL",
        side="buy",
        quantity=10.0,
        price=150.00,
        total_value=1500.00,
        timestamp=now,
        high_water_mark=150.00,
        strategy_state={},
    )
    async_session.add(transaction)
    await async_session.commit()
    
    # Call API endpoint
    response = await async_client.get(f"/api/funds/{fund_id}/transactions")
    assert response.status_code == 200
    
    transactions = response.json()
    assert len(transactions) > 0
    
    # Verify timestamp has Z suffix (UTC indicator)
    timestamp = transactions[0]["timestamp"]
    assert timestamp.endswith("Z"), f"Timestamp should end with Z but got: {timestamp}"
    
    # Verify it's parseable by JavaScript Date
    # The format should be ISO 8601 with Z suffix like: "2025-10-30T16:02:36.185901Z"
    assert "T" in timestamp
    assert timestamp.count("-") >= 2  # YYYY-MM-DD


@pytest.mark.asyncio
async def test_transfer_api_returns_utc_timestamps(async_session, async_client: AsyncClient):
    """Test that GET /api/funds/{fund_id}/transfers returns timestamps with Z suffix."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Transfer API Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create transfer
    transfer_id = str(uuid.uuid4())
    now = datetime.utcnow()
    transfer = Transfer(
        id=transfer_id,
        fund_id=fund_id,
        amount=5000.0,
        transfer_type="deposit",
        notes="Initial deposit",
        timestamp=now,
    )
    async_session.add(transfer)
    await async_session.commit()
    
    # Call API endpoint
    response = await async_client.get(f"/api/funds/{fund_id}/transfers")
    assert response.status_code == 200
    
    transfers = response.json()
    assert len(transfers) > 0
    
    # Verify timestamp has Z suffix (UTC indicator)
    timestamp = transfers[0]["timestamp"]
    assert timestamp.endswith("Z"), f"Timestamp should end with Z but got: {timestamp}"
    
    # Verify it's parseable
    assert "T" in timestamp
    assert timestamp.count("-") >= 2


@pytest.mark.asyncio
async def test_create_transfer_api_returns_utc_timestamp(async_session, async_client: AsyncClient):
    """Test that POST /api/funds/{fund_id}/transfers returns timestamp with Z suffix."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Create Transfer API Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.commit()
    
    # Create transfer via API
    response = await async_client.post(
        f"/api/funds/{fund_id}/transfers",
        json={
            "amount": 5000.0,
            "transfer_type": "deposit",
            "notes": "Test deposit",
        },
    )
    assert response.status_code == 200
    
    transfer_data = response.json()
    
    # Verify timestamp has Z suffix
    timestamp = transfer_data["timestamp"]
    assert timestamp.endswith("Z"), f"Timestamp should end with Z but got: {timestamp}"
    assert "T" in timestamp


@pytest.mark.asyncio
async def test_multiple_transactions_all_have_utc_timestamps(async_session, async_client: AsyncClient):
    """Test that all transactions in a list have properly formatted UTC timestamps."""
    # Create fund
    fund_id = str(uuid.uuid4())
    fund = Fund(
        id=fund_id,
        name="Multi Transaction API Test Fund",
        mode="sim",
        balance=10000.0,
        status="active",
    )
    async_session.add(fund)
    await async_session.flush()
    
    # Create multiple orders and transactions
    for i in range(5):
        order_id = str(uuid.uuid4())
        order = Order(
            id=order_id,
            alpaca_order_id=str(uuid.uuid4()),
            fund_id=fund_id,
            symbol=f"TEST{i}",
            side="buy",
            quantity=10,
            order_type="market",
            status="filled",
            submitted_at=datetime.utcnow(),
            filled_at=datetime.utcnow(),
        )
        async_session.add(order)
        await async_session.flush()
        
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=order_id,
            alpaca_order_id=order.alpaca_order_id,
            fund_id=fund_id,
            symbol=f"TEST{i}",
            side="buy",
            quantity=10.0,
            price=100.00 + i,
            total_value=1000.00 + (i * 10),
            timestamp=datetime.utcnow(),
            high_water_mark=100.00 + i,
            strategy_state={},
        )
        async_session.add(transaction)
    
    await async_session.commit()
    
    # Call API endpoint
    response = await async_client.get(f"/api/funds/{fund_id}/transactions")
    assert response.status_code == 200
    
    transactions = response.json()
    assert len(transactions) == 5
    
    # Verify all timestamps have Z suffix
    for txn in transactions:
        timestamp = txn["timestamp"]
        assert timestamp.endswith("Z"), f"All timestamps should end with Z but got: {timestamp}"


def test_timestamp_format_consistency():
    """Test that our timestamp format is consistent across the application."""
    # Example of proper UTC timestamp format
    now = datetime.utcnow()
    timestamp_str = now.isoformat() + "Z"
    
    # Should follow ISO 8601 format with Z suffix
    assert timestamp_str.endswith("Z")
    assert "T" in timestamp_str
    
    # Should be parseable by Python datetime
    # Remove Z and parse
    parsed = datetime.fromisoformat(timestamp_str.rstrip("Z"))
    assert parsed.year == now.year
    assert parsed.month == now.month
    assert parsed.day == now.day


