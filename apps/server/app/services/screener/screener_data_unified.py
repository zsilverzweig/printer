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
    target_timestamp: Optional[datetime] = None
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
                    WHERE time::date = :target_date
                      AND timescale = '1day'
                    ORDER BY symbol
                """),
                {"target_date": prev_trading_day}
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
            
            # STEP 2: Get current price data (mode-specific, also ONE query)
            start_time = datetime.now()
            if mode == "historical":
                # Historical: Get 5min bars at timestamp
                result = await session.execute(
                    text("""
                        SELECT DISTINCT ON (symbol)
                            symbol,
                            close as current_price
                        FROM market_data
                        WHERE time <= :timestamp
                          AND timescale = '5min'
                        ORDER BY symbol, time DESC
                    """),
                    {"timestamp": target_timestamp}
                )
                
                price_data = {}
                for row in result:
                    price_data[row[0]] = float(row[1]) if row[1] else None
                
                price_time = (datetime.now() - start_time).total_seconds()
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
                
                price_time = (datetime.now() - start_time).total_seconds()
                logger.info(f"[UNIFIED] Got {len(price_data)} symbols with live trades ({price_time:.2f}s)")
            
            # STEP 3: Combine into snapshot format (in-memory processing, very fast)
            snapshots = []
            for symbol, daily in daily_data.items():
                # Skip if no daily close
                if not daily.get("close"):
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
                snapshots.append(snapshot)
            
            logger.info(f"[UNIFIED] Returning {len(snapshots)} complete snapshots")
            return snapshots
            
    except Exception as e:
        logger.error(f"[UNIFIED] Error fetching data: {e}", exc_info=True)
        return []

