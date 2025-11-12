"""
System health monitoring framework.

Provides extensible health checks for market data, risk management, and other
critical system components.
"""

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone, date
from functools import partial
from typing import Dict, List, Optional

from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import SymbolDateValidation, MarketData, MarketDataBacktestLookup
from app.services.backtest.today_volume_fill import fill_missing_today_volume
from app.services.core.database import get_async_session
from app.services.core.time_context import get_current_time

logger = logging.getLogger("app.health_monitor")

class HealthCheckResult:
    """Result of a health check."""
    
    def __init__(
        self,
        check_name: str,
        is_healthy: bool,
        message: str,
        details: Optional[Dict] = None
    ):
        self.check_name = check_name
        self.is_healthy = is_healthy
        self.message = message
        self.details = details or {}
        self.timestamp = get_current_time()
    
    def __repr__(self) -> str:
        status = "✅ HEALTHY" if self.is_healthy else "❌ UNHEALTHY"
        return f"<HealthCheckResult({self.check_name}): {status} - {self.message}>"


class BaseHealthCheck(ABC):
    """Abstract base class for health checks."""
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"app.health_monitor.{name}")
    
    @abstractmethod
    async def check(self) -> HealthCheckResult:
        """
        Perform the health check.
        
        Returns:
            HealthCheckResult with status and details
        """
        pass


class BacktestDataHealthCheck(BaseHealthCheck):
    """
    Health check for backtest lookup table.
    
    Ensures we have pre-computed snapshot data for the previous trading day,
    allowing fast backtests without real-time population.
    
    Automatically triggers population for missing dates.
    """
    
    def __init__(self):
        super().__init__("backtest_data")
        self._populating: bool = False
        self._populating_metrics: bool = False
        self._last_population_task: Optional[asyncio.Task] = None
        self._last_metrics_task: Optional[asyncio.Task] = None
        self._population_progress: Dict = {}
        self._metrics_progress: Dict = {}
        self._volume_fill_in_progress: bool = False
        self._last_volume_fill_task: Optional[asyncio.Task] = None
        self._volume_fill_limit: int = int(os.getenv("TODAY_VOLUME_FILL_BATCH", "50000"))
    
    def _get_previous_trading_days(self, count: int = 7) -> List[date]:
        """Get the last N trading days (excluding weekends, but not holidays)."""
        today = get_current_time()
        if today.tzinfo is None:
            today = today.replace(tzinfo=timezone.utc)
        today_date = today.date()
        days: List[date] = []
        current = today_date - timedelta(days=1)
        
        while len(days) < count and current >= today_date - timedelta(days=30):
            # Skip weekends
            if current.weekday() < 5:  # 0-4 = Monday-Friday
                days.append(current)
            current -= timedelta(days=1)
        
        return days
    
    async def _check_coverage_for_dates(self, dates: List[date], session: AsyncSession) -> Dict:
        """Check lookup coverage for a list of dates."""
        coverage = {}
        
        for target_date in dates:
            start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
            end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
            
            result = await session.execute(text("""
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT(DISTINCT symbol) as symbols,
                    COUNT(DISTINCT lookup_time) as minutes,
                    COUNT(*) FILTER (WHERE today_volume IS NOT NULL) as rows_with_today_volume
                FROM market_data_backtest_lookup
                WHERE lookup_time >= :start_dt
                  AND lookup_time <= :end_dt
                  AND timescale = '1min';
            """), {"start_dt": start_dt, "end_dt": end_dt})
            
            row = result.first()
            if row:
                total_rows = row[0] or 0
                symbols = row[1] or 0
                minutes = row[2] or 0
                rows_with_today_volume = row[3] or 0
            else:
                total_rows = 0
                symbols = 0
                minutes = 0
                rows_with_today_volume = 0
            expected_minutes = 391
            minute_ratio = (minutes / expected_minutes) if expected_minutes else 0.0

            coverage[target_date.isoformat()] = {
                "has_data": total_rows > 0,
                "total_rows": total_rows,
                "symbols": symbols,
                "minutes": minutes,
                "expected_minutes": expected_minutes,
                "minute_ratio": minute_ratio,
                "rows_with_today_volume": rows_with_today_volume,
                "missing_today_volume": max(total_rows - rows_with_today_volume, 0),
                "has_today_volume": total_rows > 0 and rows_with_today_volume == total_rows,
            }
            
            self.logger.debug(
                "Lookup coverage %s: has_data=%s minutes=%s/%s ratio=%.3f today_volume=%s/%s",
                target_date.isoformat(),
                total_rows > 0,
                minutes,
                expected_minutes,
                minute_ratio,
                rows_with_today_volume,
                total_rows,
            )
        
        return coverage
    
    async def _check_metrics_coverage_for_dates(self, dates: List[date], session: AsyncSession) -> Dict:
        """Check stored metrics coverage for a list of dates based on validation flags."""
        coverage: Dict[str, Dict] = {
            target_date.isoformat(): {
                "has_validation": False,
                "validation_rows": 0,
                "metrics_completed_rows": 0,
                "metrics_ratio": 0.0,
            }
            for target_date in dates
        }
        
        if not dates:
            return coverage
        
        stmt = (
            select(
                SymbolDateValidation.date,
                func.count().label("validation_rows"),
                func.count().filter(SymbolDateValidation.background_metrics_calculated.is_(True)).label("metrics_rows"),
            )
            .where(
                SymbolDateValidation.date.in_(dates),
                SymbolDateValidation.timescale == "1day",
            )
            .group_by(SymbolDateValidation.date)
        )
        
        result = await session.execute(stmt)
        
        for row in result:
            date_value = row.date
            validation_rows = row.validation_rows or 0
            metrics_rows = row.metrics_rows or 0
            key = date_value.isoformat()
            coverage[key] = {
                "has_validation": validation_rows > 0,
                "validation_rows": validation_rows,
                "metrics_completed_rows": metrics_rows,
                "metrics_ratio": (metrics_rows / validation_rows) if validation_rows else 0.0,
            }
        
        return coverage
    
    async def _populate_missing_dates(self, dates: List[date]) -> None:
        """Populate lookup table for missing dates in background."""
        if self._populating:
            self.logger.debug("Population already in progress, skipping")
            return
        
        if os.getenv("BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED", "true").lower() != "true":
            self.logger.debug("Auto-populate disabled; skipping populate_missing_dates call")
            return
        
        self._populating = True
        try:
            from app.services.backtest.backtest_lookup_service import populate_lookup_for_date
            
            for target_date in dates:
                try:
                    self._population_progress[target_date.isoformat()] = {
                        "status": "populating",
                        "started_at": get_current_time().isoformat()
                    }
                    
                    self.logger.info(f"📊 Populating backtest lookup for {target_date}")
                    result = await populate_lookup_for_date(target_date, timescale='1min')
                    
                    self._population_progress[target_date.isoformat()] = {
                        "status": "completed",
                        "started_at": self._population_progress[target_date.isoformat()].get("started_at"),
                        "completed_at": get_current_time().isoformat(),
                        "result": result
                    }
                    
                    self.logger.info(f"✅ Completed population for {target_date}: {result['total_rows']:,} rows")
                    
                except Exception as e:
                    self.logger.error(f"❌ Failed to populate {target_date}: {e}", exc_info=True)
                    self._population_progress[target_date.isoformat()] = {
                        "status": "failed",
                        "started_at": self._population_progress.get(target_date.isoformat(), {}).get("started_at"),
                        "error": str(e)
                    }
                    
        finally:
            self._populating = False
    
    async def _populate_missing_metrics_via_loader(self, dates: List[date]) -> None:
        """Populate metrics for missing dates using BackgroundMetricsLoader."""
        if self._populating_metrics:
            self.logger.debug("Metrics population already in progress, skipping")
            return

        if os.getenv("BACKGROUND_METRICS_LOADER_ENABLED", "false").lower() != "true":
            self.logger.info("Background metrics loader disabled via BACKGROUND_METRICS_LOADER_ENABLED; skipping metrics population task")
            return

        self._populating_metrics = True
        try:
            # Import BackgroundMetricsLoader here to avoid circular imports
            from app.services.market.background_metrics_loader import BackgroundMetricsLoader

            # Track progress for all requested dates up front
            timestamp = get_current_time().isoformat()
            for target_date in dates:
                key = f"{target_date.isoformat()}_daily"
                self._metrics_progress[key] = {
                    "status": "populating",
                    "started_at": timestamp,
                }

            # Create loader instance and process once (service scans outstanding work per validation records)
            loader = BackgroundMetricsLoader()

            try:
                stats = await loader.process_daily_data()
            except Exception as exc:
                self.logger.error(
                    "❌ BackgroundMetricsLoader failed while populating metrics: %s",
                    exc,
                    exc_info=True,
                )
                for target_date in dates:
                    key = f"{target_date.isoformat()}_daily"
                    self._metrics_progress[key] = {
                        "status": "failed",
                        "started_at": timestamp,
                        "completed_at": get_current_time().isoformat(),
                        "error": str(exc),
                    }
                raise

            for target_date in dates:
                key = f"{target_date.isoformat()}_daily"
                self._metrics_progress[key] = {
                    "status": "completed",
                    "started_at": timestamp,
                    "completed_at": get_current_time().isoformat(),
                    "result": {
                        "symbols_scanned": stats.symbols_scanned,
                        "bars_processed": stats.bars_processed,
                        "metrics_calculated": stats.metrics_calculated,
                        "database_updates": stats.database_updates,
                        "errors": stats.errors,
                    },
                }

            self.logger.info(
                "✅ Daily metrics populated via BackgroundMetricsLoader: %d symbols scanned, %d bars processed",
                stats.symbols_scanned,
                stats.bars_processed,
            )

        finally:
            self._populating_metrics = False

    def _schedule_today_volume_backfill(self) -> None:
        """Kick off a background task to fill missing today_volume values."""
        if self._volume_fill_in_progress:
            self.logger.debug("Today volume backfill already running, skipping")
            return

        self.logger.info(
            "Scheduling today_volume backfill batch (limit=%s, include_today=%s)",
            self._volume_fill_limit,
            False,
        )

        async def runner() -> None:
            self._volume_fill_in_progress = True
            loop = asyncio.get_running_loop()
            try:
                result = await loop.run_in_executor(
                    None,
                    partial(
                        fill_missing_today_volume,
                        include_today=False,
                        limit=self._volume_fill_limit,
                    ),
                )
                updated = result.get("updated", 0)
                skipped = result.get("skipped_no_volume", 0)
                if updated > 0:
                    self.logger.info(
                        "🔄 Filled today_volume for %s lookup rows (skipped %s).",
                        updated,
                        skipped,
                    )
                else:
                    self.logger.debug(
                        "No today_volume rows filled (skipped %s).",
                        skipped,
                    )
            except Exception as exc:
                self.logger.error("Failed to backfill today_volume: %s", exc, exc_info=True)
            finally:
                self._volume_fill_in_progress = False

        self._last_volume_fill_task = asyncio.create_task(runner())
    
    async def check(self) -> HealthCheckResult:
        """Check if backtest lookup data and stored metrics exist, populate if missing."""
        try:
            async with get_async_session() as session:
                # Check last 7 trading days
                recent_dates = self._get_previous_trading_days(count=7)
                
                # Check backtest lookup coverage
                lookup_coverage = await self._check_coverage_for_dates(recent_dates, session)
                
                # Check stored metrics coverage
                metrics_coverage = await self._check_metrics_coverage_for_dates(recent_dates, session)
                
                # Find dates that need lookup population and whether validation exists
                missing_lookup_dates: List[date] = []
                volume_only_dates: List[date] = []
                blocked_lookup_dates: List[date] = []
                auto_populate_enabled = os.getenv("BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED", "true").lower() == "true"
                
                missing_today_volume_rows = 0
                for target_date in recent_dates:
                    date_str = target_date.isoformat()
                    info = lookup_coverage.get(date_str, {})
                    missing_today_volume_rows += info.get("missing_today_volume", 0)
                    has_data = info.get("has_data", False)
                    minute_ratio = info.get("minute_ratio", 0.0)
                    has_full_minutes = minute_ratio >= 1.0 if minute_ratio is not None else False
                    has_today_volume = info.get("has_today_volume", False)

                    if not has_data or not has_full_minutes:
                        missing_lookup_dates.append(target_date)
                    elif not has_today_volume:
                        volume_only_dates.append(target_date)

                if missing_today_volume_rows > 0:
                    self.logger.info(
                        "Detected %s lookup rows missing today_volume; scheduling backfill.",
                        missing_today_volume_rows,
                    )
                    self._schedule_today_volume_backfill()

                
                ready_lookup_dates: List[date] = []
                if missing_lookup_dates:
                    validation_stmt = (
                        select(
                            SymbolDateValidation.date,
                            func.count().label("validation_rows"),
                        )
                        .where(
                            SymbolDateValidation.date.in_(missing_lookup_dates),
                            SymbolDateValidation.timescale == "1min",
                        )
                        .group_by(SymbolDateValidation.date)
                    )
                    validation_result = await session.execute(validation_stmt)
                    validation_counts = {
                        row.date: row.validation_rows or 0 for row in validation_result
                    }
                    
                    for target_date in missing_lookup_dates:
                        if validation_counts.get(target_date, 0) > 0:
                            ready_lookup_dates.append(target_date)
                        else:
                            blocked_lookup_dates.append(target_date)
                            iso_key = target_date.isoformat()
                            self._population_progress[iso_key] = {
                                "status": "blocked_missing_validation",
                                "checked_at": get_current_time().isoformat(),
                            }
                
                if self.logger.isEnabledFor(logging.INFO):
                    self.logger.info(
                        "Lookup status summary: ready=%s, volume_only=%s, blocked=%s, missing_today_volume_rows=%s",
                        [d.isoformat() for d in ready_lookup_dates],
                        [d.isoformat() for d in volume_only_dates],
                        [d.isoformat() for d in blocked_lookup_dates],
                        missing_today_volume_rows,
                    )

                # Find dates that need metrics population
                missing_metrics_dates: List[date] = []
                blocked_metrics_dates: List[date] = []
                for target_date in recent_dates:
                    date_str = target_date.isoformat()
                    info = metrics_coverage.get(date_str, {})
                    has_validation = info.get("has_validation", False)
                    metrics_ratio = info.get("metrics_ratio", 0.0)
                    
                    if not has_validation:
                        blocked_metrics_dates.append(target_date)
                    elif metrics_ratio < 1.0:
                        missing_metrics_dates.append(target_date)
                
                # Trigger population for missing lookup data (non-blocking)
                if ready_lookup_dates and auto_populate_enabled and not self._populating:
                    self.logger.info(f"🔧 Found {len(ready_lookup_dates)} dates needing lookup population: {[d.isoformat() for d in ready_lookup_dates]}")
                    self._last_population_task = asyncio.create_task(
                        self._populate_missing_dates(ready_lookup_dates)
                    )
                elif ready_lookup_dates and not auto_populate_enabled:
                    self.logger.info(
                        "Backtest lookup auto-populate disabled via BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED; "
                        f"skipping dates: {[d.isoformat() for d in ready_lookup_dates]}"
                    )
                
                if blocked_lookup_dates:
                    self.logger.info(
                        "⏳ Lookup population deferred until validation present for dates: %s",
                        [d.isoformat() for d in blocked_lookup_dates],
                    )
                
                background_metrics_enabled = os.getenv("BACKGROUND_METRICS_LOADER_ENABLED", "false").lower() == "true"

                # Trigger population for missing metrics using BackgroundMetricsLoader (non-blocking)
                if missing_metrics_dates and background_metrics_enabled and not self._populating_metrics:
                    self.logger.info(f"🔧 Found {len(missing_metrics_dates)} dates needing metrics population: {[d.isoformat() for d in missing_metrics_dates]}")
                    self._last_metrics_task = asyncio.create_task(
                        self._populate_missing_metrics_via_loader(missing_metrics_dates)
                    )
                elif missing_metrics_dates and not background_metrics_enabled:
                    self.logger.info(
                        "Background metrics loader disabled via BACKGROUND_METRICS_LOADER_ENABLED; "
                        f"skipping auto-population for dates: {[d.isoformat() for d in missing_metrics_dates]}"
                    )
                
                if blocked_metrics_dates:
                    self.logger.info(
                        "⏳ Metrics backfill deferred until validation present for dates: %s",
                        [d.isoformat() for d in blocked_metrics_dates],
                    )
                
                # Check yesterday specifically for health status
                yesterday = recent_dates[0] if recent_dates else None
                yesterday_lookup = lookup_coverage.get(yesterday.isoformat() if yesterday else "", {})
                yesterday_metrics = metrics_coverage.get(yesterday.isoformat() if yesterday else "", {})
                
                # Overall health: both lookup and metrics should be complete for yesterday
                lookup_healthy = (
                    yesterday_lookup.get("has_data", False)
                    and yesterday_lookup.get("minute_ratio", 0.0) >= 1.0
                    and yesterday_lookup.get("has_today_volume", False)
                ) if yesterday else False
                metrics_healthy = (
                    yesterday_metrics.get("has_validation", False)
                    and yesterday_metrics.get("metrics_ratio", 0) >= 1.0
                ) if yesterday else False
                is_healthy = lookup_healthy and metrics_healthy
                
                # Prepare message
                if is_healthy:
                    lookup_complete = sum(
                        1
                        for info in lookup_coverage.values()
                        if info.get("has_data", False)
                        and info.get("minute_ratio", 0.0) >= 1.0
                        and info.get("has_today_volume", False)
                    )
                    metrics_complete = sum(
                        1
                        for info in metrics_coverage.values()
                        if info.get("has_validation", False) and info.get("metrics_ratio", 0) >= 1.0
                    )
                    message = f"Backtest data healthy: {lookup_complete}/{len(recent_dates)} lookup days, {metrics_complete}/{len(recent_dates)} metrics days sufficiently populated"
                else:
                    issues = []
                    if ready_lookup_dates or blocked_lookup_dates:
                        issues.append(
                            f"{len(ready_lookup_dates) + len(blocked_lookup_dates)} lookup date(s)"
                        )
                    if volume_only_dates:
                        issues.append(f"{len(volume_only_dates)} lookup volume-only date(s)")
                    if missing_metrics_dates:
                        issues.append(f"{len(missing_metrics_dates)} metrics date(s)")
                    if issues:
                        message = f"Populating: {', '.join(issues)}"
                    else:
                        message = f"Backtest data incomplete for {yesterday.isoformat() if yesterday else 'recent dates'}"
                
                return HealthCheckResult(
                    check_name=self.name,
                    is_healthy=is_healthy,
                    message=message,
                    details={
                        "lookup_coverage": lookup_coverage,
                        "metrics_coverage": metrics_coverage,
                        "missing_lookup_dates": [d.isoformat() for d in ready_lookup_dates],
                        "blocked_lookup_dates": [d.isoformat() for d in blocked_lookup_dates],
                        "lookup_volume_only_dates": [d.isoformat() for d in volume_only_dates],
                        "missing_metrics_dates": [d.isoformat() for d in missing_metrics_dates],
                        "blocked_metrics_dates": [d.isoformat() for d in blocked_metrics_dates],
                        "populating_lookup": self._populating,
                        "populating_metrics": self._populating_metrics,
                        "lookup_progress": self._population_progress,
                        "metrics_progress": self._metrics_progress,
                        "recent_dates_checked": [d.isoformat() for d in recent_dates],
                        "missing_today_volume_rows": missing_today_volume_rows,
                    }
                )
        
        except Exception as e:
            return HealthCheckResult(
                check_name=self.name,
                is_healthy=False,
                message=f"Error checking backtest data: {e}",
                details={"error": str(e)}
            )


class RiskManagementHealthCheck(BaseHealthCheck):
    """
    Placeholder for future risk management health checks.
    
    Could check:
    - Position limits
    - Exposure thresholds
    - Account balances
    - etc.
    """
    
    def __init__(self):
        super().__init__("risk_management")
    
    async def check(self) -> HealthCheckResult:
        """Placeholder - always returns healthy for now."""
        return HealthCheckResult(
            check_name=self.name,
            is_healthy=True,
            message="Risk management checks not yet implemented",
            details={}
        )


class MarketDataLoaderHealthCheck(BaseHealthCheck):
    """
    Health check that inspects market data coverage/validation gaps and backfills missing slices.
    
    Uses the loader diagnostics to detect unvalidated symbol/date/timescale combinations and
    schedules targeted gap fills in the background so long-running data repairs do not block
    the main health monitoring loop.
    """
    
    def __init__(self):
        super().__init__("market_data_loader")
        self._last_run: Optional[datetime] = None
        self._last_completed: Optional[datetime] = None
        self._running_task: Optional[asyncio.Task] = None
        self._last_error: Optional[str] = None
        self._last_report: Optional[dict] = None
    
    async def _run_loader_background(self) -> None:
        """Run the comprehensive market data loader in the background."""
        try:
            # Import the loader function
            import importlib.util
            import os
            
            script_path = os.path.join(
                os.path.dirname(__file__), '..', '..', '..', 'scripts', 'market_data_loader.py'
            )
            spec = importlib.util.spec_from_file_location("market_data_loader", script_path)
            market_data_loader_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(market_data_loader_module)
            
            # Import core API key
            import app.core as core_module
            
            self.logger.debug("Running market data diagnostics for health monitor...")
            diagnostics = await market_data_loader_module._log_market_data_diagnostics(
                context="health_monitor"
            )
            gaps = diagnostics.get("gaps", [])

            targeted_timescales = {"1day", "1hour", "15min", "5min", "1min"}
            if gaps:
                batches = await market_data_loader_module.fill_detected_gaps(
                    api_key=core_module.API_KEY,
                    gaps=gaps,
                    allowed_timescales=targeted_timescales,
                    max_symbols_per_batch=250,
                )
                if batches:
                    self.logger.info(
                        "Health monitor backfill executed %s batch(es) across %s",
                        batches,
                        ", ".join(sorted(targeted_timescales)),
                    )
                    diagnostics = await market_data_loader_module._log_market_data_diagnostics(
                        context="health_monitor_post_backfill"
                    )

            self._last_report = diagnostics
            self._last_completed = get_current_time()
            self._last_error = None
            self.logger.info("Market data loader health check completed successfully")
            
        except Exception as e:
            self._last_error = str(e)
            self.logger.error(f"Market data loader failed: {e}", exc_info=True)
        finally:
            self._running_task = None
    
    async def check(self) -> HealthCheckResult:
        """Check status and start background loader if not already running."""
        # Check if a task is already running
        if self._running_task is not None and not self._running_task.done():
            return HealthCheckResult(
                check_name=self.name,
                is_healthy=True,
                message="Market data loader is running in background",
                details={
                    "status": "running",
                    "started_at": self._last_run.isoformat() if self._last_run else None,
                    "last_completed": self._last_completed.isoformat() if self._last_completed else None,
                    "last_error": self._last_error,
                    "outstanding_gaps": len((self._last_report or {}).get("gaps", []))
                }
            )
        
        # Start new background task
        self._last_run = get_current_time()
        self._running_task = asyncio.create_task(self._run_loader_background())
        
        return HealthCheckResult(
            check_name=self.name,
            is_healthy=True,
            message="Market data loader started in background",
            details={
                "status": "started",
                "started_at": self._last_run.isoformat(),
                "last_completed": self._last_completed.isoformat() if self._last_completed else None,
                "last_error": self._last_error,
                "last_report": {
                    "gap_count": len((self._last_report or {}).get("gaps", [])),
                    "table": (self._last_report or {}).get("table"),
                },
            }
        )


class HealthMonitorService:
    """
    Service that runs health checks periodically.
    
    Manages a collection of health checks and runs them on a schedule.
    """
    
    def __init__(self, interval_seconds: int = 300):
        """
        Initialize health monitor.
        
        Args:
            interval_seconds: How often to run health checks (default 5 minutes)
        """
        self.interval_seconds = interval_seconds
        self.checks: List[BaseHealthCheck] = []
        self.task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger("app.health_monitor")
    
    def register_check(self, check: BaseHealthCheck) -> None:
        """Register a health check to run periodically."""
        self.checks.append(check)
        self.logger.debug(f"Registered health check: {check.name}")
    
    def get_check(self, name: str) -> Optional[BaseHealthCheck]:
        """Get a registered health check by name."""
        for check in self.checks:
            if check.name == name:
                return check
        return None
    
    async def run_all_checks(self) -> List[HealthCheckResult]:
        """Run all registered health checks and return results."""
        results = []
        for check in self.checks:
            try:
                result = await check.check()
                results.append(result)
                
                # Log results (only warnings, not successes)
                if not result.is_healthy:
                    self.logger.warning(f"❌ {result.check_name}: {result.message}")
                    if result.details:
                        self.logger.warning(f"   Details: {result.details}")
                        
            except Exception as e:
                self.logger.error(f"Health check {check.name} failed: {e}", exc_info=True)
                results.append(HealthCheckResult(
                    check_name=check.name,
                    is_healthy=False,
                    message=f"Check failed with error: {str(e)}",
                    details={"error": str(e)}
                ))
        
        return results
    
    async def start(self) -> None:
        """Start the health monitor background task."""
        if self.task and not self.task.done():
            self.logger.warning("Health monitor already running")
            return
        
        self.logger.debug(f"Starting health monitor (interval: {self.interval_seconds}s)")
        self.task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self) -> None:
        """Stop the health monitor background task."""
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.logger.info("Health monitor stopped")
    
    async def _monitor_loop(self) -> None:
        """Main monitoring loop."""
        while True:
            try:
                await self.run_all_checks()
            except Exception as e:
                self.logger.error(f"Error in health monitor loop: {e}", exc_info=True)
            
            await asyncio.sleep(self.interval_seconds)


# Global health monitor instance
_health_monitor: Optional[HealthMonitorService] = None


def get_health_monitor() -> Optional[HealthMonitorService]:
    """Get the global health monitor instance."""
    return _health_monitor


def initialize_health_monitor(interval_seconds: int = 300) -> HealthMonitorService:
    """
    Initialize and configure the global health monitor.
    
    Args:
        interval_seconds: How often to run health checks
        
    Returns:
        Configured HealthMonitorService instance
    """
    global _health_monitor
    
    if _health_monitor is None:
        _health_monitor = HealthMonitorService(interval_seconds=interval_seconds)
        
        # Register default checks
        _health_monitor.register_check(MarketDataHealthCheck(lookback_days=30))
        _health_monitor.register_check(RiskManagementHealthCheck())
        _health_monitor.register_check(BacktestDataHealthCheck())
        _health_monitor.register_check(MarketDataLoaderHealthCheck())
        
        logger.debug("Health monitor initialized with default checks")
    
    return _health_monitor

