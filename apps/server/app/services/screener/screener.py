"""On-demand screener service that queries TimescaleDB when requested."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.services.screener.screener_compute import ScreenerCompute
from app.services.screener.screener_data import ScreenerDataLoader
from app.services.screener.screener_historical import ScreenerHistorical
from app.types import ScreenerCriteria

_global_screener_service: Optional["ScreenerService"] = None


def get_screener_service() -> Optional["ScreenerService"]:
    """Get the global screener service instance."""
    return _global_screener_service


def set_screener_service(service: "ScreenerService") -> None:
    """Set the global screener service instance."""
    global _global_screener_service
    _global_screener_service = service


class ScreenerService:
    """Simple screener facade that calculates results directly from TimescaleDB."""

    def __init__(self, client: Any | None = None, interval_s: int = 5) -> None:
        """
        Initialize the screener service.

        Args:
            client: Legacy compatibility parameter (ignored).
            interval_s: Legacy compatibility parameter (ignored).
        """
        self.logger = logging.getLogger("app.screener")
        self.data_loader = ScreenerDataLoader()
        self.compute = ScreenerCompute(self.data_loader)
        self.historical = ScreenerHistorical(self.compute)

    async def _compute_with_snapshots(
        self,
        snapshots: List[Any],
        *,
        min_price: Optional[float],
        max_price: Optional[float],
        min_volume: Optional[float],
        min_change_percent: Optional[float],
        max_change_percent: Optional[float],
        min_relative_volume: Optional[float],
        min_relative_volume_last_week: Optional[float],
        order_by: str,
        limit: int,
        technical_filters: Optional[Dict[str, Any]],
        asset_types: Optional[List[str]],
        market_cap_min: Optional[int],
        market_cap_max: Optional[int],
        float_min: Optional[int],
        float_max: Optional[int],
    ) -> List[dict]:
        if not snapshots:
            return []

        return await self.compute.compute(
            snapshots,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            min_relative_volume_last_week=min_relative_volume_last_week,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            float_min=float_min,
            float_max=float_max,
        )

    async def _compute(
        self,
        snaps: List[Any],
        *,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        min_relative_volume_last_week: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        float_min: Optional[int] = None,
        float_max: Optional[int] = None,
    ) -> List[dict]:
        """
        Internal helper used primarily by tests to run compute logic on provided snapshots.
        """
        return await self._compute_with_snapshots(
            snaps,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            min_relative_volume_last_week=min_relative_volume_last_week,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            float_min=float_min,
            float_max=float_max,
        )

    async def compute_live(
        self,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_volume: Optional[float] = None,
        min_change_percent: Optional[float] = None,
        max_change_percent: Optional[float] = None,
        min_relative_volume: Optional[float] = None,
        min_relative_volume_last_week: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        float_min: Optional[int] = None,
        float_max: Optional[int] = None,
    ) -> List[dict]:
        """Run the screener against current TimescaleDB data."""
        from app.services.screener.screener_data_unified import fetch_screener_data_unified

        snapshots = await fetch_screener_data_unified(
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            float_min=float_min,
            float_max=float_max,
            asset_types=asset_types,
            min_relative_volume=min_relative_volume,
            min_relative_volume_last_week=min_relative_volume_last_week,
        )

        if not snapshots:
            self.logger.info("[SCREENER] No candidates returned from unified fetcher")
            return []

        return await self._compute_with_snapshots(
            snapshots,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            min_relative_volume_last_week=min_relative_volume_last_week,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            float_min=float_min,
            float_max=float_max,
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
        min_relative_volume_last_week: Optional[float] = None,
        order_by: str = "rv14",
        limit: int = 200,
        technical_filters: Optional[Dict[str, Any]] = None,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        float_min: Optional[int] = None,
        float_max: Optional[int] = None,
    ) -> List[dict]:
        """Run the screener at a historical timestamp."""
        return await self.historical.compute_historical(
            timestamp=timestamp,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            max_change_percent=max_change_percent,
            min_relative_volume=min_relative_volume,
            min_relative_volume_last_week=min_relative_volume_last_week,
            order_by=order_by,
            limit=limit,
            technical_filters=technical_filters,
            asset_types=asset_types,
            market_cap_min=market_cap_min,
            market_cap_max=market_cap_max,
            float_min=float_min,
            float_max=float_max,
        )

    async def compute_live_with_criteria(self, params: Dict[str, Any]) -> List[dict]:
        """Compute live results using a criteria dict (same shape as ScreeningCriteria.criteria)."""
        return await self.compute_live(
            min_price=params.get("min_price"),
            max_price=params.get("max_price"),
            min_volume=params.get("min_volume"),
            min_change_percent=params.get("min_change_percent"),
            max_change_percent=params.get("max_change_percent"),
            min_relative_volume=params.get("min_relative_volume"),
            min_relative_volume_last_week=params.get("min_relative_volume_last_week"),
            order_by=params.get("order_by", "rv14"),
            limit=params.get("limit", 200),
            technical_filters=params.get("technical_filters"),
            asset_types=params.get("asset_types"),
            market_cap_min=params.get("market_cap_min"),
            market_cap_max=params.get("market_cap_max"),
            float_min=params.get("float_min"),
            float_max=params.get("float_max"),
        )

    async def compute_historical_with_criteria(
        self,
        timestamp: datetime,
        params: Dict[str, Any],
    ) -> List[dict]:
        """Compute historical results using a criteria dict (same shape as ScreeningCriteria.criteria)."""
        return await self.compute_historical(
            timestamp=timestamp,
            min_price=params.get("min_price"),
            max_price=params.get("max_price"),
            min_volume=params.get("min_volume"),
            min_change_percent=params.get("min_change_percent"),
            max_change_percent=params.get("max_change_percent"),
            min_relative_volume=params.get("min_relative_volume"),
            min_relative_volume_last_week=params.get("min_relative_volume_last_week"),
            order_by=params.get("order_by", "rv14"),
            limit=params.get("limit", 200),
            technical_filters=params.get("technical_filters"),
            asset_types=params.get("asset_types"),
            market_cap_min=params.get("market_cap_min"),
            market_cap_max=params.get("market_cap_max"),
            float_min=params.get("float_min"),
            float_max=params.get("float_max"),
        )

    async def compute_live_from_criteria(self, criteria: ScreenerCriteria) -> List[dict]:
        """Typed variant: Compute live results from a ScreenerCriteria model."""
        return await self.compute_live(
            min_price=criteria.min_price,
            max_price=criteria.max_price,
            min_volume=criteria.min_volume,
            min_change_percent=criteria.min_change_percent,
            max_change_percent=criteria.max_change_percent,
            min_relative_volume=criteria.min_relative_volume,
            min_relative_volume_last_week=criteria.min_relative_volume_last_week,
            order_by=criteria.order_by or "rv14",
            limit=criteria.limit or 200,
            technical_filters=criteria.technical_filters,
            asset_types=criteria.asset_types,
            market_cap_min=criteria.market_cap_min,
            market_cap_max=criteria.market_cap_max,
            float_min=criteria.float_min,
            float_max=criteria.float_max,
        )

    async def compute_historical_from_criteria(
        self,
        timestamp: datetime,
        criteria: ScreenerCriteria,
    ) -> List[dict]:
        """Typed variant: Compute historical results from a ScreenerCriteria model."""
        return await self.compute_historical(
            timestamp=timestamp,
            min_price=criteria.min_price,
            max_price=criteria.max_price,
            min_volume=criteria.min_volume,
            min_change_percent=criteria.min_change_percent,
            max_change_percent=criteria.max_change_percent,
            min_relative_volume=criteria.min_relative_volume,
            min_relative_volume_last_week=criteria.min_relative_volume_last_week,
            order_by=criteria.order_by or "rv14",
            limit=criteria.limit or 200,
            technical_filters=criteria.technical_filters,
            asset_types=criteria.asset_types,
            market_cap_min=criteria.market_cap_min,
            market_cap_max=criteria.market_cap_max,
            float_min=criteria.float_min,
            float_max=criteria.float_max,
        )

    def get_last_live_filter_breakdown(self) -> List[Dict[str, Any]]:
        """Expose the most recent filter breakdown from live computations."""
        return self.compute.get_last_filter_breakdown()

    def get_last_live_debug_stats(self) -> Dict[str, Any]:
        """Expose the most recent debug stats from live computations."""
        return self.compute.get_last_debug_stats()

    def get_last_historical_filter_breakdown(self) -> List[Dict[str, Any]]:
        """Expose the most recent filter breakdown from historical computations."""
        return self.historical.get_last_filter_breakdown()

    def get_last_historical_debug_stats(self) -> Dict[str, Any]:
        """Expose the most recent debug stats from historical computations."""
        return self.historical.get_last_debug_stats()
