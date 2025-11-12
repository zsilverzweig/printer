"""
Unified Screener Data Fetcher

Provides a single data fetching pattern for both live and historical screeners.
Both modes follow the same query pattern for consistency and performance.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict, Any, Optional, Tuple

from app.services.core.time_context import get_current_time
from sqlalchemy import text, select
from app.services.core.database import get_async_session
from app.models.assets import TickerDetails

logger = logging.getLogger("app.screener.data.unified")


@dataclass
class HistoricalScreenerCache:
    """
    Cache container for historical screener lookups.
    Stores invariants that do not change across minute iterations.
    """

    signature: Optional[Tuple[Any, ...]] = None
    daily_data: Optional[Dict[str, Dict[str, Any]]] = None
    filtered_symbols: Optional[List[str]] = None
    trailing_volume_sum_map: Optional[Dict[str, float]] = None
    trailing_volume_count_map: Optional[Dict[str, int]] = None
    week_ago_volume_map: Optional[Dict[str, float]] = None
    ticker_details_map: Optional[Dict[str, Dict[str, Any]]] = None

    def ensure_signature(self, signature: Tuple[Any, ...]) -> None:
        if self.signature is None:
            self.signature = signature
            return
        if self.signature != signature:
            self.clear()
            self.signature = signature

    def clear(self) -> None:
        self.daily_data = None
        self.filtered_symbols = None
        self.trailing_volume_sum_map = None
        self.trailing_volume_count_map = None
        self.week_ago_volume_map = None
        self.ticker_details_map = None


async def fetch_screener_data_unified(
    target_date: Optional[date] = None,
    target_timestamp: Optional[datetime] = None,
    market_cap_min: Optional[int] = None,
    market_cap_max: Optional[int] = None,
    float_min: Optional[int] = None,
    float_max: Optional[int] = None,
    asset_types: Optional[List[str]] = None,
    min_relative_volume: Optional[float] = None,
    max_relative_volume: Optional[float] = None,
    min_relative_volume_last_week: Optional[float] = None,
    cache: Optional[HistoricalScreenerCache] = None,
) -> List[Dict[str, Any]]:
    """
    Unified data fetcher for both live and historical screeners.
    
    Fetches market data in ONE query each for daily + current price:
    - Daily OHLCV (previous trading day) - ONE query for ALL symbols
    - Current price (live: latest trades, historical: 5min bars) - ONE query for ALL symbols
    
    This matches the live screener's efficient pattern (10K+ symbols in <1 second).
    
    Args:
        target_date: For live mode, date for daily data (None = most recent)
        target_timestamp: For historical mode, specific datetime to screen at
        market_cap_min: Minimum market cap filter (in dollars)
        market_cap_max: Maximum market cap filter (in dollars)
        asset_types: Optional list of asset types to include
        
    Returns:
        List of snapshot-like dicts with daily + current price data:
        [
            {
                "ticker": "AAPL",
                "price": 150.25,  # current price
                "volume": 50000000,  # daily volume
                "day": {
                    "o": 149.50,  # yesterday's open
                    "h": 151.00,  # yesterday's high
                    "l": 149.00,  # yesterday's low
                    "c": 150.00,  # yesterday's close
                    "v": 50000000,  # yesterday's volume
                }
            },
            ...
        ]
    """
    
    logger.info(
        "[UNIFIED] fetch_screener_data_unified called with market_cap=(%s, %s), float=(%s, %s), asset_types=%s, min_rv=%s, max_rv=%s, min_rv_lw=%s, target_timestamp=%s",
        market_cap_min,
        market_cap_max,
        float_min,
        float_max,
        asset_types,
        min_relative_volume,
        max_relative_volume,
        min_relative_volume_last_week,
        target_timestamp.isoformat() if target_timestamp else None,
    )

    cache_signature: Tuple[Any, ...] = (
        target_date,
        target_timestamp.date() if target_timestamp else None,
        market_cap_min,
        market_cap_max,
        float_min,
        float_max,
        tuple(sorted(asset_types)) if asset_types else (),
        min_relative_volume,
        max_relative_volume,
        min_relative_volume_last_week,
    )
    if cache is not None:
        cache.ensure_signature(cache_signature)

    # Determine mode and dates (silent unless debug)
    MIN_SYMBOLS_FOR_DAILY = 1000

    if target_timestamp:
        # Historical mode
        mode = "historical"
        timestamp_date = target_timestamp.date()
        prev_trading_day = timestamp_date - timedelta(days=1)
        # If previous day was weekend, go back further
        while prev_trading_day.weekday() >= 5:  # Saturday=5, Sunday=6
            prev_trading_day -= timedelta(days=1)
        logger.debug(f"[UNIFIED] Historical: {target_timestamp.date()}")
    else:
        # Live mode - use most recent daily data
        mode = "live"
        if target_date:
            prev_trading_day = target_date
        else:
            # Find most recent date with daily data
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        SELECT MAX(time::date) as latest_date
                        FROM market_data
                        WHERE timescale = '1day'
                    """)
                )
                row = result.fetchone()
                prev_trading_day = row[0] if row and row[0] else (get_current_time().date() - timedelta(days=1))
        
        logger.debug(f"[UNIFIED] Live: {prev_trading_day}")
    
    try:
        async with get_async_session() as session:
            async def select_recent_trading_day(candidate_day: date) -> tuple[date, int]:
                """
                Find the most recent trading day at or before candidate_day that has
                sufficient coverage in market_data for 1day bars.
                """
                checked = 0
                day = candidate_day
                last_count = 0
                while checked < 10:  # don't look back more than 2 weeks
                    day_start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
                    day_end = day_start + timedelta(days=1)
                    coverage_result = await session.execute(
                        text("""
                            SELECT COUNT(DISTINCT symbol)
                            FROM market_data
                            WHERE time >= :day_start
                              AND time < :day_end
                              AND timescale = '1day'
                        """),
                        {"day_start": day_start, "day_end": day_end},
                    )
                    coverage = coverage_result.scalar() or 0
                    last_count = coverage
                    if coverage >= MIN_SYMBOLS_FOR_DAILY:
                        if day != candidate_day:
                            logger.warning(
                                "[UNIFIED] Falling back to %s due to low coverage (%s symbols) on %s",
                                day,
                                coverage,
                                candidate_day,
                            )
                        return day, coverage
                    logger.warning(
                        "[UNIFIED] Insufficient daily coverage for %s (%s symbols), looking back...",
                        day,
                        coverage,
                    )
                    checked += 1
                    day -= timedelta(days=1)
                    while day.weekday() >= 5:  # skip weekends
                        day -= timedelta(days=1)
                logger.error(
                    "[UNIFIED] Could not find recent trading day with sufficient coverage after checking %s days; using %s (%s symbols).",
                    checked,
                    candidate_day,
                    last_count,
                )
                return candidate_day, last_count

            # STEP 1: Get ALL daily OHLCV in ONE query (10K+ symbols in < 1 second)
            start_time = get_current_time()
            # OPTIMIZED: Use time range instead of date cast for efficient index usage
            if mode == "live":
                selected_day, coverage = await select_recent_trading_day(prev_trading_day)
                if selected_day != prev_trading_day:
                    prev_trading_day = selected_day
                logger.info(
                    "[UNIFIED] Using trading day %s for daily data (%s symbols available)",
                    prev_trading_day,
                    coverage,
                )
            day_start = datetime.combine(prev_trading_day, datetime.min.time(), tzinfo=timezone.utc)
            day_end = day_start + timedelta(days=1)
            
            logger.info(
                "[UNIFIED] Starting daily fetch: mode=%s, prev_trading_day=%s, target_timestamp=%s",
                mode,
                prev_trading_day,
                target_timestamp.isoformat() if target_timestamp else None,
            )
        if cache and cache.daily_data is not None:
            daily_data = cache.daily_data
        else:
            result = await session.execute(
                text("""
                    SELECT 
                        symbol,
                        open,
                        high,
                        low,
                        close,
                        volume
                    FROM market_data
                    WHERE time >= :day_start
                      AND time < :day_end
                      AND timescale = '1day'
                    ORDER BY symbol
                """),
                {"day_start": day_start, "day_end": day_end}
            )
            
            daily_data = {}
            for row in result:
                daily_data[row[0]] = {
                    "open": float(row[1]) if row[1] else None,
                    "high": float(row[2]) if row[2] else None,
                    "low": float(row[3]) if row[3] else None,
                    "close": float(row[4]) if row[4] else None,
                    "volume": int(row[5]) if row[5] else 0
                }
            
            daily_time = (get_current_time() - start_time).total_seconds()
            logger.info("[UNIFIED] Daily step: %s symbols fetched in %0.2fs", len(daily_data), daily_time)
            
            if not daily_data:
                logger.warning(f"[UNIFIED] No daily data for {prev_trading_day}")
                return []

        # STEP 1.5: Apply database filters if specified (market cap, float, asset types)
        should_apply_db_filters = (
            bool(asset_types)
            or market_cap_min is not None
            or market_cap_max is not None
            or float_min is not None
            or float_max is not None
        )

        if should_apply_db_filters:
            if cache and cache.filtered_symbols is not None:
                allowed_tickers_set = set(cache.filtered_symbols)
                original_count = len(daily_data)
                daily_data = {
                    symbol: data
                    for symbol, data in daily_data.items()
                    if symbol in allowed_tickers_set
                }
                logger.info(
                    "[UNIFIED] Using cached filtered tickers (%s -> %s)",
                    original_count,
                    len(daily_data),
                )
            else:
                from app.services.screener.ticker_filter import get_filtered_tickers, FilterCriteria
                
                logger.info(
                    "[UNIFIED] Applying database filters: asset_types=%s, market_cap=(%s, %s), float=(%s, %s)",
                    asset_types,
                    market_cap_min,
                    market_cap_max,
                    float_min,
                    float_max,
                )
                
                criteria = FilterCriteria(
                    asset_types=asset_types if asset_types else None,
                    market_cap_min=market_cap_min,
                    market_cap_max=market_cap_max,
                    float_min=float_min,
                    float_max=float_max,
                )
                
                allowed_tickers = await get_filtered_tickers(criteria)
                allowed_tickers_set = set(allowed_tickers)
                
                # Filter daily_data to only include tickers that pass database filters
                original_count = len(daily_data)
                daily_data = {
                    symbol: data
                    for symbol, data in daily_data.items()
                    if symbol in allowed_tickers_set
                }
                
                logger.info(
                    "[UNIFIED] Database filters reduced symbols from %s to %s",
                    original_count,
                    len(daily_data),
                )
                
                if not daily_data:
                    logger.warning(f"[UNIFIED] No symbols remain after market cap filtering")
                    return []
                
                if cache is not None:
                    cache.filtered_symbols = list(daily_data.keys())
        else:
            if cache is not None and cache.filtered_symbols is None:
                cache.filtered_symbols = list(daily_data.keys())

        if cache is not None:
            # Store the filtered daily snapshot for reuse.
            cache.daily_data = daily_data
            
            # STEP 2: Get current intraday price + volume snapshots
            start_time = get_current_time()
            today_volume_map: Dict[str, float] = {}
            price_data: Dict[str, Optional[float]] = {}
            symbols_list = list(daily_data.keys())

            if symbols_list:
                from app.services.market.market_data_service import get_market_data_service

                market_service = get_market_data_service()
                snapshots = await market_service.get_intraday_snapshot_batch(
                    symbols=symbols_list,
                    timeframe="1min",
                    at_timestamp=target_timestamp if mode == "historical" else None,
                )

                for symbol, snapshot in snapshots.items():
                    price = snapshot.get("price")
                    today_volume = snapshot.get("today_volume")

                    if price is not None:
                        price_data[symbol] = price
                    if today_volume is not None:
                        today_volume_map[symbol] = float(today_volume)

                price_time = (get_current_time() - start_time).total_seconds()
                logger.info(
                    "[UNIFIED] Got %s symbols with %s intraday snapshots (%0.2fs); %s include today_volume",
                    len([s for s in snapshots.values() if s.get("price") is not None]),
                    mode,
                    price_time,
                    len(today_volume_map),
                )
            else:
                price_time = 0.0
            
            symbols_list = list(daily_data.keys())
            logger.info("[UNIFIED] Symbols after daily/price merge: %s", len(symbols_list))

            # Determine reference time for intraday calculations
            reference_time = target_timestamp if target_timestamp else get_current_time()
            if reference_time.tzinfo is None:
                reference_time = reference_time.replace(tzinfo=timezone.utc)

            today_start = datetime.combine(reference_time.date(), datetime.min.time(), tzinfo=timezone.utc)
            if reference_time < today_start:
                reference_time = today_start

            elapsed_today = reference_time - today_start
            week_ago_date = reference_time.date() - timedelta(days=7)
            week_ago_start = datetime.combine(week_ago_date, datetime.min.time(), tzinfo=timezone.utc)
            week_ago_end = week_ago_start + elapsed_today
            if week_ago_end > week_ago_start + timedelta(days=1):
                week_ago_end = week_ago_start + timedelta(days=1)

            trailing_start = today_start - timedelta(days=14)

            if cache and cache.trailing_volume_sum_map is not None:
                trailing_volume_sum_map = cache.trailing_volume_sum_map
                trailing_volume_count_map = cache.trailing_volume_count_map or {}
            else:
                trailing_volume_sum_map = {}
                trailing_volume_count_map = {}

            if cache and cache.week_ago_volume_map is not None:
                week_ago_volume_map = cache.week_ago_volume_map
            else:
                week_ago_volume_map = {}

            if cache and cache.ticker_details_map is not None:
                ticker_details_map = cache.ticker_details_map
            else:
                ticker_details_map = {}

            if symbols_list:
                logger.debug(
                    "[UNIFIED] Building volume stats for %s symbols; %s already have day_volume",
                    len(symbols_list),
                    len(today_volume_map),
                )
                # Query trailing 14 calendar days of volume (excluding today)
                trailing_stmt = text("""
                    SELECT 
                        symbol, 
                        COALESCE(SUM(volume), 0) AS volume,
                        COUNT(*) AS day_count
                    FROM market_data
                    WHERE timescale = '1day'
                      AND symbol = ANY(:symbols)
                      AND time >= :start_time
                      AND time < :end_time
                    GROUP BY symbol
                """)

                if not trailing_volume_sum_map:
                    trailing_result = await session.execute(
                        trailing_stmt,
                        {
                            "symbols": symbols_list,
                            "start_time": trailing_start,
                            "end_time": today_start,
                        },
                    )
                    for row in trailing_result:
                        trailing_volume_sum_map[row[0]] = float(row[1]) if row[1] else 0.0
                        trailing_volume_count_map[row[0]] = int(row[2]) if row[2] else 0

                # Query same-day volume from one week ago using hourly bars up to matching time
                if not week_ago_volume_map:
                    week_stmt = text("""
                    SELECT symbol, COALESCE(SUM(volume), 0) AS volume
                    FROM market_data
                    WHERE timescale = '1hour'
                      AND symbol = ANY(:symbols)
                      AND time >= :start_time
                      AND time < :end_time
                    GROUP BY symbol
                """)

                    week_result = await session.execute(
                        week_stmt,
                        {
                            "symbols": symbols_list,
                            "start_time": week_ago_start,
                            "end_time": week_ago_end,
                        },
                    )
                    for row in week_result:
                        week_ago_volume_map[row[0]] = float(row[1]) if row[1] else 0.0

                # Fetch ticker fundamentals from TickerDetails
                if not ticker_details_map:
                    details_result = await session.execute(
                        select(
                            TickerDetails.symbol,
                            TickerDetails.type,
                            TickerDetails.primary_exchange,
                            TickerDetails.sic_description,
                            TickerDetails.market_cap,
                            TickerDetails.public_float,
                        ).where(TickerDetails.symbol.in_(symbols_list))
                    )

                    for row in details_result:
                        mapping = row._mapping
                        ticker_details_map[mapping["symbol"]] = {
                            "type": mapping["type"],
                            "primary_exchange": mapping["primary_exchange"],
                            "sic_description": mapping["sic_description"],
                            "market_cap": mapping["market_cap"],
                            "public_float": mapping["public_float"],
                        }

                if cache:
                    cache.trailing_volume_sum_map = trailing_volume_sum_map
                    cache.trailing_volume_count_map = trailing_volume_count_map
                    cache.week_ago_volume_map = week_ago_volume_map
                    cache.ticker_details_map = ticker_details_map

            logger.info(
                f"[UNIFIED] Combining {len(daily_data)} symbols with volume statistics, "
                f"applying RV filters min={min_relative_volume}, max={max_relative_volume}, RV_LW filter={min_relative_volume_last_week}"
            )
            snapshots = []
            filtered_by_rv = 0
            filtered_by_rv_max = 0
            filtered_by_rv_lw = 0
            filtered_by_no_close = 0

            for symbol, daily in daily_data.items():
                if not daily.get("close"):
                    filtered_by_no_close += 1
                    continue

                today_volume = today_volume_map.get(symbol, 0.0)
                trailing_sum = trailing_volume_sum_map.get(symbol, 0.0)
                trailing_count = trailing_volume_count_map.get(symbol, 0)
                trailing_avg = (trailing_sum / trailing_count) if trailing_count > 0 else 0.0
                week_ago_volume = week_ago_volume_map.get(symbol, 0.0)

                rv14_value = (today_volume / trailing_avg) if trailing_avg else 0.0
                rv_last_week = (today_volume / week_ago_volume) if week_ago_volume else 0.0

                if min_relative_volume is not None and rv14_value < min_relative_volume:
                    filtered_by_rv += 1
                    continue
                if max_relative_volume is not None and rv14_value > max_relative_volume:
                    filtered_by_rv_max += 1
                    continue
                if (
                    min_relative_volume_last_week is not None
                    and rv_last_week < min_relative_volume_last_week
                ):
                    filtered_by_rv_lw += 1
                    continue

                current_price = price_data.get(symbol) or daily["close"]
                if symbol == "ABAT" and target_timestamp:
                    logger.info(
                        "[UNIFIED][DEBUG] ABAT price lookup at %s -> price_data=%s, daily_close=%s",
                        target_timestamp.isoformat(),
                        price_data.get(symbol),
                        daily["close"],
                    )
                details = ticker_details_map.get(symbol, {})

                snapshot = {
                    "ticker": symbol,
                    "price": current_price,
                    "last_trade_price": current_price,
                    "volume": daily["volume"],
                    "today_vol": today_volume,
                    "rv14": rv14_value,
                    "rv_lw": rv_last_week,
                    "day": {
                        "o": daily["open"],
                        "h": daily["high"],
                        "l": daily["low"],
                        "c": daily["close"],
                        "v": daily["volume"],
                    },
                    "type": details.get("type"),
                    "primary_exchange": details.get("primary_exchange"),
                    "sic_description": details.get("sic_description"),
                    "market_cap": details.get("market_cap"),
                    "public_float": details.get("public_float"),
                }

                snapshots.append(snapshot)
            
            if filtered_by_rv > 0:
                logger.warning(
                    f"[UNIFIED] RV filter removed {filtered_by_rv} symbols "
                    f"(min_relative_volume={min_relative_volume})"
                )
            if filtered_by_rv_max > 0:
                logger.warning(
                    f"[UNIFIED] Max RV filter removed {filtered_by_rv_max} symbols "
                    f"(max_relative_volume={max_relative_volume})"
                )
            if filtered_by_rv_lw > 0:
                logger.warning(
                    f"[UNIFIED] RV last week filter removed {filtered_by_rv_lw} symbols "
                    f"(min_relative_volume_last_week={min_relative_volume_last_week})"
                )
            if filtered_by_no_close > 0:
                logger.debug(f"[UNIFIED] Skipped {filtered_by_no_close} symbols without daily close")
            # Single summary log
            logger.info(f"[UNIFIED] {len(snapshots)} snapshots ready")
            return snapshots
            
    except Exception as e:
        logger.error(f"[UNIFIED] Error fetching data: {e}", exc_info=True)
        return []

