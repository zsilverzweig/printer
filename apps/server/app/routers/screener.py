"""
Screener API endpoints for ticker filtering.

Provides endpoints for database-based ticker screening that can be used
by both manual testing (TCC) and automated trading (Funds).
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.ticker_filter import (
    get_filtered_tickers,
    get_filter_metadata,
    FilterCriteria
)

logger = logging.getLogger("app.screener")

router = APIRouter()


class FilterRequest(BaseModel):
    """Request model for ticker filtering."""
    asset_types: Optional[List[str]] = None
    market_cap_min: Optional[int] = None
    market_cap_max: Optional[int] = None
    sic_codes: Optional[List[str]] = None


class FilterResponse(BaseModel):
    """Response model for ticker filtering."""
    tickers: List[str]
    count: int
    criteria: FilterRequest


@router.post("/filter", response_model=FilterResponse)
async def filter_tickers(request: FilterRequest) -> FilterResponse:
    """
    Filter tickers based on database criteria.
    
    Returns list of ticker symbols that match the specified criteria:
    - Asset types (CS, ETF, WARRANT, etc.)
    - Market cap range
    - SIC codes (industry classification)
    
    Used by TCC for manual testing and Funds for automated trading.
    """
    try:
        criteria = FilterCriteria(
            asset_types=request.asset_types,
            market_cap_min=request.market_cap_min,
            market_cap_max=request.market_cap_max,
            sic_codes=request.sic_codes
        )
        
        tickers = await get_filtered_tickers(criteria)
        
        return FilterResponse(
            tickers=tickers,
            count=len(tickers),
            criteria=request
        )
        
    except Exception as e:
        logger.error(f"Failed to filter tickers: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to filter tickers: {str(e)}"
        )


@router.get("/filter/metadata")
async def get_filter_options():
    """
    Get available filter options from the database.
    
    Returns:
    - Available asset types
    - Available SIC codes (industries)
    - Market cap range
    
    Used to populate filter dropdowns in the UI.
    """
    try:
        metadata = await get_filter_metadata()
        return metadata
        
    except Exception as e:
        logger.error(f"Failed to get filter metadata: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get filter metadata: {str(e)}"
        )

