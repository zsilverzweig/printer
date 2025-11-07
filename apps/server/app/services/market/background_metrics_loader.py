"""
Background Metrics Loader

Periodically scans for 5min+ timescale bars missing technical metrics,
calculates them using MetricsCalculator, and persists them back to the database.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import MarketData
from app.services.core.database import get_async_session
from app.services.market.metrics_calculator import METRIC_FIELDS, MetricsCalculator, METRIC_TIMESCALES, is_metrics_timescale


logger = logging.getLogger("app.market.background_metrics_loader")


@dataclass
class ProcessingStats:
    """Statistics for a processing cycle."""
    symbols_scanned: int = 0
    bars_processed: int = 0
    metrics_calculated: int = 0
    database_updates: int = 0
    errors: int = 0


class BackgroundMetricsLoader:
    """
    Service that fills missing technical metrics for all historical daily data.

    This service:
    1. Scans for all 1day timescale bars missing any metrics (no date restriction)
    2. Calculates metrics for those bars using MetricsCalculator
    3. Updates the database with calculated metrics
    4. Called by health monitor when daily data completeness is checked
    """

    def __init__(
        self,
        batch_size: int = 5000,  # Large batches for efficiency
    ):
        self.batch_size = batch_size
        self._calculator = MetricsCalculator()

    async def process_daily_data(self) -> ProcessingStats:
        """
        Process all missing metrics for all historical daily data.

        This method is called by the health monitor when checking daily data completeness.
        It processes all 1day timescale bars that are missing metrics, across all history.

        Returns:
            Processing statistics
        """
        logger.info("BackgroundMetricsLoader processing daily data")
        stats = await self._process_cycle()
        logger.info(
            "Daily metrics processing completed: %d symbols scanned, %d bars processed, %d metrics calculated, %d DB updates",
            stats.symbols_scanned,
            stats.bars_processed,
            stats.metrics_calculated,
            stats.database_updates,
        )
        return stats

    async def _process_cycle(self) -> ProcessingStats:
        logger.info("BackgroundMetricsLoader _process_cycle started")
        """Process one cycle of metrics loading."""
        stats = ProcessingStats()

        # Find symbols with missing metrics
        targets = await self._find_targets()
        stats.symbols_scanned = len(targets)

        if not targets:
            logger.info("BackgroundMetricsLoader _process_cycle completed: no targets")
            return stats

        # Process each target symbol
        for symbol, timescale, missing_count in targets:
            logger.info("BackgroundMetricsLoader _process_cycle processing symbol: %s/%s", symbol, timescale)

            try:
                processed = await self._process_symbol(symbol, timescale)
                stats.bars_processed += processed

                if processed > 0:
                    logger.debug(
                        "Processed %d bars for %s/%s",
                        processed,
                        symbol,
                        timescale,
                    )
                    

            except Exception as exc:
                stats.errors += 1
                logger.warning(
                    "Failed to process %s/%s: %s",
                    symbol,
                    timescale,
                    exc,
                )

        return stats

    async def _find_targets(self) -> List[Tuple[str, str, int]]:
        """
        Find symbols/timescales with missing metrics (all historical daily data).

        Returns:
            List of (symbol, timescale, missing_count) tuples, ordered by missing_count DESC.
        """
        # Build condition for any metric field being NULL
        metric_conditions = " OR ".join(f"{field} IS NULL" for field in METRIC_FIELDS)

        stmt = text(f"""
            SELECT
                symbol,
                timescale,
                COUNT(*) as missing_count
            FROM market_data
            WHERE ({metric_conditions})
              AND timescale = '1day'
            GROUP BY symbol, timescale
            ORDER BY missing_count DESC
        """)

        async with get_async_session() as session:
            result = await session.execute(stmt)
            rows = result.fetchall()

        targets = []
        for row in rows:
            symbol, timescale, missing_count = row
            if timescale == '1day':
                targets.append((symbol, timescale, missing_count))

        return targets

    async def _process_symbol(
        self,
        symbol: str,
        timescale: str
    ) -> int:
        """
        Process all bars for a specific symbol (all historical data, 1day timescale only).

        Args:
            symbol: Stock symbol
            timescale: Must be '1day'

        Returns:
            Number of bars processed
        """
        assert timescale == '1day', f"Only '1day' timescale supported, got {timescale}"

        # Reset calculator state for this symbol/timescale
        self._calculator.reset(symbol, timescale)

        # Find bars missing metrics for this symbol/timescale
        bars = await self._find_missing_bars(symbol, timescale)
        if not bars:
            return 0

        logger.debug("Processing %d bars for %s/%s", len(bars), symbol, timescale)

        # Seed calculator with recent history for continuity
        await self._seed_calculator(symbol, timescale, bars[0].time)

        # Process bars in chronological order
        processed = 0
        async with get_async_session() as session:
            try:
                # Allow large decompressed tuple updates for TimescaleDB
                await session.execute(
                    text("SET LOCAL timescaledb.max_tuples_decompressed_per_dml_transaction = 0")
                )

                # Process bars in batches
                for i in range(0, len(bars), self.batch_size):
                    batch = bars[i:i + self.batch_size]

                    # Calculate metrics for batch
                    for bar in batch:
                        metrics = self._calculator.calculate(symbol, timescale, bar)
                        self._update_bar_metrics(bar, metrics)

                    # Bulk update this batch
                    await self._update_bars_batch(session, batch)
                    processed += len(batch)

                await session.commit()

            except Exception:
                await session.rollback()
                raise

        return processed

    async def _find_missing_bars(
        self,
        symbol: str,
        timescale: str
    ) -> List[MarketData]:
        """Find bars missing metrics for a symbol/timescale (all historical data)."""
        # Build condition for any metric field being NULL
        metric_conditions = " OR ".join(f"{field} IS NULL" for field in METRIC_FIELDS)

        stmt = (
            select(MarketData)
            .where(
                MarketData.symbol == symbol,
                MarketData.timescale == '1day',
                text(f"({metric_conditions})")
            )
            .order_by(MarketData.time.asc())
        )

        async with get_async_session() as session:
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def _seed_calculator(
        self,
        symbol: str,
        timescale: str,
        earliest_missing_time: datetime
    ) -> None:
        """Seed calculator with recent history before the missing bars."""
        # Get bars before the earliest missing time to maintain state continuity
        seed_limit = 200  # Sufficient for most indicators (EMAs, etc.)

        stmt = (
            select(MarketData)
            .where(
                MarketData.symbol == symbol,
                MarketData.timescale == timescale,
                MarketData.time < earliest_missing_time
            )
            .order_by(MarketData.time.desc())
            .limit(seed_limit)
        )

        async with get_async_session() as session:
            result = await session.execute(stmt)
            seed_bars = list(result.scalars().all())

        # Process seed bars in chronological order (reverse since we queried desc)
        for bar in reversed(seed_bars):
            self._calculator.calculate(symbol, timescale, bar)

    def _update_bar_metrics(
        self,
        bar: MarketData,
        metrics: Dict[str, Optional[float]]
    ) -> None:
        """Update a bar's metric fields."""
        from decimal import Decimal

        for field, value in metrics.items():
            if value is not None:
                setattr(bar, field, Decimal(str(value)))
            else:
                setattr(bar, field, None)

    async def _update_bars_batch(
        self,
        session: AsyncSession,
        bars: List[MarketData]
    ) -> None:
        """Bulk update bars in the database."""
        if not bars:
            return

        # Collect all updates
        for bar in bars:
            # Mark bar as modified so SQLAlchemy will update it
            session.add(bar)

        # Flush to execute updates
        await session.flush()
