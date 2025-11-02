"""Core computation logic for screener filtering and sorting."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.services.screener.screener_data import ScreenerDataLoader
from app.services.screener.screener_filters import (
    is_allowed_exchange,
    is_likely_etf,
    passes_price_filter,
    passes_volume_filter,
)
from app.services.screener.screener_snapshot import extract_snapshot_data


class ScreenerCompute:
    """Handles screener computation: filtering, sorting, and result generation."""
    
    def __init__(self, data_loader: ScreenerDataLoader):
        self.logger = logging.getLogger("app.screener.compute")
        self.data_loader = data_loader
    
    async def compute(
        self,
        snaps: List[Any],
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
    ) -> List[dict]:
        """Compute filtered and sorted screener results from market snapshots.
        
        Args:
            snaps: List of market snapshots
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            min_volume: Minimum volume for liquidity
            min_change_percent: Minimum % change from yesterday's close
            max_change_percent: Maximum % change from yesterday's close
            order_by: Field to sort by (rv14 or avg_volume)
            limit: Maximum number of results to return
            technical_filters: Optional dict of technical analysis filters
            exclude_etfs: Whether to exclude ETFs (default: True)
            asset_types: Optional list of asset types to include (e.g., ["CS", "ETF"])
        
        Returns:
            List of screener result dictionaries
        """
        # Build price and volume maps from snapshots, and snapshot OHLC lookup
        price_map: Dict[str, float] = {}
        volume_map: Dict[str, float] = {}
        snapshot_ohlc_map: Dict[str, Dict[str, float]] = {}  # ticker -> OHLC data
        filtered_by_exchange = 0
        
        # Debug: log structure of first snapshot
        if snaps and self.logger.isEnabledFor(logging.DEBUG):
            self.logger.debug(
                "First snapshot structure: %s", snaps[0] if len(snaps) > 0 else "empty"
            )
        
        for snapshot in snaps:
            data = extract_snapshot_data(snapshot)
            ticker = data["ticker"]
            price = data["price"]
            volume = data["volume"]
            exchange = data["exchange"]
            
            if not ticker:
                continue
            
            # Apply exchange filter
            if not is_allowed_exchange(exchange):
                filtered_by_exchange += 1
                continue
            
            # Store price and volume
            if price is not None:
                try:
                    price_map[ticker] = float(price)
                except Exception:
                    pass
            
            if volume is not None:
                try:
                    volume_map[ticker] = float(volume)
                except Exception:
                    pass
            
            # Extract OHLC from snapshot 'day' field if available
            if isinstance(snapshot, dict) and "day" in snapshot:
                day_data = snapshot["day"]
                if isinstance(day_data, dict):
                    snapshot_ohlc_map[ticker] = {
                        "o": float(day_data.get("o", 0.0)),
                        "h": float(day_data.get("h", 0.0)),
                        "l": float(day_data.get("l", 0.0)),
                        "c": float(day_data.get("c", 0.0)),
                        "v": float(day_data.get("v", 0.0)),
                    }
        
        # Process stocks - use snapshot data directly if last_day_ohlc is empty
        rows: List[dict] = []
        self.logger.debug(f"_compute: Processing stocks")
        self.logger.debug(f"_compute: Price map has {len(price_map)} entries")
        self.logger.debug(f"_compute: snapshot_ohlc_map has {len(snapshot_ohlc_map)} entries")
        self.logger.debug(f"_compute: last_day_ohlc has {len(self.data_loader.last_day_ohlc)} entries")
        
        processed_count = 0
        filtered_count = 0
        missing_price_count = 0
        
        # Build ticker set from either last_day_ohlc or price_map
        tickers_to_process = (
            set(self.data_loader.last_day_ohlc.keys()) 
            if self.data_loader.last_day_ohlc 
            else set(price_map.keys())
        )
        
        for ticker in tickers_to_process:
            # Get OHLC data - prefer last_day_ohlc, fallback to snapshot
            if ticker in self.data_loader.last_day_ohlc:
                ohlc = self.data_loader.last_day_ohlc[ticker]
                yesterday_close = ohlc.get("c", 0.0)
                yesterday_vol = ohlc.get("v", 0.0)
                yesterday_open = ohlc.get("o", 0.0)
                yesterday_high = ohlc.get("h", 0.0)
                yesterday_low = ohlc.get("l", 0.0)
            elif ticker in snapshot_ohlc_map:
                # Use OHLC from snapshot
                ohlc = snapshot_ohlc_map[ticker]
                yesterday_close = ohlc.get("c", 0.0)
                yesterday_vol = ohlc.get("v", 0.0)
                yesterday_open = ohlc.get("o", 0.0)
                yesterday_high = ohlc.get("h", 0.0)
                yesterday_low = ohlc.get("l", 0.0)
            else:
                # Fallback: use current price as close if no day data
                current_price = price_map.get(ticker)
                if current_price is None:
                    missing_price_count += 1
                    continue
                yesterday_close = current_price
                yesterday_vol = volume_map.get(ticker, 0.0)
                yesterday_open = current_price
                yesterday_high = current_price
                yesterday_low = current_price
            
            # Get current price from snapshot
            current_price = price_map.get(ticker)
            if current_price is None:
                missing_price_count += 1
                continue
            
            processed_count += 1
            
            # Apply optional filters
            if min_price is not None or max_price is not None:
                filter_min = min_price if min_price is not None else 0.0
                filter_max = max_price if max_price is not None else float('inf')
                if not passes_price_filter(current_price, yesterday_close, filter_min, filter_max):
                    filtered_count += 1
                    continue
            
            if min_volume is not None:
                if not passes_volume_filter(yesterday_vol, min_volume):
                    filtered_count += 1
                    continue
            
            # Apply asset type filtering if specified
            if asset_types and len(asset_types) > 0:
                # For now, use ETF detection as fallback if asset type not available
                # TODO: Query TickerDetails for actual asset type when available
                ticker_type = None
                # Try to infer from ticker patterns if not in database
                if is_likely_etf(ticker):
                    ticker_type = "ETF"
                else:
                    # Assume common stock if not ETF-like
                    ticker_type = "CS"
                
                if ticker_type not in asset_types:
                    filtered_count += 1
                    continue
            elif exclude_etfs:
                # Fallback to ETF exclusion if no asset_types specified
                if is_likely_etf(ticker):
                    filtered_count += 1
                    continue
            
            # Calculate change percent before adding to rows
            change_close_pct = (
                ((current_price - yesterday_close) / yesterday_close) * 100
                if yesterday_close > 0
                else 0.0
            )
            
            # Filter by minimum change percent (only if specified)
            # Use signed value, not absolute - allows filtering positive/negative separately
            if min_change_percent is not None and change_close_pct < min_change_percent:
                filtered_count += 1
                continue
            
            # Filter by maximum change percent (if specified)
            # Use signed value, not absolute - allows filtering positive/negative separately
            if max_change_percent is not None and change_close_pct > max_change_percent:
                filtered_count += 1
                continue
            
            # Calculate relative volume (rv14) from TimescaleDB - non-blocking, use 0 if fails
            rv14 = 0.0
            try:
                from app.services.screener.screener_volume import TimescaleVolumeCalculator
                ts_calc = TimescaleVolumeCalculator(lookback_days=30)
                rv14 = await ts_calc.calculate_rv14(ticker)
            except (ValueError, Exception):
                # Data incomplete or error - just use 0, don't log or block
                pass
            
            # Calculate percentage changes for different timeframes
            changes = self.data_loader.price_tracker.calculate_all_changes(ticker)
            
            rows.append({
                "ticker": ticker,
                "open": yesterday_open,
                "high": yesterday_high,
                "low": yesterday_low,
                "close": yesterday_close,
                "price": current_price,
                "today_vol": yesterday_vol,
                "volume": yesterday_vol,
                "rv": rv14,
                "rv14": rv14,
                "change_1m": changes["change_1m"],
                "change_5m": changes["change_5m"],
                "change_1h": changes["change_1h"],
                "change_close": change_close_pct,
                "change_close_pct": change_close_pct,
            })
        
        # Apply technical filters if provided
        if technical_filters:
            rows = await self._apply_technical_filters(rows, technical_filters, is_historical=False)
        
        # Sort results
        sort_key = {
            "rv14": lambda x: x["rv14"],
            "avg_volume": lambda x: x["today_vol"],
            "change_close": lambda x: x.get("change_close", 0),
        }.get(order_by, lambda x: x["rv14"])
        rows.sort(key=sort_key, reverse=True)
        
        # Log filtering statistics
        self.logger.info(
            "Screener computed: processed=%s, missing_price=%s, filtered_by_exchange=%s, filtered_out=%s, final_rows=%s",
            processed_count,
            missing_price_count,
            filtered_by_exchange,
            filtered_count,
            len(rows),
        )
        
        return rows[:limit]
    
    async def _apply_technical_filters(
        self,
        rows: List[dict],
        technical_filters: Dict[str, Any],
        is_historical: bool = False
    ) -> List[dict]:
        """Apply technical analysis filters to screener results.
        
        Args:
            rows: List of screener result dicts
            technical_filters: Dict of technical filter criteria
            is_historical: Whether we're in historical mode (affects bar retrieval)
            
        Returns:
            Filtered list of rows
        """
        from app.lib.technical_analysis import (
            find_swing_points,
            find_equal_levels,
            find_support_resistance,
            is_price_near_level,
        )
        
        filtered_rows = []
        
        for row in rows:
            symbol = row["ticker"]
            current_price = row["price"]
            
            # Get bars for technical analysis
            if is_historical:
                bars = row.get("_historical_bars", [])
            else:
                # For live mode, would need to track recent bars
                # For now, skip technical filters in live mode
                bars = []
            
            passed = True
            
            # Near resistance filter
            if technical_filters.get("near_resistance") and bars:
                swing_points = find_swing_points(bars)
                resistance_levels = find_support_resistance(swing_points, is_support=False)
                if not any(is_price_near_level(current_price, level, tolerance_pct=2.0) 
                          for level in resistance_levels):
                    passed = False
            
            # Near support filter
            if technical_filters.get("near_support") and bars:
                swing_points = find_swing_points(bars)
                support_levels = find_support_resistance(swing_points, is_support=True)
                if not any(is_price_near_level(current_price, level, tolerance_pct=2.0) 
                          for level in support_levels):
                    passed = False
            
            # Equal highs filter
            if technical_filters.get("has_equal_highs") and bars:
                swing_points = find_swing_points(bars)
                equal_levels = find_equal_levels(swing_points, is_support=False, tolerance_pct=1.0)
                if not equal_levels:
                    passed = False
            
            # Equal lows filter
            if technical_filters.get("has_equal_lows") and bars:
                swing_points = find_swing_points(bars)
                equal_levels = find_equal_levels(swing_points, is_support=True, tolerance_pct=1.0)
                if not equal_levels:
                    passed = False
            
            # Above 90-day high filter
            if technical_filters.get("above_90day_high"):
                if row.get("ninety_day_high") and current_price <= row["ninety_day_high"]:
                    passed = False
            
            # Below 90-day low filter
            if technical_filters.get("below_90day_low"):
                if row.get("ninety_day_low") and current_price >= row["ninety_day_low"]:
                    passed = False
            
            # Relative volume filter
            if technical_filters.get("relative_volume_min"):
                min_rv = technical_filters["relative_volume_min"]
                if row.get("rv14", 0) < min_rv:
                    passed = False
            
            if passed:
                filtered_rows.append(row)
        
        return filtered_rows

