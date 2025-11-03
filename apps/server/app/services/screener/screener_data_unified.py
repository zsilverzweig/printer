"""
Unified Screener Data Fetcher

Provides a single data fetching pattern for both live and historical screeners.
Both modes follow the same query pattern for consistency and performance.
"""

import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Dict, Any, Optional

from sqlalchemy import text
from app.services.core.database import get_async_session

logger = logging.getLogger("app.screener.data.unified")


async def fetch_screener_data_unified(
    target_date: Optional[date] = None,
    target_timestamp: Optional[datetime] = None,
    market_cap_min: Optional[int] = None,
    market_cap_max: Optional[int] = None,
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
    
    logger.info(f"[UNIFIED] fetch_screener_data_unified called: target_timestamp={target_timestamp}, min_rv={min_relative_volume}")
    
    # Determine mode and dates
    if target_timestamp:
        # Historical mode
        mode = "historical"
        timestamp_date = target_timestamp.date()
        prev_trading_day = timestamp_date - timedelta(days=1)
        # If previous day was weekend, go back further
        while prev_trading_day.weekday() >= 5:  # Saturday=5, Sunday=6
            prev_trading_day -= timedelta(days=1)
        logger.info(f"[UNIFIED] Historical mode: timestamp={target_timestamp}, prev_day={prev_trading_day}")
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
                prev_trading_day = row[0] if row and row[0] else (datetime.now(timezone.utc).date() - timedelta(days=1))
        
        logger.info(f"[UNIFIED] Live mode: prev_day={prev_trading_day}")
    
    try:
        async with get_async_session() as session:
            # STEP 1: Get ALL daily OHLCV in ONE query (10K+ symbols in < 1 second)
            start_time = datetime.now()
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
            
            daily_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"[UNIFIED] Got {len(daily_data)} symbols with daily data ({daily_time:.2f}s)")
            
            if not daily_data:
                logger.warning(f"[UNIFIED] No daily data found for {prev_trading_day}")
                return []
            
            # STEP 1.5: Apply market cap filtering if specified
            if market_cap_min is not None or market_cap_max is not None:
                from app.services.screener.ticker_filter import get_filtered_tickers, FilterCriteria
                
                logger.info(
                    f"[UNIFIED] Applying market cap filter: min={market_cap_min}, max={market_cap_max}"
                )
                
                criteria = FilterCriteria(
                    asset_types=asset_types if asset_types else None,
                    market_cap_min=market_cap_min,
                    market_cap_max=market_cap_max,
                )
                
                allowed_tickers = await get_filtered_tickers(criteria)
                allowed_tickers_set = set(allowed_tickers)
                
                # Filter daily_data to only include tickers that pass market cap filter
                original_count = len(daily_data)
                daily_data = {
                    symbol: data
                    for symbol, data in daily_data.items()
                    if symbol in allowed_tickers_set
                }
                
                logger.info(
                    f"[UNIFIED] Market cap filter reduced symbols from {original_count} to {len(daily_data)}"
                )
                
                if not daily_data:
                    logger.warning(f"[UNIFIED] No symbols remain after market cap filtering")
                    return []
            
            # STEP 2: Get current price data (mode-specific, also ONE query)
            start_time = datetime.now()
            if mode == "historical":
                # Historical: Get 5min bars at timestamp
                # OPTIMIZED: Use batched queries to avoid scanning millions of rows
                # Query in batches of 2000 symbols at a time for better performance
                symbols_list = list(daily_data.keys())
                batch_size = 2000
                num_batches = (len(symbols_list) + batch_size - 1) // batch_size
                price_data = {}
                
                logger.info(f"[UNIFIED] Fetching 5min data for {len(symbols_list)} symbols in {num_batches} batches...")
                
                for batch_idx, i in enumerate(range(0, len(symbols_list), batch_size), 1):
                    batch = symbols_list[i:i + batch_size]
                    batch_start = datetime.now()
                    
                    result = await session.execute(
                        text("""
                            SELECT DISTINCT ON (symbol)
                                symbol,
                                close as current_price
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '5min'
                              AND time <= :timestamp
                            ORDER BY symbol, time DESC
                        """),
                        {"symbols": batch, "timestamp": target_timestamp}
                    )
                    
                    for row in result:
                        price_data[row[0]] = float(row[1]) if row[1] else None
                    
                    batch_time = (datetime.now() - batch_start).total_seconds()
                    if batch_idx % 2 == 0 or batch_idx == num_batches:
                        logger.info(f"[UNIFIED] Batch {batch_idx}/{num_batches}: {len(price_data)} total symbols ({batch_time:.2f}s this batch)")
                
                price_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"[UNIFIED] Got {len(price_data)} symbols with 5min data ({price_time:.2f}s, {num_batches} batches)")
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
                
                price_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"[UNIFIED] Got {len(price_data)} symbols with live trades ({price_time:.2f}s)")
            
            # STEP 3: Fetch pre-calculated metrics
            start_time = datetime.now()
            symbols_list = list(daily_data.keys())
            
            result = await session.execute(
                text("""
                    SELECT 
                        symbol,
                        rv14, rv30, rv60,
                        high_90d, low_90d,
                        sma_20, sma_50, sma_200,
                        rsi_14,
                        macd_line, macd_signal, macd_histogram,
                        bb_upper, bb_middle, bb_lower, atr_14,
                        volume_ma_20, volume_trend
                    FROM screener_metrics
                    WHERE date = :prev_trading_day
                      AND symbol = ANY(:symbols)
                """),
                {"prev_trading_day": prev_trading_day, "symbols": symbols_list}
            )
            
            # Build metrics map
            metrics_map = {}
            for row in result:
                metrics_map[row[0]] = {
                    "rv14": float(row[1]) if row[1] else 0.0,
                    "rv30": float(row[2]) if row[2] else 0.0,
                    "rv60": float(row[3]) if row[3] else 0.0,
                    "high_90d": float(row[4]) if row[4] else None,
                    "low_90d": float(row[5]) if row[5] else None,
                    "sma_20": float(row[6]) if row[6] else None,
                    "sma_50": float(row[7]) if row[7] else None,
                    "sma_200": float(row[8]) if row[8] else None,
                    "rsi_14": float(row[9]) if row[9] else None,
                    "macd_line": float(row[10]) if row[10] else None,
                    "macd_signal": float(row[11]) if row[11] else None,
                    "macd_histogram": float(row[12]) if row[12] else None,
                    "bb_upper": float(row[13]) if row[13] else None,
                    "bb_middle": float(row[14]) if row[14] else None,
                    "bb_lower": float(row[15]) if row[15] else None,
                    "atr_14": float(row[16]) if row[16] else None,
                    "volume_ma_20": float(row[17]) if row[17] else None,
                    "volume_trend": row[18]
                }
            
            metrics_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"[UNIFIED] Got metrics for {len(metrics_map)} symbols ({metrics_time:.2f}s)")
            
            # STEP 4: Combine into snapshot format and apply filters (in-memory, very fast)
            logger.info(f"[UNIFIED] Combining {len(daily_data)} symbols with metrics, applying RV filter={min_relative_volume}")
            snapshots = []
            filtered_by_rv = 0
            
            for symbol, daily in daily_data.items():
                # Skip if no daily close
                if not daily.get("close"):
                    continue
                
                # Get metrics for this symbol
                metrics = metrics_map.get(symbol, {})
                
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
            
            if min_relative_volume is not None:
                logger.info(f"[UNIFIED] RV filter (>={min_relative_volume}): filtered out {filtered_by_rv} symbols")
            
            logger.info(f"[UNIFIED] Returning {len(snapshots)} complete snapshots")
            return snapshots
            
    except Exception as e:
        logger.error(f"[UNIFIED] Error fetching data: {e}", exc_info=True)
        return []

