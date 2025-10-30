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
    from app.services.database import init_db
    logger.info("Initializing database...")
    await init_db()
    logger.info("Database initialized successfully")


def get_client(pagination: bool = True) -> RESTClient:
    global rest_client, API_KEY
    
    if pagination:
        assert rest_client is not None
        return rest_client
    else:
        new_client = RESTClient(api_key=API_KEY, pagination=False)
        return new_client


