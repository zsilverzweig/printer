"""
Balance Validation Tests

Tests to ensure that the strategy engine properly validates fund balance before placing orders.
These tests verify that orders are rejected when the fund has insufficient balance.
"""

import sys
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch, Mock

import pytest

# Import StrategyEngine and related classes
from app.services.strategy_engine import StrategyEngine
from app.strategies.base import (
    EntrySignal,
    ExitSignal,
    MarketData,
    PositionContext,
)


@pytest.fixture
def mock_fund():
    """Create a mock fund with limited balance."""
    fund = Mock()
    fund.id = str(uuid.uuid4())
    fund.name = "Test Fund"
    fund.mode = "sim"
    fund.balance = 100.0  # Only $100 balance
    fund.status = "active"
    fund.strategy_id = "test_strategy"
    fund.strategy_config = {}
    fund.size_per_trade = 1000.0  # Wants to trade $1000 per position
    fund.max_bet_percent = None
    fund.min_bet_percent = None
    fund.max_total_exposure = None
    fund.max_loss_percent = None
    fund.max_loss_dollars = None
    fund.max_giveback_percent = None
    return fund


@pytest.fixture
def mock_execution_strategy():
    """Create a mock execution strategy."""
    strategy = AsyncMock()
    strategy.position_sizing = AsyncMock(return_value=1000.0)  # Returns $1000 position size
    strategy.get_trading_window.return_value = None
    strategy.get_max_order_age_seconds.return_value = None
    strategy.screen = AsyncMock(return_value=[])
    strategy.get_monitored_symbols = AsyncMock(return_value=[])
    strategy.should_enter = AsyncMock(return_value=EntrySignal(should_enter=False))
    strategy.should_exit = AsyncMock(return_value=ExitSignal(should_exit=False))
    strategy.should_scale_in = AsyncMock(return_value=None)
    strategy.should_scale_out = AsyncMock(return_value=None)
    return strategy


@pytest.fixture
def mock_market_data_provider():
    """Create a mock market data provider."""
    provider = AsyncMock()
    provider.build_market_data = AsyncMock(
        return_value=MarketData(
            symbol="TEST",
            price=10.0,  # $10 per share
            timestamp=datetime.utcnow(),
        )
    )
    return provider


@pytest.fixture
def mock_alpaca_service():
    """Create a mock Alpaca service."""
    service = AsyncMock()
    service.paper_trading = True
    service.place_market_order = AsyncMock(
        return_value={"id": "alpaca-order-123", "status": "pending"}
    )
    service.get_positions = AsyncMock(return_value=[])
    return service


@pytest.mark.asyncio
async def test_insufficient_balance_prevents_order(
    mock_fund,
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that orders are prevented when fund has insufficient balance.
    
    Scenario:
    - Fund balance: $100
    - Share price: $10
    - size_per_trade: $1000
    - Calculated position: $1000 / $10 = 100 shares
    - Actual cost: 100 shares * $10 = $1000
    - Expected: Order should be REJECTED because $1000 > $100 balance
    """
    engine = StrategyEngine(
        fund=mock_fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    # Simulate entry signal
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=10.0,
        reason="Test entry",
    )
    
    market_data = MarketData(
        symbol="TEST",
        price=10.0,
        timestamp=datetime.utcnow(),
    )
    
    # THIS TEST SHOULD FAIL initially because we DON'T check balance
    await engine._enter_position("TEST", entry_signal, market_data)
    
    # Order should NOT have been placed because insufficient balance
    # Expected: place_market_order should NOT be called
    assert not mock_alpaca_service.place_market_order.called, (
        "Order was placed despite insufficient balance! "
        f"Fund balance: ${mock_fund.balance:.2f}, "
        f"Order cost: $1000.00"
    )


@pytest.mark.asyncio
@patch('app.services.strategy_engine.get_async_session')
async def test_sufficient_balance_allows_order(
    mock_get_session,
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that orders are allowed when fund has sufficient balance.
    
    Scenario:
    - Fund balance: $2000
    - Share price: $10
    - size_per_trade: $1000
    - Calculated position: $1000 / $10 = 100 shares
    - Actual cost: 100 shares * $10 = $1000
    - Expected: Order should be ALLOWED because $1000 <= $2000 balance
    """
    # Mock database session
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)
    mock_session.add = Mock()
    mock_session.commit = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_get_session.return_value = mock_session
    
    fund = Mock()
    fund.id = str(uuid.uuid4())
    fund.name = "Well Funded"
    fund.mode = "sim"
    fund.balance = 2000.0  # Plenty of balance
    fund.status = "active"
    fund.strategy_id = "test_strategy"
    fund.strategy_config = {}
    fund.size_per_trade = 1000.0
    fund.max_bet_percent = None
    fund.min_bet_percent = None
    fund.max_total_exposure = None
    fund.max_loss_percent = None
    fund.max_loss_dollars = None
    fund.max_giveback_percent = None
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=10.0,
        reason="Test entry",
    )
    
    market_data = MarketData(
        symbol="TEST",
        price=10.0,
        timestamp=datetime.utcnow(),
    )
    
    await engine._enter_position("TEST", entry_signal, market_data)
    
    # Order should have been placed
    assert mock_alpaca_service.place_market_order.called, (
        "Order was not placed despite sufficient balance!"
    )


@pytest.mark.asyncio
@patch('app.services.strategy_engine.get_async_session')
async def test_exact_balance_match_allows_order(
    mock_get_session,
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that orders are allowed when fund balance exactly matches order cost.
    
    Scenario:
    - Fund balance: $1000
    - Share price: $10
    - size_per_trade: $1000
    - Calculated position: $1000 / $10 = 100 shares
    - Actual cost: 100 shares * $10 = $1000
    - Expected: Order should be ALLOWED because $1000 == $1000 balance
    """
    # Mock database session
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)
    mock_session.add = Mock()
    mock_session.commit = AsyncMock()
    mock_session.execute = AsyncMock()
    mock_get_session.return_value = mock_session
    
    fund = Mock()
    fund.id = str(uuid.uuid4())
    fund.name = "Exact Balance"
    fund.mode = "sim"
    fund.balance = 1000.0  # Exactly enough
    fund.status = "active"
    fund.strategy_id = "test_strategy"
    fund.strategy_config = {}
    fund.size_per_trade = 1000.0
    fund.max_bet_percent = None
    fund.min_bet_percent = None
    fund.max_total_exposure = None
    fund.max_loss_percent = None
    fund.max_loss_dollars = None
    fund.max_giveback_percent = None
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=10.0,
        reason="Test entry",
    )
    
    market_data = MarketData(
        symbol="TEST",
        price=10.0,
        timestamp=datetime.utcnow(),
    )
    
    await engine._enter_position("TEST", entry_signal, market_data)
    
    # Order should have been placed
    assert mock_alpaca_service.place_market_order.called, (
        "Order was not placed despite exact balance match!"
    )


@pytest.mark.asyncio
async def test_fractional_share_cost_rounds_down(
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that fractional shares are rounded down and balance is checked on actual cost.
    
    Scenario:
    - Fund balance: $150
    - Share price: $17.50
    - size_per_trade: $200
    - Calculated position: $200 / $17.50 = 11.43 shares → 11 shares
    - Actual cost: 11 shares * $17.50 = $192.50
    - Expected: Order should be REJECTED because $192.50 > $150 balance
    """
    fund = Mock()
    fund.id = str(uuid.uuid4())
    fund.name = "Fractional Test"
    fund.mode = "sim"
    fund.balance = 150.0
    fund.status = "active"
    fund.strategy_id = "test_strategy"
    fund.strategy_config = {}
    fund.size_per_trade = 200.0
    fund.max_bet_percent = None
    fund.min_bet_percent = None
    fund.max_total_exposure = None
    fund.max_loss_percent = None
    fund.max_loss_dollars = None
    fund.max_giveback_percent = None
    
    # Mock position sizing to return $200
    mock_execution_strategy.position_sizing = AsyncMock(return_value=200.0)
    
    # Mock market data with $17.50 price
    mock_market_data_provider.build_market_data = AsyncMock(
        return_value=MarketData(
            symbol="TEST",
            price=17.50,
            timestamp=datetime.utcnow(),
        )
    )
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=17.50,
        reason="Test entry",
    )
    
    market_data = MarketData(
        symbol="TEST",
        price=17.50,
        timestamp=datetime.utcnow(),
    )
    
    await engine._enter_position("TEST", entry_signal, market_data)
    
    # Order should NOT have been placed
    assert not mock_alpaca_service.place_market_order.called, (
        "Order was placed despite insufficient balance! "
        f"Fund balance: ${fund.balance:.2f}, "
        f"Order cost: $192.50 (11 shares @ $17.50)"
    )


@pytest.mark.asyncio
async def test_zero_balance_prevents_all_orders(
    mock_fund,
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that no orders can be placed when fund has zero balance.
    
    Scenario:
    - Fund balance: $0
    - Share price: $1
    - Expected: Order should be REJECTED
    """
    mock_fund.balance = 0.0  # Reset to zero
    
    engine = StrategyEngine(
        fund=mock_fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    # Mock cheap stock at $1
    market_data = MarketData(
        symbol="PENNY",
        price=1.0,
        timestamp=datetime.utcnow(),
    )
    
    mock_market_data_provider.build_market_data = AsyncMock(return_value=market_data)
    
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=1.0,
        reason="Test entry",
    )
    
    await engine._enter_position("PENNY", entry_signal, market_data)
    
    # No order should be placed with zero balance
    assert not mock_alpaca_service.place_market_order.called, (
        "Order was placed despite zero balance!"
    )


@pytest.mark.asyncio
async def test_negative_balance_prevents_orders(
    mock_fund,
    mock_execution_strategy,
    mock_market_data_provider,
    mock_alpaca_service,
):
    """
    Test that no orders can be placed when fund has negative balance.
    
    This could happen if there was a bug or manual adjustment.
    
    Scenario:
    - Fund balance: -$50
    - Share price: $10
    - Expected: Order should be REJECTED
    """
    mock_fund.balance = -50.0  # Negative balance (bug scenario)
    
    engine = StrategyEngine(
        fund=mock_fund,
        execution_strategy=mock_execution_strategy,
        market_data_provider=mock_market_data_provider,
        alpaca_service=mock_alpaca_service,
    )
    
    market_data = MarketData(
        symbol="TEST",
        price=10.0,
        timestamp=datetime.utcnow(),
    )
    
    entry_signal = EntrySignal(
        should_enter=True,
        entry_price=10.0,
        reason="Test entry",
    )
    
    await engine._enter_position("TEST", entry_signal, market_data)
    
    # No order should be placed with negative balance
    assert not mock_alpaca_service.place_market_order.called, (
        "Order was placed despite negative balance!"
    )

