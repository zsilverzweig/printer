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
from app.services.market.metrics_calculator import METRIC_FIELDS, METRIC_TIMESCALES


_EASTERN_TIMEZONE = ZoneInfo("America/New_York")
_METRICS_COMPLETENESS_THRESHOLD = 0.9


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


async def _fetch_metrics_summary(
    dates: Sequence[date],
    timescales: Sequence[str],
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Aggregate technical metrics coverage for the requested dates/timescales."""
    if not dates or not timescales:
        return {}

    relevant_timescales = [ts for ts in timescales if ts in METRIC_TIMESCALES]
    if not relevant_timescales:
        return {}

    start_date = min(dates)
    end_date = max(dates)
    start_ts = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_ts = datetime.combine(end_date + timedelta(days=1), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )

    metric_condition = " AND ".join(f"{field} IS NOT NULL" for field in METRIC_FIELDS)
    summary: Dict[str, Dict[str, Dict[str, Any]]] = {}

    async with get_async_session() as session:
        result = await session.execute(
            text(
                f"""
                SELECT
                    DATE(time) AS day,
                    timescale,
                    COUNT(*) AS total_rows,
                    COUNT(*) FILTER (WHERE {metric_condition}) AS metric_rows,
                    COUNT(DISTINCT symbol) AS symbol_count
                FROM market_data
                WHERE timescale = ANY(:timescales)
                  AND time >= :start_ts
                  AND time < :end_ts
                GROUP BY day, timescale
                """
            ),
            {
                "timescales": relevant_timescales,
                "start_ts": start_ts,
                "end_ts": end_ts,
            },
        )

        for row in result:
            mapping = row._mapping
            day: date = mapping["day"]
            timescale = mapping["timescale"]
            total_rows = int(mapping["total_rows"] or 0)
            metric_rows = int(mapping["metric_rows"] or 0)
            ratio = (metric_rows / total_rows) if total_rows else 0.0

            summary.setdefault(day.isoformat(), {})[timescale] = {
                "has_data": total_rows > 0,
                "total_rows": total_rows,
                "metric_rows": metric_rows,
                "metric_ratio": ratio,
                "symbol_count": int(mapping["symbol_count"] or 0),
            }

    return summary


async def _fetch_backtest_lookup_summary(
    dates: Sequence[date],
    timescales: Sequence[str],
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """Aggregate backtest lookup coverage for the requested dates/timescales."""
    if not dates or not timescales:
        return {}

    # Only support 1min for backtest lookup
    relevant_timescales = [ts for ts in timescales if ts == "1min"]
    if not relevant_timescales:
        return {}

    start_date = min(dates)
    end_date = max(dates)
    start_ts = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_ts = datetime.combine(end_date + timedelta(days=1), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )

    summary: Dict[str, Dict[str, Dict[str, Any]]] = {}

    async with get_async_session() as session:
        result = await session.execute(
            text(
                """
                SELECT
                    DATE(lookup_time) AS day,
                    timescale,
                    COUNT(*) AS total_rows,
                    COUNT(DISTINCT symbol) AS symbol_count,
                    COUNT(DISTINCT lookup_time) AS minute_count
                FROM market_data_backtest_lookup
                WHERE timescale = ANY(:timescales)
                  AND lookup_time >= :start_ts
                  AND lookup_time < :end_ts
                GROUP BY day, timescale
                """
            ),
            {
                "timescales": relevant_timescales,
                "start_ts": start_ts,
                "end_ts": end_ts,
            },
        )

        for row in result:
            mapping = row._mapping
            day: date = mapping["day"]
            timescale = mapping["timescale"]
            minute_count = int(mapping["minute_count"] or 0)

            summary.setdefault(day.isoformat(), {})[timescale] = {
                "has_data": minute_count > 0,
                "total_rows": int(mapping["total_rows"] or 0),
                "symbol_count": int(mapping["symbol_count"] or 0),
                "minute_count": minute_count,
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
        metrics = await _fetch_metrics_summary(recent_days, timescales)
        backtest_lookup = await _fetch_backtest_lookup_summary(recent_days, timescales)

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
            "Metrics",
            "Backtest Lookup",
        ]

        def fmt_ts(ts_value: Optional[datetime]) -> str:
            if not ts_value:
                return "--"
            return ts_value.astimezone(timezone.utc).strftime("%H:%M")

        def fmt_metrics_status(day_key: str, timescale_key: str) -> str:
            if timescale_key not in METRIC_TIMESCALES:
                return "--"
            entry = metrics.get(day_key, {}).get(timescale_key)
            if not entry:
                return "No data"
            if not entry.get("has_data"):
                return "No data"
            ratio = entry.get("metric_ratio", 0.0)
            total = entry.get("total_rows", 0)
            metric_rows = entry.get("metric_rows", 0)
            status = "OK" if ratio >= _METRICS_COMPLETENESS_THRESHOLD else "Partial"
            return f"{status} {ratio * 100:.0f}% ({metric_rows}/{total})"

        def fmt_lookup_status(day_key: str, timescale_key: str) -> str:
            if timescale_key != "1min":
                return "--"
            entry = backtest_lookup.get(day_key, {}).get(timescale_key)
            if not entry:
                return "No data"
            if not entry.get("has_data"):
                return "No data"
            total_rows = entry.get("total_rows", 0)
            symbols = entry.get("symbol_count", 0)
            minutes = entry.get("minute_count", 0)
            return f"{total_rows:,} rows ({symbols} sym, {minutes}m)"

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
                        fmt_metrics_status(day_iso, timescale),
                        fmt_lookup_status(day_iso, timescale),
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
                            "metrics": metrics.get(day.isoformat(), {}).get(timescale, {}),
                            "backtest_lookup": backtest_lookup.get(day.isoformat(), {}).get(timescale, {}),
                        }
                    )

        return {
            "table": table,
            "coverage": coverage,
            "validation": validation,
            "metrics": metrics,
            "backtest_lookup": backtest_lookup,
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


async def _log_market_data_diagnostics(
    context: str, 
    lookback_days: int = 5,
    log_table: bool = True
) -> Dict[str, Any]:
    """
    Log market data vs validation coverage for recent days.
    
    Args:
        context: Context label for the log message
        lookback_days: Number of trading days to look back
        log_table: If True, log the full diagnostics table (expensive). If False, only compute gaps.
    """
    try:
        diagnostics = await detect_market_data_gaps(lookback_days=lookback_days)
        
        if log_table:
            logger.info(
                "Market data coverage diagnostics (%s):\n%s",
                context,
                diagnostics.get("table", "No data"),
            )
        else:
            gap_count = len(diagnostics.get("gaps", []))
            if gap_count > 0:
                logger.info(
                    "Market data diagnostics (%s): Found %s gap(s) to fill",
                    context,
                    gap_count,
                )

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
    # Generate date range (include weekends for comprehensive coverage)
    dates = []
    current = start_date
    while current <= end_date:
        dates.append(current)
        current += timedelta(days=1)

    # Skip dates that are in the future relative to the current time context
    now_utc = get_current_time()
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    now_et = now_utc.astimezone(_EASTERN_TIMEZONE)
    current_trading_day = now_et.date()
    dates = [d for d in dates if d <= current_trading_day]
    
    # Process each timescale
    for timescale in timescales:
        if timescale == '1day':
            timescale_dates = list(dates)
        else:
            timescale_dates = list(dates)

        if not timescale_dates:
            continue

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
                missing_dates = [d for d in timescale_dates if d not in existing_dates]
                if missing_dates:
                    symbols_needing_data.append((symbol, missing_dates))
        
        if not symbols_needing_data:
            continue
        
        # Process with limited concurrency
        semaphore = asyncio.Semaphore(3)
        
        async def process_symbol_date(symbol: str, date: datetime.date):
            nonlocal processed, succeeded, failed, skipped
            
            async with semaphore:
                processed += 1
                try:
                    bars = await load_symbol_data(client, symbol, date, timescale, config)
                    # Drop any bars that are in the future or outside the requested date
                    bars = [
                        bar for bar in bars
                        if bar.time <= now_utc and bar.time.date() == date
                    ]
                    if bars:
                        await insert_bars(bars)

                    if bars:
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


async def load_comprehensive_data(
    init_db_flag: bool = True, 
    api_key: Optional[str] = None,
    show_diagnostics: bool = False
):
    """
    Load comprehensive market data:
    - All timescales from yesterday
    - All timescales from today (up to current time)
    - 7 days of hourly bars
    - 5min/15min for last 7 days
    
    Args:
        init_db_flag: If True, initialize database (default True). Set to False if already initialized.
        api_key: Polygon API key. If None, reads from POLYGON_API_KEY env var.
        show_diagnostics: If True, show diagnostics before and after loading (default False for performance).
    """
    # Initialize database if needed
    if init_db_flag:
        await init_db()
    
    # Optional initial diagnostics (expensive, so off by default)
    if show_diagnostics:
        await _log_market_data_diagnostics(context="load_comprehensive_data_initial")

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

    # Optional final diagnostics and gap backfill
    # Only run if show_diagnostics is True to avoid blocking
    if show_diagnostics:
        diagnostics = await _log_market_data_diagnostics(context="load_comprehensive_data_final")
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
    else:
        logger.info("✅ Market data loading complete (diagnostics skipped for performance)")


# Make it importable
__all__ = ['load_comprehensive_data']

if __name__ == "__main__":
    asyncio.run(load_comprehensive_data())
