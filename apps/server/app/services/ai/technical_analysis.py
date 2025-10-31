"""
Technical Analysis Utilities

Pattern detection and technical calculations for trading strategies.
Extracted from strategy implementations for reuse.
"""

from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class SwingPoint:
    """Represents a detected swing high or low."""
    index: int
    price: float
    timestamp: datetime
    bar: Dict[str, Any]


def find_swing_points(
    bars: List[Dict[str, Any]],
    kind: str = "high",
    lookback: int = 2
) -> List[SwingPoint]:
    """
    Detect swing highs or lows in price data.
    
    A swing high is a bar whose high is greater than the highs of
    N bars before and after it. Swing lows are the inverse.
    
    Args:
        bars: List of OHLCV bars (must have 'high', 'low', 'timestamp' keys)
        kind: "high" for swing highs, "low" for swing lows
        lookback: Number of bars to check on each side (default: 2)
        
    Returns:
        List of SwingPoint objects
    """
    results: List[SwingPoint] = []
    
    if len(bars) < (2 * lookback + 1):
        return results
    
    key = "high" if kind == "high" else "low"
    compare = max if kind == "high" else min
    
    # Check each potential swing point (skip edges)
    for idx in range(lookback, len(bars) - lookback):
        center = bars[idx]
        
        if center.get(key) is None:
            continue
        
        # Get prices in window
        prices = []
        for offset in range(-lookback, lookback + 1):
            bar = bars[idx + offset]
            if bar.get(key) is not None:
                prices.append(bar[key])
        
        # Check if center is extreme in window
        if center[key] == compare(prices):
            results.append(
                SwingPoint(
                    index=idx,
                    price=center[key],
                    timestamp=center.get("timestamp", datetime.now()),
                    bar=center,
                )
            )
    
    return results


def find_equal_levels(
    swings: List[SwingPoint],
    tolerance: float = 0.0006
) -> Optional[Tuple[SwingPoint, SwingPoint]]:
    """
    Find two price levels that are approximately equal.
    
    Searches for the most recent pair of swing points whose prices
    are within the tolerance of each other (e.g., double tops/bottoms).
    
    Args:
        swings: List of SwingPoint objects
        tolerance: Relative tolerance for equality (0.0006 = 0.06%)
        
    Returns:
        Tuple of (earlier_swing, later_swing) or None if no equal levels found
    """
    if len(swings) < 2:
        return None
    
    # Search backwards to find most recent equal pair
    for i in range(len(swings) - 1, 0, -1):
        later_swing = swings[i]
        
        for j in range(i - 1, -1, -1):
            earlier_swing = swings[j]
            
            # Calculate midpoint for relative comparison
            midpoint = (later_swing.price + earlier_swing.price) / 2
            if midpoint == 0:
                continue
            
            # Check if prices are equal within tolerance
            diff_pct = abs(later_swing.price - earlier_swing.price) / midpoint
            if diff_pct <= tolerance:
                return (earlier_swing, later_swing)
    
    return None


def calculate_true_range(bars: List[Dict[str, Any]]) -> List[float]:
    """
    Calculate true range for each bar.
    
    True Range = max(high - low, |high - prev_close|, |low - prev_close|)
    
    Args:
        bars: List of OHLCV bars (must have 'high', 'low', 'close' keys)
        
    Returns:
        List of true range values (first element is 0 since no previous close)
    """
    if not bars:
        return []
    
    trs: List[float] = [0.0]  # First bar has no previous close
    
    for i in range(1, len(bars)):
        high = bars[i].get("high")
        low = bars[i].get("low")
        prev_close = bars[i - 1].get("close")
        
        if high is None or low is None or prev_close is None:
            trs.append(0.0)
            continue
        
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        trs.append(tr)
    
    return trs


def median_true_range(
    bars: List[Dict[str, Any]],
    period: int = 14
) -> Optional[float]:
    """
    Calculate median true range over a period.
    
    Args:
        bars: List of OHLCV bars
        period: Lookback period (default: 14)
        
    Returns:
        Median true range or None if insufficient data
    """
    if len(bars) < period + 1:
        return None
    
    # Get recent bars
    recent = bars[-(period + 1):]
    
    # Calculate true ranges
    trs: List[float] = []
    for i in range(1, len(recent)):
        high = recent[i].get("high")
        low = recent[i].get("low")
        prev_close = recent[i - 1].get("close")
        
        if high is None or low is None or prev_close is None:
            continue
        
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        trs.append(tr)
    
    if not trs:
        return None
    
    return median(trs)


def average_true_range(
    bars: List[Dict[str, Any]],
    period: int = 14
) -> Optional[float]:
    """
    Calculate average true range (ATR).
    
    Args:
        bars: List of OHLCV bars
        period: Lookback period (default: 14)
        
    Returns:
        Average true range or None if insufficient data
    """
    trs = calculate_true_range(bars)
    
    if len(trs) < period + 1:
        return None
    
    # Calculate simple average of recent TRs
    recent_trs = trs[-(period):]
    return sum(recent_trs) / len(recent_trs)


def calculate_relative_volume(
    current_volume: float,
    avg_volume: float
) -> float:
    """
    Calculate relative volume ratio.
    
    Args:
        current_volume: Current bar volume
        avg_volume: Average/baseline volume
        
    Returns:
        Relative volume ratio (e.g., 1.5 = 50% above average)
    """
    if avg_volume <= 0:
        return 0.0
    
    return current_volume / avg_volume


def find_support_resistance(
    bars: List[Dict[str, Any]],
    tolerance: float = 0.01,
    min_touches: int = 2
) -> Dict[str, List[float]]:
    """
    Find support and resistance levels based on swing points.
    
    Args:
        bars: List of OHLCV bars
        tolerance: Price tolerance for clustering levels (1% = 0.01)
        min_touches: Minimum number of touches to confirm a level
        
    Returns:
        Dict with 'support' and 'resistance' lists of price levels
    """
    # Find all swing points
    swing_highs = find_swing_points(bars, kind="high")
    swing_lows = find_swing_points(bars, kind="low")
    
    # Cluster swing highs into resistance levels
    resistance_levels = _cluster_prices(
        [s.price for s in swing_highs],
        tolerance,
        min_touches
    )
    
    # Cluster swing lows into support levels
    support_levels = _cluster_prices(
        [s.price for s in swing_lows],
        tolerance,
        min_touches
    )
    
    return {
        "support": support_levels,
        "resistance": resistance_levels
    }


def _cluster_prices(
    prices: List[float],
    tolerance: float,
    min_count: int
) -> List[float]:
    """
    Cluster nearby prices into levels.
    
    Args:
        prices: List of prices to cluster
        tolerance: Relative tolerance for clustering
        min_count: Minimum cluster size
        
    Returns:
        List of clustered price levels (cluster centers)
    """
    if not prices:
        return []
    
    sorted_prices = sorted(prices)
    clusters: List[List[float]] = []
    
    current_cluster = [sorted_prices[0]]
    
    for price in sorted_prices[1:]:
        # Check if price is close to current cluster
        cluster_center = sum(current_cluster) / len(current_cluster)
        
        if abs(price - cluster_center) / cluster_center <= tolerance:
            current_cluster.append(price)
        else:
            # Start new cluster
            if len(current_cluster) >= min_count:
                clusters.append(current_cluster)
            current_cluster = [price]
    
    # Don't forget last cluster
    if len(current_cluster) >= min_count:
        clusters.append(current_cluster)
    
    # Return cluster centers
    return [sum(cluster) / len(cluster) for cluster in clusters]


def calculate_pivot_points(
    prev_bar: Dict[str, Any]
) -> Dict[str, float]:
    """
    Calculate pivot points from previous bar.
    
    Args:
        prev_bar: Previous bar with 'high', 'low', 'close' keys
        
    Returns:
        Dict with pivot levels: 'pivot', 'r1', 'r2', 's1', 's2'
    """
    high = prev_bar.get("high", 0)
    low = prev_bar.get("low", 0)
    close = prev_bar.get("close", 0)
    
    if high == 0 or low == 0 or close == 0:
        return {}
    
    pivot = (high + low + close) / 3
    
    return {
        "pivot": pivot,
        "r1": 2 * pivot - low,
        "r2": pivot + (high - low),
        "s1": 2 * pivot - high,
        "s2": pivot - (high - low),
    }


def is_price_near_level(
    current_price: float,
    level: float,
    tolerance: float = 0.005
) -> bool:
    """
    Check if price is near a support/resistance level.
    
    Args:
        current_price: Current price
        level: Support or resistance level
        tolerance: Relative tolerance (0.005 = 0.5%)
        
    Returns:
        True if price is within tolerance of level
    """
    if level == 0:
        return False
    
    diff_pct = abs(current_price - level) / level
    return diff_pct <= tolerance


