"""
Unified Screener Data Fetcher

Provides a single data fetching pattern for both live and historical screeners.
Both modes follow the same query pattern for consistency and performance.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict, Any, Optional

from app.services.core.time_context import get_current_time
from sqlalchemy import text
from app.services.core.database import get_async_session

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
            
            # STEP 3: Fetch pre-calculated metrics from market_data
            start_time = get_current_time()
            symbols_list = list(daily_data.keys())

            window_start = day_end - timedelta(days=120)

            metrics_stmt = text("""
                WITH daily_metrics AS (
                    SELECT
                        symbol,
                        time::date AS date,
                        rv14,
                        rv30,
                        rv60,
                        sma_20,
                        sma_50,
                        sma_200,
                        rsi_14,
                        macd_line,
                        macd_signal,
                        macd_histogram,
                        bb_upper,
                        bb_middle,
                        bb_lower,
                        atr_14,
                        volume_ma_20,
                        MAX(high) OVER (
                            PARTITION BY symbol
                            ORDER BY time
                            RANGE BETWEEN INTERVAL '90 day' PRECEDING AND CURRENT ROW
                        ) AS high_90d,
                        MIN(low) OVER (
                            PARTITION BY symbol
                            ORDER BY time
                            RANGE BETWEEN INTERVAL '90 day' PRECEDING AND CURRENT ROW
                        ) AS low_90d
                    FROM market_data
                    WHERE timescale = '1day'
                      AND symbol = ANY(:symbols)
                      AND time >= :window_start
                      AND time < :day_end
                )
                SELECT *
                FROM daily_metrics
                WHERE date = :prev_trading_day
            """)

            result = await session.execute(
                metrics_stmt,
                {
                    "symbols": symbols_list,
                    "window_start": window_start,
                    "day_end": day_end,
                    "prev_trading_day": prev_trading_day,
                },
            )

            # Build metrics map
            metrics_map = {}
            for row in result:
                mapping = row._mapping
                symbol = mapping["symbol"]
                metrics_map[symbol] = {
                    "rv14": float(mapping["rv14"]) if mapping["rv14"] else 0.0,
                    "rv30": float(mapping["rv30"]) if mapping["rv30"] else 0.0,
                    "rv60": float(mapping["rv60"]) if mapping["rv60"] else 0.0,
                    "high_90d": float(mapping["high_90d"]) if mapping["high_90d"] else None,
                    "low_90d": float(mapping["low_90d"]) if mapping["low_90d"] else None,
                    "sma_20": float(mapping["sma_20"]) if mapping["sma_20"] else None,
                    "sma_50": float(mapping["sma_50"]) if mapping["sma_50"] else None,
                    "sma_200": float(mapping["sma_200"]) if mapping["sma_200"] else None,
                    "rsi_14": float(mapping["rsi_14"]) if mapping["rsi_14"] else None,
                    "macd_line": float(mapping["macd_line"]) if mapping["macd_line"] else None,
                    "macd_signal": float(mapping["macd_signal"]) if mapping["macd_signal"] else None,
                    "macd_histogram": float(mapping["macd_histogram"]) if mapping["macd_histogram"] else None,
                    "bb_upper": float(mapping["bb_upper"]) if mapping["bb_upper"] else None,
                    "bb_middle": float(mapping["bb_middle"]) if mapping["bb_middle"] else None,
                    "bb_lower": float(mapping["bb_lower"]) if mapping["bb_lower"] else None,
                    "atr_14": float(mapping["atr_14"]) if mapping["atr_14"] else None,
                    "volume_ma_20": float(mapping["volume_ma_20"]) if mapping["volume_ma_20"] else None,
                }
            
            metrics_time = (get_current_time() - start_time).total_seconds()
            logger.info(f"[UNIFIED] Got metrics for {len(metrics_map)}/{len(symbols_list)} symbols ({metrics_time:.2f}s)")
            
            if len(metrics_map) == 0 and mode == "historical":
                logger.error(
                    f"[UNIFIED] ❌ No metrics found for {prev_trading_day} (historical mode). "
                    f"Ensure market_data metrics are populated for this date before backtesting. "
                    f"RV filter requires metrics to function."
                )
            
            # STEP 4: For LIVE mode, calculate RV14 using TODAY's accumulated volume vs 14-day average
            # This is critical: we should use TODAY's volume for TODAY's screening, not yesterday's!
            # Metrics are sourced directly from market_data; no live recalculation needed.
            
            # STEP 5: Combine into snapshot format and apply filters (in-memory, very fast)
            logger.info(f"[UNIFIED] Combining {len(daily_data)} symbols with metrics, applying RV filter={min_relative_volume}")
            snapshots = []
            filtered_by_rv = 0
            filtered_by_no_close = 0
            symbols_without_metrics = 0
            
            for symbol, daily in daily_data.items():
                # Skip if no daily close
                if not daily.get("close"):
                    filtered_by_no_close += 1
                    continue
                
                # Get metrics for this symbol
                metrics = metrics_map.get(symbol, {})
                if not metrics:
                    symbols_without_metrics += 1
                
                # Apply relative volume filter if specified
                if min_relative_volume is not None:
                    rv14 = metrics.get("rv14", 0.0)
                    if rv14 < min_relative_volume:
                        filtered_by_rv += 1
                        continue
                
                # Get current price (use 5min/live, or fallback to daily close)
                current_price = price_data.get(symbol) or daily["close"]
                
                snapshot = {
                    "ticker": symbol,
                    "price": current_price,
                    "volume": daily["volume"],
                    "day": {
                        "o": daily["open"],
                        "h": daily["high"],
                        "l": daily["low"],
                        "c": daily["close"],
                        "v": daily["volume"],
                    }
                }
                
                # Add pre-calculated metrics
                snapshot.update(metrics)
                
                snapshots.append(snapshot)
            
            if filtered_by_rv > 0:
                logger.warning(
                    f"[UNIFIED] RV filter removed {filtered_by_rv} symbols "
                    f"(min_relative_volume={min_relative_volume})"
                )
            if filtered_by_no_close > 0:
                logger.debug(f"[UNIFIED] Skipped {filtered_by_no_close} symbols without daily close")
            if symbols_without_metrics > 0 and mode == "historical":
                logger.warning(
                    f"[UNIFIED] {symbols_without_metrics} symbols have no metrics "
                    f"(metrics not calculated for {prev_trading_day})"
                )
            
            # Single summary log
            logger.info(f"[UNIFIED] {len(snapshots)} snapshots ready")
            return snapshots
            
    except Exception as e:
        logger.error(f"[UNIFIED] Error fetching data: {e}", exc_info=True)
        return []

