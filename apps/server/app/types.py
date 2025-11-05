from __future__ import annotations

from typing import TypedDict, Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel


class PolygonAggBar(TypedDict, total=False):
    """Polygon grouped daily aggregate bar from v2/aggs/grouped API.
    
    Fields:
        T: Ticker symbol
        v: Volume
        vw: Volume weighted average price
        o: Open price
        c: Close price
        h: High price
        l: Low price
        t: Timestamp (milliseconds since epoch)
        n: Number of transactions
    """
    T: str
    v: float
    vw: float
    o: float
    c: float
    h: float
    l: float
    t: int
    n: int


class ScreenerResult(TypedDict):
    """Screener output combining yesterday's OHLC with current price and volume metrics.
    
    Fields:
        ticker: Stock ticker symbol
        open: Yesterday's open price
        high: Yesterday's high price
        low: Yesterday's low price
        close: Yesterday's close price
        price: Current price from today's snapshot
        today_vol: Current volume from today's snapshot
        rv14: Relative volume vs 14-day average
        rv30: Relative volume vs 30-day average
        rv60: Relative volume vs 60-day average
    """
    ticker: str
    open: float
    high: float
    low: float
    close: float
    price: float
    today_vol: float
    rv14: float
    rv30: float
    rv60: float


class ScreenerCriteria(BaseModel):
    """Shared model for screener criteria used across services and routers.
    Mirrors the JSON stored in ScreeningCriteria.criteria.
    """
    # Database filters (asset metadata)
    asset_types: Optional[List[str]] = None
    market_cap_min: Optional[int] = None
    market_cap_max: Optional[int] = None
    float_min: Optional[int] = None
    float_max: Optional[int] = None
    sic_codes: Optional[List[str]] = None

    # Real-time screener filters (price/volume dynamics)
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_volume: Optional[float] = None
    min_change_percent: Optional[float] = None
    max_change_percent: Optional[float] = None
    min_relative_volume: Optional[float] = None
    exclude_etfs: Optional[bool] = True
    order_by: Optional[str] = None
    limit: Optional[int] = None

    # Technical analysis filters
    technical_filters: Optional[Dict[str, Any]] = None


class TickerStateTransitionCode(str, Enum):
    """Structured codes for ticker state transitions."""
    # Screened state
    SCREENER_PASSED = "screener_passed"
    SCREENER_UPDATED = "screener_updated"
    
    # Setup state
    SETUP_STARTED = "setup_started"
    SETUP_PASSED = "setup_passed"
    SETUP_FAILED_NEWS = "setup_failed_news"
    SETUP_FAILED_PATTERN = "setup_failed_pattern"
    SETUP_FAILED_PRICE = "setup_failed_price"
    SETUP_FAILED_CHANGE = "setup_failed_change"
    SETUP_FAILED_RV = "setup_failed_rv"
    SETUP_FAILED_OTHER = "setup_failed_other"
    
    # Entered state
    ENTRY_LEVEL_CREATED = "entry_level_created"
    ENTRY_LEVEL_UPDATED = "entry_level_updated"
    
    # Filled state
    ENTRY_ORDER_FILLED = "entry_order_filled"
    
    # Exited state
    EXIT_ORDER_FILLED = "exit_order_filled"
    STOP_LOSS_TRIGGERED = "stop_loss_triggered"
    TAKE_PROFIT_TRIGGERED = "take_profit_triggered"
    MANUAL_CLOSE = "manual_close"
    
    # Removed state
    DROPPED_FROM_SCREENER = "dropped_from_screener"
    SCREENER_NO_LONGER_PASSES = "screener_no_longer_passes"
