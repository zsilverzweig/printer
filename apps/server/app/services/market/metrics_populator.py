from __future__ import annotations

"""
DEPRECATED: Historical metrics backfill service.

⚠️  DEPRECATED - DO NOT USE ⚠️

This service has been superseded by BackgroundMetricsLoader, which is now the
mothership for all metrics processing. BackgroundMetricsLoader provides:

- Unified processing of all historical daily data
- Better performance and reliability
- Simplified architecture
- Health monitor integration for automatic triggering

This service will be removed in a future version. Migrate to BackgroundMetricsLoader.

OLD DESCRIPTION:
Processes market_data bars in chronological order, calculates metrics via
MetricsCalculator, and persists them back to the database in batches.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Mapping, Optional

from sqlalchemy import Select, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import MarketData
from app.services.core.database import get_async_session
from app.services.market.metrics_calculator import METRIC_FIELDS, MetricsCalculator, is_metrics_timescale, METRIC_TIMESCALES


logger = logging.getLogger("app.market.metrics_populator")


def _to_decimal(value: Optional[float]) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value))


@dataclass
class MetricsPopulator:
    """
    ⚠️ DEPRECATED: Backfills technical metrics directly into the market_data table.

    This class is deprecated. Use BackgroundMetricsLoader instead.
    The mothership BackgroundMetricsLoader will kill all the old metric loaders.

    OLD DESCRIPTION:
    Intended for use by maintenance scripts or background jobs that need to
    compute metrics for historical bars. The populator processes data per
    symbol/timescale combination in chronological order to maintain indicator
    state.
    """

    batch_size: int = 500
    calculator: MetricsCalculator = MetricsCalculator()

    async def populate_symbol(
        self,
        symbol: str,
        timescale: str,
        *,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        recompute_existing: bool = False,
        session: Optional[AsyncSession] = None,
    ) -> int:
        """
        Populate metrics for a specific symbol/timescale.

        Args:
            symbol: Ticker symbol to process.
            timescale: Timescale string ('1min', '5min', '1day', etc.).
            start_time: Optional start timestamp filter (inclusive).
            end_time: Optional end timestamp filter (inclusive).
            recompute_existing: If False, metrics already present will not be
                rewritten. Bars still advance the calculator state either way.
            session: Optional session. If not provided, a new session is opened.

        Returns:
            Number of bars processed.
        """
        self.calculator.reset(symbol, timescale)
        if not is_metrics_timescale(timescale):
            logger.debug("Skipping metrics population for disallowed timescale %s/%s", symbol, timescale)
            return 0
        owns_session = session is None
        processed = 0

        async with get_async_session() if owns_session else _identity_async_context(session) as db_session:
            try:
                # Metrics completion can touch large compressed chunks; lift the per-transaction
                # decompression guard for this session so TimescaleDB doesn't abort the updates.
                await db_session.execute(
                    text("SET LOCAL timescaledb.max_tuples_decompressed_per_dml_transaction = 0")
                )
                stmt = self._build_query(symbol, timescale, start_time, end_time)
                result = await db_session.stream(stmt)

                pending_flush = 0
                async for bar in result.scalars():
                    metrics = self.calculator.calculate(symbol, timescale, bar)

                    if recompute_existing or self._needs_update(bar):
                        self._apply_metrics(bar, metrics)
                        pending_flush += 1

                    processed += 1

                    if pending_flush >= self.batch_size:
                        await db_session.flush()
                        pending_flush = 0

                if pending_flush > 0:
                    await db_session.flush()

                await db_session.commit()

            except Exception:
                await db_session.rollback()
                raise

        logger.info(
            "Metrics populated for %s/%s processed=%s",
            symbol,
            timescale,
            processed,
        )
        return processed

    def _build_query(
        self,
        symbol: str,
        timescale: str,
        start_time: Optional[datetime],
        end_time: Optional[datetime],
    ) -> Select:
        stmt = (
            select(MarketData)
            .where(
                MarketData.symbol == symbol,
                MarketData.timescale == timescale,
            )
            .order_by(MarketData.time.asc())
            .execution_options(yield_per=self.batch_size)
        )

        if start_time is not None:
            stmt = stmt.where(MarketData.time >= start_time)
        if end_time is not None:
            stmt = stmt.where(MarketData.time <= end_time)

        return stmt

    @staticmethod
    def _needs_update(bar: MarketData) -> bool:
        return any(getattr(bar, field) is None for field in METRIC_FIELDS)

    @staticmethod
    def _apply_metrics(bar: MarketData, metrics: Mapping[str, Optional[float]]) -> None:
        for field, value in metrics.items():
            setattr(bar, field, _to_decimal(value))


class _identity_async_context:
    """
    Helper context manager to reuse an existing async session in `async with`.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def __aenter__(self) -> AsyncSession:
        return self.session

    async def __aexit__(self, exc_type, exc, tb) -> None:
        # Caller owns the session; responsibility for rollback/commit is external.
        return

