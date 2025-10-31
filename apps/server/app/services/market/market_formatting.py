"""
Market Data Formatting Utilities

Functions for formatting market data for display and AI prompts.
Extracted from strategy implementations for reuse.
"""

from datetime import datetime
from statistics import median
from typing import Any, Dict, List


def format_candlesticks_table(
    bars: List[Dict[str, Any]],
    timeframe: str,
    max_bars: int = 20
) -> str:
    """
    Format candlestick data as ASCII table for LLM prompts.
    
    Args:
        bars: List of OHLCV bars
        timeframe: Timeframe description (e.g., "1hr", "15min")
        max_bars: Maximum number of bars to include (shows most recent)
        
    Returns:
        Formatted ASCII table string
    """
    if not bars:
        return f"No {timeframe} data available"
    
    # Limit to max_bars most recent
    display_bars = bars[-max_bars:] if len(bars) > max_bars else bars
    
    formatted = [f"\n{timeframe} Candlesticks (most recent last):"]
    formatted.append(
        f"{'Time':<20} {'Open':<10} {'High':<10} {'Low':<10} {'Close':<10} {'Volume':<12}"
    )
    formatted.append("-" * 72)
    
    for bar in display_bars:
        # Format timestamp
        ts = bar.get('timestamp', 'N/A')
        if isinstance(ts, datetime):
            ts = ts.strftime('%Y-%m-%d %H:%M')
        else:
            ts = str(ts)
        
        # Format OHLCV values
        o = bar.get('open', 0)
        h = bar.get('high', 0)
        l = bar.get('low', 0)
        c = bar.get('close', 0)
        v = bar.get('volume', 0)
        
        formatted.append(
            f"{ts:<20} "
            f"{o:<10.2f} "
            f"{h:<10.2f} "
            f"{l:<10.2f} "
            f"{c:<10.2f} "
            f"{v:<12,}"
        )
    
    return "\n".join(formatted)


def format_ohlcv_summary(
    bars: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Summarize OHLCV data (highs, lows, volume stats).
    
    Args:
        bars: List of OHLCV bars
        
    Returns:
        Dict with summary statistics
    """
    if not bars:
        return {}
    
    highs = [b.get('high', 0) for b in bars if b.get('high')]
    lows = [b.get('low', 0) for b in bars if b.get('low')]
    closes = [b.get('close', 0) for b in bars if b.get('close')]
    volumes = [b.get('volume', 0) for b in bars if b.get('volume')]
    
    summary = {
        "bar_count": len(bars),
        "highest": max(highs) if highs else 0,
        "lowest": min(lows) if lows else 0,
        "close_first": closes[0] if closes else 0,
        "close_last": closes[-1] if closes else 0,
        "avg_volume": sum(volumes) / len(volumes) if volumes else 0,
        "total_volume": sum(volumes),
    }
    
    # Calculate price change
    if closes and len(closes) > 1:
        summary["change"] = closes[-1] - closes[0]
        summary["change_pct"] = (summary["change"] / closes[0] * 100) if closes[0] != 0 else 0
    
    return summary


def ensure_timeframe_bars(
    bars: List[Dict[str, Any]],
    expected_interval_seconds: float
) -> List[Dict[str, Any]]:
    """
    Validate and sort bars by expected timeframe.
    
    Checks that bars are in chronological order and warns if
    interval deviates significantly from expected.
    
    Args:
        bars: List of OHLCV bars with 'timestamp' key
        expected_interval_seconds: Expected interval in seconds (e.g., 300 for 5min)
        
    Returns:
        Sorted list of bars
    """
    if len(bars) < 3:
        return bars
    
    # Sort by timestamp
    sorted_bars = sorted(
        [b for b in bars if b.get('timestamp')],
        key=lambda b: b['timestamp']
    )
    
    # Calculate actual intervals
    intervals = []
    for i in range(1, len(sorted_bars)):
        prev = sorted_bars[i - 1]['timestamp']
        curr = sorted_bars[i]['timestamp']
        
        if isinstance(prev, datetime) and isinstance(curr, datetime):
            intervals.append((curr - prev).total_seconds())
    
    if intervals:
        median_interval = median([abs(i) for i in intervals])
        
        # Warn if median differs significantly from expected
        tolerance = expected_interval_seconds * 0.3  # 30% tolerance
        if abs(median_interval - expected_interval_seconds) > tolerance:
            import logging
            logger = logging.getLogger(__name__)
            logger.debug(
                f"Bar interval mismatch: expected {expected_interval_seconds:.0f}s, "
                f"got median {median_interval:.0f}s"
            )
    
    return sorted_bars


def format_price_action_summary(
    bars: List[Dict[str, Any]],
    recent_count: int = 5
) -> str:
    """
    Create human-readable summary of recent price action.
    
    Args:
        bars: List of OHLCV bars
        recent_count: Number of recent bars to summarize
        
    Returns:
        Text summary of price action
    """
    if not bars:
        return "No price data available"
    
    recent_bars = bars[-recent_count:] if len(bars) > recent_count else bars
    
    if not recent_bars:
        return "No recent price data"
    
    closes = [b.get('close', 0) for b in recent_bars if b.get('close')]
    
    if len(closes) < 2:
        return f"Current price: ${closes[0]:.2f}" if closes else "No price data"
    
    # Calculate trend
    start_price = closes[0]
    end_price = closes[-1]
    change = end_price - start_price
    change_pct = (change / start_price * 100) if start_price != 0 else 0
    
    direction = "up" if change > 0 else "down"
    
    # Calculate highest and lowest in period
    highs = [b.get('high', 0) for b in recent_bars if b.get('high')]
    lows = [b.get('low', 0) for b in recent_bars if b.get('low')]
    
    highest = max(highs) if highs else end_price
    lowest = min(lows) if lows else end_price
    
    summary = (
        f"Recent {len(recent_bars)} bars: "
        f"${start_price:.2f} → ${end_price:.2f} ({direction} {abs(change_pct):.1f}%), "
        f"Range: ${lowest:.2f} - ${highest:.2f}"
    )
    
    return summary


def format_volume_profile(
    bars: List[Dict[str, Any]],
    price_buckets: int = 10
) -> Dict[float, float]:
    """
    Create volume profile (volume at price levels).
    
    Args:
        bars: List of OHLCV bars
        price_buckets: Number of price buckets to create
        
    Returns:
        Dict mapping price level to volume
    """
    if not bars:
        return {}
    
    # Get price range
    lows = [b.get('low', 0) for b in bars if b.get('low')]
    highs = [b.get('high', 0) for b in bars if b.get('high')]
    
    if not lows or not highs:
        return {}
    
    min_price = min(lows)
    max_price = max(highs)
    
    if min_price >= max_price:
        return {}
    
    # Create price buckets
    bucket_size = (max_price - min_price) / price_buckets
    volume_profile: Dict[float, float] = {}
    
    for i in range(price_buckets):
        bucket_price = min_price + (i + 0.5) * bucket_size
        volume_profile[bucket_price] = 0.0
    
    # Distribute volume to buckets based on bar's price range
    for bar in bars:
        low = bar.get('low', 0)
        high = bar.get('high', 0)
        volume = bar.get('volume', 0)
        
        if not (low and high and volume):
            continue
        
        # Find which buckets this bar overlaps
        for bucket_price, _ in volume_profile.items():
            bucket_min = bucket_price - bucket_size / 2
            bucket_max = bucket_price + bucket_size / 2
            
            # Check if bar overlaps this bucket
            if low <= bucket_max and high >= bucket_min:
                # Distribute volume proportionally
                overlap = min(high, bucket_max) - max(low, bucket_min)
                bar_range = high - low
                
                if bar_range > 0:
                    proportion = overlap / bar_range
                    volume_profile[bucket_price] += volume * proportion
    
    return volume_profile


def format_bar_pattern(bar: Dict[str, Any]) -> str:
    """
    Describe candlestick pattern for a single bar.
    
    Args:
        bar: OHLCV bar
        
    Returns:
        Text description (e.g., "bullish engulfing", "doji")
    """
    o = bar.get('open', 0)
    h = bar.get('high', 0)
    l = bar.get('low', 0)
    c = bar.get('close', 0)
    
    if not all([o, h, l, c]):
        return "incomplete bar"
    
    body = abs(c - o)
    full_range = h - l
    
    if full_range == 0:
        return "flat"
    
    body_pct = body / full_range
    
    # Doji (small body)
    if body_pct < 0.1:
        return "doji"
    
    # Hammer/shooting star (long wick)
    upper_wick = h - max(o, c)
    lower_wick = min(o, c) - l
    
    if lower_wick > body * 2:
        return "hammer" if c > o else "hanging man"
    
    if upper_wick > body * 2:
        return "shooting star" if c < o else "inverted hammer"
    
    # Regular candles
    if c > o:
        return "bullish" if body_pct > 0.6 else "weak bullish"
    else:
        return "bearish" if body_pct > 0.6 else "weak bearish"


def format_bars_for_ml(
    bars: List[Dict[str, Any]],
    normalize: bool = True
) -> List[List[float]]:
    """
    Format bars for machine learning input.
    
    Args:
        bars: List of OHLCV bars
        normalize: Whether to normalize prices relative to first close
        
    Returns:
        List of [open, high, low, close, volume] arrays
    """
    if not bars:
        return []
    
    result = []
    
    # Get first close for normalization
    first_close = bars[0].get('close', 1.0) if normalize else 1.0
    
    for bar in bars:
        o = bar.get('open', 0) / first_close if normalize else bar.get('open', 0)
        h = bar.get('high', 0) / first_close if normalize else bar.get('high', 0)
        l = bar.get('low', 0) / first_close if normalize else bar.get('low', 0)
        c = bar.get('close', 0) / first_close if normalize else bar.get('close', 0)
        v = bar.get('volume', 0)
        
        result.append([o, h, l, c, v])
    
    return result


