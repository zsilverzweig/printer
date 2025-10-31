"""
Tests for GPT Candlestick Strategy.

Tests the AI-powered trading strategy including:
- Entry signal generation and level monitoring
- Price crossing detection
- Exit signals with stop loss management
- GPT response validation and error handling
"""
import math
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, Mock, patch, MagicMock
from typing import Dict, Any

from app.strategies.gpt_candlestick import (
    GPTCandlestickStrategy,
    GPTTradeSignal,
    GPTStopUpdate,
)
from app.strategies.base import MarketData, PositionContext, EntrySignal, ExitSignal


@pytest.fixture
def strategy_config():
    """Default configuration for the strategy."""
    return {
        "evaluation_interval_minutes": 15,
        "lookback_hours_1h": 48,
        "lookback_hours_15m": 6,
        "min_confidence": 0.6,
        "update_stop_interval_minutes": 15,
    }


@pytest.fixture
def strategy(strategy_config):
    """Create a GPT Candlestick strategy instance."""
    with patch("app.strategies.gpt_candlestick.get_gpt_helper"):
        return GPTCandlestickStrategy(strategy_config)


@pytest.fixture
def sample_market_data():
    """Sample market data for testing."""
    return MarketData(
        symbol="AAPL",
        price=150.0,
        timestamp=datetime.now(),
        volume=1000000,
    )


@pytest.fixture
def sample_bars_1h():
    """Sample 1-hour bars."""
    now = datetime.now()
    return [
        {
            "timestamp": now - timedelta(hours=i),
            "open": 145.0 + i * 0.5,
            "high": 146.0 + i * 0.5,
            "low": 144.0 + i * 0.5,
            "close": 145.5 + i * 0.5,
            "volume": 1000000,
        }
        for i in range(48, 0, -1)
    ]


@pytest.fixture
def sample_bars_15m():
    """Sample 15-minute bars."""
    now = datetime.now()
    return [
        {
            "timestamp": now - timedelta(minutes=15 * i),
            "open": 149.0 + i * 0.1,
            "high": 149.5 + i * 0.1,
            "low": 148.5 + i * 0.1,
            "close": 149.2 + i * 0.1,
            "volume": 100000,
        }
        for i in range(24, 0, -1)
    ]


@pytest.fixture
def sample_position():
    """Sample position for testing exits."""
    return PositionContext(
        position_id="test-pos-1",
        symbol="AAPL",
        entry_price=148.0,
        entry_time=datetime.now() - timedelta(minutes=30),
        quantity=10,
        current_price=150.0,
        unrealized_pnl=20.0,
        unrealized_pnl_percent=1.35,
        high_water_mark=151.0,
        strategy_state={"stop_loss": 146.0},
    )


# ============================================================================
# GPTTradeSignal Validation Tests
# ============================================================================


def test_gpt_trade_signal_validate_prices_valid():
    """Test validation of valid trade signal."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=145.0,
        confidence=0.75,
        reasoning="Valid setup",
    )
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert is_valid
    assert error is None


def test_gpt_trade_signal_validate_prices_zero_current_price():
    """Test validation rejects zero current price (prevents division by zero)."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=145.0,
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=0.0)
    assert not is_valid
    assert "current_price is invalid" in error


def test_gpt_trade_signal_validate_prices_negative_current_price():
    """Test validation rejects negative current price."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=145.0,
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=-10.0)
    assert not is_valid
    assert "current_price is invalid" in error


def test_gpt_trade_signal_validate_prices_nan():
    """Test validation rejects NaN values."""
    # Pydantic will reject NaN at construction due to gt=0 constraint
    # So we test by directly creating and validating a signal with manually set NaN
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=145.0,
        confidence=0.75,
        reasoning="Test",
    )
    # Manually set to NaN to test our validation
    signal.entry_price = float("nan")
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert not is_valid
    assert "not finite" in error


def test_gpt_trade_signal_validate_prices_infinity():
    """Test validation rejects infinity values."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=float("inf"),
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert not is_valid
    assert "not finite" in error


def test_gpt_trade_signal_validate_prices_too_far():
    """Test validation rejects entry price too far from current."""
    signal = GPTTradeSignal(
        entry_price=250.0,  # 67% above current
        stop_loss=240.0,
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=150.0)
    assert not is_valid
    assert "away from current price" in error


def test_gpt_trade_signal_validate_prices_stop_above_entry():
    """Test validation rejects stop loss above entry."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=152.0,  # Above entry
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert not is_valid
    assert "must be below entry_price" in error


def test_gpt_trade_signal_validate_prices_stop_too_tight():
    """Test validation rejects stop loss too tight."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=149.93,  # Only 0.047% below
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert not is_valid
    assert "too tight" in error


def test_gpt_trade_signal_validate_prices_stop_too_wide():
    """Test validation rejects stop loss too wide."""
    signal = GPTTradeSignal(
        entry_price=150.0,
        stop_loss=119.0,  # 21% below
        confidence=0.75,
        reasoning="Test",
    )
    
    is_valid, error = signal.validate_prices(current_price=149.0)
    assert not is_valid
    assert "too wide" in error


# ============================================================================
# GPTStopUpdate Validation Tests
# ============================================================================


def test_gpt_stop_update_validate_valid():
    """Test validation of valid stop update."""
    update = GPTStopUpdate(
        new_stop_loss=141.0,  # 94% of current price (150), within valid range
        reasoning="Trailing stop",
    )
    
    is_valid, error = update.validate_stop(
        current_stop=140.0,
        current_price=150.0,
        entry_price=148.0,
    )
    assert is_valid
    assert error is None


def test_gpt_stop_update_validate_lowering():
    """Test validation rejects lowering stop."""
    update = GPTStopUpdate(
        new_stop_loss=145.0,
        reasoning="Test",
    )
    
    is_valid, error = update.validate_stop(
        current_stop=146.0,
        current_price=150.0,
        entry_price=148.0,
    )
    assert not is_valid
    assert "Cannot lower stop" in error


def test_gpt_stop_update_validate_above_current_price():
    """Test validation rejects stop above current price."""
    update = GPTStopUpdate(
        new_stop_loss=151.0,
        reasoning="Test",
    )
    
    is_valid, error = update.validate_stop(
        current_stop=146.0,
        current_price=150.0,
        entry_price=148.0,
    )
    assert not is_valid
    assert "must be below current price" in error


def test_gpt_stop_update_validate_too_close():
    """Test validation rejects stop too close to current price."""
    update = GPTStopUpdate(
        new_stop_loss=149.5,  # 96.7% of current price
        reasoning="Test",
    )
    
    is_valid, error = update.validate_stop(
        current_stop=146.0,
        current_price=150.0,
        entry_price=148.0,
    )
    assert not is_valid
    assert "too close to current price" in error


def test_gpt_stop_update_validate_too_far_below_entry():
    """Test validation rejects stop too far below entry."""
    update = GPTStopUpdate(
        new_stop_loss=117.0,  # 79% of entry
        reasoning="Test",
    )
    
    is_valid, error = update.validate_stop(
        current_stop=116.0,
        current_price=150.0,
        entry_price=148.0,
    )
    assert not is_valid
    assert "too far below entry" in error


# ============================================================================
# Entry Signal Tests
# ============================================================================


@pytest.mark.asyncio
async def test_should_enter_first_evaluation_stores_level(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that first evaluation stores entry level for monitoring."""
    # Mock GPT response with valid signal
    gpt_response = GPTTradeSignal(
        entry_price=151.0,
        stop_loss=147.0,
        confidence=0.75,
        reasoning="Breakout above resistance",
    )
    
    # Mock GPT helper and candlestick data
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    # First call should evaluate and store level
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should not enter yet (price hasn't crossed)
    assert not signal.should_enter
    assert signal.reason == "monitoring"
    
    # Level should be stored
    assert "AAPL" in strategy._monitored_levels
    assert strategy._monitored_levels["AAPL"].entry_price == 151.0
    
    # Should have called GPT
    strategy.gpt_helper.get_structured_response.assert_called_once()


@pytest.mark.asyncio
async def test_should_enter_price_crosses_level_triggers_entry(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that price crossing entry level triggers market order."""
    # Mock GPT response
    gpt_response = GPTTradeSignal(
        entry_price=151.0,
        stop_loss=147.0,
        confidence=0.75,
        reasoning="Breakout",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    # First call - store level
    await strategy.should_enter("AAPL", sample_market_data)
    assert "AAPL" in strategy._monitored_levels
    
    # Second call - price crosses above entry level
    sample_market_data.price = 151.5  # Above entry level
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should trigger entry
    assert signal.should_enter
    assert signal.reason == "level_triggered"
    assert signal.order_type == "market"
    assert signal.stop_loss == 147.0
    assert signal.confidence == 0.75
    
    # Level should be removed after triggering
    assert "AAPL" not in strategy._monitored_levels
    
    # Metadata should include trigger details
    assert signal.metadata["target_entry_price"] == 151.0
    assert signal.metadata["triggered_at_price"] == 151.5


@pytest.mark.asyncio
async def test_should_enter_invalid_gpt_response(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that invalid GPT response is handled gracefully."""
    # Mock GPT response with invalid prices
    gpt_response = GPTTradeSignal(
        entry_price=250.0,  # Too far from current price
        stop_loss=240.0,
        confidence=0.75,
        reasoning="Test",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should not enter
    assert not signal.should_enter
    assert signal.reason == "invalid_gpt_response"
    
    # Should have error in metadata
    assert "error" in signal.metadata
    assert "away from current price" in signal.metadata["error"]
    
    # Level should not be stored
    assert "AAPL" not in strategy._monitored_levels


@pytest.mark.asyncio
async def test_should_enter_low_confidence(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that low confidence signal is rejected."""
    # Mock GPT response with low confidence
    gpt_response = GPTTradeSignal(
        entry_price=151.0,
        stop_loss=147.0,
        confidence=0.3,  # Below min_confidence of 0.6
        reasoning="Weak setup",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should not enter
    assert not signal.should_enter
    assert signal.reason == "low_confidence"
    
    # Level should not be stored
    assert "AAPL" not in strategy._monitored_levels


@pytest.mark.asyncio
async def test_should_enter_no_setup(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that 'no setup' response is handled."""
    # Mock GPT response with no setup (very small positive values that our code treats as "no setup")
    gpt_response = GPTTradeSignal(
        entry_price=0.01,  # Small value (code checks <= 0)
        stop_loss=0.01,
        confidence=0.0,
        reasoning="No clear setup",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    # Manually set prices to 0 after construction to test the <= 0 check
    gpt_response.entry_price = 0.0
    gpt_response.stop_loss = 0.0
    
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should not enter
    assert not signal.should_enter
    assert signal.reason == "no_setup"


@pytest.mark.asyncio
async def test_should_enter_gpt_exception(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that GPT exceptions are handled gracefully."""
    # Mock GPT to raise exception
    strategy.gpt_helper.get_structured_response = AsyncMock(
        side_effect=ValueError("GPT API error")
    )
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    signal = await strategy.should_enter("AAPL", sample_market_data)
    
    # Should not enter
    assert not signal.should_enter
    assert signal.reason == "analysis_error"
    
    # Level should not be stored
    assert "AAPL" not in strategy._monitored_levels


@pytest.mark.asyncio
async def test_should_enter_respects_evaluation_interval(
    strategy, sample_market_data, sample_bars_1h, sample_bars_15m
):
    """Test that evaluation only happens on interval boundaries."""
    gpt_response = GPTTradeSignal(
        entry_price=151.0,
        stop_loss=147.0,
        confidence=0.75,
        reasoning="Test",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(side_effect=[sample_bars_1h, sample_bars_15m])
    
    # First call - should evaluate
    await strategy.should_enter("AAPL", sample_market_data)
    assert strategy.gpt_helper.get_structured_response.call_count == 1
    
    # Second call immediately - should NOT evaluate again
    await strategy.should_enter("AAPL", sample_market_data)
    assert strategy.gpt_helper.get_structured_response.call_count == 1  # Still 1


# ============================================================================
# Exit Signal Tests
# ============================================================================


@pytest.mark.asyncio
async def test_should_exit_stop_loss_hit(strategy, sample_position, sample_market_data):
    """Test that stop loss triggers exit."""
    sample_market_data.price = 145.0  # Below stop loss of 146.0
    
    signal = await strategy.should_exit(sample_position, sample_market_data)
    
    assert signal.should_exit
    assert signal.reason == "stop_loss"
    assert signal.exit_price == 145.0


@pytest.mark.asyncio
async def test_should_exit_stop_not_hit(strategy, sample_position, sample_market_data):
    """Test that position holds when stop not hit."""
    sample_market_data.price = 150.0  # Above stop loss
    
    # Mock stop update to not run yet
    strategy._last_stop_update["AAPL"] = datetime.now()
    
    signal = await strategy.should_exit(sample_position, sample_market_data)
    
    assert not signal.should_exit


@pytest.mark.asyncio
async def test_should_exit_updates_stop_loss(
    strategy, sample_position, sample_market_data, sample_bars_15m
):
    """Test that stop loss is updated periodically."""
    sample_market_data.price = 152.0
    
    # Mock GPT response with raised stop
    gpt_response = GPTStopUpdate(
        new_stop_loss=148.0,  # Raised from 146.0
        reasoning="Trailing to breakeven",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(return_value=sample_bars_15m)
    
    signal = await strategy.should_exit(sample_position, sample_market_data)
    
    # Should not exit (stop not hit)
    assert not signal.should_exit
    
    # Should have called GPT for stop update
    strategy.gpt_helper.get_structured_response.assert_called_once()


@pytest.mark.asyncio
async def test_should_exit_invalid_stop_update(
    strategy, sample_position, sample_market_data, sample_bars_15m
):
    """Test that invalid stop update is rejected."""
    sample_market_data.price = 152.0
    
    # Mock GPT response trying to lower stop
    gpt_response = GPTStopUpdate(
        new_stop_loss=145.0,  # Lower than current 146.0
        reasoning="Test",
    )
    
    strategy.gpt_helper.get_structured_response = AsyncMock(return_value=gpt_response)
    strategy._get_candlesticks = AsyncMock(return_value=sample_bars_15m)
    
    signal = await strategy.should_exit(sample_position, sample_market_data)
    
    # Should not exit
    assert not signal.should_exit
    
    # Invalid update should be logged but not crash


@pytest.mark.asyncio
async def test_should_exit_stop_update_exception(
    strategy, sample_position, sample_market_data, sample_bars_15m
):
    """Test that stop update exceptions don't crash exit logic."""
    sample_market_data.price = 152.0
    
    # Mock GPT to raise exception
    strategy.gpt_helper.get_structured_response = AsyncMock(
        side_effect=ValueError("GPT error")
    )
    strategy._get_candlesticks = AsyncMock(return_value=sample_bars_15m)
    
    signal = await strategy.should_exit(sample_position, sample_market_data)
    
    # Should not exit (original stop still in place)
    assert not signal.should_exit
    
    # Exception should be caught and logged


@pytest.mark.asyncio
async def test_should_exit_no_stop_in_state(strategy, sample_market_data):
    """Test fallback when no stop loss in position state."""
    # Position without stop_loss in state
    position = PositionContext(
        position_id="test-pos",
        symbol="AAPL",
        entry_price=148.0,
        entry_time=datetime.now(),
        quantity=10,
        current_price=150.0,
        unrealized_pnl=20.0,
        unrealized_pnl_percent=1.35,
        high_water_mark=151.0,
        strategy_state={},  # No stop_loss
    )
    
    # Mock to skip update check
    strategy._last_stop_update["AAPL"] = datetime.now()
    
    # Price below fallback stop (95% of entry)
    sample_market_data.price = 140.0  # Below 148.0 * 0.95 = 140.6
    
    signal = await strategy.should_exit(position, sample_market_data)
    
    # Should exit using fallback stop
    assert signal.should_exit
    assert signal.reason == "stop_loss"


# ============================================================================
# Level Monitoring Tests
# ============================================================================


def test_log_monitored_levels_empty(strategy, caplog):
    """Test logging when no levels are monitored."""
    strategy._log_monitored_levels()
    
    # Should not log anything
    assert "Monitored Entry Levels" not in caplog.text


def test_log_monitored_levels_multiple(strategy, caplog):
    """Test logging multiple monitored levels."""
    # Add some monitored levels
    strategy._monitored_levels["AAPL"] = GPTTradeSignal(
        entry_price=151.0,
        stop_loss=147.0,
        confidence=0.75,
        reasoning="Test",
    )
    strategy._monitored_levels["MSFT"] = GPTTradeSignal(
        entry_price=380.0,
        stop_loss=375.0,
        confidence=0.82,
        reasoning="Test",
    )
    
    strategy._last_price["AAPL"] = 150.0
    strategy._last_price["MSFT"] = 378.0
    
    import logging
    with caplog.at_level(logging.INFO):
        strategy._log_monitored_levels()
    
    # Should log summary
    assert "Monitored Entry Levels (2)" in caplog.text
    assert "AAPL" in caplog.text
    assert "MSFT" in caplog.text


# ============================================================================
# Position Sizing Tests
# ============================================================================


@pytest.mark.asyncio
async def test_position_sizing_with_confidence(strategy):
    """Test that position sizing respects confidence."""
    signal = EntrySignal(
        should_enter=True,
        entry_price=150.0,
        confidence=0.75,
    )
    
    risk_params = {"size_per_trade": 1000.0}
    
    size = await strategy.position_sizing(signal, fund_balance=10000.0, risk_params=risk_params)
    
    # Should be size_per_trade * confidence
    assert size == 750.0  # 1000 * 0.75


@pytest.mark.asyncio
async def test_position_sizing_respects_max_bet(strategy):
    """Test that position sizing respects max bet percentage."""
    signal = EntrySignal(
        should_enter=True,
        entry_price=150.0,
        confidence=1.0,
    )
    
    risk_params = {
        "size_per_trade": 5000.0,
        "max_bet_percent": 10.0,  # 10% of 10000 = 1000
    }
    
    size = await strategy.position_sizing(signal, fund_balance=10000.0, risk_params=risk_params)
    
    # Should be capped at max_bet_percent
    assert size == 1000.0


# ============================================================================
# Configuration Tests
# ============================================================================


def test_strategy_properties(strategy):
    """Test strategy metadata properties."""
    assert strategy.id == "gpt_candlestick"
    assert strategy.name == "GPT Candlestick Analysis"
    assert strategy.strategy_type == "ai-based"
    assert strategy.expected_timeframe == "15+ minutes"
    assert strategy.required_indicators == []


def test_strategy_config_schema(strategy):
    """Test that config schema is properly defined."""
    schema = strategy.config_schema
    
    assert schema["type"] == "object"
    assert "evaluation_interval_minutes" in schema["properties"]
    assert "min_confidence" in schema["properties"]
    assert schema["properties"]["min_confidence"]["type"] == "number"


@pytest.mark.asyncio
async def test_get_monitored_symbols(strategy):
    """Test symbol monitoring."""
    candidates = [
        {"ticker": "AAPL"},
        {"ticker": "MSFT"},
        {"ticker": "GOOGL"},
    ]
    
    symbols = await strategy.get_monitored_symbols(
        candidates=candidates,
        active_position_count=1,
        active_order_count=0,
    )
    
    assert symbols == ["AAPL", "MSFT", "GOOGL"]

