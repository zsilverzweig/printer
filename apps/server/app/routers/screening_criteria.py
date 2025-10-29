"""
Screening Criteria API endpoints.

Provides CRUD operations for reusable screening criteria configurations
that can be used by multiple funds.
"""

import logging
import uuid
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import ScreeningCriteria, Strategy
from app.services.database import get_async_session

logger = logging.getLogger("app.screening_criteria")

router = APIRouter()


# ============================================================================
# Screener Execution
# ============================================================================

class ScreenerRunResult(BaseModel):
    """Result of running the screener."""
    ticker_count: int
    tickers: List[str]


@router.post("/screening-criteria/{criteria_id}/run", response_model=ScreenerRunResult)
async def run_screener_with_criteria(criteria_id: str) -> ScreenerRunResult:
    """
    Run the screener with specific criteria and return matching tickers.
    
    Args:
        criteria_id: UUID of the screening criteria to use
        
    Returns:
        List of tickers matching the criteria and count
    """
    try:
        # Get the global screener service
        from app.services.screener import get_screener_service
        screener_service = get_screener_service()
        
        if not screener_service:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Screener service not available. Please ensure the server is fully started."
            )
        
        # Get screening criteria
        async with get_async_session() as session:
            result = await session.execute(
                select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
            )
            criteria = result.scalar_one_or_none()
            
            if not criteria:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Screening criteria {criteria_id} not found"
                )
        
        # Get latest snapshot data from screener service
        if not screener_service.cached_payload:
            # Try to fetch fresh data
            try:
                await screener_service._tick()
            except Exception as e:
                logger.warning(f"Failed to fetch fresh data: {e}")
                if not screener_service.cached_payload:
                    return ScreenerRunResult(ticker_count=0, tickers=[])
        
        # Use cached payload (which has already been filtered by default criteria)
        # Now apply the fund-specific criteria on top
        params = criteria.criteria
        
        # Extract parameters with defaults
        min_price = params.get("min_price", 2.0)
        max_price = params.get("max_price", 20.0)
        min_volume = params.get("min_volume", 50000.0)
        min_change_percent = params.get("min_change_percent", 5.0)
        order_by = params.get("order_by", "rv14")
        limit = params.get("limit", 200)
        
        # Get the last snapshot and recompute with custom criteria
        from app.services.screener_snapshot import fetch_snapshot_all
        import app.core as core
        
        if not core.API_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Polygon API key not configured"
            )
        
        # Fetch current snapshots
        snaps = fetch_snapshot_all(core.API_KEY)
        
        # Apply screener computation with custom parameters
        results = screener_service._compute(
            snaps,
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume,
            min_change_percent=min_change_percent,
            order_by=order_by,
            limit=limit
        )
        
        # Extract ticker symbols
        tickers = [r["ticker"] for r in results]
        
        logger.info(f"Screener run for criteria {criteria_id}: {len(tickers)} tickers matched")
        
        return ScreenerRunResult(
            ticker_count=len(tickers),
            tickers=tickers
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to run screener with criteria {criteria_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run screener: {str(e)}"
        )


@router.get("/screening-criteria/health")
async def health_check():
    """Simple health check endpoint to verify router is registered."""
    logger.info("✅ Screening criteria router health check called")
    return {"status": "ok", "message": "Screening criteria router is working"}


# ============================================================================
# Request/Response Models
# ============================================================================

class ScreeningCriteriaParams(BaseModel):
    """Screening criteria parameters for filtering."""
    # Database filters (asset metadata)
    asset_types: Optional[List[str]] = None
    market_cap_min: Optional[int] = None
    market_cap_max: Optional[int] = None
    sic_codes: Optional[List[str]] = None
    
    # Real-time screener filters (price/volume dynamics)
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_volume: Optional[float] = None
    min_change_percent: Optional[float] = None
    order_by: Optional[str] = None
    limit: Optional[int] = None


class CreateScreeningCriteriaRequest(BaseModel):
    """Request model for creating screening criteria."""
    name: str
    description: Optional[str] = None
    criteria: ScreeningCriteriaParams


class UpdateScreeningCriteriaRequest(BaseModel):
    """Request model for updating screening criteria."""
    name: Optional[str] = None
    description: Optional[str] = None
    criteria: Optional[ScreeningCriteriaParams] = None


class ScreeningCriteriaResponse(BaseModel):
    """Response model for screening criteria."""
    id: str
    name: str
    description: Optional[str]
    criteria: dict
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.get("/screening-criteria", response_model=List[ScreeningCriteriaResponse])
async def list_screening_criteria() -> List[ScreeningCriteriaResponse]:
    """
    List all screening criteria.
    
    Returns list of all available screening criteria configurations
    that can be associated with funds.
    """
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(ScreeningCriteria).order_by(ScreeningCriteria.name)
            )
            criteria_list = result.scalars().all()
            
            return [
                ScreeningCriteriaResponse(
                    id=c.id,
                    name=c.name,
                    description=c.description,
                    criteria=c.criteria,
                    created_at=c.created_at.isoformat(),
                    updated_at=c.updated_at.isoformat()
                )
                for c in criteria_list
            ]
    except Exception as e:
        logger.error(f"Failed to list screening criteria: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list screening criteria: {str(e)}"
        )


@router.get("/screening-criteria/{criteria_id}", response_model=ScreeningCriteriaResponse)
async def get_screening_criteria(criteria_id: str) -> ScreeningCriteriaResponse:
    """
    Get a specific screening criteria by ID.
    
    Args:
        criteria_id: UUID of the screening criteria
        
    Returns:
        Screening criteria details
    """
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
            )
            criteria = result.scalar_one_or_none()
            
            if not criteria:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Screening criteria {criteria_id} not found"
                )
            
            return ScreeningCriteriaResponse(
                id=criteria.id,
                name=criteria.name,
                description=criteria.description,
                criteria=criteria.criteria,
                created_at=criteria.created_at.isoformat(),
                updated_at=criteria.updated_at.isoformat()
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get screening criteria {criteria_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get screening criteria: {str(e)}"
        )


@router.post("/screening-criteria", response_model=ScreeningCriteriaResponse, status_code=status.HTTP_201_CREATED)
async def create_screening_criteria(request: CreateScreeningCriteriaRequest) -> ScreeningCriteriaResponse:
    """
    Create new screening criteria.
    
    Args:
        request: Screening criteria details including name and filter parameters
        
    Returns:
        Created screening criteria
    """
    logger.info(f"=== CREATE SCREENING CRITERIA REQUEST ===")
    logger.info(f"Request data: {request.model_dump()}")
    try:
        async with get_async_session() as session:
            # Create new screening criteria
            criteria = ScreeningCriteria(
                id=str(uuid.uuid4()),
                name=request.name,
                description=request.description,
                criteria=request.criteria.model_dump(exclude_none=True),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            session.add(criteria)
            await session.commit()
            await session.refresh(criteria)
            
            logger.info(f"✅ Successfully created screening criteria: {criteria.id} - {criteria.name}")
            
            return ScreeningCriteriaResponse(
                id=criteria.id,
                name=criteria.name,
                description=criteria.description,
                criteria=criteria.criteria,
                created_at=criteria.created_at.isoformat(),
                updated_at=criteria.updated_at.isoformat()
            )
    except Exception as e:
        logger.error(f"❌ Failed to create screening criteria: {e}", exc_info=True)
        logger.error(f"Request was: {request.model_dump()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create screening criteria: {str(e)}"
        )


@router.put("/screening-criteria/{criteria_id}", response_model=ScreeningCriteriaResponse)
async def update_screening_criteria(
    criteria_id: str,
    request: UpdateScreeningCriteriaRequest
) -> ScreeningCriteriaResponse:
    """
    Update existing screening criteria.
    
    Args:
        criteria_id: UUID of the screening criteria to update
        request: Updated screening criteria fields
        
    Returns:
        Updated screening criteria
    """
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
            )
            criteria = result.scalar_one_or_none()
            
            if not criteria:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Screening criteria {criteria_id} not found"
                )
            
            # Update fields if provided
            if request.name is not None:
                criteria.name = request.name
            if request.description is not None:
                criteria.description = request.description
            if request.criteria is not None:
                criteria.criteria = request.criteria.model_dump(exclude_none=True)
            
            criteria.updated_at = datetime.utcnow()
            
            await session.commit()
            await session.refresh(criteria)
            
            logger.info(f"Updated screening criteria: {criteria.id} - {criteria.name}")
            
            return ScreeningCriteriaResponse(
                id=criteria.id,
                name=criteria.name,
                description=criteria.description,
                criteria=criteria.criteria,
                created_at=criteria.created_at.isoformat(),
                updated_at=criteria.updated_at.isoformat()
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update screening criteria {criteria_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update screening criteria: {str(e)}"
        )


@router.delete("/screening-criteria/{criteria_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_screening_criteria(criteria_id: str):
    """
    Delete screening criteria.
    
    Fails if the criteria is currently in use by any strategy.
    
    Args:
        criteria_id: UUID of the screening criteria to delete
    """
    try:
        async with get_async_session() as session:
            # Check if criteria exists
            result = await session.execute(
                select(ScreeningCriteria).where(ScreeningCriteria.id == criteria_id)
            )
            criteria = result.scalar_one_or_none()
            
            if not criteria:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Screening criteria {criteria_id} not found"
                )
            
            # Check if any strategies are using this criteria
            strategy_result = await session.execute(
                select(func.count(Strategy.id)).where(
                    Strategy.screening_criteria_id == criteria_id
                )
            )
            strategy_count = strategy_result.scalar()
            
            if strategy_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot delete screening criteria: {strategy_count} strategy(ies) are using it"
                )
            
            # Delete criteria
            await session.delete(criteria)
            await session.commit()
            
            logger.info(f"Deleted screening criteria: {criteria_id} - {criteria.name}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete screening criteria {criteria_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete screening criteria: {str(e)}"
        )

