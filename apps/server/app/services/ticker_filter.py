"""
Ticker filtering service for database-based screening.

Provides reusable filtering logic that can be used by:
- TCC (Trading Command Center) for manual testing
- Funds for automated trading strategies
"""

import logging
from typing import List, Optional, Dict, Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assets import TickerDetails
from app.services.database import get_async_session

logger = logging.getLogger("app.ticker_filter")


class FilterCriteria:
    """Filter criteria for ticker screening."""
    
    def __init__(
        self,
        asset_types: Optional[List[str]] = None,
        market_cap_min: Optional[int] = None,
        market_cap_max: Optional[int] = None,
        sic_codes: Optional[List[str]] = None,
    ):
        self.asset_types = asset_types or []
        self.market_cap_min = market_cap_min
        self.market_cap_max = market_cap_max
        self.sic_codes = sic_codes or []


async def get_filtered_tickers(criteria: FilterCriteria) -> List[str]:
    """
    Get list of ticker symbols matching filter criteria.
    
    Args:
        criteria: FilterCriteria with asset types, market cap range, and SIC codes
        
    Returns:
        List of ticker symbols that match all criteria
        
    Example:
        >>> criteria = FilterCriteria(
        ...     asset_types=["CS", "ETF"],
        ...     market_cap_min=1_000_000_000,
        ...     market_cap_max=100_000_000_000
        ... )
        >>> tickers = await get_filtered_tickers(criteria)
        >>> print(tickers)  # ['AAPL', 'GOOGL', ...]
    """
    logger.info(
        "Filtering tickers: asset_types=%s, market_cap=(%s, %s), sic_codes=%s",
        criteria.asset_types,
        criteria.market_cap_min,
        criteria.market_cap_max,
        criteria.sic_codes
    )
    
    async with get_async_session() as session:
        # Build query conditions
        conditions = []
        
        # Filter by asset type
        if criteria.asset_types:
            conditions.append(TickerDetails.type.in_(criteria.asset_types))
        
        # Filter by market cap range
        if criteria.market_cap_min is not None:
            conditions.append(TickerDetails.market_cap >= criteria.market_cap_min)
        if criteria.market_cap_max is not None:
            conditions.append(TickerDetails.market_cap <= criteria.market_cap_max)
        
        # Filter by SIC codes (industry)
        if criteria.sic_codes:
            conditions.append(TickerDetails.sic_code.in_(criteria.sic_codes))
        
        # Execute query
        query = select(TickerDetails.symbol)
        if conditions:
            query = query.where(and_(*conditions))
        
        result = await session.execute(query)
        tickers = [row[0] for row in result.fetchall()]
        
        logger.info(
            "✅ Filtered to %d tickers (conditions applied: %d)",
            len(tickers),
            len(conditions)
        )
        if len(tickers) > 0:
            logger.info("Sample tickers: %s", ", ".join(tickers[:10]))
        
        return tickers


async def get_filter_metadata() -> Dict[str, Any]:
    """
    Get metadata about available filter options.
    
    Returns:
        Dictionary with:
        - available_asset_types: List of unique asset types in DB
        - available_sic_codes: List of {code, description} for industries
        - market_cap_range: {min, max} values in DB
    """
    async with get_async_session() as session:
        # Get unique asset types
        asset_type_result = await session.execute(
            select(TickerDetails.type)
            .distinct()
            .where(TickerDetails.type.isnot(None))
            .order_by(TickerDetails.type)
        )
        asset_types = [row[0] for row in asset_type_result.fetchall()]
        
        # Get unique SIC codes with descriptions
        sic_result = await session.execute(
            select(TickerDetails.sic_code, TickerDetails.sic_description)
            .distinct()
            .where(TickerDetails.sic_code.isnot(None))
            .order_by(TickerDetails.sic_description)
        )
        sic_codes = [
            {"code": row[0], "description": row[1] or row[0]}
            for row in sic_result.fetchall()
        ]
        
        # Get market cap range
        from sqlalchemy import func
        cap_result = await session.execute(
            select(
                func.min(TickerDetails.market_cap),
                func.max(TickerDetails.market_cap)
            )
            .where(TickerDetails.market_cap.isnot(None))
        )
        min_cap, max_cap = cap_result.first()
        
        return {
            "available_asset_types": asset_types,
            "available_sic_codes": sic_codes,
            "market_cap_range": {
                "min": min_cap or 0,
                "max": max_cap or 0
            }
        }

