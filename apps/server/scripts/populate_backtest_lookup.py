#!/usr/bin/env python3
"""
Populate backtest lookup table for a given date.

This pre-computes "latest bar as-of" data for every trading minute,
making backtest queries instant.
"""

import asyncio
import sys
from datetime import date as date_type

sys.path.insert(0, "/app")

from app.services.backtest.backtest_lookup_service import (
    check_lookup_coverage,
    populate_lookup_for_date,
)


async def populate_date(target_date: date_type, timescale: str = "1min") -> None:
    """Populate lookup table for one date using backtest service helpers."""
    print(f"📊 Populating backtest lookup for {target_date} ({timescale})")

    result = await populate_lookup_for_date(target_date, timescale=timescale)
    print(
        f"✅ Populated {result['total_rows']:,} rows for {result['symbols']} symbols "
        f"(table size {result['size']})"
    )


async def coverage(target_date: date_type) -> None:
    """Display lookup coverage summary for a date."""
    stats = await check_lookup_coverage(target_date)
    status = "✅ Ready" if stats["has_data"] else "⚠️ Missing"
    print(
        f"{status} - {target_date}: {stats['total_rows']:,} rows, "
        f"{stats['symbols']} symbols, {stats['minutes']} minutes "
        f"(expected {stats['expected_minutes']})"
    )


if __name__ == "__main__":
    target = date_type(2025, 11, 3)
    asyncio.run(populate_date(target))
    asyncio.run(coverage(target))
