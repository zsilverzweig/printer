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
from app.services.core.startup_orchestrator import startup_application, get_orchestrator
from app.routers import market, news, trading, events, admin, screener, strategies, funds, screening_criteria, db_admin, screener_metrics, analytics, backtests
from app.routers.realtime import router as realtime_router
from app.routers import ticker_states
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

# Configure logging - uvicorn may have already set up handlers
# We'll configure our format and deduplicate handlers in startup event
logger = logging.getLogger("app.main")

def _configure_logging():
    """Configure logging format and remove duplicate handlers."""
    import sys
    
    # Remove ALL existing handlers to start fresh
    # This prevents uvicorn from adding duplicate handlers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
        handler.close()
    
    # Set the format for our handler
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    
    # Add a single handler with our format
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    logging.root.addHandler(handler)
    logging.root.setLevel(logging.INFO)
    
    # Also configure uvicorn's logger to use our handler
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_access_logger = logging.getLogger("uvicorn.access")
    for logger in [uvicorn_logger, uvicorn_access_logger]:
        # Remove any existing handlers
        for h in logger.handlers[:]:
            logger.removeHandler(h)
            h.close()
        # Set to use root logger's handlers (propagate=True is default)
        logger.propagate = True
        logger.setLevel(logging.INFO)

# Configure logging at module load - but we'll reconfigure in startup to remove duplicates
# This ensures basic logging works even if startup event doesn't fire
if not logging.root.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


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
    """Execute application startup using the orchestrator."""
    # Fix duplicate logging handlers that may have been added by uvicorn
    _configure_logging()
    
    # Execute startup using orchestrator
    orchestrator = await startup_application()
    
    # Store services in app state for shutdown
    if orchestrator.alpaca_websocket:
        app.state.alpaca_websocket = orchestrator.alpaca_websocket


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Gracefully shutdown services on server stop."""
    logger.info("Shutting down server...")
    
    # Shutdown orchestrator services
    orchestrator = get_orchestrator()
    if orchestrator:
        await orchestrator.shutdown()


@app.get("/health")
async def health() -> JSONResponse:
    """Enhanced health check endpoint with startup status and backtest lookup status."""
    from app.services.monitoring.health_monitor import get_health_monitor
    from datetime import datetime, timedelta, timezone
    
    orchestrator = get_orchestrator()
    health_data = {"status": "ok"}
    
    # Add startup service status
    if orchestrator:
        health_data["startup"] = {
            "services": orchestrator.get_service_status(),
            "started_at": datetime.fromtimestamp(orchestrator.start_time).isoformat() if orchestrator.start_time else None,
            "uptime_seconds": time.time() - orchestrator.start_time if orchestrator.start_time else None
        }
    
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
app.include_router(ticker_states.router, prefix="/api", tags=["ticker-states"])  # Ticker lifecycle state tracking

# Include realtime/WebSocket router
app.include_router(realtime_router)
