"""
System health monitoring framework.

Provides extensible health checks for market data, risk management, and other
critical system components.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import SymbolDateValidation, MarketData
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
        self.timestamp = datetime.now(timezone.utc)
    
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
    Health check for market data ingestion and completeness.
    
    Checks:
    - Data freshness (is recent data being ingested?)
    - Data gaps (are there missing dates?)
    - Validation coverage (how many symbols have validated data?)
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
                    message = f"Market data healthy: {validation_check['complete_count']} symbols with complete data"
                else:
                    issues = []
                    if not freshness_check["is_healthy"]:
                        issues.append("stale data")
                    if not validation_check["is_healthy"]:
                        issues.append("low validation coverage")
                    if not gap_check["is_healthy"]:
                        issues.append("data gaps detected")
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
            now = datetime.now(timezone.utc)
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
        """Check how many symbols have validated complete data."""
        try:
            cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
            
            # Count symbols with complete validation in lookback period
            result = await session.execute(
                text("""
                    SELECT 
                        COUNT(DISTINCT symbol) as total_symbols,
                        COUNT(DISTINCT CASE WHEN is_complete THEN symbol END) as complete_symbols,
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
                    "total_symbols": 0,
                    "complete_count": 0
                }
            
            total_symbols = row[0] or 0
            complete_symbols = row[1] or 0
            total_validations = row[2] or 0
            complete_validations = row[3] or 0
            
            # Healthy if at least 50% of symbols have some complete data
            is_healthy = total_symbols > 0 and (complete_symbols / total_symbols) >= 0.5
            
            completion_rate = (complete_validations / total_validations * 100) if total_validations > 0 else 0
            
            return {
                "is_healthy": is_healthy,
                "message": f"{complete_symbols}/{total_symbols} symbols with complete data ({completion_rate:.1f}% completion)",
                "total_symbols": total_symbols,
                "complete_count": complete_symbols,
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
        """Check for missing dates in validation table."""
        try:
            cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
            
            # Find symbols with incomplete data in recent dates
            result = await session.execute(
                text("""
                    SELECT 
                        symbol,
                        COUNT(*) as incomplete_days
                    FROM symbol_date_validation
                    WHERE date >= :cutoff_date
                      AND is_complete = FALSE
                    GROUP BY symbol
                    HAVING COUNT(*) > 5
                    ORDER BY incomplete_days DESC
                    LIMIT 10
                """),
                {"cutoff_date": cutoff_date}
            )
            
            gaps = []
            for row in result:
                gaps.append({
                    "symbol": row[0],
                    "incomplete_days": row[1]
                })
            
            is_healthy = len(gaps) < 10  # Arbitrary threshold
            
            if gaps:
                gap_symbols = [g["symbol"] for g in gaps[:3]]
                message = f"{len(gaps)} symbols with significant gaps (e.g., {', '.join(gap_symbols)})"
            else:
                message = "No significant data gaps detected"
            
            return {
                "is_healthy": is_healthy,
                "message": message,
                "gaps": gaps
            }
            
        except Exception as e:
            self.logger.error(f"Gap check failed: {e}")
            return {
                "is_healthy": False,
                "message": f"Gap check error: {str(e)}"
            }


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
        self.logger.info(f"Registered health check: {check.name}")
    
    async def run_all_checks(self) -> List[HealthCheckResult]:
        """Run all registered health checks and return results."""
        results = []
        for check in self.checks:
            try:
                result = await check.check()
                results.append(result)
                
                # Log results
                if result.is_healthy:
                    self.logger.info(f"✅ {result.check_name}: {result.message}")
                else:
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
        
        self.logger.info(f"Starting health monitor (interval: {self.interval_seconds}s)")
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
        
        logger.info("Health monitor initialized with default checks")
    
    return _health_monitor

