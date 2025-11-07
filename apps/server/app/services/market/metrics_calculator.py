from __future__ import annotations

"""
Unified incremental technical metrics calculator.

Provides per-symbol/timescale stateful calculation of all indicators that we
store directly on `market_data` rows. Calculations are designed to be fed one
bar at a time in chronological order so they can be used for realtime ingestion
as well as historical backfills.
"""

from collections import deque
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Deque, Dict, Mapping, Optional, Tuple


Number = float | int | Decimal


def _to_float(value: Number | None) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@dataclass
class EMAState:
    period: int
    multiplier: float = field(init=False)
    value: Optional[float] = None
    initialized: bool = False
    _window: Deque[float] = field(default_factory=deque)

    def __post_init__(self) -> None:
        self.multiplier = 2.0 / (self.period + 1)

    def update(self, price: Optional[float]) -> Optional[float]:
        if price is None:
            return None

        if not self.initialized:
            self._window.append(price)
            if len(self._window) < self.period:
                return None
            self.value = sum(self._window) / self.period
            self.initialized = True
            self._window.clear()
            return self.value

        self.value = (price - self.value) * self.multiplier + self.value
        return self.value

    def reset(self) -> None:
        self.value = None
        self.initialized = False
        self._window.clear()


@dataclass
class RollingAverage:
    period: int
    _window: Deque[float] = field(default_factory=deque)
    _total: float = 0.0

    def update(self, value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        self._window.append(value)
        self._total += value

        if len(self._window) > self.period:
            self._total -= self._window.popleft()

        if len(self._window) == self.period:
            return self._total / self.period

        return None

    def reset(self) -> None:
        self._window.clear()
        self._total = 0.0


@dataclass
class RollingStats:
    period: int
    _window: Deque[float] = field(default_factory=deque)
    _total: float = 0.0
    _total_sq: float = 0.0

    def update(self, value: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
        if value is None:
            return None, None

        self._window.append(value)
        self._total += value
        self._total_sq += value * value

        if len(self._window) > self.period:
            old = self._window.popleft()
            self._total -= old
            self._total_sq -= old * old

        if len(self._window) == self.period:
            mean = self._total / self.period
            variance = max((self._total_sq / self.period) - (mean ** 2), 0.0)
            std = variance ** 0.5
            return mean, std

        return None, None

    def reset(self) -> None:
        self._window.clear()
        self._total = 0.0
        self._total_sq = 0.0


@dataclass
class RelativeVolumeState:
    period: int
    _window: Deque[float] = field(default_factory=deque)
    _total: float = 0.0

    def update(self, current_volume: Optional[float]) -> Optional[float]:
        if current_volume is None:
            return None

        ratio: Optional[float] = None
        if len(self._window) >= self.period:
            average = self._total / self.period if self.period else 0.0
            if average > 0:
                ratio = current_volume / average

        self._window.append(current_volume)
        self._total += current_volume

        if len(self._window) > self.period:
            removed = self._window.popleft()
            self._total -= removed

        return ratio

    def reset(self) -> None:
        self._window.clear()
        self._total = 0.0


@dataclass
class RSIState:
    period: int
    avg_gain: Optional[float] = None
    avg_loss: Optional[float] = None
    prev_close: Optional[float] = None
    initialized: bool = False
    _gains: Deque[float] = field(default_factory=deque)
    _losses: Deque[float] = field(default_factory=deque)

    def update(self, close: Optional[float]) -> Optional[float]:
        if close is None:
            return None

        if self.prev_close is None:
            self.prev_close = close
            return None

        change = close - self.prev_close
        gain = max(change, 0.0)
        loss = max(-change, 0.0)
        self.prev_close = close

        if not self.initialized:
            self._gains.append(gain)
            self._losses.append(loss)
            if len(self._gains) < self.period:
                return None

            self.avg_gain = sum(self._gains) / self.period
            self.avg_loss = sum(self._losses) / self.period
            self.initialized = True
        else:
            assert self.avg_gain is not None and self.avg_loss is not None
            self.avg_gain = ((self.avg_gain * (self.period - 1)) + gain) / self.period
            self.avg_loss = ((self.avg_loss * (self.period - 1)) + loss) / self.period

        if self.avg_loss is None:
            return None
        if self.avg_loss == 0:
            return 100.0
        if self.avg_gain is None:
            return None

        rs = self.avg_gain / self.avg_loss if self.avg_loss > 0 else None
        if rs is None:
            return None

        return 100.0 - (100.0 / (1.0 + rs))

    def reset(self) -> None:
        self.avg_gain = None
        self.avg_loss = None
        self.prev_close = None
        self.initialized = False
        self._gains.clear()
        self._losses.clear()


@dataclass
class ATRState:
    period: int
    value: Optional[float] = None
    prev_close: Optional[float] = None
    _trs: Deque[float] = field(default_factory=deque)

    def update(self, high: Optional[float], low: Optional[float], close: Optional[float]) -> Optional[float]:
        if high is None or low is None or close is None:
            if close is not None:
                self.prev_close = close
            return None

        if self.prev_close is None:
            self.prev_close = close
            return None

        true_range = max(high - low, abs(high - self.prev_close), abs(low - self.prev_close))
        self._trs.append(true_range)

        if self.value is None:
            if len(self._trs) < self.period:
                self.prev_close = close
                return None
            self.value = sum(self._trs) / self.period
        else:
            self.value = ((self.value * (self.period - 1)) + true_range) / self.period

        if len(self._trs) > self.period:
            self._trs.popleft()

        self.prev_close = close
        return self.value

    def reset(self) -> None:
        self.value = None
        self.prev_close = None
        self._trs.clear()


METRIC_FIELDS = [
    "ema_12",
    "ema_26",
    "ema_50",
    "ema_200",
    "sma_20",
    "sma_50",
    "sma_200",
    "macd_line",
    "macd_signal",
    "macd_histogram",
    "rsi_14",
    "atr_14",
    "bb_upper",
    "bb_middle",
    "bb_lower",
    "rv14",
    "rv30",
    "rv60",
    "volume_ma_20",
]

METRIC_TIMESCALES: set[str] = {"5min", "15min", "1hour", "1day"}


def is_metrics_timescale(timescale: str) -> bool:
    return timescale in METRIC_TIMESCALES


class _BarMetricsState:
    """Internal per-symbol/timescale state for incremental metrics."""

    def __init__(self) -> None:
        self.ema_states: Dict[int, EMAState] = {
            12: EMAState(12),
            26: EMAState(26),
            50: EMAState(50),
            200: EMAState(200),
        }
        self.sma_states: Dict[int, RollingAverage] = {
            20: RollingAverage(20),
            50: RollingAverage(50),
            200: RollingAverage(200),
        }
        self.macd_signal = EMAState(9)
        self.rsi_state = RSIState(14)
        self.atr_state = ATRState(14)
        self.bollinger_stats = RollingStats(20)
        self.rv_states: Dict[int, RelativeVolumeState] = {
            14: RelativeVolumeState(14),
            30: RelativeVolumeState(30),
            60: RelativeVolumeState(60),
        }
        self.volume_ma = RollingAverage(20)

    def reset(self) -> None:
        for ema in self.ema_states.values():
            ema.reset()
        for sma in self.sma_states.values():
            sma.reset()
        self.macd_signal.reset()
        self.rsi_state.reset()
        self.atr_state.reset()
        self.bollinger_stats.reset()
        for rv in self.rv_states.values():
            rv.reset()
        self.volume_ma.reset()

    def update(self, bar: Mapping[str, Any] | Any) -> Dict[str, Optional[float]]:
        close = _to_float(_get_value(bar, "close", "c"))
        high = _to_float(_get_value(bar, "high", "h"))
        low = _to_float(_get_value(bar, "low", "l"))
        volume = _to_float(_get_value(bar, "volume", "v"))

        ema_12 = self.ema_states[12].update(close)
        ema_26 = self.ema_states[26].update(close)
        ema_50 = self.ema_states[50].update(close)
        ema_200 = self.ema_states[200].update(close)

        sma_20 = self.sma_states[20].update(close)
        sma_50 = self.sma_states[50].update(close)
        sma_200 = self.sma_states[200].update(close)

        macd_line = None
        if ema_12 is not None and ema_26 is not None:
            macd_line = ema_12 - ema_26

        macd_signal = self.macd_signal.update(macd_line)
        macd_histogram = None
        if macd_line is not None and macd_signal is not None:
            macd_histogram = macd_line - macd_signal

        rsi_14 = self.rsi_state.update(close)
        atr_14 = self.atr_state.update(high, low, close)

        bb_middle = bb_upper = bb_lower = None
        mean, std = self.bollinger_stats.update(close)
        if mean is not None and std is not None:
            bb_middle = mean
            bb_upper = mean + (2 * std)
            bb_lower = mean - (2 * std)

        rv14 = self.rv_states[14].update(volume)
        rv30 = self.rv_states[30].update(volume)
        rv60 = self.rv_states[60].update(volume)

        volume_ma_20 = self.volume_ma.update(volume)

        return {
            "ema_12": ema_12,
            "ema_26": ema_26,
            "ema_50": ema_50,
            "ema_200": ema_200,
            "sma_20": sma_20,
            "sma_50": sma_50,
            "sma_200": sma_200,
            "macd_line": macd_line,
            "macd_signal": macd_signal,
            "macd_histogram": macd_histogram,
            "rsi_14": rsi_14,
            "atr_14": atr_14,
            "bb_upper": bb_upper,
            "bb_middle": bb_middle,
            "bb_lower": bb_lower,
            "rv14": rv14,
            "rv30": rv30,
            "rv60": rv60,
            "volume_ma_20": volume_ma_20,
        }


def _get_value(bar: Mapping[str, Any] | Any, *keys: str) -> Any:
    for key in keys:
        if isinstance(bar, Mapping) and key in bar:
            return bar[key]
        if hasattr(bar, key):
            return getattr(bar, key)
    return None


class MetricsCalculator:
    """
    Maintains per-symbol, per-timescale state for incremental metric updates.

    Usage:
        calculator = MetricsCalculator()
        metrics = calculator.calculate(symbol, timescale, bar_dict_or_model)
    """

    def __init__(self) -> None:
        self._states: Dict[Tuple[str, str], _BarMetricsState] = {}

    def calculate(self, symbol: str, timescale: str, bar: Mapping[str, Any] | Any) -> Dict[str, Optional[float]]:
        if not is_metrics_timescale(timescale):
            return {field: None for field in METRIC_FIELDS}
        state = self._states.setdefault((symbol, timescale), _BarMetricsState())
        return state.update(bar)

    def reset(self, symbol: Optional[str] = None, timescale: Optional[str] = None) -> None:
        if symbol is None and timescale is None:
            self._states.clear()
            return

        keys_to_delete = []
        for key in self._states:
            matches_symbol = symbol is None or key[0] == symbol
            matches_timescale = timescale is None or key[1] == timescale
            if matches_symbol and matches_timescale:
                keys_to_delete.append(key)

        for key in keys_to_delete:
            self._states.pop(key, None)


