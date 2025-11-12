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

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.market_data import MarketData, SymbolDateValidation
from app.services.core.database import get_async_session
from app.services.market.metrics_calculator import METRIC_FIELDS, MetricsCalculator


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
        min_history_bars: int = 100,  # Skip first N bars where long-window metrics are unavailable
        max_concurrent_symbols: int = 6,  # Limit concurrent symbol processing to balance DB load
    ):
        self.batch_size = batch_size
        self._min_history_bars = min_history_bars
        self._max_concurrent_symbols = max(1, max_concurrent_symbols)
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
        total_missing_bars = sum(missing_count for _, _, missing_count in targets)

        if stats.symbols_scanned:
            logger.info(
                "BackgroundMetricsLoader _process_cycle found %d symbols with %d missing bars",
                stats.symbols_scanned,
                total_missing_bars,
            )

        if not targets:
            logger.info("BackgroundMetricsLoader _process_cycle completed: no targets")
            return stats

        semaphore = asyncio.Semaphore(self._max_concurrent_symbols)
        stats_lock = asyncio.Lock()
        completed_symbols = 0

        async def process_target(
            index: int, symbol: str, timescale: str, missing_count: int
        ) -> None:
            nonlocal completed_symbols

            async with semaphore:
                logger.info(
                    (
                        "BackgroundMetricsLoader progress: processing %s/%s "
                        "(%d of %d symbols, %.1f%%), %d missing bars"
                    ),
                    symbol,
                    timescale,
                    index,
                    stats.symbols_scanned,
                    (index / stats.symbols_scanned) * 100.0,
                    missing_count,
                )

                processed = 0
                failed = False

                try:
                    processed = await self._process_symbol(symbol, timescale)
                except Exception as exc:
                    failed = True
                    async with stats_lock:
                        stats.errors += 1
                    logger.warning(
                        "Failed to process %s/%s: %s",
                        symbol,
                        timescale,
                        exc,
                    )

                async with stats_lock:
                    if not failed:
                        stats.bars_processed += processed
                        stats.metrics_calculated += processed * len(METRIC_FIELDS)
                        stats.database_updates += processed
                    completed_symbols += 1
                    bars_processed = stats.bars_processed
                    symbol_progress = (
                        (completed_symbols / stats.symbols_scanned) * 100.0
                        if stats.symbols_scanned
                        else 100.0
                    )
                    bar_progress = (
                        (bars_processed / total_missing_bars) * 100.0
                        if total_missing_bars
                        else 100.0
                    )

                if not failed:
                    logger.info(
                        (
                            "BackgroundMetricsLoader progress: completed %s/%s "
                            "(%d bars this symbol, %d total, %.1f%% of %d target bars)"
                        ),
                        symbol,
                        timescale,
                        processed,
                        bars_processed,
                        bar_progress,
                        total_missing_bars,
                    )

                    if processed > 0:
                        logger.debug(
                            "Processed %d bars for %s/%s",
                            processed,
                            symbol,
                            timescale,
                        )
                else:
                    logger.info(
                        (
                            "BackgroundMetricsLoader progress: skipped %s/%s after failure "
                            "(%d of %d symbols, %.1f%% complete, %.1f%% of %d target bars)"
                        ),
                        symbol,
                        timescale,
                        completed_symbols,
                        stats.symbols_scanned,
                        symbol_progress,
                        bar_progress,
                        total_missing_bars,
                    )

        tasks = [
            asyncio.create_task(process_target(index, symbol, timescale, missing_count))
            for index, (symbol, timescale, missing_count) in enumerate(targets, start=1)
        ]
        if tasks:
            await asyncio.gather(*tasks)

        return stats

    async def _find_targets(self) -> List[Tuple[str, str, int]]:
        """
        Find symbols/timescales with missing metrics (all historical daily data).

        Returns:
            List of (symbol, timescale, missing_count) tuples, ordered by missing_count DESC.
        """
        pending_symbols_stmt = (
            select(SymbolDateValidation.symbol)
            .where(
                SymbolDateValidation.timescale == '1day',
                SymbolDateValidation.background_metrics_calculated.is_(False),
            )
            .distinct()
        )

        ordered_bars = (
            select(
                MarketData.symbol.label("symbol"),
                MarketData.timescale.label("timescale"),
                MarketData.time.label("time"),
                func.count()
                .over(
                    partition_by=(MarketData.symbol, MarketData.timescale),
                )
                .label("total_bars"),
                func.row_number()
                .over(
                    partition_by=(MarketData.symbol, MarketData.timescale),
                    order_by=MarketData.time.asc(),
                )
                .label("bar_index"),
            )
            .subquery()
        )

        md_alias = aliased(MarketData)
        metric_conditions_expr = or_(
            *[getattr(md_alias, field).is_(None) for field in METRIC_FIELDS]
        )

        stmt = (
            select(
                ordered_bars.c.symbol,
                ordered_bars.c.timescale,
                func.count().label("missing_count"),
            )
            .select_from(
                ordered_bars.join(
                    md_alias,
                    (md_alias.symbol == ordered_bars.c.symbol)
                    & (md_alias.timescale == ordered_bars.c.timescale)
                    & (md_alias.time == ordered_bars.c.time),
                )
            )
            .where(
                ordered_bars.c.timescale == '1day',
                ordered_bars.c.bar_index > self._min_history_bars,
                metric_conditions_expr,
            )
            .group_by(ordered_bars.c.symbol, ordered_bars.c.timescale)
            .order_by(func.count().desc())
        )

        async with get_async_session() as session:
            pending_symbols_result = await session.execute(pending_symbols_stmt)
            pending_symbols = list(pending_symbols_result.scalars().all())

            if not pending_symbols:
                return []

            result = await session.execute(
                stmt.where(ordered_bars.c.symbol.in_(pending_symbols))
            )
            rows = result.all()

        symbols_with_missing = {row.symbol for row in rows}
        symbols_without_missing = set(pending_symbols) - symbols_with_missing

        for symbol in symbols_without_missing:
            logger.debug(
                "BackgroundMetricsLoader found no missing metrics for %s/1day; marking as calculated",
                symbol,
            )
            await self._mark_metrics_calculated(symbol, '1day')

        return [(row.symbol, row.timescale, row.missing_count) for row in rows]

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
            await self._mark_metrics_calculated(symbol, timescale)
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

        await self._mark_metrics_calculated(symbol, timescale)
        return processed

    async def _find_missing_bars(
    self,
    symbol: str,
    timescale: str
    ) -> List[MarketData]:
        """Find bars missing metrics for a symbol/timescale (all historical data)."""
        ordered_bars = (
            select(
                MarketData.symbol.label("symbol"),
                MarketData.timescale.label("timescale"),
                MarketData.time.label("time"),
                func.count()
                .over(
                    partition_by=(MarketData.symbol, MarketData.timescale),
                )
                .label("total_bars"),
                func.row_number()
                .over(
                    partition_by=(MarketData.symbol, MarketData.timescale),
                    order_by=MarketData.time.asc(),
                )
                .label("bar_index"),
            )
            .subquery()
        )

        metric_conditions_expr = or_(
            *[getattr(MarketData, field).is_(None) for field in METRIC_FIELDS]
        )

        stmt = (
            select(MarketData)
            .join(
                ordered_bars,
                (MarketData.symbol == ordered_bars.c.symbol)
                & (MarketData.timescale == ordered_bars.c.timescale)
                & (MarketData.time == ordered_bars.c.time),
            )
            .where(
                MarketData.symbol == symbol,
                MarketData.timescale == timescale,
                ordered_bars.c.bar_index > self._min_history_bars,
                metric_conditions_expr,
            )
            .order_by(MarketData.time.asc())
        )

        async with get_async_session() as session:
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def _mark_metrics_calculated(
        self,
        symbol: str,
        timescale: str
    ) -> None:
        """Mark symbol/timescale validation rows as having background metrics calculated."""
        async with get_async_session() as session:
            result = await session.execute(
                update(SymbolDateValidation)
                .where(
                    SymbolDateValidation.symbol == symbol,
                    SymbolDateValidation.timescale == timescale,
                    SymbolDateValidation.background_metrics_calculated.is_(False),
                )
                .values(background_metrics_calculated=True)
            )
            await session.commit()
        if result.rowcount:
            logger.debug(
                "Marked background metrics as calculated for %s/%s",
                symbol,
                timescale,
            )

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
