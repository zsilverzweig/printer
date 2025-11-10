#!/usr/bin/env python3
"""
Core utilities for market data loading.

Contains shared functions, configuration, and helpers used by the main loader.
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta, timezone
from typing import List, Dict

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from polygon import RESTClient
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
import urllib3
from urllib3.poolmanager import PoolManager

import logging

# Configure urllib3 connection pool globally for concurrent requests
# Patch the PoolManager to use a larger default pool size
_original_connection_from_url = PoolManager.connection_from_url

def _connection_from_url_with_pool(self, url, pool_kwargs=None):
    """Wrapper to set maxsize for connection pools."""
    if pool_kwargs is None:
        pool_kwargs = {}
    pool_kwargs.setdefault('maxsize', 10)  # Default pool size is 1, increase to 10
    return _original_connection_from_url(self, url, pool_kwargs)

PoolManager.connection_from_url = _connection_from_url_with_pool

# Also patch connection_from_host
_original_connection_from_host = PoolManager.connection_from_host

def _connection_from_host_with_pool(self, host, port=None, scheme='http', pool_kwargs=None):
    """Wrapper to set maxsize for connection pools."""
    if pool_kwargs is None:
        pool_kwargs = {}
    pool_kwargs.setdefault('maxsize', 10)
    return _original_connection_from_host(self, host, port, scheme, pool_kwargs)

PoolManager.connection_from_host = _connection_from_host_with_pool

from app.models.market_data import MarketData, SymbolDateValidation
from app.services.core.database import get_async_session
from app.services.market.metrics_calculator import METRIC_FIELDS, MetricsCalculator, is_metrics_timescale

# Optimize logging: default to INFO for visibility, allow override via env
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOADER_LOG_LEVEL", "INFO"))

# Quiet noisy libraries
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("polygon").setLevel(logging.WARNING)

TIMESCALE_CONFIG = {
    '1min': {'multiplier': 1, 'timespan': 'minute'},
    '5min': {'multiplier': 5, 'timespan': 'minute'},
    '15min': {'multiplier': 15, 'timespan': 'minute'},
    '1hour': {'multiplier': 1, 'timespan': 'hour'},
    '1day': {'multiplier': 1, 'timespan': 'day'}
}

def create_polygon_client(api_key: str) -> RESTClient:
    """
    Create Polygon RESTClient.
    
    Connection pool is configured globally via urllib3 settings above.
    """
    return RESTClient(api_key=api_key)


async def needs_data(symbol: str, date: datetime.date, timescale: str) -> bool:
    """Check if we already have validation for this symbol/date/timescale."""
    async with get_async_session() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(*) FROM symbol_date_validation
                WHERE symbol = :symbol
                  AND date = :date
                  AND timescale = :timescale
            """),
            {
                "symbol": symbol.upper(),
                "date": date,
                "timescale": timescale
            }
        )
        return result.scalar() == 0


async def load_symbol_data(
    client: RESTClient,
    symbol: str,
    date: datetime.date,
    timescale: str,
    config: Dict
) -> List[MarketData]:
    """Fetch bars for a symbol/date/timescale from Polygon."""
    if timescale == '1day':
        # Fetch a slightly wider window to avoid Polygon returning empty results for single-day queries
        from_date_dt = date - timedelta(days=4)
        to_date_dt = date + timedelta(days=1)
    else:
        from_date_dt = date
        to_date_dt = date + timedelta(days=1)
    
    from_date = from_date_dt.strftime("%Y-%m-%d")
    to_date = to_date_dt.strftime("%Y-%m-%d")
    
    try:
        # Run Polygon API call in executor (it's synchronous)
        loop = asyncio.get_event_loop()
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "Fetching %s %s %s (from %s to %s)",
                symbol,
                timescale,
                date,
                from_date,
                to_date,
            )
        aggs = await loop.run_in_executor(
            None,
            lambda: list(client.list_aggs(
                ticker=symbol,
                multiplier=config['multiplier'],
                timespan=config['timespan'],
                from_=from_date,
                to=to_date,
                sort='asc',
                limit=50000,
                adjusted=True,
            ))
        )
        
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(
                "Polygon returned %s bars for %s %s",
                len(aggs),
                symbol,
                timescale,
            )
        
        # Optimize hot path: bind locals to avoid repeated lookups
        bars = []
        ts_from_ms = datetime.fromtimestamp
        utc = timezone.utc
        append = bars.append
        symbol_upper = symbol.upper()
        
        for agg in aggs:
            timestamp = ts_from_ms(agg.timestamp / 1000, tz=utc)
            
            # Only keep bars that match the requested date when using the wider 1day window
            if timescale == '1day' and timestamp.date() != date:
                continue
            append(MarketData(
                time=timestamp,
                symbol=symbol_upper,
                timescale=timescale,
                open=float(agg.open),
                high=float(agg.high),
                low=float(agg.low),
                close=float(agg.close),
                volume=int(agg.volume),
                vwap=float(agg.vwap) if hasattr(agg, 'vwap') and agg.vwap else None,
                trade_count=int(agg.transactions) if hasattr(agg, 'transactions') and agg.transactions else None,
                session_type='regular'
            ))
        
        return bars
    except Exception as e:
        logger.error("Error loading %s %s: %s", symbol, timescale, e)
        return []


SEED_HISTORY_LIMIT = 400  # Sufficient for EMA200 and RV60 warm-up


def _as_numeric(value: float | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _build_insert_payload(bar: MarketData) -> Dict:
    payload = {
        "time": bar.time,
        "symbol": bar.symbol,
        "timescale": bar.timescale,
        "open": bar.open,
        "high": bar.high,
        "low": bar.low,
        "close": bar.close,
        "volume": bar.volume,
        "vwap": bar.vwap,
        "trade_count": bar.trade_count,
        "session_type": bar.session_type,
    }

    for field in METRIC_FIELDS:
        payload[field] = _as_numeric(getattr(bar, field, None))

    return payload


def _build_conflict_update(stmt) -> Dict:
    update_values = {
        "open": stmt.excluded.open,
        "high": stmt.excluded.high,
        "low": stmt.excluded.low,
        "close": stmt.excluded.close,
        "volume": stmt.excluded.volume,
        "vwap": stmt.excluded.vwap,
        "trade_count": stmt.excluded.trade_count,
        "session_type": stmt.excluded.session_type,
    }

    for field in METRIC_FIELDS:
        update_values[field] = getattr(stmt.excluded, field)

    return update_values


async def insert_bars(bars: List[MarketData]) -> None:
    """Bulk insert bars with pre-calculated metrics."""
    if not bars:
        return
    
    original_count = len(bars)
    
    # Deduplicate
    seen = {}
    for bar in bars:
        key = (bar.time, bar.symbol, bar.timescale)
        seen[key] = bar
    bars = list(seen.values())
    
    if len(bars) < original_count and logger.isEnabledFor(logging.DEBUG):
        logger.debug("Deduplicated %s bars to %s unique bars", original_count, len(bars))
    
    # Sort to prevent deadlocks
    bars = sorted(bars, key=lambda b: (b.time, b.symbol, b.timescale))

    calculator = MetricsCalculator()
    
    async with get_async_session() as session:
        # Warm up calculator state with existing history for each combination
        combinations = {}
        for bar in bars:
            combinations.setdefault((bar.symbol, bar.timescale), []).append(bar)

        for (symbol, timescale), combo_bars in combinations.items():
            if not is_metrics_timescale(timescale):
                continue
            earliest_time = combo_bars[0].time
            seed_stmt = (
                select(MarketData)
                .where(
                    MarketData.symbol == symbol,
                    MarketData.timescale == timescale,
                    MarketData.time < earliest_time,
                )
                .order_by(MarketData.time.desc())
                .limit(SEED_HISTORY_LIMIT)
            )
            seed_result = await session.execute(seed_stmt)
            existing_bars = list(seed_result.scalars())
            for existing_bar in reversed(existing_bars):
                calculator.calculate(symbol, timescale, existing_bar)

        for bar in bars:
            if is_metrics_timescale(bar.timescale):
                metrics = calculator.calculate(bar.symbol, bar.timescale, bar)
                for field, value in metrics.items():
                    setattr(bar, field, _as_numeric(value))

        # Cap chunk size so total query parameters stay within PostgreSQL limits
        chunk_size = 1000
        for i in range(0, len(bars), chunk_size):
            chunk = bars[i:i + chunk_size]
            values = [_build_insert_payload(bar) for bar in chunk]
            stmt = insert(MarketData).values(values)
            stmt = stmt.on_conflict_do_update(
                index_elements=["time", "symbol", "timescale"],
                set_=_build_conflict_update(stmt),
            )
            await session.execute(stmt)
            await session.commit()

        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Inserted %s bars into database", len(bars))


async def create_validation(symbol: str, date: datetime.date, timescale: str, bars: List[MarketData]) -> None:
    """Create validation record for symbol/date/timescale."""
    bar_count = len([b for b in bars if b.time.date() == date])
    is_complete = bar_count > 0
    
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(
            "Validation summary: %s %s %s bar_count=%s expected=%s is_complete=%s",
            symbol,
            timescale,
            date,
            bar_count,
            expected,
            is_complete,
        )
    
    date_bars = [b for b in bars if b.time.date() == date]
    first_bar = min(b.time for b in date_bars) if date_bars else None
    last_bar = max(b.time for b in date_bars) if date_bars else None
    
    async with get_async_session() as session:
        stmt = insert(SymbolDateValidation).values({
            "symbol": symbol.upper(),
            "date": date,
            "timescale": timescale,
            "is_complete": is_complete,
            "bar_count": bar_count,
            "first_bar_time": first_bar,
            "last_bar_time": last_bar,
            "validated_at": datetime.now(timezone.utc)
        })
        stmt = stmt.on_conflict_do_update(
            index_elements=["symbol", "date", "timescale"],
            set_={
                "bar_count": stmt.excluded.bar_count,
                "is_complete": stmt.excluded.is_complete,
                "first_bar_time": stmt.excluded.first_bar_time,
                "last_bar_time": stmt.excluded.last_bar_time,
                "validated_at": stmt.excluded.validated_at
            }
        )
        await session.execute(stmt)
        await session.commit()
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug("Created validation record for %s %s %s", symbol, date, timescale)

