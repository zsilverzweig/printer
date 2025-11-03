"""
Wyckoff OHLCV detection utilities.

These helpers implement pragmatic, testable heuristics for identifying
key Wyckoff accumulation elements using only OHLCV bars:
 - Selling Climax (SC) and Automatic Rally (AR)
 - Phase B compression (declining volatility and volume)
 - Spring (shakeout and quick reclaim)
 - Sign of Strength (SOS) breakout
 - Last Point of Support (LPS) pullback

All functions operate on lists of bar dicts shaped like:
{
    "t": datetime | str,
    "o": float,
    "h": float,
    "l": float,
    "c": float,
    "v": float | int,
}

Note: These are intentionally conservative and parameterized to allow
strategy-level tuning. They return simple dataclasses or None.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean
from typing import Dict, List, Optional, Tuple


def _bar_range(bar: Dict[str, float]) -> float:
    return float(bar.get("h", 0.0)) - float(bar.get("l", 0.0))


def moving_average(values: List[float], window: int) -> List[float]:
    if window <= 0:
        raise ValueError("window must be positive")
    out: List[float] = []
    acc: List[float] = []
    for v in values:
        acc.append(v)
        if len(acc) > window:
            acc.pop(0)
        out.append(mean(acc))
    return out


def average_of_last(values: List[float], window: int) -> float:
    if not values:
        return 0.0
    if window <= 0:
        return mean(values)
    return mean(values[-min(window, len(values)):])


@dataclass
class SCAR:
    sc_index: int
    ar_index: int
    sc_low: float
    ar_high: float


def detect_sc_ar(
    bars: List[Dict[str, float]],
    ma_window: int = 50,
    k_range: float = 2.0,
    k_vol: float = 2.0,
    min_downtrend_bars: int = 5,
    ar_min_retrace: float = 0.3,
) -> Optional[SCAR]:
    """
    Detect Selling Climax (SC) followed by Automatic Rally (AR).

    - SC: down bar with range > k_range * avg(range_M) and vol > k_vol * avg(vol_M)
    - Requires preceding downtrend of lower lows
    - AR: first significant swing high after SC with >= ar_min_retrace retrace of SC drop
    """
    n = len(bars)
    if n < ma_window + 10:
        return None

    ranges = [_bar_range(b) for b in bars]
    vols = [float(b.get("v", 0.0)) for b in bars]
    avg_range_m = moving_average(ranges, ma_window)
    avg_vol_m = moving_average(vols, ma_window)

    # Find candidate SC index
    sc_idx: Optional[int] = None
    for i in range(ma_window, n):
        b = bars[i]
        prev_closes = [bars[j]["c"] for j in range(max(0, i - min_downtrend_bars), i)]
        if len(prev_closes) < min_downtrend_bars:
            continue
        if not all(prev_closes[j] > prev_closes[j + 1] for j in range(len(prev_closes) - 1)):
            continue  # not a clean downtrend

        is_down_bar = b["c"] < b["o"]
        if not is_down_bar:
            continue

        if ranges[i] > k_range * max(1e-9, avg_range_m[i]) and vols[i] > k_vol * max(1.0, avg_vol_m[i]):
            sc_idx = i
            break

    if sc_idx is None:
        return None

    sc_low = float(bars[sc_idx]["l"])
    sc_open = float(bars[sc_idx]["o"])
    sc_drop = max(1e-6, sc_open - sc_low)

    # Find AR as first swing high with sufficient retrace
    ar_idx: Optional[int] = None
    high_since_sc = sc_open
    for i in range(sc_idx + 1, n):
        high_since_sc = max(high_since_sc, float(bars[i]["h"]))
        retrace = (high_since_sc - sc_low) / sc_drop if sc_drop > 0 else 0.0
        if retrace >= ar_min_retrace:
            ar_idx = i
            break

    if ar_idx is None:
        return None

    ar_high = high_since_sc
    return SCAR(sc_index=sc_idx, ar_index=ar_idx, sc_low=sc_low, ar_high=ar_high)


def compute_compression_score(
    bars: List[Dict[str, float]],
    start_idx: int,
    end_idx: int,
    vol_window: int = 30,
    atr_window: int = 30,
) -> float:
    """Compute a simple compression score in [0,1] based on declining ATR and volume."""
    if end_idx <= start_idx or start_idx < 0 or end_idx > len(bars):
        return 0.0

    segment = bars[start_idx:end_idx]
    if len(segment) < max(vol_window, atr_window) + 2:
        return 0.0

    ranges = [_bar_range(b) for b in segment]
    vols = [float(b.get("v", 0.0)) for b in segment]

    first_half_r = average_of_last(ranges[: len(ranges) // 2], min(atr_window, len(ranges) // 2))
    second_half_r = average_of_last(ranges[len(ranges) // 2 :], min(atr_window, len(ranges) // 2))
    first_half_v = average_of_last(vols[: len(vols) // 2], min(vol_window, len(vols) // 2))
    second_half_v = average_of_last(vols[len(vols) // 2 :], min(vol_window, len(vols) // 2))

    r_decline = 0.0
    v_decline = 0.0
    if first_half_r > 0:
        r_decline = max(0.0, min(1.0, (first_half_r - second_half_r) / first_half_r))
    if first_half_v > 0:
        v_decline = max(0.0, min(1.0, (first_half_v - second_half_v) / first_half_v))

    # Simple average for a compression score
    return (r_decline + v_decline) / 2.0


@dataclass
class SpringSignal:
    index: int
    spring_low: float
    support_level: float


def detect_spring(
    bars: List[Dict[str, float]],
    support_level: float,
    max_bars_to_reclaim: int = 3,
    max_close_below_bars: int = 1,
    max_penetration_ratio: float = 0.02,
) -> Optional[SpringSignal]:
    """
    Detect a Wyckoff spring: brief break below support, quick reclaim.
    - Penetration of up to max_penetration_ratio of price into/below support
    - Close back above support within max_bars_to_reclaim bars
    - Do not allow multiple consecutive closes below support (> max_close_below_bars)
    """
    n = len(bars)
    if n < 5:
        return None

    for i in range(max(1, n - 50), n):
        low = float(bars[i]["l"]) 
        close = float(bars[i]["c"]) 
        if low < support_level:
            # Check shallow penetration
            if (support_level - low) / max(1e-6, support_level) > max_penetration_ratio:
                continue

            # Ensure quick reclaim
            closes_below = 0
            reclaimed = False
            for j in range(i, min(n, i + max_bars_to_reclaim + 1)):
                if float(bars[j]["c"]) < support_level:
                    closes_below += 1
                else:
                    reclaimed = True
                    break
            if closes_below <= max_close_below_bars and reclaimed:
                return SpringSignal(index=i, spring_low=low, support_level=support_level)

    return None


@dataclass
class SOSSignal:
    index: int
    breakout_high: float


def detect_sos(
    bars: List[Dict[str, float]],
    range_high: float,
    avg_vol_phase_b: float,
    avg_range_phase_b: float,
    v_mult: float = 1.5,
    r_mult: float = 1.5,
) -> Optional[SOSSignal]:
    """Detect a Sign of Strength breakout above range on volume and spread expansion."""
    n = len(bars)
    if n < 3:
        return None

    for i in range(max(1, n - 50), n):
        b = bars[i]
        if float(b["c"]) > range_high and _bar_range(b) > r_mult * max(1e-9, avg_range_phase_b):
            if float(b.get("v", 0.0)) > v_mult * max(1.0, avg_vol_phase_b):
                return SOSSignal(index=i, breakout_high=float(b["h"]))
    return None


@dataclass
class LPSSignal:
    index: int
    lps_low: float


def detect_lps(
    bars: List[Dict[str, float]],
    range_high_now_support: float,
    sos_index: int,
    max_retrace_ratio: float = 0.5,
    max_lookahead_bars: int = 30,
) -> Optional[LPSSignal]:
    """
    Detect Last Point of Support after SOS: a higher low pullback that holds above prior range high
    and pivots up.
    """
    n = len(bars)
    start = min(sos_index + 1, n - 1)
    if start >= n - 1:
        return None

    post = bars[start : min(n, start + max_lookahead_bars)]
    if not post:
        return None

    # Find minimum low above/near new support, with shallow retrace
    sos_high = float(bars[sos_index]["h"])
    sos_close = float(bars[sos_index]["c"])
    sos_gain = max(1e-6, sos_close - range_high_now_support)

    best_idx = None
    best_low = None
    for i, b in enumerate(post):
        low = float(b["l"])
        if low < range_high_now_support * 0.98:  # allow slight dip into range
            continue
        retrace = (sos_close - low) / sos_gain
        if retrace <= max_retrace_ratio:
            if best_low is None or low < best_low:
                best_low = low
                best_idx = start + i

    if best_idx is None:
        return None

    # Require a pivot up (next bar close higher than prior close)
    if best_idx + 1 < n and float(bars[best_idx + 1]["c"]) > float(bars[best_idx]["c"]):
        return LPSSignal(index=best_idx, lps_low=float(bars[best_idx]["l"]))
    return None


def summarize_phase_b_metrics(
    bars: List[Dict[str, float]],
    start_idx: int,
    end_idx: int,
) -> Tuple[float, float]:
    """Return (avg_vol, avg_range) for Phase B segment for comparison in SOS."""
    segment = bars[start_idx:end_idx]
    if not segment:
        return 0.0, 0.0
    avg_vol = mean([float(b.get("v", 0.0)) for b in segment])
    avg_rng = mean([_bar_range(b) for b in segment])
    return avg_vol, avg_rng




