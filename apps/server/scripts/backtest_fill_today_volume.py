"""
Command-line helper to backfill ``today_volume`` values in the
``market_data_backtest_lookup`` table.

This delegates to ``app.services.backtest.today_volume_fill`` so it can be
shared with the health monitor.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from app.services.backtest.today_volume_fill import fill_missing_today_volume  # noqa: E402

logger = logging.getLogger("backtest_fill_today_volume")
logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill today_volume values.")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on the number of lookup rows to fill.",
    )
    parser.add_argument(
        "--include-today",
        action="store_true",
        help="Include current trading day rows. Default is to skip them.",
    )
    args = parser.parse_args()

    result = fill_missing_today_volume(limit=args.limit, include_today=args.include_today)
    logger.info(
        "Completed backfill. Updated %s rows (skipped %s).",
        result["updated"],
        result["skipped_no_volume"],
    )


if __name__ == "__main__":
    main()
