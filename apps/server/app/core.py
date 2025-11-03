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
    lookback_days = int(os.getenv("MARKET_DATA_LOOKBACK_DAYS", "30"))
    gap_detector = initialize_gap_detector(lookback_days=lookback_days)
    # Run initial gap detection
    logger.info(f"Running initial gap detection (lookback: {lookback_days} days)...")
    await gap_detector.detect_gaps()
    
    # Initialize snapshot ingestion service (for real-time pricing and gap filling)
    snapshot_ingestion_enabled = os.getenv("SNAPSHOT_INGESTION_ENABLED", "true").lower() == "true"
    if snapshot_ingestion_enabled:
        from app.services.market.snapshot_ingestion import initialize_snapshot_service
        logger.info("Initializing snapshot ingestion service...")
        snapshot_service = initialize_snapshot_service(
            api_key=API_KEY,
            fetch_interval_seconds=5
        )
        await snapshot_service.start()
        logger.info("✓ Snapshot ingestion service started (fetching every 5s)")
    else:
        logger.info("Snapshot ingestion disabled (set SNAPSHOT_INGESTION_ENABLED=true to enable)")
    
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
        logger.info("✅ Backfill service started")
    else:
        logger.info("Smart backfill disabled (set MARKET_DATA_BACKFILL_ENABLED=true to enable)")
    
    # Initialize aggregate timescale loading
    # Load recent data for all timescales to ensure system has complete multi-granularity data
    aggregate_loading_enabled = os.getenv("MARKET_DATA_AGGREGATE_LOADING_ENABLED", "true").lower() == "true"
    if aggregate_loading_enabled:
        logger.info("Starting automatic aggregate timescale loading...")
        asyncio.create_task(_load_aggregate_timescales_async())
    else:
        logger.info("Aggregate timescale loading disabled (set MARKET_DATA_AGGREGATE_LOADING_ENABLED=true to enable)")


async def _load_aggregate_timescales_async() -> None:
    """
    Background task to load aggregate timescales on startup.
    
    This runs on startup to ensure the system has historical data at key granularities:
    - 60 days of 5-minute bars (powers the screener - PRIORITY)
    - 60 days of 15-minute bars (intraday analysis)
    - 3 months of hourly bars (intraday analysis)
    - 6 months of daily bars (technical analysis and backtesting)
    
    Note: All timescales are loaded in a single task to avoid conflicts.
    Each timescale respects its configured lookback period from TIMESCALE_CONFIG.
    """
    import logging
    logger = logging.getLogger("app.core")
    
    try:
        # Wait a few seconds for other services to initialize
        await asyncio.sleep(5)
        
        from app.services.market import historical_data_loader
        from datetime import datetime, timedelta, timezone
        
        # Load all aggregate timescales in a single task
        # Uses the longest lookback period (180 days for daily data)
        # Each timescale will only fetch data for its configured lookback period from TIMESCALE_CONFIG
        logger.info("📊 Loading historical data (5min/15min/1hour/1day)")
        
        start_date = datetime.now(timezone.utc) - timedelta(days=180)
        
        result = await historical_data_loader.start_historical_load_task(
            days=180,  # Maximum lookback across all timescales
            symbols=None,  # All symbols
            start_date=start_date,
            timescales=['5min', '15min', '1hour', '1day']  # All aggregate timescales
        )
        logger.info(f"✅ Multi-timescale data loading started: {result['message']}")
        
    except Exception as e:
        logger.error(f"Failed to start aggregate timescale loading: {e}", exc_info=True)


def get_client(pagination: bool = True) -> RESTClient:
    global rest_client, API_KEY
    
    if pagination:
        assert rest_client is not None
        return rest_client
    else:
        new_client = RESTClient(api_key=API_KEY, pagination=False)
        return new_client


