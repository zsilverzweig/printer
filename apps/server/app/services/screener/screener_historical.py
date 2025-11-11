"""Historical screener computation logic."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.screener.screener_compute import ScreenerCompute
from app.services.screener.screener_filters import (
    is_allowed_exchange,
    is_likely_etf,
    passes_price_filter,
    passes_volume_filter,
)
from app.services.screener.screener_snapshot import extract_snapshot_data


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
            def _to_float(value: Any) -> Optional[float]:
                try:
                    if value is None:
                        return None
                    return float(value)
                except (TypeError, ValueError):
                    return None

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

            total_snapshots = len(snapshots)
            filter_breakdown: List[Dict[str, Any]] = []
            debug_counts: Dict[str, Any] = {"total_snapshots": total_snapshots}
            previous_count: Optional[int] = None

            def add_step(label: str, count: int) -> None:
                nonlocal previous_count
                count = max(int(count or 0), 0)
                removed = None
                if previous_count is not None:
                    removed = max(previous_count - count, 0)
                filter_breakdown.append(
                    {
                        "label": label,
                        "count": count,
                        "removed": removed if removed is not None else 0,
                    }
                )
                previous_count = count

            add_step("Total symbols fetched", total_snapshots)

            if not snapshots:
                self.logger.warning("[HISTORICAL SCREENER] No snapshots returned")
                self.last_filter_breakdown = filter_breakdown
                self.last_debug_stats = {
                    **debug_counts,
                    "filter_breakdown": filter_breakdown,
                }
                return []

            filtered_by_exchange = 0
            exchange_eligible: List[Dict[str, Any]] = []
            for snapshot in snapshots:
                data = extract_snapshot_data(snapshot)
                ticker = data["ticker"]
                exchange = data["exchange"]
                current_price = _to_float(data["price"])
                if not ticker or current_price is None:
                    continue
                if not is_allowed_exchange(exchange):
                    filtered_by_exchange += 1
                    continue
                day_data = snapshot.get("day", {}) or {}
                exchange_eligible.append(
                    {
                        "ticker": ticker,
                        "current_price": current_price,
                        "snapshot": snapshot,
                        "day": day_data,
                    }
                )

            debug_counts["filtered_by_exchange"] = filtered_by_exchange
            add_step("After exchange eligibility", len(exchange_eligible))

            missing_prior_day = 0
            prior_day_ready: List[Dict[str, Any]] = []
            for entry in exchange_eligible:
                day = entry["day"]
                prior_open = _to_float(day.get("o"))
                prior_high = _to_float(day.get("h"))
                prior_low = _to_float(day.get("l"))
                prior_close = _to_float(day.get("c"))
                prior_volume = _to_float(day.get("v"))
                if (
                    prior_open is None
                    or prior_high is None
                    or prior_low is None
                    or prior_close is None
                    or prior_volume is None
                ):
                    missing_prior_day += 1
                    continue
                entry.update(
                    {
                        "prior_open": prior_open,
                        "prior_high": prior_high,
                        "prior_low": prior_low,
                        "prior_close": prior_close,
                        "prior_volume": prior_volume,
                    }
                )
                prior_day_ready.append(entry)

            debug_counts["missing_prior_day"] = missing_prior_day
            add_step("After prior-day data", len(prior_day_ready))

            if (
                market_cap_min is not None
                or market_cap_max is not None
                or float_min is not None
                or float_max is not None
            ):
                from app.services.screener.ticker_filter import (
                    FilterCriteria,
                    get_filtered_tickers,
                )

                self.logger.info(
                    "[HISTORICAL SCREENER] Applying database filters: market_cap=(%s, %s), float=(%s, %s)",
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
                allowed_ticker_set = set(allowed_tickers)
                filtered_prior_day_ready = [
                    entry
                    for entry in prior_day_ready
                    if entry["ticker"] in allowed_ticker_set
                ]
                debug_counts["database_filtered_removed"] = (
                    len(prior_day_ready) - len(filtered_prior_day_ready)
                )
                prior_day_ready = filtered_prior_day_ready
            else:
                debug_counts["database_filtered_removed"] = 0

            add_step("After fundamentals (market cap / float)", len(prior_day_ready))

            working_entries = prior_day_ready
            price_filtered_count = 0
            if min_price is not None or max_price is not None:
                filter_min = min_price if min_price is not None else 0.0
                filter_max = max_price if max_price is not None else float("inf")
                next_entries = []
                for entry in working_entries:
                    if passes_price_filter(
                        entry["current_price"],
                        entry["prior_close"],
                        filter_min,
                        filter_max,
                    ):
                        next_entries.append(entry)
                    else:
                        price_filtered_count += 1
                working_entries = next_entries
            add_step("After price range filter", len(working_entries))

            volume_filtered_count = 0
            if min_volume is not None:
                next_entries = []
                for entry in working_entries:
                    if passes_volume_filter(entry["prior_volume"], min_volume):
                        next_entries.append(entry)
                    else:
                        volume_filtered_count += 1
                working_entries = next_entries
            add_step("After volume filter", len(working_entries))

            rv_filtered_count = 0
            rv_max_filtered_count = 0
            rv_lw_filtered_count = 0
            if min_relative_volume is not None or max_relative_volume is not None:
                next_entries = []
                for entry in working_entries:
                    rv_value = _to_float(entry["snapshot"].get("rv14")) or 0.0
                    if min_relative_volume is not None and rv_value < min_relative_volume:
                        rv_filtered_count += 1
                        continue
                    if max_relative_volume is not None and rv_value > max_relative_volume:
                        rv_max_filtered_count += 1
                        continue
                    next_entries.append(entry)
                working_entries = next_entries
            add_step("After relative volume filter", len(working_entries))

            if min_relative_volume_last_week is not None:
                next_entries = []
                for entry in working_entries:
                    rv_lw_value = _to_float(entry["snapshot"].get("rv_lw")) or 0.0
                    if rv_lw_value >= min_relative_volume_last_week:
                        next_entries.append(entry)
                    else:
                        rv_lw_filtered_count += 1
                working_entries = next_entries
            add_step("After RV last week filter", len(working_entries))

            asset_type_filtered_count = 0
            asset_types_upper = {t.upper() for t in asset_types} if asset_types else set()
            next_entries = []
            for entry in working_entries:
                ticker = entry["ticker"]
                snapshot = entry["snapshot"]
                snapshot_type = (snapshot.get("type") or "").upper()

                if snapshot_type:
                    normalized_type = "ETF" if snapshot_type in ETF_TYPE_CODES else snapshot_type
                else:
                    normalized_type = "ETF" if is_likely_etf(ticker) else "CS"

                if asset_types_upper and normalized_type not in asset_types_upper:
                    asset_type_filtered_count += 1
                    continue

                next_entries.append(entry)
            working_entries = next_entries
            add_step("After asset type / ETF filter", len(working_entries))

            change_min_filtered_count = 0
            change_max_filtered_count = 0
            if min_change_percent is not None or max_change_percent is not None:
                next_entries = []
                for entry in working_entries:
                    current_price = entry["current_price"]
                    prior_close = entry["prior_close"]
                    change_close_pct = (
                        ((current_price - prior_close) / prior_close) * 100
                        if prior_close > 0
                        else 0.0
                    )
                    entry["change_close_pct"] = change_close_pct
                    entry["change_close"] = change_close_pct
                    if min_change_percent is not None and change_close_pct < min_change_percent:
                        change_min_filtered_count += 1
                        continue
                    if max_change_percent is not None and change_close_pct > max_change_percent:
                        change_max_filtered_count += 1
                        continue
                    next_entries.append(entry)
                working_entries = next_entries
            else:
                for entry in working_entries:
                    prior_close = entry["prior_close"]
                    current_price = entry["current_price"]
                    entry["change_close_pct"] = (
                        ((current_price - prior_close) / prior_close) * 100
                        if prior_close > 0
                        else 0.0
                    )
                    entry["change_close"] = entry["change_close_pct"]
            add_step("After change% filters", len(working_entries))

            rows: List[dict] = []
            for entry in working_entries:
                snapshot = entry["snapshot"]
                rows.append(
                    {
                        "ticker": entry["ticker"],
                        "price": entry["current_price"],
                        "last_trade_price": entry["current_price"],
                        "prev_open": entry["prior_open"],
                        "prev_high": entry["prior_high"],
                        "prev_low": entry["prior_low"],
                        "prev_close": entry["prior_close"],
                        "prev_volume": entry["prior_volume"],
                        "today_vol": _to_float(snapshot.get("today_vol")) or 0.0,
                        "rv14": _to_float(snapshot.get("rv14")) or 0.0,
                        "rv_lw": _to_float(snapshot.get("rv_lw")) or 0.0,
                        "change_close": entry["change_close"],
                        "change_close_pct": entry["change_close_pct"],
                        "type": snapshot.get("type"),
                        "primary_exchange": snapshot.get("primary_exchange") or snapshot.get("exchange"),
                        "sic_description": snapshot.get("sic_description"),
                        "market_cap": snapshot.get("market_cap"),
                        "public_float": snapshot.get("public_float"),
                    }
                )

            processed_count = len(rows)
            filtered_count = (
                price_filtered_count
                + volume_filtered_count
                + rv_filtered_count
                + rv_max_filtered_count
                + rv_lw_filtered_count
                + asset_type_filtered_count
                + change_min_filtered_count
                + change_max_filtered_count
            )

            sort_key = {
                "rv14": lambda x: x.get("rv14") or 0.0,
                "rv_lw": lambda x: x.get("rv_lw") or 0.0,
                "today_vol": lambda x: x.get("today_vol") or 0.0,
                "avg_volume": lambda x: x.get("prev_volume") or 0.0,
                "change_close": lambda x: x.get("change_close", 0.0),
            }.get(order_by, lambda x: x.get("rv14") or 0.0)
            rows.sort(key=sort_key, reverse=True)

            limited_rows = rows[:limit] if limit is not None else rows
            limit_removed = max(len(rows) - len(limited_rows), 0)
            add_step("Final results (limit applied)", len(limited_rows))

            debug_counts.update(
                {
                    "processed_count": processed_count,
                    "price_filtered": price_filtered_count,
                    "volume_filtered": volume_filtered_count,
                    "rv_filtered": rv_filtered_count,
                    "rv_max_filtered": rv_max_filtered_count,
                    "rv_lw_filtered": rv_lw_filtered_count,
                    "asset_type_filtered": asset_type_filtered_count,
                    "change_min_filtered": change_min_filtered_count,
                    "change_max_filtered": change_max_filtered_count,
                    "limit_removed": limit_removed,
                }
            )

            final_count = len(limited_rows)
            total_time = time.time() - start_time
            self.logger.info(
                "[HISTORICAL SCREENER] ✓ Complete! Returning %s results in %.2fs "
                "(processed=%s, filtered=%s, limit_removed=%s)",
                final_count,
                total_time,
                processed_count,
                filtered_count,
                limit_removed,
            )

            self.last_filter_breakdown = filter_breakdown
            self.last_debug_stats = {
                **debug_counts,
                "filter_breakdown": filter_breakdown,
            }

            return limited_rows

        except Exception as e:
            self.logger.error(
                "[HISTORICAL SCREENER] Error computing historical screener: %s",
                e,
                exc_info=True,
            )
            return []
    
