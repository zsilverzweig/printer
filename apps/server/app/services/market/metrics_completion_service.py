from __future__ import annotations

"""
Background service that incrementally fills missing technical metrics.

Periodically scans the market_data table for symbol/timescale combinations with
missing key metrics (EMA, MACD, RSI), then uses MetricsPopulator to recompute
metrics from the earliest missing timestamp onward.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy import text

from app.services.core.database import get_async_session
from app.services.market.metrics_populator import MetricsPopulator
from app.services.market.metrics_calculator import METRIC_TIMESCALES, is_metrics_timescale


logger = logging.getLogger("app.market.metrics_completion")


PRIMARY_METRIC_COLUMNS: List[str] = [
    "ema_12",
    "ema_26",
    "macd_line",
    "macd_signal",
    "rsi_14",
]


@dataclass
class MetricsCompletionService:
    """
    Periodic background worker that completes missing metrics.
    """

    interval_seconds: int = 300
    max_symbols_per_cycle: int = 5
    populator_batch_size: int = 500

    def __post_init__(self) -> None:
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self._populator = MetricsPopulator(batch_size=self.populator_batch_size)

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="metrics-completion")
        logger.info(
            "Metrics completion service started (interval=%ss, batch=%s symbols)",
            self.interval_seconds,
            self.max_symbols_per_cycle,
        )

    async def stop(self) -> None:
        if not self._running:
            return
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Metrics completion service stopped")

    async def _run_loop(self) -> None:
        try:
            while self._running:
                try:
                    await self._process_cycle()
                except Exception as exc:
                    logger.error("Metrics completion cycle failed: %s", exc, exc_info=True)
                await asyncio.sleep(self.interval_seconds)
        except asyncio.CancelledError:
            logger.debug("Metrics completion loop cancelled")

    async def _process_cycle(self) -> None:
        if not self._running:
            return

        if not self._lock.locked():
            async with self._lock:
                targets = await self._find_targets()
                if not targets:
                    logger.debug("No metrics gaps detected this cycle")
                    return

                logger.info("Metrics completion processing %s target(s)", len(targets))

                for symbol, timescale, start_time in targets:
                    try:
                        processed = await self._populator.populate_symbol(
                            symbol=symbol,
                            timescale=timescale,
                            start_time=start_time,
                            recompute_existing=False,
                        )
                        logger.info(
                            "Metrics completion processed %s bars for %s/%s starting %s",
                            processed,
                            symbol,
                            timescale,
                            start_time.isoformat() if start_time else "beginning",
                        )
                    except Exception as exc:
                        logger.warning(
                            "Metrics completion failed for %s/%s: %s",
                            symbol,
                            timescale,
                            exc,
                        )

    async def _find_targets(self) -> List[Tuple[str, str, Optional[datetime]]]:
        missing_conditions = " OR ".join(f"{column} IS NULL" for column in PRIMARY_METRIC_COLUMNS)

        stmt = text(
            f"""
            SELECT symbol, timescale, MIN(time) AS start_time
            FROM market_data
            WHERE ({missing_conditions})
              AND timescale = ANY(:timescales)
            GROUP BY symbol, timescale
            ORDER BY start_time ASC
            LIMIT :limit
        """
        )

        async with get_async_session() as session:
            result = await session.execute(
                stmt,
                {"limit": self.max_symbols_per_cycle, "timescales": list(METRIC_TIMESCALES)},
            )
            rows = result.fetchall()

        targets: List[Tuple[str, str, Optional[datetime]]] = []
        for row in rows:
            symbol = row[0]
            timescale = row[1]
            if not is_metrics_timescale(timescale):
                continue
            start_time = row[2]
            targets.append((symbol, timescale, start_time))

        return targets

