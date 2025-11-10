"""Core computation logic for screener filtering and sorting."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select, text

from app.models.assets import TickerDetails
from app.services.core.database import get_async_session
from app.services.core.time_context import get_current_time
from app.services.screener.screener_data import ScreenerDataLoader
from app.services.screener.screener_filters import (
    is_allowed_exchange,
    is_likely_etf,
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
        min_change_percent: Optional[float] = None,  # Ignored in streamlined version
        max_change_percent: Optional[float] = None,  # Ignored in streamlined version
        min_relative_volume: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        float_min: Optional[int] = None,
        float_max: Optional[int] = None,
    ) -> List[dict]:
        """Compute filtered and sorted screener results from market snapshots."""

        if technical_filters:
            self.logger.debug(
                "Technical filters provided but ignored in streamlined screener: %s",
                technical_filters,
            )

        symbol_snapshots: Dict[str, Dict[str, Any]] = {}
        filtered_by_exchange = 0

        for snapshot in snaps:
            data = extract_snapshot_data(snapshot)
            ticker = data.get("ticker")
            if not ticker:
                continue

            exchange = data.get("exchange")
            if not is_allowed_exchange(exchange):
                filtered_by_exchange += 1
                continue

            price = self._safe_float(data.get("price"))
            if price is None:
                continue

            today_vol_value = data.get("today_vol")
            if today_vol_value is None:
                today_vol_value = data.get("volume")
            today_vol = self._safe_float(today_vol_value) or 0.0

            symbol_snapshots[ticker] = {
                "price": price,
                "today_vol": today_vol,
                "exchange": exchange,
            }

        if not symbol_snapshots:
            self.logger.info(
                "Screener: no symbols available after parsing snapshots (filtered_by_exchange=%s)",
                filtered_by_exchange,
            )
            return []

        tickers = list(symbol_snapshots.keys())
        as_of = get_current_time()
        sum_last_14, last_week_partial = await self._fetch_volume_metrics(tickers, as_of)
        ticker_details = await self._fetch_ticker_details(tickers)

        rows: List[dict] = []
        processed_count = 0
        filtered_count = 0

        for ticker in tickers:
            snapshot_data = symbol_snapshots[ticker]
            price = snapshot_data["price"]
            today_vol = snapshot_data["today_vol"]

            sum_14_volume = sum_last_14.get(ticker, 0.0)
            rv14 = (today_vol / sum_14_volume) if sum_14_volume else 0.0

            last_week_volume = last_week_partial.get(ticker, 0.0)
            rv_lw = (today_vol / last_week_volume) if last_week_volume else 0.0

            details = ticker_details.get(ticker, {})
            type_value = details.get("type")
            primary_exchange = details.get("primary_exchange") or snapshot_data.get("exchange")

            if not is_allowed_exchange(primary_exchange):
                filtered_count += 1
                continue

            if exclude_etfs and ((type_value and type_value.upper() == "ETF") or is_likely_etf(ticker)):
                filtered_count += 1
                continue

            if asset_types:
                if not type_value or type_value not in asset_types:
                    filtered_count += 1
                    continue

            if min_price is not None and price < min_price:
                filtered_count += 1
                continue
            if max_price is not None and price > max_price:
                filtered_count += 1
                continue

            if min_volume is not None and today_vol < min_volume:
                filtered_count += 1
                continue

            if min_relative_volume is not None and rv14 < min_relative_volume:
                filtered_count += 1
                continue

            market_cap = details.get("market_cap")
            if market_cap_min is not None:
                if market_cap is None or market_cap < market_cap_min:
                    filtered_count += 1
                    continue
            if market_cap_max is not None:
                if market_cap is None or market_cap > market_cap_max:
                    filtered_count += 1
                    continue

            public_float = details.get("public_float")
            if float_min is not None:
                if public_float is None or public_float < float_min:
                    filtered_count += 1
                    continue
            if float_max is not None:
                if public_float is None or public_float > float_max:
                    filtered_count += 1
                    continue

            rows.append(
                {
                    "ticker": ticker,
                    "price": price,
                    "today_vol": today_vol,
                    "rv14": rv14,
                    "rv_lw": rv_lw,
                    "type": type_value,
                    "primary_exchange": primary_exchange,
                    "sic_description": details.get("sic_description"),
                    "market_cap": market_cap,
                    "public_float": public_float,
                }
            )
            processed_count += 1

        sort_key = {
            "rv14": lambda x: x.get("rv14", 0.0),
            "rv_lw": lambda x: x.get("rv_lw", 0.0),
            "today_vol": lambda x: x.get("today_vol", 0.0),
            "price": lambda x: x.get("price", 0.0),
        }.get(order_by, lambda x: x.get("rv14", 0.0))

        rows.sort(key=sort_key, reverse=True)

        self.logger.info(
            "Screener: %s processed → %s results (filtered=%s, filtered_by_exchange=%s)",
            processed_count,
            len(rows),
            filtered_count,
            filtered_by_exchange,
        )

        if len(rows) > limit:
            rows = rows[:limit]

        return rows

    async def _fetch_volume_metrics(
        self, symbols: List[str], as_of: datetime
    ) -> Tuple[Dict[str, float], Dict[str, float]]:
        """Fetch supporting volume metrics used for RV calculations."""

        if not symbols:
            return {}, {}

        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        else:
            as_of = as_of.astimezone(timezone.utc)

        start_of_day = datetime.combine(as_of.date(), datetime.min.time(), tzinfo=timezone.utc)
        elapsed = as_of - start_of_day
        last_week_start = start_of_day - timedelta(days=7)
        last_week_end = last_week_start + elapsed

        async with get_async_session() as session:
            fourteen_stmt = text(
                """
                WITH ranked AS (
                    SELECT
                        symbol,
                        volume,
                        ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) AS rn
                    FROM market_data
                    WHERE timescale = '1day'
                      AND symbol = ANY(:symbols)
                      AND time < :day_start
                )
                SELECT symbol, SUM(volume) AS total_volume
                FROM ranked
                WHERE rn <= 14
                GROUP BY symbol
                """
            )
            result = await session.execute(
                fourteen_stmt,
                {"symbols": symbols, "day_start": start_of_day},
            )
            sum_last_14 = {
                row[0]: float(row[1]) if row[1] is not None else 0.0
                for row in result
            }

            last_week_stmt = text(
                """
                SELECT
                    symbol,
                    SUM(volume) AS total_volume
                FROM market_data
                WHERE timescale = '1hour'
                  AND symbol = ANY(:symbols)
                  AND time >= :start_time
                  AND time < :end_time
                GROUP BY symbol
                """
            )
            result = await session.execute(
                last_week_stmt,
                {
                    "symbols": symbols,
                    "start_time": last_week_start,
                    "end_time": last_week_end,
                },
            )
            last_week_partial = {
                row[0]: float(row[1]) if row[1] is not None else 0.0
                for row in result
            }

        return sum_last_14, last_week_partial

    async def _fetch_ticker_details(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Fetch ticker metadata (type, exchange, market cap, float)."""

        if not symbols:
            return {}

        async with get_async_session() as session:
            stmt = (
                select(
                    TickerDetails.symbol,
                    TickerDetails.type,
                    TickerDetails.primary_exchange,
                    TickerDetails.sic_description,
                    TickerDetails.market_cap,
                    TickerDetails.public_float,
                )
                .where(TickerDetails.symbol.in_(symbols))
            )
            result = await session.execute(stmt)
            rows = result.fetchall()

        details: Dict[str, Dict[str, Any]] = {}
        for row in rows:
            mapping = row._mapping
            market_cap = mapping["market_cap"]
            public_float = mapping["public_float"]
            details[mapping["symbol"]] = {
                "type": mapping["type"],
                "primary_exchange": mapping["primary_exchange"],
                "sic_description": mapping["sic_description"],
                "market_cap": float(market_cap) if market_cap is not None else None,
                "public_float": float(public_float) if public_float is not None else None,
            }

        return details

    @staticmethod
    def _safe_float(value: Any) -> Optional[float]:
        """Safely convert a value to float."""

        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    async def _apply_technical_filters(
        self,
        rows: List[dict],
        technical_filters: Dict[str, Any],
        is_historical: bool = False
    ) -> List[dict]:
        """Apply technical analysis filters to screener results."""

        from app.lib.technical_analysis import (
            find_swing_points,
            find_equal_levels,
            find_support_resistance,
            is_price_near_level,
        )

        filtered_rows = []

        for row in rows:
            symbol = row["ticker"]
            current_price = row.get("price")

            if is_historical:
                bars = row.get("_historical_bars", [])
            else:
                bars = []

            passed = True

            if technical_filters.get("near_resistance") and bars:
                swing_points = find_swing_points(bars)
                resistance_levels = find_support_resistance(swing_points, is_support=False)
                if not any(
                    is_price_near_level(current_price, level, tolerance_pct=2.0)
                    for level in resistance_levels
                ):
                    passed = False

            if technical_filters.get("near_support") and bars:
                swing_points = find_swing_points(bars)
                support_levels = find_support_resistance(swing_points, is_support=True)
                if not any(
                    is_price_near_level(current_price, level, tolerance_pct=2.0)
                    for level in support_levels
                ):
                    passed = False

            if technical_filters.get("has_equal_highs") and bars:
                swing_points = find_swing_points(bars)
                equal_levels = find_equal_levels(
                    swing_points, is_support=False, tolerance_pct=1.0
                )
                if not equal_levels:
                    passed = False

            if technical_filters.get("has_equal_lows") and bars:
                swing_points = find_swing_points(bars)
                equal_levels = find_equal_levels(
                    swing_points, is_support=True, tolerance_pct=1.0
                )
                if not equal_levels:
                    passed = False

            if technical_filters.get("above_90day_high"):
                ninety_high = row.get("ninety_day_high")
                if ninety_high is not None and current_price is not None and current_price <= ninety_high:
                    passed = False

            if technical_filters.get("below_90day_low"):
                ninety_low = row.get("ninety_day_low")
                if ninety_low is not None and current_price is not None and current_price >= ninety_low:
                    passed = False

            if technical_filters.get("min_relative_volume") is not None:
                min_rv = technical_filters["min_relative_volume"]
                rv_value = row.get("rv14")
                if rv_value is None or rv_value < min_rv:
                    passed = False

            if passed:
                filtered_rows.append(row)

        return filtered_rows
