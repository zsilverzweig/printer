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


class ScreenerResult(TypedDict, total=False):
    """Screener output combining prior-day market_data with current price."""
    ticker: str
    price: float
    last_trade_price: float
    prev_open: float
    prev_high: float
    prev_low: float
    prev_close: float
    prev_volume: float
    today_vol: Optional[float]
    rv14: Optional[float]
    rv_lw: Optional[float]
    change_close: Optional[float]
    change_close_pct: Optional[float]
    type: Optional[str]
    primary_exchange: Optional[str]
    sic_description: Optional[str]
    market_cap: Optional[int]
    public_float: Optional[int]


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
    min_relative_volume_last_week: Optional[float] = None
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
