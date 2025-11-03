"""Historical screener computation logic."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.screener.screener_compute import ScreenerCompute
from app.services.screener.screener_filters import (
    is_likely_etf,
    passes_price_filter,
    passes_volume_filter,
)


class ScreenerHistorical:
    """Handles historical screener computation using TimescaleDB."""
    
    def __init__(self, compute: ScreenerCompute):
        self.logger = logging.getLogger("app.screener.historical")
        self.compute = compute
    
    async def compute_historical(
        self,
        timestamp: datetime,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
    ) -> List[dict]:
        """Compute screener results at a specific historical timestamp.
        
        Args:
            timestamp: Historical datetime to screen at
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            min_volume: Minimum volume for liquidity
            min_change_percent: Minimum % change from yesterday's close
            max_change_percent: Maximum % change from yesterday's close
            min_relative_volume: Minimum relative volume (RV14) filter
            order_by: Field to sort by (rv14, avg_volume, change_close)
            limit: Maximum number of results to return
            technical_filters: Optional dict of technical analysis filters
            exclude_etfs: Whether to exclude ETFs (default: True)
            asset_types: Optional list of asset types to include
            market_cap_min: Minimum market cap filter (in dollars)
            market_cap_max: Maximum market cap filter (in dollars)
            
        Returns:
            List of screener result dictionaries
        """
        import time
        start_time = time.time()
        self.logger.info(f"[HISTORICAL SCREENER] Starting compute_historical at {timestamp}")
        
        try:
            # Use unified data fetcher (same pattern as live screener)
            step_start = time.time()
            self.logger.info(f"[HISTORICAL SCREENER] Fetching data using unified fetcher...")
            
            from app.services.screener.screener_data_unified import fetch_screener_data_unified
            snapshots = await fetch_screener_data_unified(
                target_timestamp=timestamp,
                market_cap_min=market_cap_min,
                market_cap_max=market_cap_max,
                asset_types=asset_types,
                min_relative_volume=min_relative_volume
            )
            
            step_time = time.time() - step_start
            self.logger.info(f"[HISTORICAL SCREENER] ✓ Got {len(snapshots)} snapshots ({step_time:.2f}s)")
            
            if not snapshots:
                self.logger.warning("[HISTORICAL SCREENER] No snapshots returned from unified fetcher")
                return []
            
            # Fetch accumulated intraday volume for all symbols
            step_start = time.time()
            symbols_list = [s["ticker"] for s in snapshots]
            intraday_volume = await self._get_accumulated_intraday_volume(symbols_list, timestamp)
            step_time = time.time() - step_start
            self.logger.info(f"[HISTORICAL SCREENER] ✓ Got intraday volume for {len(intraday_volume)} symbols ({step_time:.2f}s)")
            
            rows: List[dict] = []
            processed_count = 0
            filtered_count = 0
            
            # NOTE: Market cap filtering is now handled in the unified data fetcher for efficiency
            
            # Process all symbols (now using unified snapshot format - same as live screener!)
            step_start = time.time()
            self.logger.info(f"[HISTORICAL SCREENER] Processing {len(snapshots)} symbols with filters...")
            
            # Process each snapshot
            for snapshot in snapshots:
                symbol = snapshot["ticker"]
                current_price = snapshot["price"]
                day = snapshot["day"]
                
                # Skip if no daily close
                if not day.get("c"):
                    continue
                
                processed_count += 1
                
                yesterday_close = day["c"]
                # Use accumulated intraday volume (from market open to timestamp)
                # This is the actual volume "as of" the timestamp, not the full day's volume
                current_volume = intraday_volume.get(symbol, day["v"])  # Fallback to daily if not available
                
                # Apply optional basic filters
                if min_price is not None or max_price is not None:
                    filter_min = min_price if min_price is not None else 0.0
                    filter_max = max_price if max_price is not None else float('inf')
                    if not passes_price_filter(current_price, yesterday_close, filter_min, filter_max):
                        filtered_count += 1
                        continue
                
                if min_volume is not None:
                    # Volume filter uses current accumulated volume, not yesterday's full daily volume
                    if not passes_volume_filter(current_volume, min_volume):
                        filtered_count += 1
                        continue
                
                # Apply asset type filtering if specified
                if asset_types and len(asset_types) > 0:
                    # For now, use ETF detection as fallback if asset type not available
                    # TODO: Query TickerDetails for actual asset type when available
                    ticker_type = None
                    if is_likely_etf(symbol):
                        ticker_type = "ETF"
                    else:
                        ticker_type = "CS"
                    
                    if ticker_type not in asset_types:
                        filtered_count += 1
                        continue
                elif exclude_etfs:
                    # Fallback to ETF exclusion if no asset_types specified
                    if is_likely_etf(symbol):
                        filtered_count += 1
                        continue
                
                # Calculate change percent
                change_close_pct = (
                    ((current_price - yesterday_close) / yesterday_close) * 100
                    if yesterday_close > 0
                    else 0.0
                )
                
                # Use signed value, not absolute - allows filtering positive/negative separately
                if min_change_percent is not None and change_close_pct < min_change_percent:
                    filtered_count += 1
                    continue
                
                # Use signed value, not absolute - allows filtering positive/negative separately
                if max_change_percent is not None and change_close_pct > max_change_percent:
                    filtered_count += 1
                    continue

                # NOTE: RV14 filtering now handled in unified data fetcher for efficiency
                # Snapshots already filtered by min_relative_volume if specified

                # Get RV14 from snapshot (already calculated by unified fetcher)
                rv14 = snapshot.get("rv14", 0.0)

                # Build result row (matches live screener format)
                row = {
                    "ticker": symbol,
                    "open": day["o"],
                    "high": day["h"],
                    "low": day["l"],
                    "close": yesterday_close,
                    "price": current_price,
                    "today_vol": current_volume,  # Accumulated intraday volume up to timestamp
                    "rv": rv14,
                    "rv14": rv14,
                    "change_close": change_close_pct,
                    # TODO: Add 90-day high/low if needed for technical filters
                    "ninety_day_high": None,
                    "ninety_day_low": None,
                }
                
                rows.append(row)
            
            step_time = time.time() - step_start
            self.logger.info(f"[HISTORICAL SCREENER] ✓ Processed all symbols: {processed_count} passed basic filters, {filtered_count} filtered out ({step_time:.2f}s)")
            
            # Apply technical filters if provided
            if technical_filters:
                step_start = time.time()
                self.logger.info(f"[HISTORICAL SCREENER] Step 5/5: Applying technical filters to {len(rows)} symbols...")
                # Fetch historical bars ONLY for symbols that passed basic filters
                # This avoids N+1 queries for symbols we'll filter out anyway
                bars_start = time.time()
                self.logger.info(f"[HISTORICAL SCREENER] Fetching historical bars for {len(rows)} symbols...")
                for row in rows:
                    symbol = row["ticker"]
                    historical_bars = await self._get_bars_for_technical_analysis(symbol, timestamp)
                    row["_historical_bars"] = historical_bars
                
                bars_time = time.time() - bars_start
                self.logger.info(f"[HISTORICAL SCREENER] ✓ Got historical bars ({bars_time:.2f}s), applying filters...")
                filter_start = time.time()
                rows = await self.compute._apply_technical_filters(rows, technical_filters, is_historical=True)
                filter_time = time.time() - filter_start
                step_time = time.time() - step_start
                self.logger.info(f"[HISTORICAL SCREENER] ✓ {len(rows)} symbols passed technical filters (filter: {filter_time:.2f}s, total: {step_time:.2f}s)")
                
                # Remove internal _historical_bars field after filtering
                for row in rows:
                    row.pop("_historical_bars", None)
            
            # Sort results
            self.logger.info(f"[HISTORICAL SCREENER] Sorting by {order_by}...")
            sort_key = {
                "rv14": lambda x: x["rv14"],
                "avg_volume": lambda x: x["today_vol"],
                "change_close": lambda x: x.get("change_close", 0),
            }.get(order_by, lambda x: x["rv14"])
            rows.sort(key=sort_key, reverse=True)
            
            final_count = min(len(rows), limit)
            total_time = time.time() - start_time
            self.logger.info(
                f"[HISTORICAL SCREENER] ✓ Complete! Returning {final_count} results in {total_time:.2f}s "
                f"(processed={processed_count}, filtered={filtered_count})"
            )
            
            return rows[:limit]
            
        except Exception as e:
            self.logger.error(f"[HISTORICAL SCREENER] Error computing historical screener: {e}", exc_info=True)
            return []
    
    async def _get_bars_for_technical_analysis(
        self,
        symbol: str,
        timestamp: datetime,
        lookback_bars: int = 30
    ) -> List[Dict[str, Any]]:
        """Get historical bars for technical analysis."""
        from app.lib.market_queries import get_historical_bars
        return await get_historical_bars(symbol, "5m", timestamp, lookback_bars)
    
    async def _get_accumulated_intraday_volume(
        self,
        symbols: List[str],
        timestamp: datetime
    ) -> Dict[str, int]:
        """
        Get accumulated intraday volume from 5min bars.
        
        Sums volume from market open (9:30 AM ET) to the target timestamp.
        This gives accurate volume as if we were screening at that exact moment.
        
        Args:
            symbols: List of symbols to fetch volume for
            timestamp: Target datetime
            
        Returns:
            Dict mapping symbol to accumulated volume
        """
        from sqlalchemy import text
        from app.services.core.database import get_async_session
        
        # Get market open time for the timestamp date (9:30 AM ET = 13:30 UTC)
        timestamp_date = timestamp.date()
        market_open = datetime.combine(timestamp_date, datetime.min.time(), tzinfo=timestamp.tzinfo or timezone.utc).replace(hour=13, minute=30)
        
        self.logger.info(f"[HISTORICAL VOLUME] Fetching accumulated volume for {len(symbols)} symbols from {market_open} to {timestamp}")
        
        try:
            async with get_async_session() as session:
                # Query in batches for performance
                batch_size = 2000
                volume_data = {}
                
                for i in range(0, len(symbols), batch_size):
                    batch = symbols[i:i + batch_size]
                    
                    result = await session.execute(
                        text("""
                            SELECT 
                                symbol,
                                SUM(volume) as accumulated_volume
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '5min'
                              AND time >= :market_open
                              AND time <= :timestamp
                            GROUP BY symbol
                        """),
                        {"symbols": batch, "market_open": market_open, "timestamp": timestamp}
                    )
                    
                    for row in result:
                        volume_data[row[0]] = int(row[1]) if row[1] else 0
                
                self.logger.info(f"[HISTORICAL VOLUME] Got accumulated volume for {len(volume_data)} symbols")
                return volume_data
                
        except Exception as e:
            self.logger.error(f"[HISTORICAL VOLUME] Error fetching accumulated volume: {e}", exc_info=True)
            return {}

