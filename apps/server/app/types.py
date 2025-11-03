from __future__ import annotations

from typing import TypedDict, Optional, List, Dict, Any
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


class NocStockData(TypedDict):
    """NOC (Network Operations Center) stock data with all trading signals.
    
    Fields:
        ticker: Stock ticker symbol
        price: Current price
        priceSignal: Price signal status (green/yellow/red)
        changePercent: Yesterday's change percentage
        changeSignal: Change signal status
        relativeVolume: Time-adjusted relative volume
        rvSignal: Relative volume signal status
        newsSentiment: AI-generated news sentiment
        newsSignal: News signal status
        float: Number of shares trading
        floatSignal: Float signal status
        bullFlag: Bull flag pattern detected
        flagSignal: Bull flag signal status
    """
    ticker: str
    price: float
    priceSignal: str  # "green" | "yellow" | "red"
    changePercent: float
    changeSignal: str
    relativeVolume: float
    rvSignal: str
    newsSentiment: str
    newsSignal: str
    float: str
    floatSignal: str
    bullFlag: bool
    flagSignal: str



class ScreenerCriteria(BaseModel):
    """Shared model for screener criteria used across services and routers.
    Mirrors the JSON stored in ScreeningCriteria.criteria.
    """
    # Database filters (asset metadata)
    asset_types: Optional[List[str]] = None
    market_cap_min: Optional[int] = None
    market_cap_max: Optional[int] = None
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
