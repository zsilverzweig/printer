"""Historical screener computation logic."""
from __future__ import annotations

import logging
from datetime import datetime
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
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
    ) -> List[dict]:
        """Compute screener results at a specific historical timestamp.
        
        Args:
            timestamp: Historical datetime to screen at
            min_price: Minimum price filter (for yesterday's close)
            max_price: Maximum price filter (for yesterday's close)
            min_volume: Minimum volume for liquidity
            min_change_percent: Minimum % change from yesterday's close
            max_change_percent: Maximum % change from yesterday's close
            order_by: Field to sort by (rv14, avg_volume, change_close)
            limit: Maximum number of results to return
            technical_filters: Optional dict of technical analysis filters
            exclude_etfs: Whether to exclude ETFs (default: True)
            asset_types: Optional list of asset types to include
            
        Returns:
            List of screener result dictionaries
        """
        self.logger.info(f"[HISTORICAL SCREENER] Starting compute_historical at {timestamp}")
        
        from app.lib.market_queries import get_snapshot_at_time, get_daily_context
        from app.models.assets import TickerDetails
        from app.services.core.database import get_async_session
        from sqlalchemy import select
        
        try:
            # Get active symbols
            self.logger.info("[HISTORICAL SCREENER] Fetching active symbols")
            async with get_async_session() as session:
                result = await session.execute(
                    select(TickerDetails.symbol).where(
                        TickerDetails.type.in_(["CS", "ETF"]),
                        TickerDetails.active == True
                    )
                )
                all_symbols = [row[0] for row in result.all()]
            
            self.logger.info(f"[HISTORICAL SCREENER] Found {len(all_symbols)} active symbols")
            
            # Get snapshot at timestamp
            self.logger.info(f"[HISTORICAL SCREENER] Getting snapshot at {timestamp}")
            snapshot = await get_snapshot_at_time(timestamp, all_symbols)
            
            self.logger.info(f"[HISTORICAL SCREENER] Got snapshot with {len(snapshot)} symbols")
            
            if not snapshot:
                self.logger.warning(f"[HISTORICAL SCREENER] No snapshot data found at {timestamp}")
                self.logger.warning(
                    "[HISTORICAL SCREENER] Historical mode requires data in TimescaleDB. "
                    "Load data using: POST /api/market/historical/start-load?days=1"
                )
                return []
            
            rows: List[dict] = []
            processed_count = 0
            filtered_count = 0
            missing_context_count = 0
            
            # Process each symbol
            for symbol, bar_data in snapshot.items():
                current_price = bar_data["close"]
                
                # Get daily context (yesterday's OHLC, 90-day high/low)
                context = await get_daily_context(symbol, timestamp)
                
                if not context.get("has_data"):
                    missing_context_count += 1
                    continue
                
                processed_count += 1
                
                yesterday = context["yesterday"]
                yesterday_close = yesterday["close"]
                yesterday_vol = yesterday["volume"]
                
                # Apply optional basic filters
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
                
                # Calculate relative volume (rv14) at historical time
                rv14 = 0.0
                try:
                    from app.services.screener.screener_volume import TimescaleVolumeCalculator
                    ts_calc = TimescaleVolumeCalculator(lookback_days=30)
                    # Note: calculate_rv14 uses today's date - would need historical version
                    # For now, skip rv14 in historical mode
                    rv14 = 0.0
                except Exception as e:
                    self.logger.debug(f"Error calculating rv14 for {symbol}: {e}")
                
                # Get historical bars for technical analysis
                historical_bars = await self._get_bars_for_technical_analysis(symbol, timestamp)
                
                # Build result row
                row = {
                    "ticker": symbol,
                    "open": yesterday["open"],
                    "high": yesterday["high"],
                    "low": yesterday["low"],
                    "close": yesterday_close,
                    "price": current_price,
                    "today_vol": yesterday_vol,
                    "rv": rv14,
                    "rv14": rv14,
                    "change_close": change_close_pct,
                    # Add context for technical analysis
                    "ninety_day_high": context.get("ninety_day_high"),
                    "ninety_day_low": context.get("ninety_day_low"),
                    # Get historical bars for technical analysis
                    "_historical_bars": historical_bars,
                }
                
                rows.append(row)
            
            # Apply technical filters if provided
            if technical_filters:
                rows = await self.compute._apply_technical_filters(rows, technical_filters, is_historical=True)
            
            # Sort results
            sort_key = {
                "rv14": lambda x: x["rv14"],
                "avg_volume": lambda x: x["today_vol"],
                "change_close": lambda x: x.get("change_close", 0),
            }.get(order_by, lambda x: x["rv14"])
            rows.sort(key=sort_key, reverse=True)
            
            # Remove internal _historical_bars field before returning
            for row in rows:
                row.pop("_historical_bars", None)
            
            self.logger.info(
                f"[HISTORICAL SCREENER] Completed: processed={processed_count}, "
                f"missing_context={missing_context_count}, filtered={filtered_count}, "
                f"final_rows={len(rows)}"
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

