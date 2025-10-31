from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.strategies.base import MarketData, PositionContext
from app.strategies.failed_equal_highs import FailedEqualHighsBreakoutStrategy


ET = ZoneInfo("America/New_York")


def make_bar(ts: datetime, open_: float, high: float, low: float, close: float, volume: int, avg_volume: int) -> dict:
    return {
        "timestamp": ts,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "avg_volume_20d_5m": avg_volume,
    }


def generate_base_bars(start: datetime, count: int, base_price: float = 100.0) -> list[dict]:
    bars = []
    price = base_price
    for idx in range(count):
        ts = start + timedelta(minutes=5 * idx)
        open_ = price
        high = price + 0.3
        low = price - 0.3
        close = price + 0.05
        volume = 9000 + (idx % 5) * 500
        bars.append(make_bar(ts, open_, high, low, close, volume, 8000))
        price = close
    return bars


@pytest.mark.asyncio
async def test_should_enter_signals_on_failed_equal_highs() -> None:
    strategy = FailedEqualHighsBreakoutStrategy({})

    start = datetime(2024, 1, 2, 9, 35, tzinfo=ET)
    bars = generate_base_bars(start, 24)

    # Create equal highs around 102.0 within tolerance
    bars[16]["high"] = 102.0
    bars[16]["close"] = 101.6
    bars[19]["high"] = 102.01
    bars[19]["close"] = 101.5

    # Current bar sweeps and rejects
    current_ts = start + timedelta(minutes=5 * 24)
    current_bar = make_bar(
        current_ts,
        open_=101.7,
        high=102.15,
        low=101.2,
        close=101.35,
        volume=16000,
        avg_volume=12000,
    )
    bars.append(current_bar)

    # 4:50s proxy timestamp (10 seconds before close)
    proxy_ts = current_ts + timedelta(minutes=5) - timedelta(seconds=8)

    market_data = MarketData(
        symbol="AAPL",
        price=101.33,
        timestamp=proxy_ts,
        bars=bars,
        indicators={},
    )

    signal = await strategy.should_enter("AAPL", market_data)

    assert signal.should_enter is True
    assert signal.reason == "failed_equal_highs_short"
    assert pytest.approx(signal.entry_price, rel=1e-5) == 101.33
    assert "AAPL" in strategy._pending_states
    pending = strategy._pending_states["AAPL"]
    assert pending["stop_price"] > signal.entry_price
    assert pending["tp1_price"] < signal.entry_price


@pytest.mark.asyncio
async def test_should_scale_out_returns_signal_at_tp1() -> None:
    strategy = FailedEqualHighsBreakoutStrategy({})

    entry_time = datetime(2024, 1, 2, 10, 5, tzinfo=ET)
    state = {
        "stop_price": 101.6,
        "tp1_price": 100.7,
        "tp2_price": 99.9,
        "risk_per_share": 0.9,
        "initialized": False,
        "half_r_progress": False,
        "best_price": 101.2,
    }

    strategy._pending_states["AAPL"] = state

    position = PositionContext(
        position_id="pos-1",
        symbol="AAPL",
        entry_price=101.6,
        entry_time=entry_time,
        quantity=100,
        current_price=100.9,
        unrealized_pnl=(100.9 - 101.6) * 100,
        unrealized_pnl_percent=((100.9 - 101.6) / 101.6) * 100,
        high_water_mark=101.6,
        strategy_state={},
        has_scaled_out=False,
        has_taken_profits=False,
        scale_in_count=0,
    )

    market_data = MarketData(
        symbol="AAPL",
        price=100.65,
        timestamp=entry_time + timedelta(minutes=10),
        bars=[],
        indicators={},
    )

    scale_signal = await strategy.should_scale_out(position, market_data)

    assert scale_signal is not None
    assert scale_signal.action == "scale_out"
    assert scale_signal.percent == pytest.approx(strategy.scale_percent)


@pytest.mark.asyncio
async def test_should_exit_time_stop_without_progress() -> None:
    strategy = FailedEqualHighsBreakoutStrategy({})

    entry_time = datetime(2024, 1, 2, 10, 0, tzinfo=ET)
    state = {
        "stop_price": 101.0,
        "tp1_price": 99.7,
        "tp2_price": 99.0,
        "risk_per_share": 0.7,
        "half_r_progress": False,
        "best_price": 100.2,
        "initialized": True,
    }

    position = PositionContext(
        position_id="pos-2",
        symbol="AAPL",
        entry_price=100.3,
        entry_time=entry_time,
        quantity=50,
        current_price=100.1,
        unrealized_pnl=(100.1 - 100.3) * 50,
        unrealized_pnl_percent=((100.1 - 100.3) / 100.3) * 100,
        high_water_mark=100.3,
        strategy_state=state,
        has_scaled_out=False,
        has_taken_profits=False,
        scale_in_count=0,
    )

    market_data = MarketData(
        symbol="AAPL",
        price=100.2,
        timestamp=entry_time + timedelta(minutes=16),
        bars=[],
        indicators={},
    )

    exit_signal = await strategy.should_exit(position, market_data)

    assert exit_signal.should_exit is True
    assert exit_signal.reason == "time_stop"

