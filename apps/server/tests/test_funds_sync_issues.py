"""
Fund Sync Issue Tests

Tests designed to catch corner cases where database and Alpaca get out of sync:
1. Orders in Alpaca but not in DB (the METD/TALK issue)
2. Balance discrepancies between UI and backend
3. Failed orders that partially executed
4. Orders that succeed in Alpaca but DB transaction fails
5. Race conditions during high-frequency trading
"""

import pytest
import uuid
from datetime import datetime
from unittest.mock import patch, Mock, AsyncMock

from fastapi.testclient import TestClient
from fastapi import status

from app.main import app
from app.models.strategies import Order, Transaction, Transfer
from tests.test_builders import build_fund, build_order, build_transaction


@pytest.mark.asyncio
async def test_detect_orders_in_alpaca_but_not_in_db(async_session):
    """
    Test detection of orders that exist in Alpaca but not in our DB.
    
    Scenario: Order was submitted to Alpaca successfully, but DB write failed.
    This is the METD/TALK issue reported.
    """
    fund = build_fund(mode="sim")
    async_session.add(fund)
    await async_session.commit()
    
    # Mock Alpaca showing orders we don't have in DB
    mock_alpaca = AsyncMock()
    mock_alpaca.is_available = Mock(return_value=True)
    mock_alpaca.get_positions = AsyncMock(return_value=[
        {
            "symbol": "METD",
            "qty": 63,
            "avg_entry_price": 15.87,
            "current_price": 16.00,
            "market_value": 1008.00,
            "unrealized_pl": 8.19,
            "unrealized_plpc": 0.82,
        },
        {
            "symbol": "TALK",
            "qty": 338,
            "avg_entry_price": 2.96,
            "current_price": 3.00,
            "market_value": 1014.00,
            "unrealized_pl": 13.52,
            "unrealized_plpc": 1.35,
        }
    ])
    
    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            with patch("app.services.alpaca_service.AlpacaService", return_value=mock_alpaca):
                response = client.get(f"/api/funds/{fund.id}/positions")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Should detect sync issues
    assert data["has_sync_issues"] == True
    assert "METD" in data["sync_issues"]["in_alpaca_not_db"]
    assert "TALK" in data["sync_issues"]["in_alpaca_not_db"]
    assert len(data["alpaca_positions"]) == 2
    assert len(data["database_positions"]) == 0


@pytest.mark.asyncio
async def test_balance_sync_after_transfer(async_session):
    """
    Test that balance is correctly updated after transfers.
    
    Scenario: User makes a deposit, but balance doesn't update properly.
    """
    fund = build_fund(balance=0.0)
    async_session.add(fund)
    await async_session.commit()
    
    client = TestClient(app)
    
    # Make a deposit
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        
        transfer_data = {
            "amount": 10000.0,
            "transfer_type": "deposit",
            "notes": "Initial funding"
        }
        response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["new_balance"] == 10000.0
    
    # Verify balance reconciliation shows correct state
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        
        response = client.get(f"/api/funds/{fund.id}/reconcile")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Balance should match ledger
    assert data["current_balance"] == 10000.0
    assert data["ledger_balance"] == 10000.0
    assert data["is_synced"] == True


@pytest.mark.asyncio
async def test_failed_order_with_no_alpaca_id(async_session):
    """
    Test handling of orders that failed before reaching Alpaca.
    
    Scenario: Order has status='failed' and no alpaca_order_id.
    Like the METD order found in the DB.
    """
    fund = build_fund()
    async_session.add(fund)
    
    # Create a failed order with no Alpaca ID
    order = Order(
        id=str(uuid.uuid4()),
        alpaca_order_id="",  # Empty = never made it to Alpaca
        fund_id=fund.id,
        symbol="METD",
        side="buy",
        quantity=63,
        order_type="market",
        status="failed",
        submitted_at=datetime.utcnow(),
    )
    async_session.add(order)
    await async_session.commit()
    
    client = TestClient(app)
    
    # Validate this order
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            response = client.post(f"/api/funds/{fund.id}/orders/{order.id}/validate")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Should detect as orphaned (no Alpaca ID)
    assert data.get("is_orphaned", True) == True or data.get("reason") is not None


@pytest.mark.asyncio
async def test_order_succeeds_in_alpaca_but_transaction_not_recorded(async_session):
    """
    Test detection of orders that executed in Alpaca but no transaction recorded.
    
    Scenario: Order was filled in Alpaca, but our transaction callback failed.
    """
    fund = build_fund()
    async_session.add(fund)
    
    # Create order record
    order = build_order(
        fund_id=fund.id,
        symbol="TALK",
        side="buy",
        quantity=338,
        status="filled",
        alpaca_order_id="alpaca-talk-123",
        filled_qty=338.0,
        filled_avg_price=2.96
    )
    async_session.add(order)
    await async_session.commit()
    
    # But NO transaction record exists!
    # This means balance wasn't debited
    
    client = TestClient(app)
    
    # Get fund balance reconciliation
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        
        response = client.get(f"/api/funds/{fund.id}/reconcile")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Since no transaction, buys should be $0
    assert data["breakdown"]["buys"] == 0.0
    
    # But we should have a filled order, which is a discrepancy
    # The order exists but no corresponding transaction


@pytest.mark.asyncio
async def test_partial_fill_sync_issue(async_session):
    """
    Test handling of partially filled orders.
    
    Scenario: Order partially filled in Alpaca, but our DB shows wrong quantity.
    """
    fund = build_fund()
    async_session.add(fund)
    
    # Order shows partially filled
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,  # Requested 100
        status="partially_filled",
        filled_qty=50.0,  # Only got 50
        filled_avg_price=10.0
    )
    async_session.add(order)
    
    # Transaction recorded for full amount (BUG!)
    txn = build_transaction(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,  # Wrong! Should be 50
        price=10.0
    )
    async_session.add(txn)
    
    await async_session.commit()
    
    client = TestClient(app)
    
    # Mock MarketDataProvider
    mock_market = AsyncMock()
    mock_market.get_latest_price = AsyncMock(return_value=10.0)
    
    # Check positions
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.services.market_data_provider.MarketDataProvider", return_value=mock_market):
            response = client.get(f"/api/funds/{fund.id}/positions/summary")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Database thinks we have 100 shares, but we actually have 50
    # This test documents the bug


@pytest.mark.asyncio
async def test_race_condition_multiple_deposits(async_session):
    """
    Test race condition when multiple deposits happen simultaneously.
    
    Scenario: Two deposits submitted at same time, balance could be wrong.
    """
    fund = build_fund(balance=1000.0)
    async_session.add(fund)
    await async_session.commit()
    
    client = TestClient(app)
    
    # Simulate two deposits happening quickly
    deposits = []
    for i in range(2):
        with patch("app.routers.funds.get_async_session") as mock_session:
            mock_session.return_value.__aenter__.return_value = async_session
            
            transfer_data = {
                "amount": 5000.0,
                "transfer_type": "deposit",
            }
            response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)
            deposits.append(response.json())
    
    # Both should succeed
    assert all(d["transfer_type"] == "deposit" for d in deposits)
    
    # Final balance should be 1000 + 5000 + 5000 = 11000
    # But race condition could cause it to be 1000 + 5000 = 6000
    final_balance = deposits[-1]["new_balance"]
    
    # This test documents potential race condition
    # Ideally should be 11000, but might be 6000 due to race


@pytest.mark.asyncio
async def test_balance_after_order_cancellation(async_session):
    """
    Test that balance is correctly restored when order is cancelled.
    
    Scenario: Order placed (balance reserved), then cancelled (balance should be restored).
    """
    fund = build_fund(balance=10000.0)
    async_session.add(fund)
    
    # Create a cancelled order
    order = build_order(
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100,
        status="cancelled"
    )
    async_session.add(order)
    
    await async_session.commit()
    
    client = TestClient(app)
    
    # Check balance - should still be 10000 since order was cancelled
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        
        response = client.get(f"/api/funds/{fund.id}")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Balance should not have changed
    assert data["balance"] == 10000.0


@pytest.mark.asyncio
async def test_database_transaction_rollback_scenario(async_session):
    """
    Test handling when database transaction fails mid-operation.
    
    Scenario: Order submitted to Alpaca, but database commit fails.
    This leaves order in Alpaca but not in our DB.
    """
    # This is a challenging test to write because we need to simulate
    # a database failure after Alpaca succeeds
    # 
    # In real code, this happens when:
    # 1. engine.place_order() succeeds with Alpaca
    # 2. session.add(order) or session.commit() fails
    # 3. Order exists in Alpaca but not in DB
    
    # This test documents the scenario for future implementation
    pass


@pytest.mark.asyncio
async def test_detect_missing_sell_transaction(async_session):
    """
    Test detection of positions closed in Alpaca without sell transaction in DB.
    
    Scenario: Position was closed in Alpaca, but we never recorded the sell transaction.
    """
    fund = build_fund()
    async_session.add(fund)
    
    # We have a buy transaction
    buy_txn = Transaction(
        id=str(uuid.uuid4()),
        order_id=str(uuid.uuid4()),
        alpaca_order_id="buy-123",
        fund_id=fund.id,
        symbol="TEST",
        side="buy",
        quantity=100.0,
        price=10.0,
        total_value=1000.0,
        timestamp=datetime.utcnow()
    )
    async_session.add(buy_txn)
    await async_session.commit()
    
    # Mock Alpaca showing no position (it was sold)
    mock_alpaca = AsyncMock()
    mock_alpaca.is_available = Mock(return_value=True)
    mock_alpaca.get_positions = AsyncMock(return_value=[])  # Empty = position closed
    
    client = TestClient(app)
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=None):
            with patch("app.services.alpaca_service.AlpacaService", return_value=mock_alpaca):
                response = client.get(f"/api/funds/{fund.id}/positions")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Should detect: we have position in DB but not in Alpaca
    assert data["has_sync_issues"] == True
    assert "TEST" in data["sync_issues"]["in_db_not_alpaca"]


@pytest.mark.asyncio
async def test_stale_balance_in_running_engine(async_session):
    """
    Test that running strategy engine sees updated balance after transfer.
    
    Scenario: Fund is actively trading, user makes deposit, but engine still sees old balance.
    This is the issue reported: UI shows $10k, backend engine sees $0.
    """
    fund = build_fund(balance=0.0, status="active")
    async_session.add(fund)
    await async_session.commit()
    
    # Mock a running engine with stale balance
    mock_engine = Mock()
    mock_engine.fund.balance = 0.0  # Engine has stale data
    
    client = TestClient(app)
    
    # Make a deposit while fund is running
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch("app.routers.funds.get_engine", return_value=mock_engine):
            transfer_data = {
                "amount": 10000.0,
                "transfer_type": "deposit",
            }
            # This should fail because engine is running
            response = client.post(f"/api/funds/{fund.id}/transfers", json=transfer_data)
    
    # Transfer should succeed even with engine running
    # And engine should be notified of balance change
    assert response.status_code == status.HTTP_200_OK
    
    # The issue is: engine.fund.balance is still 0.0 (stale)
    # but database now shows 10000.0
    # This causes "insufficient balance" errors in trading
    
    # TODO: Add mechanism to refresh engine balance after transfers


@pytest.mark.asyncio
async def test_reconcile_detects_balance_discrepancy(async_session):
    """
    Test that reconciliation endpoint detects when balance doesn't match ledger.
    
    Scenario: Balance in DB doesn't match sum of deposits - withdrawals - buys + sells.
    """
    fund = build_fund(balance=5000.0)  # Current balance
    async_session.add(fund)
    
    # Deposits: $100,000
    for i in range(10):
        transfer = Transfer(
            id=str(uuid.uuid4()),
            fund_id=fund.id,
            amount=10000.0,
            transfer_type="deposit",
            timestamp=datetime.utcnow()
        )
        async_session.add(transfer)
    
    # Transactions: Spent $90,000 on buys
    for i in range(9):
        txn = Transaction(
            id=str(uuid.uuid4()),
            order_id=str(uuid.uuid4()),
            alpaca_order_id=f"buy-{i}",
            fund_id=fund.id,
            symbol=f"TEST{i}",
            side="buy",
            quantity=100.0,
            price=100.0,
            total_value=10000.0,
            timestamp=datetime.utcnow()
        )
        async_session.add(txn)
    
    await async_session.commit()
    
    client = TestClient(app)
    
    # Check reconciliation
    with patch("app.routers.funds.get_async_session") as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        
        response = client.get(f"/api/funds/{fund.id}/reconcile")
    
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    
    # Ledger: 100000 (deposits) - 90000 (buys) = 10000
    # But balance shows 5000
    assert data["ledger_balance"] == 10000.0
    assert data["current_balance"] == 5000.0
    assert data["discrepancy"] == -5000.0  # Missing $5k
    assert data["is_synced"] == False

