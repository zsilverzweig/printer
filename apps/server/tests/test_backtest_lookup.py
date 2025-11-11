"""Tests for backtest lookup population helpers."""

from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Callable
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.models.market_data import (
    MarketData,
    MarketDataBacktestLookup,
    SymbolDateValidation,
)
from app.services.backtest.backtest_lookup_service import populate_lookup_for_date


def _session_override_factory(async_session) -> Callable[[], asynccontextmanager]:
    """Create a factory that returns an async contextmanager yielding the provided session."""

    @asynccontextmanager
    async def _override():
        yield async_session

    return lambda: _override()


@pytest.mark.asyncio
async def test_populate_lookup_requires_validation(async_session):
    """populate_lookup_for_date should fail when no validation records exist."""
    target = date(2025, 11, 3)

    session_factory = _session_override_factory(async_session)

    with patch(
        "app.services.backtest.backtest_lookup_service.get_async_session",
        new=session_factory,
    ):
        with pytest.raises(ValueError, match="No validation records"):
            await populate_lookup_for_date(target, timescale="1min")


@pytest.mark.asyncio
async def test_populate_lookup_calculates_today_volume(async_session):
    """populate_lookup_for_date should store cumulative intraday volume."""
    target = date(2025, 11, 3)
    symbol = "AAPL"

    bars = [
        (datetime(2025, 11, 3, 9, 30, tzinfo=timezone.utc), 100),
        (datetime(2025, 11, 3, 9, 31, tzinfo=timezone.utc), 200),
        (datetime(2025, 11, 3, 9, 32, tzinfo=timezone.utc), 300),
    ]

    for bar_time, volume in bars:
        async_session.add(
            MarketData(
                time=bar_time,
                symbol=symbol,
                timescale="1min",
                open=Decimal("100.0"),
                high=Decimal("101.0"),
                low=Decimal("99.5"),
                close=Decimal("100.5"),
                volume=volume,
                session_type="regular",
            )
        )

    # Validation record indicating the date is fully loaded.
    async_session.add(
        SymbolDateValidation(
            symbol=symbol,
            date=target,
            timescale="1min",
            bar_count=391,
            first_bar_time=bars[0][0],
            last_bar_time=bars[-1][0],
        )
    )
    await async_session.commit()

    session_factory = _session_override_factory(async_session)

    with patch(
        "app.services.backtest.backtest_lookup_service.get_async_session",
        new=session_factory,
    ):
        result = await populate_lookup_for_date(target, timescale="1min")

    assert result["symbols"] == 1
    assert result["total_rows"] > 0

    lookup_time = datetime(2025, 11, 3, 9, 32, tzinfo=timezone.utc)
    row_result = await async_session.execute(
        select(MarketDataBacktestLookup).where(
            MarketDataBacktestLookup.symbol == symbol,
            MarketDataBacktestLookup.timescale == "1min",
            MarketDataBacktestLookup.lookup_time == lookup_time,
        )
    )
    lookup_row = row_result.scalar_one()

    assert lookup_row.today_volume == sum(volume for _, volume in bars)
    assert lookup_row.latest_bar_time == bars[-1][0]

