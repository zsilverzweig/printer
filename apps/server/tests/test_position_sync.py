"""
Tests for position synchronization between Alpaca and fund transaction ledger.

Ensures that positions closed in Alpaca are properly reconciled with the fund's
internal transaction ledger.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.strategies.strategy_engine import StrategyEngine
from app.services.strategies.position_sync_service import PositionSyncService
from app.models.strategies import Fund
from tests.test_builders import build_fund


@pytest.mark.asyncio
async def test_detects_position_closed_in_alpaca():
    """Test that we detect when a position is closed in Alpaca but still in transaction ledger."""
    
    # Create a mock fund
    fund = build_fund(
        name="Test Fund",
        mode="sim",
        strategy_id="wyckoff",
        balance=10000.0,
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    mock_reconciliation_service = AsyncMock()
    
    # Mock Alpaca positions - AAPL is closed (not in list)
    mock_alpaca_service.get_positions.return_value = [
        {
            "symbol": "TSLA",
            "qty": 10.0,
            "current_price": 250.0,
            "unrealized_pl": 50.0,
            "unrealized_plpc": 0.02,
        }
    ]
    
    # Create position sync service
    sync_service = PositionSyncService(mock_alpaca_service)
    
    # Mock _get_fund_symbols to return both AAPL and TSLA
    # This simulates transaction ledger showing AAPL is still open
    with patch.object(sync_service, '_get_fund_symbols', return_value={'AAPL', 'TSLA'}):
        with patch.object(sync_service, '_get_position_details', return_value=(250.0, datetime.now(timezone.utc), {}, 250.0)):
            with patch.object(sync_service, '_reconcile_closed_position', new_callable=AsyncMock) as mock_reconcile:
                with patch('app.services.strategies.position_sync_service.get_reconciliation_service', return_value=mock_reconciliation_service):
                    # Refresh positions - should detect AAPL is closed in Alpaca
                    position_cache = await sync_service.refresh_positions_from_alpaca(
                        fund_id=str(fund.id),
                        fund_name=fund.name
                    )
                    
                    # Verify reconciliation was triggered for AAPL
                    mock_reconcile.assert_called_once_with(str(fund.id), fund.name, 'AAPL')
                    
                    # Verify position cache only has TSLA
                    assert 'TSLA' in position_cache
                    assert 'AAPL' not in position_cache


@pytest.mark.asyncio
async def test_reconcile_closed_position_calls_reconciliation_service():
    """Test that reconcile_closed_position properly uses the reconciliation service."""
    
    # Create a mock fund
    fund = build_fund(
        name="Test Fund",
        mode="sim",
        strategy_id="wyckoff",
        balance=10000.0,
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    mock_reconciliation_service = AsyncMock()
    mock_reconciliation_service.reconcile_symbol = AsyncMock(return_value=True)
    
    # Create position sync service
    sync_service = PositionSyncService(mock_alpaca_service)
    
    with patch('app.services.strategies.position_sync_service.get_reconciliation_service', return_value=mock_reconciliation_service):
        # Call reconcile closed position
        await sync_service._reconcile_closed_position(str(fund.id), fund.name, 'AAPL')
        
        # Verify reconciliation service was called
        mock_reconciliation_service.reconcile_symbol.assert_called_once_with(
            fund_id=str(fund.id),
            symbol='AAPL',
            order_id=None,
            attempt=1,
            total_attempts=1
        )


@pytest.mark.asyncio
async def test_no_reconciliation_when_all_positions_synced():
    """Test that reconciliation is not triggered when all positions are in sync."""
    
    # Create a mock fund
    fund = build_fund(
        name="Test Fund",
        mode="sim",
        strategy_id="wyckoff",
        balance=10000.0,
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    
    # Mock Alpaca positions
    mock_alpaca_service.get_positions.return_value = [
        {
            "symbol": "TSLA",
            "qty": 10.0,
            "current_price": 250.0,
            "unrealized_pl": 50.0,
            "unrealized_plpc": 0.02,
        }
    ]
    
    # Create position sync service
    sync_service = PositionSyncService(mock_alpaca_service)
    
    # Mock _get_fund_symbols to return only TSLA (matches Alpaca)
    with patch.object(sync_service, '_get_fund_symbols', return_value={'TSLA'}):
        with patch.object(sync_service, '_get_position_details', return_value=(250.0, datetime.now(timezone.utc), {}, 250.0)):
            with patch.object(sync_service, '_reconcile_closed_position', new_callable=AsyncMock) as mock_reconcile:
                # Refresh positions - should NOT trigger reconciliation
                position_cache = await sync_service.refresh_positions_from_alpaca(
                    fund_id=str(fund.id),
                    fund_name=fund.name
                )
                
                # Verify reconciliation was NOT called
                mock_reconcile.assert_not_called()
                
                # Verify position cache has TSLA
                assert 'TSLA' in position_cache
