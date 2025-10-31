"""Trading window and timezone tests for strategy-driven configurations."""

from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch

import pytest
import pytz

from app.services.strategy_engine import StrategyEngine
from app.strategies.base import EntrySignal, MarketData, TradingWindow
from tests.test_assertions import assert_trading_hours_respected
from tests.test_builders import build_fund


def test_trading_window_allows_within_range():
    """Strategies should allow trading inside the configured window."""
    window = TradingWindow(
        start_time="09:30",
        end_time="16:00",
        timezone="America/New_York",
    )
    ny_tz = pytz.timezone(window.timezone)
    within_window = ny_tz.localize(datetime(2024, 1, 15, 10, 30))

    assert_trading_hours_respected(window, within_window, should_allow_trading=True)


def test_trading_window_blocks_outside_range():
    """Strategies should block trading outside the configured window."""
    window = TradingWindow(
        start_time="09:30",
        end_time="16:00",
        timezone="America/New_York",
    )
    ny_tz = pytz.timezone(window.timezone)
    before_window = ny_tz.localize(datetime(2024, 1, 15, 9, 0))

    assert_trading_hours_respected(window, before_window, should_allow_trading=False)


def test_trading_without_window_is_always_allowed():
    """If no trading window is configured, trading should be allowed at all times."""
    any_time = datetime(2024, 1, 15, 3, 0)
    assert_trading_hours_respected(None, any_time, should_allow_trading=True)


def test_trading_window_converts_from_utc():
    """UTC timestamps should be converted using the trading window timezone."""
    window = TradingWindow(
        start_time="09:30",
        end_time="16:00",
        timezone="America/New_York",
    )
    utc_time = pytz.UTC.localize(datetime(2024, 1, 15, 15, 30))  # 10:30 AM ET

    assert_trading_hours_respected(window, utc_time, should_allow_trading=True)


@pytest.mark.asyncio
async def test_strategy_engine_skips_entries_outside_window():
    """StrategyEngine should not evaluate entries outside the trading window."""
    window = TradingWindow(
        start_time="09:30",
        end_time="16:00",
        timezone="America/New_York",
    )

    fund = build_fund(
        strategy_config={
            "trading_start_time": window.start_time,
            "trading_end_time": window.end_time,
            "timezone": window.timezone,
            "max_order_age_seconds": 60,
        }
    )

    strategy = Mock()
    strategy.id = "mock"
    strategy.name = "Mock Strategy"
    strategy.description = "Test"
    strategy.strategy_type = "math-based"
    strategy.get_trading_window.return_value = window
    strategy.get_max_order_age_seconds.return_value = None
    strategy.screen = AsyncMock(return_value=[{"ticker": "AAPL"}])
    strategy.get_monitored_symbols = AsyncMock(return_value=["AAPL"])
    strategy.should_enter = AsyncMock(return_value=EntrySignal(should_enter=False))
    strategy.should_exit = AsyncMock()
    strategy.should_scale_in = AsyncMock(return_value=None)
    strategy.should_scale_out = AsyncMock(return_value=None)
    strategy.position_sizing = AsyncMock(return_value=1000.0)

    market_data_provider = Mock()
    market_data_provider.build_market_data = AsyncMock(
        return_value=MarketData(
            symbol="AAPL",
            price=10.0,
            timestamp=datetime.utcnow(),
        )
    )

    alpaca_service = Mock()
    alpaca_service.paper_trading = True
    alpaca_service.get_positions = AsyncMock(return_value=[])
    alpaca_service.get_open_orders = AsyncMock(return_value=[])
    alpaca_service.place_market_order = AsyncMock()

    engine = StrategyEngine(
        fund=fund,
        execution_strategy=strategy,
        market_data_provider=market_data_provider,
        alpaca_service=alpaca_service,
    )

    engine.get_active_positions = AsyncMock(return_value={})
    engine.get_pending_orders = AsyncMock(return_value=[])

    with patch("app.services.strategy_engine.datetime") as mock_datetime:
        ny_tz = pytz.timezone(window.timezone)
        mock_datetime.now.return_value = ny_tz.localize(datetime(2024, 1, 15, 8, 0))
        mock_datetime.utcnow.return_value = datetime.utcnow()

        await engine._monitor_entries()

    strategy.should_enter.assert_not_awaited()
    alpaca_service.place_market_order.assert_not_called()


@pytest.mark.asyncio
async def test_strategy_engine_allows_entries_inside_window():
    """StrategyEngine should evaluate entries when inside the trading window."""
    window = TradingWindow(
        start_time="09:30",
        end_time="16:00",
        timezone="America/New_York",
    )

    fund = build_fund(
        strategy_config={
            "trading_start_time": window.start_time,
            "trading_end_time": window.end_time,
            "timezone": window.timezone,
        }
    )

    strategy = Mock()
    strategy.id = "mock"
    strategy.name = "Mock Strategy"
    strategy.description = "Test"
    strategy.strategy_type = "math-based"
    strategy.get_trading_window.return_value = window
    strategy.get_max_order_age_seconds.return_value = None
    strategy.screen = AsyncMock(return_value=[{"ticker": "AAPL"}])
    strategy.get_monitored_symbols = AsyncMock(return_value=["AAPL"])
    strategy.should_enter = AsyncMock(return_value=EntrySignal(should_enter=False))
    strategy.should_exit = AsyncMock()
    strategy.should_scale_in = AsyncMock(return_value=None)
    strategy.should_scale_out = AsyncMock(return_value=None)
    strategy.position_sizing = AsyncMock(return_value=1000.0)

    market_data_provider = Mock()
    market_data_provider.build_market_data = AsyncMock(
        return_value=MarketData(
            symbol="AAPL",
            price=10.0,
            timestamp=datetime.utcnow(),
        )
    )

    alpaca_service = Mock()
    alpaca_service.paper_trading = True
    alpaca_service.get_positions = AsyncMock(return_value=[])
    alpaca_service.get_open_orders = AsyncMock(return_value=[])
    alpaca_service.place_market_order = AsyncMock()

    engine = StrategyEngine(
        fund=fund,
        execution_strategy=strategy,
        market_data_provider=market_data_provider,
        alpaca_service=alpaca_service,
    )

    engine.get_active_positions = AsyncMock(return_value={})
    engine.get_pending_orders = AsyncMock(return_value=[])
    engine.monitored_symbols = ["AAPL"]

    with patch("app.services.strategy_engine.datetime") as mock_datetime:
        ny_tz = pytz.timezone(window.timezone)
        mock_datetime.now.return_value = ny_tz.localize(datetime(2024, 1, 15, 10, 0))
        mock_datetime.utcnow.return_value = datetime.utcnow()

        await engine._monitor_entries()

    strategy.should_enter.assert_awaited()
