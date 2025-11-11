"""
Service for running screener backtests across all screening criteria.

Given a target date, the service executes each screener at hourly intervals
throughout the regular trading session and aggregates the number of matches.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import select

from app.models.strategies import Fund, ScreeningCriteria
from app.services.core.database import get_async_session
from app.services.screener.screener import get_screener_service

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    from backports.zoneinfo import ZoneInfo  # type: ignore


logger = logging.getLogger("app.backtests.screener")


@dataclass
class ScreenerBacktestPoint:
    """Aggregated screener results for a single timestamp."""

    timestamp_utc: datetime
    timestamp_local: datetime
    count: int
    tickers: Sequence[str]


@dataclass
class ScreenerBacktestSeries:
    """Time series results for a screening criteria."""

    criteria_id: str
    criteria_name: str
    description: Optional[str]
    points: List[ScreenerBacktestPoint]
    total_hits: int
    unique_ticker_count: int


@dataclass
class ScreenerBacktestResult:
    """Container for an entire screener backtest execution."""

    date: date
    start_utc: datetime
    end_utc: datetime
    interval_minutes: int
    series: List[ScreenerBacktestSeries]


class ScreenerBacktestService:
    """
    Execute screener backtests for all saved screening criteria.

    The service queries historical screener results on an hourly cadence
    (default) between 09:30 and 16:00 ET for the specified date.
    """

    MARKET_TZ = ZoneInfo("America/New_York")
    DEFAULT_START_TIME = time(hour=9, minute=30)
    DEFAULT_END_TIME = time(hour=16, minute=0)
    MAX_TICKERS_PER_POINT = 25

    def __init__(self) -> None:
        self.logger = logger

    async def run(
        self,
        target_date: date,
        *,
        interval_minutes: int = 60,
        fund_ids: Optional[Sequence[str]] = None,
    ) -> ScreenerBacktestResult:
        """
        Run screener backtests for all screening criteria on the given date.

        Args:
            target_date: Date (in calendar terms) to evaluate.
            interval_minutes: Interval minutes between screener executions.

        Returns:
            ScreenerBacktestResult with per-criteria time series.

        Raises:
            ValueError: If interval_minutes is invalid or no criteria exist.
            RuntimeError: If the screener service is not initialized.
        """
        if interval_minutes <= 0:
            raise ValueError("interval_minutes must be greater than 0")

        screener_service = get_screener_service()
        if not screener_service:
            raise RuntimeError("Screener service is not initialized")

        criteria_records = await self._load_screening_criteria(fund_ids=fund_ids)
        if not criteria_records:
            if fund_ids:
                raise ValueError("No screening criteria are configured for the selected fund(s)")
            raise ValueError("No screening criteria are configured")

        local_points = self._generate_time_points(
            target_date,
            interval_minutes=interval_minutes,
            start_time=self.DEFAULT_START_TIME,
            end_time=self.DEFAULT_END_TIME,
        )
        if not local_points:
            raise ValueError("No timestamps generated for screener backtest")

        points_local_and_utc = [
            (local_dt, local_dt.astimezone(timezone.utc)) for local_dt in local_points
        ]

        series_results: List[ScreenerBacktestSeries] = []

        for criteria in criteria_records:
            params = self._extract_criteria_params(criteria.criteria)
            if params is None:
                self.logger.warning(
                    "Skipping screening criteria %s (%s) due to invalid parameters",
                    criteria.id,
                    criteria.name,
                )
                continue

            points: List[ScreenerBacktestPoint] = []
            unique_tickers: set[str] = set()
            total_hits = 0

            for local_dt, utc_dt in points_local_and_utc:
                try:
                    results = await screener_service.compute_historical_with_criteria(
                        timestamp=utc_dt,
                        params=params,
                    )
                except Exception as exc:  # pragma: no cover
                    self.logger.error(
                        "Failed to compute historical screener results for %s at %s: %s",
                        criteria.id,
                        utc_dt.isoformat(),
                        exc,
                        exc_info=True,
                    )
                    results = []

                tickers: List[str] = []
                for row in results:
                    ticker = row.get("ticker") or row.get("symbol")
                    if ticker:
                        tickers.append(ticker)
                        unique_tickers.add(ticker)

                count = len(tickers)
                total_hits += count

                points.append(
                    ScreenerBacktestPoint(
                        timestamp_utc=utc_dt,
                        timestamp_local=local_dt,
                        count=count,
                        tickers=tickers[: self.MAX_TICKERS_PER_POINT],
                    )
                )

            series_results.append(
                ScreenerBacktestSeries(
                    criteria_id=criteria.id,
                    criteria_name=criteria.name,
                    description=criteria.description,
                    points=points,
                    total_hits=total_hits,
                    unique_ticker_count=len(unique_tickers),
                )
            )

        start_utc = points_local_and_utc[0][1]
        end_utc = points_local_and_utc[-1][1]

        return ScreenerBacktestResult(
            date=target_date,
            start_utc=start_utc,
            end_utc=end_utc,
            interval_minutes=interval_minutes,
            series=series_results,
        )

    async def _load_screening_criteria(
        self, *, fund_ids: Optional[Sequence[str]] = None
    ) -> Sequence[ScreeningCriteria]:
        """Load all screening criteria sorted by name."""
        async with get_async_session() as session:
            statement = select(ScreeningCriteria).order_by(ScreeningCriteria.name)

            if fund_ids:
                statement = (
                    select(ScreeningCriteria)
                    .join(Fund, Fund.screening_criteria_id == ScreeningCriteria.id)
                    .where(Fund.id.in_(fund_ids))
                    .order_by(ScreeningCriteria.name)
                    .distinct()
                )

            result = await session.execute(statement)
            return result.scalars().all()

    def _generate_time_points(
        self,
        target_date: date,
        *,
        interval_minutes: int,
        start_time: time,
        end_time: time,
    ) -> List[datetime]:
        """
        Generate timezone-aware datetime points for the given trading session.
        """
        start_local = datetime.combine(
            target_date, start_time, tzinfo=self.MARKET_TZ
        )
        end_local = datetime.combine(target_date, end_time, tzinfo=self.MARKET_TZ)

        if end_local < start_local:
            raise ValueError("end_time must be after start_time")

        points: List[datetime] = []
        current = start_local
        while current <= end_local:
            points.append(current)
            current += timedelta(minutes=interval_minutes)

        # Ensure the final point includes the exact end time
        if points[-1] != end_local:
            points.append(end_local)

        return points

    def _extract_criteria_params(self, raw_params: Any) -> Optional[Dict[str, Any]]:
        """Validate the stored criteria payload is a dict."""
        if raw_params is None:
            return {}

        if isinstance(raw_params, dict):
            return dict(raw_params)

        self.logger.error(
            "Screening criteria params expected dict but received %s", type(raw_params)
        )
        return None


