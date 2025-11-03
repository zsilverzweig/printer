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
from app.models.strategies import Fund


@pytest.mark.asyncio
async def test_detects_position_closed_in_alpaca():
    """Test that we detect when a position is closed in Alpaca but still in transaction ledger."""
    
    # Create a mock fund
    fund = Fund(
        id=str(uuid4()),
        user_id="test_user",
        name="Test Fund",
        mode="paper",
        strategy="wyckoff",
        config={},
        balance=10000.0,
        cash_balance=10000.0,
        is_active=True
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    mock_market_data_provider = AsyncMock()
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
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        alpaca_service=mock_alpaca_service,
        market_data_provider=mock_market_data_provider
    )
    
    # Mock _get_fund_symbols to return both AAPL and TSLA
    # This simulates transaction ledger showing AAPL is still open
    with patch.object(engine, '_get_fund_symbols', return_value={'AAPL', 'TSLA'}):
        with patch.object(engine, '_get_position_details', return_value=(150.0, datetime.now(timezone.utc), {}, 150.0)):
            with patch.object(engine, '_reconcile_closed_position', new_callable=AsyncMock) as mock_reconcile:
                with patch('app.services.strategies.strategy_engine.get_reconciliation_service', return_value=mock_reconciliation_service):
                    # Refresh positions - should detect AAPL is closed in Alpaca
                    await engine._refresh_positions_from_alpaca()
                    
                    # Verify reconciliation was triggered for AAPL
                    mock_reconcile.assert_called_once_with('AAPL')
                    
                    # Verify position cache only has TSLA
                    assert 'TSLA' in engine._position_cache
                    assert 'AAPL' not in engine._position_cache


@pytest.mark.asyncio
async def test_reconcile_closed_position_calls_reconciliation_service():
    """Test that reconcile_closed_position properly uses the reconciliation service."""
    
    # Create a mock fund
    fund = Fund(
        id=str(uuid4()),
        user_id="test_user",
        name="Test Fund",
        mode="paper",
        strategy="wyckoff",
        config={},
        balance=10000.0,
        cash_balance=10000.0,
        is_active=True
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    mock_market_data_provider = AsyncMock()
    mock_reconciliation_service = AsyncMock()
    mock_reconciliation_service.reconcile_symbol = AsyncMock(return_value=True)
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        alpaca_service=mock_alpaca_service,
        market_data_provider=mock_market_data_provider
    )
    
    with patch('app.services.strategies.strategy_engine.get_reconciliation_service', return_value=mock_reconciliation_service):
        # Call reconcile closed position
        await engine._reconcile_closed_position('AAPL')
        
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
    fund = Fund(
        id=str(uuid4()),
        user_id="test_user",
        name="Test Fund",
        mode="paper",
        strategy="wyckoff",
        config={},
        balance=10000.0,
        cash_balance=10000.0,
        is_active=True
    )
    
    # Create mocks
    mock_alpaca_service = AsyncMock()
    mock_market_data_provider = AsyncMock()
    
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
    
    # Create strategy engine
    engine = StrategyEngine(
        fund=fund,
        alpaca_service=mock_alpaca_service,
        market_data_provider=mock_market_data_provider
    )
    
    # Mock _get_fund_symbols to return only TSLA (matches Alpaca)
    with patch.object(engine, '_get_fund_symbols', return_value={'TSLA'}):
        with patch.object(engine, '_get_position_details', return_value=(250.0, datetime.now(timezone.utc), {}, 250.0)):
            with patch.object(engine, '_reconcile_closed_position', new_callable=AsyncMock) as mock_reconcile:
                # Refresh positions - should NOT trigger reconciliation
                await engine._refresh_positions_from_alpaca()
                
                # Verify reconciliation was NOT called
                mock_reconcile.assert_not_called()
                
                # Verify position cache has TSLA
                assert 'TSLA' in engine._position_cache
