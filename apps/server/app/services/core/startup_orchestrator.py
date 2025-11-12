"""
Startup Orchestrator

Centralized service that manages all application startup logic.
Consolidates initialization from main.py and core.py into a single,
organized flow with consistent logging and health tracking.
"""

import asyncio
import os
import time
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional

from app.services.core.startup_logger import get_startup_logger, Status
from app.services.core.time_context import get_current_time


class StartupOrchestrator:
    """Manages all application startup initialization."""
    
    def __init__(self):
        """Initialize orchestrator."""
        self.logger = get_startup_logger()
        self.start_time: Optional[float] = None
        self.services: Dict[str, Status] = {}
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self.active_funds_count = 0
        
        # Store initialized services for shutdown
        self.health_monitor = None
        self.snapshot_service = None
        self.realtime_ingestion_service = None
        self.screener_service = None
        self.alpaca_websocket = None
        self.reconciliation_service = None
        self.background_metrics_loader = None
        self.last_lookup_date: Optional[date] = None
    
    async def startup(self) -> None:
        """
        Execute full startup sequence.
        
        Raises:
            RuntimeError: If critical services fail to initialize
        """
        self.start_time = time.time()
        self.logger.print_banner()
        
        try:
            # Phase 1: Core Services
            await self._phase_core_services()
            
            # Phase 2: Data Services
            await self._phase_data_services()
            
            # Phase 3: Trading Services
            await self._phase_trading_services()
            
            # Phase 4: Application Services
            await self._phase_application_services()
            
            # Phase 5: Cleanup and Summary
            await self._phase_cleanup()
            self._print_summary()
            
        except Exception as e:
            # Critical error - break out immediately
            self.logger.log_error("Startup", e, "Critical startup failure")
            raise
    
    async def _phase_core_services(self) -> None:
        """Phase 1: Initialize core services (API, Database)."""
        self.logger.start_phase("Core Services")
        
        # Initialize Polygon API
        try:
            from app.core import initialize_core
            import app.core as core_module
            initialize_core()
            
            # Access API_KEY through module after initialization
            api_key_display = core_module.API_KEY[:10] if core_module.API_KEY else "N/A"
            
            self.services["Polygon API"] = Status.OK
            self.logger.log_service("Polygon API", Status.OK, f"Connected ({api_key_display}...)")
        except Exception as e:
            self.services["Polygon API"] = Status.FAIL
            self.logger.log_error("Polygon API", e)
            raise
        
        # Initialize Database
        try:
            from app.services.core.database import init_db
            await init_db()
            self.services["Database"] = Status.OK
            self.logger.log_service("Database", Status.OK, "Ready")
        except Exception as e:
            self.services["Database"] = Status.FAIL
            self.logger.log_error("Database", e)
            raise
        
        # Validate datetime usage
        try:
            from app.services.core.datetime_validator import DatetimeValidator
            from pathlib import Path
            
            # Get codebase root (apps/server directory)
            codebase_root = Path(__file__).parent.parent.parent.parent
            
            validator = DatetimeValidator(codebase_root)
            
            if not validator.validate():
                self.warnings.append("Datetime usage violations detected - check logs")
                self.logger.log_service("Datetime Validation", Status.WARN, "Violations found")
            else:
                self.logger.log_service("Datetime Validation", Status.OK, "All checks passed")
        except Exception as e:
            import logging
            logging.warning(f"Datetime validation error: {e}")
            self.warnings.append("Could not run datetime validation")
    
    async def _phase_data_services(self) -> None:
        """Phase 2: Initialize data services (health monitor, ingestion, etc.)."""
        self.logger.start_phase("Data Services")
        
        # Health Monitor
        try:
            from app.services.monitoring.health_monitor import initialize_health_monitor
            health_check_interval = int(os.getenv("MARKET_DATA_HEALTH_CHECK_INTERVAL", "300"))
            self.health_monitor = initialize_health_monitor(interval_seconds=health_check_interval)
            await self.health_monitor.start()
            self.services["Health Monitor"] = Status.OK
            self.logger.log_service("Health Monitor", Status.OK, f"{health_check_interval}s interval")
        except Exception as e:
            self.services["Health Monitor"] = Status.FAIL
            self.logger.log_error("Health Monitor", e)
            self.errors.append(f"Health Monitor: {str(e)}")
        
        # Backtest lookup readiness (optional)
        try:
            auto_populate_enabled = os.getenv("BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED", "true").lower() == "true"
            if auto_populate_enabled:
                target_date = self._previous_trading_day()
                coverage, populated = await self._ensure_backtest_lookup_ready(target_date)
                rows = coverage.get("total_rows", 0)
                symbols = coverage.get("symbols", 0)
                today_volume_rows = coverage.get("rows_with_today_volume", 0)
                status_msg = (
                    f"{'populated' if populated else 'ready'} for {target_date.isoformat()} "
                    f"(rows={rows:,}, symbols={symbols}, today_volume_rows={today_volume_rows:,})"
                )
                self.services["Backtest Lookup"] = Status.OK
                self.logger.log_service("Backtest Lookup", Status.OK, status_msg)
            else:
                self.services["Backtest Lookup"] = Status.SKIP
                self.logger.log_service(
                    "Backtest Lookup",
                    Status.SKIP,
                    "auto-populate disabled via BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED",
                )
        except Exception as e:
            self.services["Backtest Lookup"] = Status.FAIL
            self.logger.log_error("Backtest Lookup", e)
            self.errors.append(f"Backtest Lookup: {str(e)}")
        
        # Snapshot Ingestion
        try:
            snapshot_enabled = os.getenv("SNAPSHOT_INGESTION_ENABLED", "true").lower() == "true"
            if snapshot_enabled:
                from app.services.market.snapshot_ingestion import initialize_snapshot_service
                from app.core import API_KEY
                self.snapshot_service = initialize_snapshot_service(
                    api_key=API_KEY,
                    fetch_interval_seconds=5
                )
                await self.snapshot_service.start()
                self.services["Snapshot Ingestion"] = Status.OK
                self.logger.log_service("Snapshot Ingestion", Status.OK, "5s interval")
            else:
                self.services["Snapshot Ingestion"] = Status.SKIP
                self.logger.log_service("Snapshot Ingestion", Status.SKIP, "disabled")
        except Exception as e:
            self.services["Snapshot Ingestion"] = Status.FAIL
            self.logger.log_error("Snapshot Ingestion", e)
            self.errors.append(f"Snapshot Ingestion: {str(e)}")
        
        # Real-time Ingestion
        try:
            ingestion_enabled = os.getenv("MARKET_DATA_INGESTION_ENABLED", "false").lower() == "true"
            if ingestion_enabled:
                from app.services.market.realtime_ingestion import initialize_ingestion_service
                from app.core import API_KEY
                self.realtime_ingestion_service = initialize_ingestion_service(
                    api_key=API_KEY,
                    batch_interval_seconds=10,
                    enable_validation=True
                )
                await self.realtime_ingestion_service.start()
                self.services["Real-time Ingestion"] = Status.OK
                self.logger.log_service("Real-time Ingestion", Status.OK, "10s batch interval")
            else:
                self.services["Real-time Ingestion"] = Status.SKIP
                self.logger.log_service("Real-time Ingestion", Status.SKIP, "disabled")
        except Exception as e:
            self.services["Real-time Ingestion"] = Status.FAIL
            self.logger.log_error("Real-time Ingestion", e)
            self.errors.append(f"Real-time Ingestion: {str(e)}")
        
        # Background Metrics Loader (optional - can be enabled for health monitor)
        background_metrics_enabled = os.getenv("BACKGROUND_METRICS_LOADER_ENABLED", "false").lower() == "true"
        if background_metrics_enabled:
            try:
                from app.services.market.background_metrics_loader import BackgroundMetricsLoader

                self.background_metrics_loader = BackgroundMetricsLoader()

                self.services["Background Metrics Loader"] = Status.OK
                self.logger.log_service("Background Metrics Loader", Status.OK, "available for daily metrics processing")
            except Exception as e:
                self.services["Background Metrics Loader"] = Status.FAIL
                self.logger.log_error("Background Metrics Loader", e)

        # Print data diagnostics table
        try:
            import importlib.util

            script_path = os.path.join(
                os.path.dirname(__file__), '..', '..', '..', 'scripts', 'market_data_loader.py'
            )
            spec = importlib.util.spec_from_file_location("market_data_loader", script_path)
            market_data_loader_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(market_data_loader_module)

            diagnostics = await market_data_loader_module._log_market_data_diagnostics(
                context="startup_validation",
                lookback_days=7
            )

            self.services["Data Diagnostics"] = Status.OK
            self.logger.log_service("Data Diagnostics", Status.OK, "table printed above")
        except Exception as e:
            self.services["Data Diagnostics"] = Status.FAIL
            self.logger.log_error("Data Diagnostics", e)
        
        # Note about disabled services (not errors, just informational)
        if os.getenv("MARKET_DATA_BACKFILL_ENABLED", "false").lower() != "true":
            self.logger.log_service("Smart Backfill", Status.SKIP, "using MarketDataLoader script instead")
            self.services["Smart Backfill"] = Status.SKIP
    
    async def _phase_trading_services(self) -> None:
        """Phase 3: Initialize trading services (Alpaca, WebSocket, Reconciliation)."""
        self.logger.start_phase("Trading Services")
        
        # Alpaca WebSocket Client
        try:
            from app.services.trading.alpaca_service import AlpacaService
            from app.services.trading.alpaca_websocket import AlpacaWebSocketClient
            from app.services.trading.trade_event_handler import TradeEventHandler
            
            alpaca_service = AlpacaService(paper_trading=True)
            event_handler = TradeEventHandler()
            self.alpaca_websocket = AlpacaWebSocketClient(
                alpaca_service=alpaca_service,
                event_handler=event_handler,
                paper_trading=True
            )
            await self.alpaca_websocket.connect()
            self.services["Alpaca WebSocket"] = Status.OK
            self.logger.log_service("Alpaca WebSocket", Status.OK, "paper trading mode")
        except Exception as e:
            self.services["Alpaca WebSocket"] = Status.FAIL
            self.logger.log_error("Alpaca WebSocket", e)
            self.errors.append(f"Alpaca WebSocket: {str(e)}")
        
        # Reconciliation Service
        try:
            from app.services.trading.reconciliation_service import ReconciliationService, set_reconciliation_service
            from app.services.trading.alpaca_service import AlpacaService
            alpaca_service = AlpacaService(paper_trading=True)
            self.reconciliation_service = ReconciliationService(alpaca_service)
            set_reconciliation_service(self.reconciliation_service)
            self.services["Reconciliation Service"] = Status.OK
            self.logger.log_service("Reconciliation Service", Status.OK, "manual position reconciliation")
        except Exception as e:
            self.services["Reconciliation Service"] = Status.FAIL
            self.logger.log_error("Reconciliation Service", e)
            self.errors.append(f"Reconciliation Service: {str(e)}")
    
    async def _phase_application_services(self) -> None:
        """Phase 4: Initialize application services (Screener, Funds, Data Loading)."""
        self.logger.start_phase("Application Services")
        
        # Cancel interrupted backtests
        try:
            from app.services.core.database import get_async_session
            from app.models.strategies import Backtest
            from sqlalchemy import select
            
            async with get_async_session() as session:
                stmt = select(Backtest).where(Backtest.status == 'running')
                result = await session.execute(stmt)
                running_backtests = result.scalars().all()
                
                if running_backtests:
                    for bt in running_backtests:
                        bt.status = 'cancelled'
                        bt.completed_at = get_current_time()
                        bt.error_message = 'Server restarted'
                    await session.commit()
                    self.services["Backtest Cleanup"] = Status.OK
                    self.logger.log_service("Backtest Cleanup", Status.OK, f"cancelled {len(running_backtests)} interrupted")
                else:
                    self.services["Backtest Cleanup"] = Status.OK
                    self.logger.log_service("Backtest Cleanup", Status.OK, "no interrupted backtests")
        except Exception as e:
            self.services["Backtest Cleanup"] = Status.FAIL
            self.logger.log_error("Backtest Cleanup", e)
            self.warnings.append(f"Backtest cleanup failed: {str(e)}")
        
        # Screener Service (on-demand queries only)
        try:
            from app.services.screener.screener import ScreenerService, set_screener_service

            self.screener_service = ScreenerService()
            set_screener_service(self.screener_service)
            self.services["Screener Service"] = Status.OK
            self.logger.log_service("Screener Service", Status.OK, "on-demand queries")
        except Exception as e:
            self.services["Screener Service"] = Status.FAIL
            self.logger.log_error("Screener Service", e)
            self.errors.append(f"Screener Service: {str(e)}")
        
        # Market Data Loading (comprehensive coverage)
        try:
            import importlib.util
            script_path = os.path.join(
                os.path.dirname(__file__), '..', '..', '..', 'scripts', 'market_data_loader.py'
            )
            spec = importlib.util.spec_from_file_location("market_data_loader", script_path)
            market_data_loader_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(market_data_loader_module)
            
            import app.core as core_module
            
            # Run in background (non-blocking)
            asyncio.create_task(
                market_data_loader_module.load_comprehensive_data(
                    init_db_flag=False,
                    api_key=core_module.API_KEY
                )
            )
            self.services["Market Data Loader"] = Status.OK
            self.logger.log_service("Market Data Loader", Status.OK, "loading comprehensive data (background)")
        except Exception as e:
            self.services["Market Data Loader"] = Status.FAIL
            self.logger.log_error("Market Data Loader", e)
            self.warnings.append(f"Market data loading failed: {str(e)}")
        
        # Fund Auto-Start
        try:
            # Count active funds before auto-start
            from app.services.core.database import get_async_session
            from app.models.strategies import Fund
            from sqlalchemy import select
            
            async with get_async_session() as session:
                stmt = select(Fund).where(Fund.status == "active")
                result = await session.execute(stmt)
                active_funds = result.scalars().all()
                self.active_funds_count = len(active_funds)
            
            from app.services.core.fund_autostart import auto_start_active_funds
            await auto_start_active_funds()
            
            self.services["Fund Auto-Start"] = Status.OK
            self.logger.log_service("Fund Auto-Start", Status.OK, f"{self.active_funds_count} active fund(s)")
        except Exception as e:
            self.services["Fund Auto-Start"] = Status.FAIL
            self.logger.log_error("Fund Auto-Start", e)
            self.errors.append(f"Fund Auto-Start: {str(e)}")
            self.active_funds_count = 0
    
    async def _phase_cleanup(self) -> None:
        """Phase 5: Final cleanup tasks."""
        self.logger.start_phase("Finalization")
        
        # Store services in app state for shutdown
        # This will be done in main.py after orchestrator returns
        self.services["Startup Complete"] = Status.OK
        self.logger.log_service("Startup Complete", Status.OK)
    
    def _print_summary(self) -> None:
        """Print startup summary."""
        total_time = time.time() - self.start_time if self.start_time else 0
        
        services_ok = sum(1 for s in self.services.values() if s == Status.OK)
        services_skip = sum(1 for s in self.services.values() if s == Status.SKIP)
        services_fail = sum(1 for s in self.services.values() if s == Status.FAIL)
        
        # Health status
        health_status = "All checks passing"
        if services_fail > 0:
            health_status = f"{services_fail} service(s) failed"
        elif self.warnings:
            health_status = f"Healthy with {len(self.warnings)} warning(s)"
        
        self.logger.log_summary(
            total_time=total_time,
            services_ok=services_ok,
            services_skip=services_skip,
            services_fail=services_fail,
            health_status=health_status,
            active_funds=self.active_funds_count,
            warnings=self.warnings if self.warnings else None
        )
    
    def get_service_status(self) -> Dict[str, str]:
        """Get current service status for health endpoint."""
        return {
            name: status.value for name, status in self.services.items()
        }
    
    async def shutdown(self) -> None:
        """Gracefully shutdown all services."""
        if self.alpaca_websocket:
            try:
                await self.alpaca_websocket.disconnect()
            except Exception:
                pass

    async def _ensure_backtest_lookup_ready(self, target_date: date):
        """Ensure the backtest lookup table is populated for the specified trading day."""
        from app.services.backtest.backtest_lookup_service import (
            check_lookup_coverage,
            populate_lookup_for_date,
        )

        coverage = await check_lookup_coverage(target_date)
        populated = False

        needs_population = not coverage.get("has_data")

        if needs_population:
            self.logger.log_service(
                "Backtest Lookup",
                Status.WARN,
                f"Populating lookup data for {target_date.isoformat()}…",
            )
            await populate_lookup_for_date(target_date, timescale="1min")
            coverage = await check_lookup_coverage(target_date)
            populated = True

        self.last_lookup_date = target_date

        return coverage, populated

    def _previous_trading_day(self, reference: Optional[datetime] = None) -> date:
        """Return the previous weekday trading day relative to the provided reference."""
        current_date = (
            reference.date() if isinstance(reference, datetime) else get_current_time().date()
        )
        candidate = current_date - timedelta(days=1)
        while candidate.weekday() >= 5:
            candidate -= timedelta(days=1)
        return candidate


# Global instance
_orchestrator: Optional[StartupOrchestrator] = None


def get_orchestrator() -> Optional[StartupOrchestrator]:
    """Get the global orchestrator instance."""
    return _orchestrator


async def startup_application() -> StartupOrchestrator:
    """
    Execute application startup and return orchestrator instance.
    
    Returns:
        StartupOrchestrator instance with initialized services
    """
    global _orchestrator
    _orchestrator = StartupOrchestrator()
    await _orchestrator.startup()
    return _orchestrator

