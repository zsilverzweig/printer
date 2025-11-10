"""
Unified Screener Data Fetcher

Provides a single data fetching pattern for both live and historical screeners.
Both modes follow the same query pattern for consistency and performance.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict, Any, Optional

from app.services.core.time_context import get_current_time
from sqlalchemy import text, select
from app.services.core.database import get_async_session
from app.models.assets import TickerDetails

logger = logging.getLogger("app.screener.data.unified")


async def fetch_screener_data_unified(
    target_date: Optional[date] = None,
    target_timestamp: Optional[datetime] = None,
    market_cap_min: Optional[int] = None,
    market_cap_max: Optional[int] = None,
    float_min: Optional[int] = None,
    float_max: Optional[int] = None,
    asset_types: Optional[List[str]] = None,
    min_relative_volume: Optional[float] = None,
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
    
    # Determine mode and dates (silent unless debug)
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
            # STEP 1: Get ALL daily OHLCV in ONE query (10K+ symbols in < 1 second)
            start_time = get_current_time()
            # OPTIMIZED: Use time range instead of date cast for efficient index usage
            day_start = datetime.combine(prev_trading_day, datetime.min.time(), tzinfo=timezone.utc)
            day_end = day_start + timedelta(days=1)
            
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
            logger.debug(f"[UNIFIED] Daily: {len(daily_data)} symbols ({daily_time:.2f}s)")
            
            if not daily_data:
                logger.warning(f"[UNIFIED] No daily data for {prev_trading_day}")
                return []
            
            # STEP 1.5: Apply database filters if specified (market cap, float, asset types)
            if market_cap_min is not None or market_cap_max is not None or float_min is not None or float_max is not None:
                from app.services.screener.ticker_filter import get_filtered_tickers, FilterCriteria
                
                logger.info(
                    f"[UNIFIED] Applying database filters: market_cap=({market_cap_min}, {market_cap_max}), float=({float_min}, {float_max})"
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
                    f"[UNIFIED] Database filters reduced symbols from {original_count} to {len(daily_data)}"
                )
                
                if not daily_data:
                    logger.warning(f"[UNIFIED] No symbols remain after market cap filtering")
                    return []
            
            # STEP 2: Get current price data (mode-specific, also ONE query)
            start_time = get_current_time()
            if mode == "historical":
                # Historical: Get 5min bars at timestamp via MarketDataService
                from app.services.market.market_data_service import get_market_data_service
                market_service = get_market_data_service()
                
                symbols_list = list(daily_data.keys())
                
                logger.info(f"[UNIFIED] Fetching 5min data for {len(symbols_list)} symbols via MarketDataService...")
                
                # Use MarketDataService batch query
                price_data = await market_service.get_latest_prices_batch(
                    symbols=symbols_list,
                    timeframe="5min",
                    at_timestamp=target_timestamp
                )
                
                price_time = (get_current_time() - start_time).total_seconds()
                logger.info(f"[UNIFIED] Got {len(price_data)} symbols with 5min data ({price_time:.2f}s)")
            else:
                # Live: Get latest trades
                result = await session.execute(
                    text("""
                        SELECT DISTINCT ON (symbol)
                            symbol,
                            price as current_price
                        FROM market_latest_trades
                        ORDER BY symbol, timestamp DESC
                    """)
                )
                
                price_data = {}
                for row in result:
                    price_data[row[0]] = float(row[1]) if row[1] else None
                
                price_time = (get_current_time() - start_time).total_seconds()
                logger.debug(f"[UNIFIED] Got {len(price_data)} symbols with live trades ({price_time:.2f}s)")
            
            symbols_list = list(daily_data.keys())

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

            today_volume_map: Dict[str, float] = {}
            trailing_volume_map: Dict[str, float] = {}
            week_ago_volume_map: Dict[str, float] = {}
            ticker_details_map: Dict[str, Dict[str, Any]] = {}

            if symbols_list:
                # Query today's accumulated volume using hourly bars (fallback to 0 if missing)
                today_stmt = text("""
                    SELECT symbol, COALESCE(SUM(volume), 0) AS volume
                    FROM market_data
                    WHERE timescale = '1hour'
                      AND symbol = ANY(:symbols)
                      AND time >= :start_time
                      AND time < :end_time
                    GROUP BY symbol
                """)

                today_result = await session.execute(
                    today_stmt,
                    {
                        "symbols": symbols_list,
                        "start_time": today_start,
                        "end_time": reference_time,
                    },
                )
                for row in today_result:
                    today_volume_map[row[0]] = float(row[1]) if row[1] else 0.0

                # Query trailing 14 calendar days of volume (excluding today)
                trailing_stmt = text("""
                    SELECT symbol, COALESCE(SUM(volume), 0) AS volume
                    FROM market_data
                    WHERE timescale = '1day'
                      AND symbol = ANY(:symbols)
                      AND time >= :start_time
                      AND time < :end_time
                    GROUP BY symbol
                """)

                trailing_result = await session.execute(
                    trailing_stmt,
                    {
                        "symbols": symbols_list,
                        "start_time": trailing_start,
                        "end_time": today_start,
                    },
                )
                for row in trailing_result:
                    trailing_volume_map[row[0]] = float(row[1]) if row[1] else 0.0

                # Query same-day volume from one week ago using hourly bars up to matching time
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

            logger.info(
                f"[UNIFIED] Combining {len(daily_data)} symbols with volume statistics, "
                f"applying RV filter={min_relative_volume}"
            )
            snapshots = []
            filtered_by_rv = 0
            filtered_by_no_close = 0

            for symbol, daily in daily_data.items():
                if not daily.get("close"):
                    filtered_by_no_close += 1
                    continue

                today_volume = today_volume_map.get(symbol, 0.0)
                trailing_volume = trailing_volume_map.get(symbol, 0.0)
                week_ago_volume = week_ago_volume_map.get(symbol, 0.0)

                rv14_value = (today_volume / trailing_volume) if trailing_volume else 0.0
                rv_last_week = (today_volume / week_ago_volume) if week_ago_volume else 0.0

                if min_relative_volume is not None and rv14_value < min_relative_volume:
                    filtered_by_rv += 1
                    continue

                current_price = price_data.get(symbol) or daily["close"]
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
            if filtered_by_no_close > 0:
                logger.debug(f"[UNIFIED] Skipped {filtered_by_no_close} symbols without daily close")
            # Single summary log
            logger.info(f"[UNIFIED] {len(snapshots)} snapshots ready")
            return snapshots
            
    except Exception as e:
        logger.error(f"[UNIFIED] Error fetching data: {e}", exc_info=True)
        return []

