#!/usr/bin/env python3
"""
Populate backtest lookup table for a given date.

This pre-computes "latest bar as-of" data for every trading minute,
making backtest queries instant.
"""

import asyncio
import argparse
import logging
import os
import sys
from datetime import date as date_type, datetime

sys.path.insert(0, "/app")

from app.services.backtest.backtest_lookup_service import (
    check_lookup_coverage,
    populate_lookup_for_date,
)


async def populate_date(target_date: date_type, timescale: str = "1min", max_minutes: int | None = None) -> None:
    """Populate lookup table for one date using backtest service helpers."""
    print(f"📊 Populating backtest lookup for {target_date} ({timescale})")

    result = await populate_lookup_for_date(target_date, timescale=timescale, max_minutes=max_minutes)
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate backtest lookup data for a given date")
    parser.add_argument(
        "date",
        type=lambda s: datetime.strptime(s, "%Y-%m-%d").date(),
        help="Target trading date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "timescale",
        nargs="?",
        default="1min",
        help="Timescale to populate (default: 1min)",
    )
    parser.add_argument(
        "--max-minutes",
        type=int,
        default=None,
        help="Optionally limit the number of minutes processed (for testing)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable verbose logging output",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if args.debug:
        os.environ["BACKTEST_LOOKUP_DEBUG"] = "true"
        logging.basicConfig(level=logging.DEBUG)

    async def _main() -> None:
        await populate_date(args.date, timescale=args.timescale, max_minutes=args.max_minutes)
        await coverage(args.date)

    asyncio.run(_main())
