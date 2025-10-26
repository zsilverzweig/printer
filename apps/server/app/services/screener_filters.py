"""Filtering logic for the screener service."""
from __future__ import annotations

from typing import Set


# Allowed exchanges: NASDAQ, NYSE, NYSE Arca, NYSE American
ALLOWED_EXCHANGES: Set[str] = {
    'XNAS',  # NASDAQ
    'XNYS',  # NYSE
    'ARCX',  # NYSE Arca
    'XASE',  # NYSE American (formerly AMEX)
}


def is_allowed_exchange(exchange: str | None) -> bool:
    """Check if an exchange is in the allowed list."""
    if not exchange:
        return True  # Allow if exchange info not available
    return exchange in ALLOWED_EXCHANGES


def is_likely_etf(ticker: str) -> bool:
    """Check if a ticker is likely an ETF or leveraged product.
    
    ETFs often have single/double letters or end with certain patterns.
    """
    ticker_upper = ticker.upper()
    
    # Common ETF patterns
    etf_patterns = ['VIX', 'SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD', 'SLV']
    if any(pattern in ticker_upper for pattern in etf_patterns):
        return True
    
    # Leveraged products (e.g., SOXL, TQQQ, SPXL)
    if len(ticker) == 3 and ticker_upper.endswith('X'):
        return True
    if len(ticker) == 4 and ticker_upper.endswith('XX'):
        return True
    if ticker_upper.endswith('XXX'):
        return True
    
    # Inverse commodity ETFs
    if ticker_upper.startswith('DG'):
        return True
    
    return False


def passes_price_filter(
    current_price: float,
    yesterday_close: float,
    min_price: float = 2.0,
    max_price: float = 20.0,
) -> bool:
    """Check if stock passes price-based filters.
    
    Args:
        current_price: Current trading price
        yesterday_close: Previous day's closing price
        min_price: Minimum price for yesterday's close
        max_price: Maximum price for yesterday's close
    
    Returns:
        True if stock passes all price filters
    """
    # Filter by yesterday's close price range
    if not (min_price <= yesterday_close <= max_price):
        return False
    
    # Filter out penny stocks (< $1)
    if current_price < 1.0:
        return False
    
    # Only include stocks that are 5% or more above yesterday's close
    if current_price < yesterday_close * 1.05:
        return False
    
    return True


def passes_volume_filter(volume: float, min_volume: float = 50000.0) -> bool:
    """Check if stock passes volume filter.
    
    Args:
        volume: Trading volume
        min_volume: Minimum required volume for liquidity
    
    Returns:
        True if volume meets minimum requirement
    """
    return volume >= min_volume

