"""Historical screener computation logic."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.screener.screener_compute import ScreenerCompute


class ScreenerHistorical:
    """Handles historical screener computation using TimescaleDB."""
    
    def __init__(self, compute: ScreenerCompute):
        self.logger = logging.getLogger("app.screener.historical")
        self.compute = compute
        self.last_filter_breakdown: List[Dict[str, Any]] = []
        self.last_debug_stats: Dict[str, Any] = {}

    def get_last_filter_breakdown(self) -> List[Dict[str, Any]]:
        """Return the most recent filter breakdown for historical computations."""
        return [dict(step) for step in self.last_filter_breakdown]

    def get_last_debug_stats(self) -> Dict[str, Any]:
        """Return the most recent debug stats for historical screener runs."""
        return dict(self.last_debug_stats)
    
    async def compute_historical(
        self,
        timestamp: datetime,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        max_relative_volume: Optional[float] = None,
        min_relative_volume_last_week: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        float_min: Optional[int] = None,
        float_max: Optional[int] = None,
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
            max_relative_volume: Maximum relative volume (RV14) filter
            min_relative_volume_last_week: Minimum relative volume vs last week filter
            order_by: Field to sort by (rv14, avg_volume, change_close)
            limit: Maximum number of results to return
            technical_filters: Optional dict of technical analysis filters
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
            from app.services.screener.screener_data_unified import fetch_screener_data_unified

            step_start = time.time()
            self.logger.info("[HISTORICAL SCREENER] Fetching data using unified fetcher…")
            snapshots = await fetch_screener_data_unified(
                target_timestamp=timestamp,
                market_cap_min=market_cap_min,
                market_cap_max=market_cap_max,
                float_min=float_min,
                float_max=float_max,
                asset_types=asset_types,
                min_relative_volume=min_relative_volume,
                max_relative_volume=max_relative_volume,
                min_relative_volume_last_week=min_relative_volume_last_week,
            )
            step_time = time.time() - step_start
            self.logger.info(
                "[HISTORICAL SCREENER] ✓ Got %s snapshots (%.2fs)",
                len(snapshots),
                step_time,
            )

            if not snapshots:
                self.logger.warning("[HISTORICAL SCREENER] No snapshots returned")
                self.last_filter_breakdown = [
                    {"label": "Total symbols fetched", "count": 0, "removed": 0}
                ]
                self.last_debug_stats = {
                    "total_snapshots": 0,
                    "filter_breakdown": self.last_filter_breakdown,
                }
                return []

            async def _attach_historical_bars(rows: List[dict]) -> None:
                for row in rows:
                    ticker = row.get("ticker")
                    if not ticker:
                        continue
                    row["_historical_bars"] = await self._get_bars_for_technical_analysis(
                        ticker, timestamp
                    )

            results = await self.compute.compute(
                snapshots,
                min_price=min_price,
                max_price=max_price,
                min_volume=min_volume,
                min_change_percent=min_change_percent,
                max_change_percent=max_change_percent,
                min_relative_volume=min_relative_volume,
                max_relative_volume=max_relative_volume,
                min_relative_volume_last_week=min_relative_volume_last_week,
                order_by=order_by,
                limit=limit,
                technical_filters=technical_filters,
                asset_types=asset_types,
                market_cap_min=market_cap_min,
                market_cap_max=market_cap_max,
                float_min=float_min,
                float_max=float_max,
                is_historical=True,
                technical_data_provider=_attach_historical_bars if technical_filters else None,
            )

            total_time = time.time() - start_time
            self.last_filter_breakdown = self.compute.get_last_filter_breakdown()
            self.last_debug_stats = self.compute.get_last_debug_stats()
            self.logger.info(
                "[HISTORICAL SCREENER] ✓ Complete! Returning %s results in %.2fs",
                len(results),
                total_time,
            )

            return results

        except Exception as e:
            self.logger.error(
                "[HISTORICAL SCREENER] Error computing historical screener: %s",
                e,
                exc_info=True,
            )
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
    
