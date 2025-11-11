#!/usr/bin/env python3
"""
Market data loader for comprehensive data coverage.

Loads:
- Yesterday's data (all timescales)
- Today's data (all timescales) - up to current time
- 7 days of hourly bars
- 5min/15min for last 7 days
"""

import asyncio
import sys
import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from polygon import RESTClient
from sqlalchemy import text
import logging

# Import core utilities
# Add scripts directory to path so we can import the core module
_scripts_dir = os.path.dirname(__file__)
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

import market_data_loader_core
from market_data_loader_core import (
    create_polygon_client,
    load_symbol_data,
    insert_bars,
    create_validation,
    TIMESCALE_CONFIG,
    logger
)

from app.services.core.database import get_async_session, init_db
from app.services.core.time_context import get_current_time
from app.services.screener.screener_snapshot import fetch_snapshot_all
from app.services.market.market_data_service import get_market_data_service


_EASTERN_TIMEZONE = ZoneInfo("America/New_York")


def _get_et_today() -> date:
    """Return the current trading date in Eastern Time."""
    current_time = get_current_time()
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    return current_time.astimezone(_EASTERN_TIMEZONE).date()


def _recent_trading_days(count: int = 5) -> List[date]:
    """Return the most recent trading days (skip weekends), newest first."""
    days: List[date] = []
    current = _get_et_today()
    while len(days) < count:
        if current.weekday() < 5:
            days.append(current)
        current -= timedelta(days=1)
    return days


async def _fetch_validation_summary(
    dates: Sequence[date],
    timescales: Sequence[str]
) -> Dict[Tuple[date, str], Dict[str, int]]:
    """Aggregate validation coverage for the requested dates/timescales."""
    if not dates or not timescales:
        return {}

    summary: Dict[Tuple[date, str], Dict[str, int]] = {}
    start_date = min(dates)
    end_date = max(dates)

    async with get_async_session() as session:
        result = await session.execute(
            text(
                """
                SELECT
                    date,
                    timescale,
                    COUNT(*) AS validation_rows
                    
                FROM symbol_date_validation
                WHERE date >= :start_date
                  AND date <= :end_date
                  AND timescale = ANY(:timescales)
                GROUP BY date, timescale
                """
            ),
            {
                "start_date": start_date,
                "end_date": end_date,
                "timescales": list(timescales),
            },
        )

        for row in result:
            mapping = row._mapping
            summary[(mapping["date"], mapping["timescale"])] = {
                "validation_rows": int(mapping["validation_rows"] or 0),
                
            }

    return summary


def _format_table(rows: List[List[str]], headers: List[str]) -> str:
    """Render rows as a simple ASCII table."""
    widths = [len(header) for header in headers]
    for row in rows:
        for idx, value in enumerate(row):
            widths[idx] = max(widths[idx], len(value))

    header_line = " | ".join(header.ljust(widths[idx]) for idx, header in enumerate(headers))
    separator = "-+-".join("-" * widths[idx] for idx in range(len(headers)))
    body_lines = [
        " | ".join(value.ljust(widths[idx]) for idx, value in enumerate(row)) for row in rows
    ]

    table = [header_line, separator]
    table.extend(body_lines)
    return "\n".join(table)


async def detect_market_data_gaps(
    lookback_days: int = 5,
    timescales: Optional[Sequence[str]] = None,
    max_symbols_per_gap: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute diagnostics and identify gaps between stored bars and validation records.

    Returns:
        Dict with coverage table, raw coverage/validation maps, and per-gap details.
    """
    try:
        timescales = list(timescales or ["1day", "1hour", "15min", "5min", "1min"])
        recent_days = _recent_trading_days(lookback_days)
        service = get_market_data_service()
        coverage = await service.get_coverage_summary(recent_days, timescales)
        validation = await _fetch_validation_summary(recent_days, timescales)

        rows: List[List[str]] = []
        headers = [
            "Date",
            "Timescale",
            "Bars",
            "Symbols",
            "First Bar",
            "Last Bar",
            "Validation Rows",
            "Complete Rows",
        ]

        def fmt_ts(ts_value: Optional[datetime]) -> str:
            if not ts_value:
                return "--"
            return ts_value.astimezone(timezone.utc).strftime("%H:%M")

        for day in recent_days:
            day_iso = day.isoformat()
            for timescale in timescales:
                coverage_entry = coverage.get(day_iso, {}).get(timescale, {})
                validation_entry = validation.get((day, timescale), {})

                rows.append(
                    [
                        day_iso,
                        timescale,
                        str(coverage_entry.get("bar_count", 0)),
                        str(coverage_entry.get("symbol_count", 0)),
                        fmt_ts(coverage_entry.get("first_bar")),
                        fmt_ts(coverage_entry.get("last_bar")),
                        str(validation_entry.get("validation_rows", 0)),
                        str(validation_entry.get("complete_rows", 0)),
                    ]
                )

        table = _format_table(rows, headers) if rows else "No coverage data found."

        gaps: List[Dict[str, Any]] = []
        max_symbols = max_symbols_per_gap or 0

        async with get_async_session() as session:
            for day in recent_days:
                for timescale in timescales:
                    missing_symbols: List[str] = []

                    missing_result = await session.execute(
                        text(
                            """
                            SELECT td.symbol
                            FROM ticker_details td
                            WHERE td.active = true
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM symbol_date_validation sdv
                                  WHERE sdv.symbol = td.symbol
                                    AND sdv.date = :date
                                    AND sdv.timescale = :timescale
                              )
                            """
                        ),
                        {"date": day, "timescale": timescale},
                    )
                    missing_symbols = [row[0] for row in missing_result]

                    

                    total_missing = len(missing_symbols)
                    

                    if not total_missing:
                        continue

                    symbols_to_load: List[str] = []
                    symbols_to_load.extend(missing_symbols)
                    

                    if symbols_to_load:
                        symbols_to_load = sorted({symbol.upper() for symbol in symbols_to_load})

                    if max_symbols:
                        symbols_to_load = symbols_to_load[:max_symbols]

                    gaps.append(
                        {
                            "date": day,
                            "timescale": timescale,
                            "missing_validation_count": total_missing,
                            "missing_validation_symbols": missing_symbols[: max_symbols or None],
                            "symbols_to_load": symbols_to_load,
                            "coverage": coverage.get(day.isoformat(), {}).get(timescale, {}),
                            "validation": validation.get((day, timescale), {}),
                        }
                    )

        return {
            "table": table,
            "coverage": coverage,
            "validation": validation,
            "gaps": gaps,
        }

    except Exception as exc:
        logger.error("Failed to detect market data gaps: %s", exc, exc_info=True)
        return {
            "table": "Diagnostics unavailable (error encountered).",
            "coverage": {},
            "validation": {},
            "gaps": [],
            "error": str(exc),
        }


async def _log_market_data_diagnostics(context: str, lookback_days: int = 5) -> Dict[str, Any]:
    """Log market data vs validation coverage for recent days."""
    try:
        diagnostics = await detect_market_data_gaps(lookback_days=lookback_days)
        logger.info(
            "Market data coverage diagnostics (%s):\n%s",
            context,
            diagnostics.get("table", "No data"),
        )

        gaps = diagnostics.get("gaps", [])
        if gaps:
            for gap in gaps:
                sample_missing = ", ".join(gap.get("missing_validation_symbols", [])[:5])
                
                logger.info(
                    "Gap detected: %s %s | missing=%s | sample_missing=[%s]",
                    gap["date"].isoformat(),
                    gap["timescale"],
                    gap.get("missing_validation_count", 0),
                    sample_missing,
                )
        else:
            logger.info("No outstanding gaps detected for context %s.", context)

        return diagnostics

    except Exception as exc:
        logger.error("Failed to log market data diagnostics (%s): %s", context, exc, exc_info=True)
        return {"table": "", "coverage": {}, "validation": {}, "gaps": [], "error": str(exc)}


def _chunk_symbols(symbols: Sequence[str], chunk_size: int) -> Iterable[List[str]]:
    """Yield chunked slices of symbols."""
    if chunk_size <= 0:
        yield list(symbols)
        return
    for idx in range(0, len(symbols), chunk_size):
        yield list(symbols[idx : idx + chunk_size])


async def _backfill_gaps_with_client(
    client: RESTClient,
    gaps: Sequence[Dict[str, Any]],
    allowed_dates: Optional[Set[date]] = None,
    allowed_timescales: Optional[Set[str]] = None,
    max_symbols_per_batch: int = 250,
) -> int:
    """
    Invoke load_date_range_data for each gap slice using the provided Polygon client.

    Returns:
        Total number of batch loads executed.
    """
    batches_executed = 0

    for gap in gaps:
        gap_date: date = gap.get("date")
        gap_timescale: str = gap.get("timescale")
        if allowed_dates and gap_date not in allowed_dates:
            continue
        if allowed_timescales and gap_timescale not in allowed_timescales:
            continue

        symbols_to_load: List[str] = list(gap.get("symbols_to_load") or [])
        if not symbols_to_load:
            continue

        logger.info(
            "Backfilling gap %s %s for %s symbols",
            gap_date,
            gap_timescale,
            len(symbols_to_load),
        )

        for batch_symbols in _chunk_symbols(symbols_to_load, max_symbols_per_batch):
            await load_date_range_data(
                client=client,
                symbols=batch_symbols,
                start_date=gap_date,
                end_date=gap_date,
                timescales=[gap_timescale],
            )
            batches_executed += 1

    return batches_executed


async def fill_detected_gaps(
    api_key: str,
    gaps: Sequence[Dict[str, Any]],
    allowed_dates: Optional[Set[date]] = None,
    allowed_timescales: Optional[Set[str]] = None,
    max_symbols_per_batch: int = 250,
) -> int:
    """
    Convenience wrapper that creates a Polygon client and fills detected gaps.

    Returns:
        Total number of batch loads executed.
    """
    if not gaps:
        return 0

    if not api_key:
        logger.warning("Polygon API key missing; cannot backfill detected gaps.")
        return 0

    client = create_polygon_client(api_key)
    return await _backfill_gaps_with_client(
        client=client,
        gaps=gaps,
        allowed_dates=allowed_dates,
        allowed_timescales=allowed_timescales,
        max_symbols_per_batch=max_symbols_per_batch,
    )


async def load_date_range_data(
    client: RESTClient,
    symbols: List[str],
    start_date: datetime.date,
    end_date: datetime.date,
    timescales: List[str]
):
    """
    Load data for a date range and timescales.
    
    Args:
        client: Polygon REST client
        symbols: List of symbols to load
        start_date: Start date (inclusive)
        end_date: End date (inclusive)
        timescales: List of timescales to load (e.g., ['1hour', '5min'])
    """
    # Generate date range (skip weekends)
    dates = []
    current = start_date
    while current <= end_date:
        if current.weekday() < 5:  # Monday=0, Friday=4
            dates.append(current)
        current += timedelta(days=1)
    
    if not dates:
        logger.info(
            "✅ No trading days between %s and %s (all weekends) for timescales %s; skipping.",
            start_date,
            end_date,
            timescales,
        )
        return
    
    # Process each timescale
    for timescale in timescales:
        config = TIMESCALE_CONFIG[timescale]
        
        processed = 0
        succeeded = 0
        failed = 0
        skipped = 0
        
        # Pre-check which symbols/dates need data
        symbols_needing_data = []
        async with get_async_session() as session:
            for symbol in symbols:
                symbol_upper = symbol.upper()
                # Check which dates need data for this symbol
                result = await session.execute(
                    text("""
                    SELECT DISTINCT date
                    FROM symbol_date_validation
                    WHERE symbol = :symbol
                      AND date BETWEEN :start_date AND :end_date
                      AND timescale = :timescale
                    """),
                    {
                        "symbol": symbol_upper,
                        "start_date": start_date,
                        "end_date": end_date,
                        "timescale": timescale
                    }
                )
                existing_dates = {row[0] for row in result}
                missing_dates = [d for d in dates if d not in existing_dates]
                if missing_dates:
                    symbols_needing_data.append((symbol, missing_dates))
        
        total_symbol_dates = sum(len(dates) for _, dates in symbols_needing_data)
        logger.info(
            "🔍 Date-range precheck: timescale=%s, symbols=%s, symbol-date slots needing data=%s",
            timescale,
            len(symbols_needing_data),
            total_symbol_dates,
        )
        
        if not symbols_needing_data:
            logger.info(
                "✅ All %s symbols already validated for %s between %s and %s; skipping.",
                len(symbols),
                timescale,
                start_date,
                end_date,
            )
            continue
        
        # Process with limited concurrency
        semaphore = asyncio.Semaphore(3)
        
        async def process_symbol_date(symbol: str, date: datetime.date):
            nonlocal processed, succeeded, failed
            
            async with semaphore:
                processed += 1
                try:
                    bars = await load_symbol_data(client, symbol, date, timescale, config)
                    if bars:
                        await insert_bars(bars)
                        await create_validation(symbol, date, timescale, bars)
                        succeeded += 1
                    else:
                        await create_validation(symbol, date, timescale, [])
                        succeeded += 1
                except Exception as e:
                    failed += 1
                    logger.error("%s %s %s: Failed - %s", symbol, date, timescale, e)
        
        # Create tasks for all symbol-date combinations
        tasks = []
        for symbol, dates_list in symbols_needing_data:
            for date in dates_list:
                tasks.append(process_symbol_date(symbol, date))
        
        await asyncio.gather(*tasks, return_exceptions=True)


async def load_comprehensive_data(init_db_flag: bool = True, api_key: Optional[str] = None):
    """
    Load comprehensive market data:
    - All timescales from yesterday
    - All timescales from today (up to current time)
    - 7 days of hourly bars
    - 5min/15min for last 7 days
    
    Args:
        init_db_flag: If True, initialize database (default True). Set to False if already initialized.
        api_key: Polygon API key. If None, reads from POLYGON_API_KEY env var.
    """
    # Initialize database if needed
    if init_db_flag:
        await init_db()
    
    await _log_market_data_diagnostics(context="load_comprehensive_data")

    # Initialize Polygon client
    if api_key is None:
        api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        raise ValueError("POLYGON_API_KEY environment variable not set")
    client = create_polygon_client(api_key)
    
    # Get symbols
    snapshot_data = fetch_snapshot_all(api_key)
    symbols = [ticker["ticker"] for ticker in snapshot_data if "ticker" in ticker]
    
    today = _get_et_today()
    
    # Define timescale groups so we can prioritize daily bars first
    daily_timescales = ['1day']
    intraday_timescales = ['1hour', '15min', '5min', '1min']

    # Phase 1: Load yesterday's daily data first
    yesterday = today - timedelta(days=1)
    
    await load_date_range_data(
        client, symbols, yesterday, yesterday,
        timescales=daily_timescales
    )
    
    # Phase 2: Load today's daily data
    await load_date_range_data(
        client, symbols, today, today,
        timescales=daily_timescales
    )
    
    # Phase 3: Load remaining intraday data for yesterday
    await load_date_range_data(
        client, symbols, yesterday, yesterday,
        timescales=intraday_timescales
    )

    # Phase 4: Load today's intraday data
    await load_date_range_data(
        client, symbols, today, today,
        timescales=intraday_timescales
    )

    # Phase 5: Load 7 days of hourly bars
    start_date = today - timedelta(days=7)
    await load_date_range_data(
        client, symbols, start_date, yesterday - timedelta(days=1),
        timescales=['1hour']
    )
    
    # Phase 6: Load 5min/15min for last 7 days
    start_date = today - timedelta(days=7)
    await load_date_range_data(
        client, symbols, start_date, yesterday - timedelta(days=1),
        timescales=['15min', '5min']
    )

    diagnostics = await _log_market_data_diagnostics(context="load_comprehensive_data")
    targeted_timescales: Set[str] = {"1day", "1hour", "15min", "5min", "1min"}
    additional_batches = await _backfill_gaps_with_client(
        client=client,
        gaps=diagnostics.get("gaps", []),
        allowed_dates=None,
        allowed_timescales=targeted_timescales,
        max_symbols_per_batch=250,
    )

    if additional_batches:
        logger.info(
            "Comprehensive backfill executed %s additional batches across %s",
            additional_batches,
            ", ".join(sorted(targeted_timescales)),
        )
        await _log_market_data_diagnostics(context="load_comprehensive_data_post_backfill")


# Make it importable
__all__ = ['load_comprehensive_data']

if __name__ == "__main__":
    asyncio.run(load_comprehensive_data())
