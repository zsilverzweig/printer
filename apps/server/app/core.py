from __future__ import annotations

import os
from typing import Optional

from polygon import RESTClient


API_KEY: Optional[str] = None
rest_client: Optional[RESTClient] = None


async def startup_init() -> None:
    """
    Initialize application services on startup.
    
    Initializes:
    - Polygon REST client for market data
    - PostgreSQL database connection and tables
    - Real-time market data ingestion (if enabled)
    - Health monitoring
    - Gap detection and backfill (if enabled)
    
    Raises:
        RuntimeError: If required environment variables are not set
        Exception: If database initialization fails
    """
    global API_KEY, rest_client
    import logging
    logger = logging.getLogger("app.core")
    
    # Initialize Polygon client
    api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        logger.error("POLYGON_API_KEY not set")
        raise RuntimeError("POLYGON_API_KEY not set")
    
    logger.info(f"Initializing Polygon client with API key: {api_key[:10]}...")
    API_KEY = api_key
    rest_client = RESTClient(api_key=API_KEY)
    logger.info("Polygon client initialized successfully")
    
    # Initialize database
    from app.services.core.database import init_db
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database initialized successfully")
    
    # Initialize health monitor
    from app.services.monitoring.health_monitor import initialize_health_monitor
    health_check_interval = int(os.getenv("MARKET_DATA_HEALTH_CHECK_INTERVAL", "300"))
    health_monitor = initialize_health_monitor(interval_seconds=health_check_interval)
    await health_monitor.start()
    logger.info(f"Health monitor started (interval: {health_check_interval}s)")
    
    # Initialize gap detector
    from app.services.market.gap_detector import initialize_gap_detector
    gap_detector = initialize_gap_detector(lookback_days=30)
    # Run initial gap detection
    logger.info("Running initial gap detection...")
    await gap_detector.detect_gaps()
    
    # Initialize real-time ingestion (if enabled)
    ingestion_enabled = os.getenv("MARKET_DATA_INGESTION_ENABLED", "false").lower() == "true"
    if ingestion_enabled:
        from app.services.market.realtime_ingestion import initialize_ingestion_service
        logger.info("Initializing real-time ingestion service...")
        ingestion_service = initialize_ingestion_service(
            api_key=API_KEY,
            batch_interval_seconds=10,
            enable_validation=True
        )
        await ingestion_service.start()
        logger.info("Real-time ingestion service started")
    else:
        logger.info("Real-time ingestion disabled (set MARKET_DATA_INGESTION_ENABLED=true to enable)")
    
    # Initialize backfill service (if enabled)
    backfill_enabled = os.getenv("MARKET_DATA_BACKFILL_ENABLED", "false").lower() == "true"
    if backfill_enabled:
        from app.services.market.smart_backfill import initialize_backfill_service
        logger.info("Initializing smart backfill service...")
        backfill_service = initialize_backfill_service(
            api_key=API_KEY,
            concurrent_requests=100,  # Process 100 symbols concurrently
            request_delay_seconds=0.0,  # No delay = maximum throughput
            auto_start=True
        )
        await backfill_service.start()
        logger.info("Smart backfill service started")
    else:
        logger.info("Smart backfill disabled (set MARKET_DATA_BACKFILL_ENABLED=true to enable)")


def get_client(pagination: bool = True) -> RESTClient:
    global rest_client, API_KEY
    
    if pagination:
        assert rest_client is not None
        return rest_client
    else:
        new_client = RESTClient(api_key=API_KEY, pagination=False)
        return new_client


