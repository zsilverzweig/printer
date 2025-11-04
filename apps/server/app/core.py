from __future__ import annotations

import asyncio
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
    
    API_KEY = api_key
    rest_client = RESTClient(api_key=API_KEY)
    logger.info(f"✓ Polygon API connected ({api_key[:10]}...)")
    
    # Initialize database
    from app.services.core.database import init_db
    await init_db()
    logger.info("✓ Database ready")
    
    # Initialize health monitor
    from app.services.monitoring.health_monitor import initialize_health_monitor
    health_check_interval = int(os.getenv("MARKET_DATA_HEALTH_CHECK_INTERVAL", "300"))
    health_monitor = initialize_health_monitor(interval_seconds=health_check_interval)
    await health_monitor.start()
    logger.info(f"✓ Health monitor ({health_check_interval}s)")
    
    # Initialize snapshot ingestion service (for real-time pricing and gap filling)
    snapshot_ingestion_enabled = os.getenv("SNAPSHOT_INGESTION_ENABLED", "true").lower() == "true"
    if snapshot_ingestion_enabled:
        from app.services.market.snapshot_ingestion import initialize_snapshot_service
        snapshot_service = initialize_snapshot_service(
            api_key=API_KEY,
            fetch_interval_seconds=5
        )
        await snapshot_service.start()
        logger.info("✓ Snapshot ingestion (5s)")
    
    # Initialize real-time ingestion (if enabled)
    ingestion_enabled = os.getenv("MARKET_DATA_INGESTION_ENABLED", "false").lower() == "true"
    if ingestion_enabled:
        from app.services.market.realtime_ingestion import initialize_ingestion_service
        ingestion_service = initialize_ingestion_service(
            api_key=API_KEY,
            batch_interval_seconds=10,
            enable_validation=True
        )
        await ingestion_service.start()
        logger.info("✓ Real-time ingestion")
    
    # Initialize backfill service (if enabled)
    # COMMENTED OUT - Using MarketDataLoader script instead
    # backfill_enabled = os.getenv("MARKET_DATA_BACKFILL_ENABLED", "false").lower() == "true"
    # if backfill_enabled:
    #     from app.services.market.smart_backfill import initialize_backfill_service
    #     backfill_service = initialize_backfill_service(
    #         api_key=API_KEY,
    #         concurrent_requests=100,  # Process 100 symbols concurrently
    #         request_delay_seconds=0.0,  # No delay = maximum throughput
    #         auto_start=True
    #     )
    #     await backfill_service.start()
    #     logger.info("✅ Backfill service started")
    # else:
    #     logger.info("Smart backfill disabled (set MARKET_DATA_BACKFILL_ENABLED=true to enable)")
    logger.info("Smart backfill disabled (using MarketDataLoader script instead)")
    
    # Initialize aggregate timescale loading
    # COMMENTED OUT - Using MarketDataLoader script instead
    # Load recent data for all timescales to ensure system has complete multi-granularity data
    # aggregate_loading_enabled = os.getenv("MARKET_DATA_AGGREGATE_LOADING_ENABLED", "true").lower() == "true"
    # if aggregate_loading_enabled:
    #     logger.info("Starting automatic aggregate timescale loading...")
    #     asyncio.create_task(_load_aggregate_timescales_async())
    # else:
    #     logger.info("Aggregate timescale loading disabled (set MARKET_DATA_AGGREGATE_LOADING_ENABLED=true to enable)")
    logger.info("Aggregate timescale loading disabled (using MarketDataLoader script instead)")


def get_client(pagination: bool = True) -> RESTClient:
    global rest_client, API_KEY
    
    if pagination:
        assert rest_client is not None
        return rest_client
    else:
        new_client = RESTClient(api_key=API_KEY, pagination=False)
        return new_client


