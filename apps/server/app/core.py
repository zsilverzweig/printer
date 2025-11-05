from __future__ import annotations

import os
from typing import Optional

from polygon import RESTClient


API_KEY: Optional[str] = None
rest_client: Optional[RESTClient] = None


def initialize_core() -> None:
    """
    Initialize core utilities (API client, database connection).
    
    This is called by the startup orchestrator to set up core services.
    The orchestrator handles all service initialization.
    
    Raises:
        RuntimeError: If POLYGON_API_KEY is not set
    """
    global API_KEY, rest_client
    
    api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        raise RuntimeError("POLYGON_API_KEY not set")
    
    API_KEY = api_key
    rest_client = RESTClient(api_key=API_KEY)


def get_client(pagination: bool = True) -> RESTClient:
    global rest_client, API_KEY
    
    if pagination:
        assert rest_client is not None
        return rest_client
    else:
        new_client = RESTClient(api_key=API_KEY, pagination=False)
        return new_client


