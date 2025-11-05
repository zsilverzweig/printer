"""
System health monitoring framework.

Provides extensible health checks for market data, risk management, and other
critical system components.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone, date

from app.services.core.time_context import get_current_time
from typing import Dict, List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import SymbolDateValidation, MarketData, MarketDataBacktestLookup
from app.services.core.database import get_async_session

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


class MarketDataHealthCheck(BaseHealthCheck):
    """
    Health check for market data loading and validation coverage.
    
    Philosophy: We check that we're ATTEMPTING to load data for all symbols
    and dates, not that the data is complete (which may not exist on Polygon).
    
    Checks:
    - Data freshness: Is recent data being ingested?
    - Validation coverage: Have we attempted to load data for most active symbols?
    - Missing validations: Are there symbols/dates we haven't tried to load yet?
    
    Note: We do NOT flag incomplete validations (is_complete=FALSE) as problems.
    If we tried to load data and got incomplete results, that's all Polygon has.
    """
    
    def __init__(self, lookback_days: int = 30):
        super().__init__("market_data")
        self.lookback_days = lookback_days
    
    async def check(self) -> HealthCheckResult:
        """Check market data health."""
        try:
            async with get_async_session() as session:
                # Check 1: Data freshness - do we have recent minute bars?
                freshness_check = await self._check_data_freshness(session)
                
                # Check 2: Validation coverage - how complete is our data?
                validation_check = await self._check_validation_coverage(session)
                
                # Check 3: Gap detection - are there missing dates?
                gap_check = await self._check_for_gaps(session)
                
                # Aggregate results
                all_healthy = (
                    freshness_check["is_healthy"] and
                    validation_check["is_healthy"] and
                    gap_check["is_healthy"]
                )
                
                details = {
                    "freshness": freshness_check,
                    "validation": validation_check,
                    "gaps": gap_check
                }
                
                if all_healthy:
                    message = f"Market data healthy: {validation_check['validated_symbols']} symbols validated, {validation_check['coverage_pct']:.1f}% coverage"
                else:
                    issues = []
                    if not freshness_check["is_healthy"]:
                        issues.append("stale data")
                    if not validation_check["is_healthy"]:
                        issues.append("low validation coverage")
                    if not gap_check["is_healthy"]:
                        issues.append("missing validation records")
                    message = f"Market data issues: {', '.join(issues)}"
                
                return HealthCheckResult(
                    check_name=self.name,
                    is_healthy=all_healthy,
                    message=message,
                    details=details
                )
                
        except Exception as e:
            self.logger.error(f"Health check failed: {e}", exc_info=True)
            return HealthCheckResult(
                check_name=self.name,
                is_healthy=False,
                message=f"Health check error: {str(e)}",
                details={"error": str(e)}
            )
    
    async def _check_data_freshness(self, session: AsyncSession) -> Dict:
        """Check if we have recent data (within last 15 minutes during market hours)."""
        try:
            # Get most recent bar timestamp
            result = await session.execute(
                text("SELECT MAX(time) as last_bar FROM market_data WHERE timescale = '1min'")
            )
            row = result.fetchone()
            
            if not row or not row[0]:
                return {
                    "is_healthy": False,
                    "message": "No market data found in database",
                    "last_bar": None
                }
            
            last_bar = row[0]
            now = get_current_time()
            age_minutes = (now - last_bar).total_seconds() / 60
            
            # During market hours (9:30 AM - 4:00 PM ET, Mon-Fri), data should be recent
            # For now, just check if data is less than 24 hours old
            is_fresh = age_minutes < (24 * 60)
            
            return {
                "is_healthy": is_fresh,
                "message": f"Last bar: {last_bar.isoformat()} ({age_minutes:.0f} minutes ago)",
                "last_bar": last_bar.isoformat(),
                "age_minutes": age_minutes
            }
            
        except Exception as e:
            self.logger.error(f"Freshness check failed: {e}")
            return {
                "is_healthy": False,
                "message": f"Freshness check error: {str(e)}"
            }
    
    async def _check_validation_coverage(self, session: AsyncSession) -> Dict:
        """
        Check how many symbols have validation records (attempted loads).
        
        This checks that we're TRYING to load data for symbols, not whether
        the data is complete (which may not be available from Polygon).
        """
        try:
            cutoff_date = get_current_time().date() - timedelta(days=self.lookback_days)
            
            # Count symbols with ANY validation records in lookback period
            result = await session.execute(
                text("""
                    SELECT 
                        COUNT(DISTINCT symbol) as validated_symbols,
                        COUNT(*) as total_validations,
                        COUNT(CASE WHEN is_complete THEN 1 END) as complete_validations
                    FROM symbol_date_validation
                    WHERE date >= :cutoff_date
                """),
                {"cutoff_date": cutoff_date}
            )
            row = result.fetchone()
            
            if not row:
                return {
                    "is_healthy": False,
                    "message": "No validation data found",
                    "validated_symbols": 0,
                    "total_validations": 0
                }
            
            validated_symbols = row[0] or 0
            total_validations = row[1] or 0
            complete_validations = row[2] or 0
            
            # Count total active symbols in ticker_details
            result = await session.execute(
                text("""
                    SELECT COUNT(*)
                    FROM ticker_details
                    WHERE type IN ('CS', 'ETF')
                      AND active = true
                """)
            )
            total_active_symbols = result.scalar() or 0
            
            # Healthy if we have validation records for at least 90% of active symbols
            coverage_pct = (validated_symbols / total_active_symbols * 100) if total_active_symbols > 0 else 0
            is_healthy = coverage_pct >= 90.0
            
            completion_rate = (complete_validations / total_validations * 100) if total_validations > 0 else 0
            
            return {
                "is_healthy": is_healthy,
                "message": f"{validated_symbols}/{total_active_symbols} active symbols validated ({coverage_pct:.1f}% coverage, {completion_rate:.1f}% complete)",
                "validated_symbols": validated_symbols,
                "total_active_symbols": total_active_symbols,
                "coverage_pct": coverage_pct,
                "total_validations": total_validations,
                "complete_validations": complete_validations,
                "completion_rate": completion_rate,
                "lookback_days": self.lookback_days
            }
            
        except Exception as e:
            self.logger.error(f"Validation coverage check failed: {e}")
            return {
                "is_healthy": False,
                "message": f"Validation check error: {str(e)}"
            }
    
    async def _check_for_gaps(self, session: AsyncSession) -> Dict:
        """
        Check for missing validation records (dates we haven't tried to load).
        
        NOTE: We intentionally DO NOT flag incomplete validations (is_complete=FALSE)
        as problems. If we tried to load data and got incomplete results, that's all
        Polygon has for that symbol/date. No point retrying or flagging as unhealthy.
        
        We only flag:
        1. Symbols with NO validation records at all
        2. Trading days with missing validation records
        """
        try:
            cutoff_date = get_current_time().date() - timedelta(days=self.lookback_days)
            today = get_current_time().date()
            
            # Check 1: Find active symbols with NO validation records at all
            result = await session.execute(
                text("""
                    SELECT td.symbol
                    FROM ticker_details td
                    WHERE td.type IN ('CS', 'ETF')
                      AND td.active = true
                      AND td.symbol NOT IN (
                          SELECT DISTINCT symbol 
                          FROM symbol_date_validation
                      )
                    LIMIT 100
                """)
            )
            
            missing_symbols = [row[0] for row in result]
            
            # Check 2: Find recent trading days with no validation records
            # (Market closed on weekends, so only check weekdays)
            result = await session.execute(
                text("""
                    SELECT DISTINCT date
                    FROM symbol_date_validation
                    WHERE date >= :cutoff_date
                    ORDER BY date DESC
                """),
                {"cutoff_date": cutoff_date}
            )
            
            validated_dates = {row[0] for row in result}
            
            # Generate expected trading days (exclude weekends)
            missing_dates = []
            current_date = cutoff_date
            while current_date < today:
                # Skip weekends (Monday=0, Sunday=6)
                if current_date.weekday() < 5 and current_date not in validated_dates:
                    missing_dates.append(current_date)
                current_date += timedelta(days=1)
            
            # Overall health assessment
            total_issues = len(missing_symbols) + len(missing_dates)
            is_healthy = total_issues == 0
            
            # Build message
            issues = []
            if missing_symbols:
                issues.append(f"{len(missing_symbols)} symbols never loaded")
            if missing_dates:
                issues.append(f"{len(missing_dates)} dates not validated")
            
            if issues:
                message = "Missing validation records: " + ", ".join(issues)
            else:
                message = "All expected validation records present"
            
            return {
                "is_healthy": is_healthy,
                "message": message,
                "missing_symbols_count": len(missing_symbols),
                "missing_symbols": missing_symbols[:10],  # First 10 for details
                "missing_dates_count": len(missing_dates),
                "missing_dates": [d.isoformat() for d in missing_dates[:10]]  # First 10 for details
            }
            
        except Exception as e:
            self.logger.error(f"Gap check failed: {e}")
            return {
                "is_healthy": False,
                "message": f"Gap check error: {str(e)}"
            }


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
        self._populating_indicators: bool = False
        self._last_population_task: Optional[asyncio.Task] = None
        self._last_indicators_task: Optional[asyncio.Task] = None
        self._population_progress: Dict = {}
        self._indicators_progress: Dict = {}
    
    def _get_previous_trading_days(self, count: int = 7) -> List[date]:
        """Get the last N trading days (excluding weekends, but not holidays)."""
        today = datetime.now(timezone.utc).date()
        days = []
        current = today - timedelta(days=1)
        
        while len(days) < count and current >= today - timedelta(days=30):
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
                    COUNT(DISTINCT lookup_time) as minutes
                FROM market_data_backtest_lookup
                WHERE lookup_time >= :start_dt
                  AND lookup_time <= :end_dt
                  AND timescale = '1min';
            """), {"start_dt": start_dt, "end_dt": end_dt})
            
            row = result.first()
            total_rows = row[0]
            symbols = row[1]
            minutes = row[2]
            
            # We expect ~391 minutes (9:30-16:00) and substantial data
            is_complete = total_rows > 10000 and minutes >= 300
            
            coverage[target_date.isoformat()] = {
                "has_data": total_rows > 0,
                "is_complete": is_complete,
                "total_rows": total_rows,
                "symbols": symbols,
                "minutes": minutes,
                "expected_minutes": 391
            }
        
        return coverage
    
    async def _check_indicators_coverage_for_dates(self, dates: List[date], session: AsyncSession) -> Dict:
        """Check technical indicators coverage for a list of dates."""
        coverage = {}
        
        for target_date in dates:
            start_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=9, minute=30, tzinfo=timezone.utc)
            end_dt = datetime.combine(target_date, datetime.min.time()).replace(hour=16, minute=0, tzinfo=timezone.utc)
            
            # Check for 1min timescale (primary for backtesting)
            result = await session.execute(text("""
                SELECT 
                    COUNT(*) as total_rows,
                    COUNT(DISTINCT symbol) as symbols,
                    COUNT(DISTINCT time) as minutes
                FROM technical_indicators
                WHERE time >= :start_dt
                  AND time <= :end_dt
                  AND timescale = '1min';
            """), {"start_dt": start_dt, "end_dt": end_dt})
            
            row = result.first()
            total_rows = row[0]
            symbols = row[1]
            minutes = row[2]
            
            # We expect substantial data
            is_complete = total_rows > 10000 and minutes >= 300
            
            coverage[target_date.isoformat()] = {
                "has_data": total_rows > 0,
                "is_complete": is_complete,
                "total_rows": total_rows,
                "symbols": symbols,
                "minutes": minutes,
                "expected_minutes": 391
            }
        
        return coverage
    
    async def _populate_missing_dates(self, dates: List[date]) -> None:
        """Populate lookup table for missing dates in background."""
        if self._populating:
            self.logger.debug("Population already in progress, skipping")
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
    
    async def _populate_missing_indicators(self, dates: List[date], timescale: str = '1min') -> None:
        """Populate technical indicators for missing dates in background."""
        if self._populating_indicators:
            self.logger.debug("Indicators population already in progress, skipping")
            return
        
        self._populating_indicators = True
        try:
            from app.services.backtest.technical_indicators_service import populate_indicators_for_date
            
            for target_date in dates:
                try:
                    key = f"{target_date.isoformat()}_{timescale}"
                    self._indicators_progress[key] = {
                        "status": "populating",
                        "started_at": get_current_time().isoformat()
                    }
                    
                    self.logger.info(f"📊 Populating technical indicators for {target_date} ({timescale})")
                    result = await populate_indicators_for_date(target_date, timescale=timescale)
                    
                    self._indicators_progress[key] = {
                        "status": "completed",
                        "started_at": self._indicators_progress[key].get("started_at"),
                        "completed_at": get_current_time().isoformat(),
                        "result": result
                    }
                    
                    self.logger.info(f"✅ Completed indicators population for {target_date}: {result['total_rows']:,} rows")
                    
                except Exception as e:
                    self.logger.error(f"❌ Failed to populate indicators for {target_date}: {e}", exc_info=True)
                    key = f"{target_date.isoformat()}_{timescale}"
                    self._indicators_progress[key] = {
                        "status": "failed",
                        "started_at": self._indicators_progress.get(key, {}).get("started_at"),
                        "error": str(e)
                    }
                    
        finally:
            self._populating_indicators = False
    
    async def check(self) -> HealthCheckResult:
        """Check if backtest lookup data and technical indicators exist, populate if missing."""
        try:
            async with get_async_session() as session:
                # Check last 7 trading days
                recent_dates = self._get_previous_trading_days(count=7)
                
                # Check backtest lookup coverage
                lookup_coverage = await self._check_coverage_for_dates(recent_dates, session)
                
                # Check technical indicators coverage
                indicators_coverage = await self._check_indicators_coverage_for_dates(recent_dates, session)
                
                # Find dates that need lookup population
                missing_lookup_dates = []
                for date_str, info in lookup_coverage.items():
                    if not info["is_complete"]:
                        target_date = datetime.fromisoformat(date_str).date()
                        missing_lookup_dates.append(target_date)
                
                # Find dates that need indicators population
                missing_indicators_dates = []
                for date_str, info in indicators_coverage.items():
                    if not info["is_complete"]:
                        target_date = datetime.fromisoformat(date_str).date()
                        missing_indicators_dates.append(target_date)
                
                # Trigger population for missing lookup data (non-blocking)
                if missing_lookup_dates and not self._populating:
                    self.logger.info(f"🔧 Found {len(missing_lookup_dates)} dates needing lookup population: {[d.isoformat() for d in missing_lookup_dates]}")
                    self._last_population_task = asyncio.create_task(
                        self._populate_missing_dates(missing_lookup_dates)
                    )
                
                # Trigger population for missing indicators (non-blocking)
                if missing_indicators_dates and not self._populating_indicators:
                    self.logger.info(f"🔧 Found {len(missing_indicators_dates)} dates needing indicators population: {[d.isoformat() for d in missing_indicators_dates]}")
                    self._last_indicators_task = asyncio.create_task(
                        self._populate_missing_indicators(missing_indicators_dates, timescale='1min')
                    )
                
                # Check yesterday specifically for health status
                yesterday = recent_dates[0] if recent_dates else None
                yesterday_lookup = lookup_coverage.get(yesterday.isoformat() if yesterday else "", {})
                yesterday_indicators = indicators_coverage.get(yesterday.isoformat() if yesterday else "", {})
                
                # Overall health: both lookup and indicators should be complete for yesterday
                lookup_healthy = yesterday_lookup.get("is_complete", False) if yesterday else False
                indicators_healthy = yesterday_indicators.get("is_complete", False) if yesterday else False
                is_healthy = lookup_healthy and indicators_healthy
                
                # Prepare message
                if is_healthy:
                    lookup_complete = sum(1 for info in lookup_coverage.values() if info.get("is_complete", False))
                    indicators_complete = sum(1 for info in indicators_coverage.values() if info.get("is_complete", False))
                    message = f"Backtest data healthy: {lookup_complete}/{len(recent_dates)} lookup days, {indicators_complete}/{len(recent_dates)} indicators days complete"
                else:
                    issues = []
                    if missing_lookup_dates:
                        issues.append(f"{len(missing_lookup_dates)} lookup date(s)")
                    if missing_indicators_dates:
                        issues.append(f"{len(missing_indicators_dates)} indicators date(s)")
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
                        "indicators_coverage": indicators_coverage,
                        "missing_lookup_dates": [d.isoformat() for d in missing_lookup_dates],
                        "missing_indicators_dates": [d.isoformat() for d in missing_indicators_dates],
                        "populating_lookup": self._populating,
                        "populating_indicators": self._populating_indicators,
                        "lookup_progress": self._population_progress,
                        "indicators_progress": self._indicators_progress,
                        "recent_dates_checked": [d.isoformat() for d in recent_dates]
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
    Health check that runs the Market Data Loader to ensure comprehensive data coverage.
    
    Runs the loader in the background (non-blocking) to avoid blocking other health checks.
    
    Loads:
    - All timescales from yesterday
    - All timescales from today (up to current time)
    - 7 days of hourly bars
    - 5min/15min for last 7 days
    """
    
    def __init__(self):
        super().__init__("market_data_loader")
        self._last_run: Optional[datetime] = None
        self._last_completed: Optional[datetime] = None
        self._running_task: Optional[asyncio.Task] = None
        self._last_error: Optional[str] = None
    
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
            
            # Run the comprehensive loader
            self.logger.debug("Running comprehensive market data loader in background...")
            
            await market_data_loader_module.load_comprehensive_data(
                init_db_flag=False,  # Already initialized
                api_key=core_module.API_KEY
            )
            
            self._last_completed = get_current_time()
            self._last_error = None
            self.logger.info("Market data loader completed successfully")
            
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
                    "last_error": self._last_error
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
                "last_error": self._last_error
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

