"""
Tests for Four Red Candles V2 Strategy
"""

import pytest
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from app.strategies.four_red_candles_v2 import FourRedCandlesV2Strategy
from app.strategies.base import MarketDataSnapshot, PositionContext


def create_bar(
    open_price: float,
    high: float,
    low: float,
    close: float,
    volume: int = 1_000_000,
    timestamp: datetime = None
) -> Dict[str, Any]:
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    ts_ms = int(timestamp.timestamp() * 1000)
    return {
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "o": open_price,
        "h": high,
        "l": low,
        "c": close,
        "v": volume,
        "timestamp": timestamp,
        "t": ts_ms,
    }


def create_market_data_snapshot(
    symbol: str,
    price: float,
    bars: List[Dict[str, Any]],
    timestamp: datetime = None
) -> MarketDataSnapshot:
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    return MarketDataSnapshot(
        symbol=symbol,
        price=price,
        timestamp=timestamp,
        bars=bars,
    )


class TestFourRedCandlesV2Strategy:
    @pytest.fixture
    def strategy(self):
        return FourRedCandlesV2Strategy({})

    @pytest.mark.asyncio
    async def test_analyze_entry_breakout_uses_close(self, strategy):
        """Entry breakout level should use close of 3rd red candle."""
        base_time = datetime(2025, 11, 11, 15, 8, tzinfo=timezone.utc)
        bars = [
            create_bar(1.80, 1.81, 1.78, 1.79, timestamp=base_time - timedelta(minutes=2)),
            create_bar(1.79, 1.80, 1.75, 1.76, timestamp=base_time - timedelta(minutes=1)),
            create_bar(1.76, 1.76, 1.70, 1.71, timestamp=base_time),
        ]
        market_snapshot = create_market_data_snapshot("GREE", 1.70, bars)

        setup_result = await strategy.analyze_setup(["GREE"], {"GREE": market_snapshot})
        assert setup_result == ["GREE"]

        entry_signal = await strategy.analyze_entry("GREE", market_snapshot)
        assert entry_signal is not None
        assert entry_signal.entry_price == pytest.approx(1.71)
        assert entry_signal.stop_loss < entry_signal.entry_price

    @pytest.mark.asyncio
    async def test_analyze_entry_invalidated_by_green_candle(self, strategy):
        """Setup should be invalidated if green candle fails to break third open."""
        base_time = datetime(2025, 11, 11, 15, 8, tzinfo=timezone.utc)
        red_bars = [
            create_bar(1.80, 1.81, 1.78, 1.79, timestamp=base_time - timedelta(minutes=2)),
            create_bar(1.79, 1.80, 1.75, 1.76, timestamp=base_time - timedelta(minutes=1)),
            create_bar(1.76, 1.76, 1.70, 1.71, timestamp=base_time),
        ]
        green_bar = create_bar(
            1.71, 1.72, 1.69, 1.72, timestamp=base_time + timedelta(minutes=1)
        )
        # Lower the high to keep it beneath third open (1.76)
        green_bar["high"] = 1.75

        initial_snapshot = create_market_data_snapshot("GREE", 1.70, red_bars)
        setup_result = await strategy.analyze_setup(["GREE"], {"GREE": initial_snapshot})
        assert setup_result == ["GREE"]

        post_snapshot = create_market_data_snapshot("GREE", 1.72, red_bars + [green_bar])
        entry_signal = await strategy.analyze_entry("GREE", post_snapshot)
        assert entry_signal is None

        # ensure candidate removed
        assert "GREE" not in strategy._setup_candidates

    @pytest.mark.asyncio
    async def test_manage_position_triggers_partial_exit(self, strategy):
        """Manage position should scale out 50% at +2% profit."""
        entry_price = 10.0
        position = PositionContext(
            symbol="GREE",
            entry_price=entry_price,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=entry_price,
            unrealized_pnl=0.0,
            unrealized_pnl_percent=0.0,
            strategy_state={},
        )
        market_snapshot = create_market_data_snapshot("GREE", entry_price * 1.021, [])

        update = await strategy.manage_position(position, market_snapshot)
        assert update.scale_out_percent == pytest.approx(50.0)
        assert update.current_stop == pytest.approx(entry_price)
        assert update.metadata.get("has_scaled_out") is True

    @pytest.mark.asyncio
    async def test_manage_position_does_not_repeat_partial_exit(self, strategy):
        """After initial scale-out, strategy should not rescale."""
        entry_price = 20.0
        position = PositionContext(
            symbol="GREE",
            entry_price=entry_price,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=entry_price,
            unrealized_pnl=0.0,
            unrealized_pnl_percent=0.0,
            strategy_state={},
        )
        market_snapshot = create_market_data_snapshot("GREE", entry_price * 1.025, [])

        first_update = await strategy.manage_position(position, market_snapshot)
        position.strategy_state.update(first_update.metadata or {})

        second_update = await strategy.manage_position(position, market_snapshot)
        assert second_update.scale_out_percent is None
        assert second_update.current_stop == pytest.approx(entry_price)

    @pytest.mark.asyncio
    async def test_manage_position_returns_base_stop_pre_profit(self, strategy):
        """Before profit target, stop should stay at configured percentage below entry."""
        entry_price = 5.0
        position = PositionContext(
            symbol="GREE",
            entry_price=entry_price,
            entry_time=datetime.now(timezone.utc),
            quantity=50.0,
            current_price=entry_price,
            unrealized_pnl=0.0,
            unrealized_pnl_percent=0.0,
            strategy_state={},
        )
        market_snapshot = create_market_data_snapshot("GREE", entry_price * 1.01, [])

        update = await strategy.manage_position(position, market_snapshot)
        expected_stop = entry_price * (1 - strategy.stop_loss_percent / 100)
        assert update.current_stop == pytest.approx(expected_stop)
        assert update.scale_out_percent is None


