"""Main screener service coordinating market data filtering and streaming."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Set
from datetime import datetime

from polygon import RESTClient

from app import core
from app.services.screener.screener_broadcast import ScreenerBroadcaster
from app.services.screener.screener_compute import ScreenerCompute
from app.services.screener.screener_data import ScreenerDataLoader
from app.services.screener.screener_historical import ScreenerHistorical


# Global screener service instance for strategy engines to access
_global_screener_service: Optional['ScreenerService'] = None


def get_screener_service() -> Optional['ScreenerService']:
    """Get the global screener service instance."""
    return _global_screener_service


def set_screener_service(service: 'ScreenerService') -> None:
    """Set the global screener service instance."""
    global _global_screener_service
    _global_screener_service = service


class ScreenerService:
    """Orchestrates screener functionality: fetching snapshots, filtering, and streaming results."""

    def __init__(self, client: RESTClient, interval_s: int = 5):
        """Initialize the screener service.
        
        Args:
            client: Polygon REST client
            interval_s: Seconds between market snapshot updates
        """
        self.logger = logging.getLogger("app.screener")
        self.client = client
        self.interval_s = interval_s
        
        # Initialize component services
        self.data_loader = ScreenerDataLoader()
        self.compute = ScreenerCompute(self.data_loader)
        self.historical = ScreenerHistorical(self.compute)
        self.broadcaster = ScreenerBroadcaster()
        
        # Background task
        self.task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the screener service and begin periodic updates without blocking."""
        self.logger.info("ScreenerService starting; loading data from TimescaleDB…")
        # Initialize with TimescaleDB data
        await self.data_loader.load_from_timescale()
        # Start periodic loop
        self.task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        """Stop the screener service."""
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        self.logger.info("ScreenerService stopped")

    async def _loop(self) -> None:
        """Main loop that periodically fetches and broadcasts market data."""
        while True:
            await self._tick()
            await asyncio.sleep(self.interval_s)

    async def _tick(self) -> None:
        """Fetch current market data from database, compute filtered results, and broadcast to subscribers."""
        try:
            # Fetch latest market data from TimescaleDB using unified fetcher
            # This queries both market_data (minute bars) and market_latest_trades (real-time prices)
            self.logger.debug("[REALTIME SCREENER] Fetching latest market data from TimescaleDB…")
            snaps = await self.data_loader.fetch_latest_from_timescale()
            self.logger.debug("[REALTIME SCREENER] Market data fetched: %s symbols", len(snaps))
            
            if not snaps:
                self.logger.warning("[SCREENER] No market data available from database")
                payload = []
            else:
                # Use permissive defaults (no filters except ETF filter and exchange filter)
                payload = await self.compute.compute(
                    snaps,
                    min_price=None,
                    max_price=None,
                    min_volume=None,
                    min_change_percent=None,
                    max_change_percent=None,
                    order_by="rv14",
                    limit=200,
                    exclude_etfs=True,  # Default to excluding ETFs
                    asset_types=None
                )
        except Exception as e:
            self.logger.error("Failed to fetch/process market data from database: %s", e, exc_info=True)
            payload = []
        
        # Broadcast results
        await self.broadcaster.broadcast(payload)

    # Public API methods that delegate to component services
    
    async def _compute(
        self,
        snaps: List[Any],
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
    ) -> List[dict]:
        """Compute filtered and sorted screener results from market snapshots.
        
        This is a convenience method that delegates to ScreenerCompute.
        Kept for backward compatibility.
        """
        return await self.compute.compute(
            snaps,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            exclude_etfs=exclude_etfs,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
        )
    
    async def compute_historical(
        self,
        timestamp: datetime,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        exclude_etfs: bool = True,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
    ) -> List[dict]:
        """Compute screener results at a specific historical timestamp.
        
        This delegates to ScreenerHistorical.
        """
        return await self.historical.compute_historical(
            timestamp=timestamp,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            exclude_etfs=exclude_etfs,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
        )
    
    # WebSocket subscriber management
    
    @property
    def subscribers(self) -> Set[Any]:
        """Get the set of WebSocket subscribers (for backward compatibility)."""
        return self.broadcaster.subscribers
    
    @property
    def cached_payload(self) -> List[dict]:
        """Get the most recently cached payload (for backward compatibility)."""
        return self.broadcaster.cached_payload
    
    def add_subscriber(self, websocket: Any) -> None:
        """Add a WebSocket subscriber for real-time screener updates."""
        self.broadcaster.add_subscriber(websocket)
    
    def remove_subscriber(self, websocket: Any) -> None:
        """Remove a WebSocket subscriber."""
        self.broadcaster.remove_subscriber(websocket)
    
    def get_cached_payload(self) -> List[dict]:
        """Get the most recently computed screener results."""
        return self.broadcaster.get_cached_payload()
