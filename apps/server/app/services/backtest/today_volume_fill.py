"""
Utility helpers for populating ``today_volume`` in backtest lookup rows.

This module provides a reusable function that can be invoked both manually
and from automated monitors. It operates synchronously using the shared
SQLAlchemy session factory.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Select, func, select, update
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session

from app.models.market_data import MarketData, MarketDataBacktestLookup
from app.services.core.database import get_sync_session
from app.services.core.time_context import get_current_time

logger = logging.getLogger("app.backtest.today_volume_fill")


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _start_of_day(dt: datetime) -> datetime:
    dt = _ensure_utc(dt)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _lookup_rows_to_fill(session: Session, *, limit: Optional[int], today_cutoff: datetime) -> List[Tuple[str, str, datetime, Optional[datetime]]]:
    stmt: Select = (
        select(
            MarketDataBacktestLookup.symbol,
            MarketDataBacktestLookup.timescale,
            MarketDataBacktestLookup.lookup_time,
            MarketDataBacktestLookup.latest_bar_time,
        )
        .where(MarketDataBacktestLookup.today_volume.is_(None))
        .where(MarketDataBacktestLookup.lookup_time < today_cutoff)
        .order_by(MarketDataBacktestLookup.lookup_time)
    )

    if limit is not None:
        stmt = stmt.limit(limit)

    result = session.execute(stmt)
    return result.all()


def _compute_today_volume(
    session: Session,
    *,
    symbol: str,
    lookup_time: datetime,
    latest_bar_time: Optional[datetime],
) -> Optional[int]:
    cutoff_time = latest_bar_time or lookup_time
    if cutoff_time is None:
        return None

    cutoff_time = _ensure_utc(cutoff_time)
    start_of_day = _start_of_day(cutoff_time)

    stmt = (
        select(func.sum(MarketData.volume))
        .where(MarketData.symbol == symbol)
        .where(MarketData.timescale == "1min")
        .where(MarketData.time >= start_of_day)
        .where(MarketData.time <= cutoff_time)
    )

    result: Result = session.execute(stmt)
    volume_sum = result.scalar_one_or_none()

    if volume_sum is None:
        return None

    return int(volume_sum)


def fill_missing_today_volume(*, limit: Optional[int] = None, include_today: bool = False) -> Dict[str, Any]:
    """
    Populate ``today_volume`` for lookup rows that are currently NULL.

    Args:
        limit: Optional cap on the number of rows to update.
        include_today: When False (default) skip the current trading day.

    Returns:
        Dictionary containing counts for updated rows and skips.
    """
    updated = 0
    skipped_no_volume = 0

    current_time = get_current_time()
    today_start = _start_of_day(current_time)

    with get_sync_session() as session:
        rows = _lookup_rows_to_fill(
            session,
            limit=limit,
            today_cutoff=today_start if not include_today else datetime.max.replace(tzinfo=timezone.utc),
        )

        for symbol, timescale, lookup_time, latest_bar_time in rows:
            today_volume = _compute_today_volume(
                session,
                symbol=symbol,
                lookup_time=lookup_time,
                latest_bar_time=latest_bar_time,
            )

            if today_volume is None:
                logger.debug(
                    "Skipping %s %s @ %s (no intraday volume found)",
                    symbol,
                    timescale,
                    lookup_time.isoformat(),
                )
                skipped_no_volume += 1
                continue

            session.execute(
                update(MarketDataBacktestLookup)
                .where(MarketDataBacktestLookup.symbol == symbol)
                .where(MarketDataBacktestLookup.timescale == timescale)
                .where(MarketDataBacktestLookup.lookup_time == lookup_time)
                .values(today_volume=today_volume)
            )
            updated += 1

            logger.debug(
                "Filled today_volume=%s for %s %s @ %s (cutoff=%s)",
                today_volume,
                symbol,
                timescale,
                lookup_time.isoformat(),
                (latest_bar_time or lookup_time).isoformat(),
            )

    return {
        "updated": updated,
        "skipped_no_volume": skipped_no_volume,
        "limit": limit,
        "include_today": include_today,
    }

