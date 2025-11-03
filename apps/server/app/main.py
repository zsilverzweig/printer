from __future__ import annotations

import os
from typing import Optional
from dotenv import load_dotenv

from fastapi import FastAPI, Request

# Load environment variables
load_dotenv("env.local")
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core import startup_init
from app.routers import market, news, trading, events, noc, admin, screener, strategies, funds, screening_criteria, db_admin, screener_metrics
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

# Basic logging
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
    
    # Initialize global screener service for strategy engines
    from app.services.screener.screener import ScreenerService, set_screener_service
    import app.core as core
    
    screener_service = ScreenerService(core.get_client(), interval_s=20)
    await screener_service.start()
    set_screener_service(screener_service)
    
    logger.info("✅ Server started (FastAPI + WebSocket + Screener)")
    
    # Initialize order polling service for order status synchronization
    from app.services.trading.order_polling import OrderPollingService, set_polling_service
    from app.services.trading.alpaca_service import AlpacaService
    from app.services.trading.reconciliation_service import ReconciliationService, set_reconciliation_service
    
    logger.info("Initializing OrderPollingService...")
    alpaca_service = AlpacaService(paper_trading=True)  # Use paper trading for now
    polling_service = OrderPollingService(alpaca_service, poll_interval=5.0)
    await polling_service.start()
    set_polling_service(polling_service)
    logger.info("✓ OrderPollingService initialized and running (polling every 5s)")
    
    # Initialize reconciliation service for automatic position sync
    logger.info("Initializing ReconciliationService...")
    reconciliation_service = ReconciliationService(alpaca_service)
    set_reconciliation_service(reconciliation_service)
    logger.info("✓ ReconciliationService initialized (automatic position reconciliation enabled)")
    
    # Auto-start funds that were active before server restart
    from app.services.core.fund_autostart import auto_start_active_funds
    logger.info("Checking for active funds to auto-start...")
    await auto_start_active_funds()
    
    # Log all registered routes
    for route in app.routes:
        logger.debug(f"Registered route: {route.path} ({getattr(route, 'methods', 'WEBSOCKET' if 'WebSocket' in str(type(route)) else 'UNKNOWN')})")


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})


# Include domain-specific routers
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(news.router, prefix="/api/news", tags=["news"])
app.include_router(trading.router, prefix="/api/trading", tags=["trading"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(noc.router, prefix="/api/noc", tags=["noc"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(db_admin.router, prefix="/api/db-admin", tags=["db-admin"])
app.include_router(screener.router, prefix="/api/screener", tags=["screener"])
app.include_router(screening_criteria.router, prefix="/api", tags=["screening-criteria"])
app.include_router(screener_metrics.router)  # Screener metrics management
app.include_router(strategies.router)
app.include_router(funds.router, prefix="/api", tags=["funds"])

# Include realtime/WebSocket router
app.include_router(realtime_router)
