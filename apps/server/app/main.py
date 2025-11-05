from __future__ import annotations

import os
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv

from fastapi import FastAPI, Request

# Load environment variables
load_dotenv("env.local")
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core import startup_init
from app.routers import market, news, trading, events, admin, screener, strategies, funds, screening_criteria, db_admin, screener_metrics, analytics, backtests
from app.routers.realtime import router as realtime_router
import logging
import time


app = FastAPI()

# CORS for frontend dev at localhost:3000 and Docker internal network
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "ws://localhost:3000",
        "ws://127.0.0.1:3000",
        # Docker service names
        "http://web:3000",
        "ws://web:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Basic logging - only configure if not already configured
# This prevents duplicate handlers when uvicorn reloads the application
if not logging.root.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("app.main")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.debug(f"Incoming request: {request.method} {request.url.path} (scope type: {request.scope.get('type', 'unknown')})")
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"Request completed: {request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
    return response


@app.on_event("startup")
async def on_startup() -> None:
    await startup_init()
    
    # Cancel any running backtests from previous server instance
    from app.services.core.database import get_async_session
    from app.models.strategies import Backtest
    from sqlalchemy import select
    
    async with get_async_session() as session:
        stmt = select(Backtest).where(Backtest.status == 'running')
        result = await session.execute(stmt)
        running_backtests = result.scalars().all()
        
        if running_backtests:
            logger.info(f"🧹 Cleaning up {len(running_backtests)} interrupted backtest(s) from previous server instance")
            for bt in running_backtests:
                bt.status = 'cancelled'
                bt.completed_at = datetime.utcnow()
                bt.error_message = 'Server restarted'
            await session.commit()
            logger.info(f"✅ Cancelled {len(running_backtests)} interrupted backtest(s)")
        else:
            logger.debug("No interrupted backtests to clean up")
    
    # Initialize global screener service for strategy engines
    from app.services.screener.screener import ScreenerService, set_screener_service
    import app.core as core
    
    screener_service = ScreenerService(core.get_client(), interval_s=20)
    await screener_service.start()
    set_screener_service(screener_service)
    
    logger.info("✅ Server started (FastAPI + WebSocket + Screener)")
    
    # Initialize Alpaca WebSocket client for real-time order tracking
    from app.services.trading.alpaca_service import AlpacaService
    from app.services.trading.alpaca_websocket import AlpacaWebSocketClient
    from app.services.trading.trade_event_handler import TradeEventHandler
    from app.services.trading.reconciliation_service import ReconciliationService, set_reconciliation_service
    
    logger.info("Initializing Alpaca WebSocket client...")
    alpaca_service = AlpacaService(paper_trading=True)  # Use paper trading for now
    
    # Create event handler
    event_handler = TradeEventHandler()
    
    # Create and start WebSocket client
    websocket_client = AlpacaWebSocketClient(
        alpaca_service=alpaca_service,
        event_handler=event_handler,
        paper_trading=True
    )
    await websocket_client.connect()
    
    # Store global reference for shutdown
    app.state.alpaca_websocket = websocket_client
    logger.info("✓ Alpaca WebSocket client initialized and connected to trade_updates stream")
    
    # Initialize reconciliation service for manual position sync
    logger.info("Initializing ReconciliationService...")
    reconciliation_service = ReconciliationService(alpaca_service)
    set_reconciliation_service(reconciliation_service)
    logger.info("✓ ReconciliationService initialized (manual position reconciliation available)")
    
    # Load yesterday's market data (all timescales)
    try:
        # Import the loader function (use relative import from scripts directory)
        import importlib.util
        import os
        import app.core as core_module
        
        script_path = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'market_data_loader.py')
        spec = importlib.util.spec_from_file_location("market_data_loader", script_path)
        market_data_loader_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(market_data_loader_module)
        
        # Database and Polygon client are already initialized, so pass False and use core API key
        await market_data_loader_module.load_yesterday_data(
            init_db_flag=False,  # Already initialized in startup_init()
            api_key=core_module.API_KEY  # Use already-initialized API key
        )
    except Exception as e:
        logger.error(f"❌ Failed to load yesterday's market data: {e}")
        # Don't block startup if data loading fails
        import traceback
        logger.debug(traceback.format_exc())
    
    # Auto-start funds that were active before server restart
    from app.services.core.fund_autostart import auto_start_active_funds
    logger.info("Checking for active funds to auto-start...")
    await auto_start_active_funds()
    
    # Log all registered routes
    for route in app.routes:
        logger.debug(f"Registered route: {route.path} ({getattr(route, 'methods', 'WEBSOCKET' if 'WebSocket' in str(type(route)) else 'UNKNOWN')})")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully shutdown services on server stop."""
    logger.info("🛑 Shutting down server...")
    
    # Disconnect WebSocket
    if hasattr(app.state, 'alpaca_websocket'):
        websocket_client = app.state.alpaca_websocket
        await websocket_client.disconnect()
        logger.info("✓ Alpaca WebSocket client disconnected")


@app.get("/health")
async def health() -> JSONResponse:
    """Enhanced health check endpoint with backtest lookup status."""
    from app.services.monitoring.health_monitor import get_health_monitor
    from datetime import datetime, timedelta, timezone
    
    health_data = {"status": "ok"}
    
    # Get backtest lookup status
    try:
        # Check the last 7 trading days
        today = datetime.now(timezone.utc).date()
        recent_dates = []
        current = today - timedelta(days=1)
        
        # Get last 7 trading days
        while len(recent_dates) < 7 and current >= today - timedelta(days=30):
            if current.weekday() < 5:  # 0-4 = Monday-Friday
                recent_dates.append(current)
            current -= timedelta(days=1)
        
        # Check coverage using backtest lookup service
        from app.services.backtest.backtest_lookup_service import check_lookup_coverage
        from app.services.backtest.technical_indicators_service import check_indicators_coverage
        
        lookup_coverage = {}
        indicators_coverage = {}
        missing_lookup_dates = []
        missing_indicators_dates = []
        
        for target_date in recent_dates:
            # Check backtest lookup coverage
            try:
                lookup_info = await check_lookup_coverage(target_date)
                lookup_coverage[target_date.isoformat()] = lookup_info
                
                if not lookup_info.get("has_data") or lookup_info.get("minutes", 0) < 300:
                    missing_lookup_dates.append(target_date.isoformat())
            except Exception as e:
                logger.error(f"Error checking lookup coverage for {target_date}: {e}")
                lookup_coverage[target_date.isoformat()] = {
                    "has_data": False,
                    "error": str(e)
                }
                missing_lookup_dates.append(target_date.isoformat())
            
            # Check technical indicators coverage (1min timescale)
            try:
                indicators_info = await check_indicators_coverage(target_date, timescale='1min')
                indicators_coverage[target_date.isoformat()] = indicators_info
                
                if not indicators_info.get("has_data") or indicators_info.get("minutes", 0) < 300:
                    missing_indicators_dates.append(target_date.isoformat())
            except Exception as e:
                logger.error(f"Error checking indicators coverage for {target_date}: {e}")
                indicators_coverage[target_date.isoformat()] = {
                    "has_data": False,
                    "error": str(e)
                }
                missing_indicators_dates.append(target_date.isoformat())
        
        # Check if yesterday is complete for both
        yesterday = recent_dates[0] if recent_dates else None
        yesterday_lookup = lookup_coverage.get(yesterday.isoformat() if yesterday else "", {})
        yesterday_indicators = indicators_coverage.get(yesterday.isoformat() if yesterday else "", {})
        lookup_healthy = yesterday_lookup.get("has_data", False) and yesterday_lookup.get("minutes", 0) >= 300
        indicators_healthy = yesterday_indicators.get("has_data", False) and yesterday_indicators.get("minutes", 0) >= 300
        
        # Get population progress from health monitor if available
        health_monitor = get_health_monitor()
        lookup_progress = {}
        indicators_progress = {}
        is_populating_lookup = False
        is_populating_indicators = False
        
        if health_monitor:
            backtest_check = health_monitor.get_check("backtest_data")
            if backtest_check:
                lookup_progress = getattr(backtest_check, '_population_progress', {})
                indicators_progress = getattr(backtest_check, '_indicators_progress', {})
                is_populating_lookup = getattr(backtest_check, '_populating', False)
                is_populating_indicators = getattr(backtest_check, '_populating_indicators', False)
        
        health_data["backtest_lookup"] = {
            "healthy": lookup_healthy,
            "message": f"{len(recent_dates) - len(missing_lookup_dates)}/{len(recent_dates)} recent days have complete lookup data" if recent_dates else "No recent dates checked",
            "coverage": lookup_coverage,
            "missing_dates": missing_lookup_dates,
            "populating": is_populating_lookup,
            "population_progress": lookup_progress,
            "last_checked": datetime.now(timezone.utc).isoformat()
        }
        
        health_data["technical_indicators"] = {
            "healthy": indicators_healthy,
            "message": f"{len(recent_dates) - len(missing_indicators_dates)}/{len(recent_dates)} recent days have complete indicators data" if recent_dates else "No recent dates checked",
            "coverage": indicators_coverage,
            "missing_dates": missing_indicators_dates,
            "populating": is_populating_indicators,
            "population_progress": indicators_progress,
            "last_checked": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting backtest data status: {e}", exc_info=True)
        health_data["backtest_lookup"] = {
            "healthy": False,
            "message": f"Error checking lookup status: {str(e)}",
            "error": str(e)
        }
        health_data["technical_indicators"] = {
            "healthy": False,
            "message": f"Error checking indicators status: {str(e)}",
            "error": str(e)
        }
    
    return JSONResponse(health_data)


# Include domain-specific routers
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(trading.router, prefix="/api/trading", tags=["trading"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(db_admin.router, prefix="/api/db-admin", tags=["db-admin"])
app.include_router(screener.router, prefix="/api/screener", tags=["screener"])
app.include_router(screening_criteria.router, prefix="/api", tags=["screening-criteria"])
app.include_router(screener_metrics.router)  # Screener metrics management
app.include_router(strategies.router)
app.include_router(funds.router, prefix="/api", tags=["funds"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])  # Trade analytics and performance
app.include_router(backtests.router, prefix="/api/backtests", tags=["backtests"])  # Backtest execution and results

# Include realtime/WebSocket router
app.include_router(realtime_router)
