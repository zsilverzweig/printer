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
from app.routers import market, news, trading, events, noc, admin
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
    logger.info(f"Incoming request: {request.method} {request.url.path} (scope type: {request.scope.get('type', 'unknown')})")
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"Request completed: {request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
    return response


@app.on_event("startup")
async def on_startup() -> None:
    await startup_init()
    logger.info("FastAPI application started, WebSocket endpoints registered")
    
    # Log all registered routes
    for route in app.routes:
        logger.info(f"Registered route: {route.path} ({getattr(route, 'methods', 'WEBSOCKET' if 'WebSocket' in str(type(route)) else 'UNKNOWN')})")


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

# Include realtime/WebSocket router
app.include_router(realtime_router)
