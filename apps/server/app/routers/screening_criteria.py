"""
Screening Criteria API endpoints.

Provides CRUD operations for reusable screening criteria configurations
that can be used by multiple funds.
"""

import logging
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import ScreeningCriteria, Fund
from app.services.core.database import get_async_session

logger = logging.getLogger("app.screening_criteria")

router = APIRouter()


# ============================================================================
# Diagnostic Endpoint
# ============================================================================

@router.get("/screening-criteria/diagnostics/historical-data")
async def check_historical_data(
    timestamp: Optional[datetime] = Query(None, description="Check if data exists at this timestamp")
) -> dict:
    """
    Diagnostic endpoint to check if historical data exists in TimescaleDB.
    
    Returns information about what data is available.
    """
    from app.services.core.database import get_async_session
    from sqlalchemy import text
    from datetime import timezone
    
    try:
        async with get_async_session() as session:
            # Check if market_data table exists and has data (1day timescale)
            result = await session.execute(text("""
                SELECT 
                    COUNT(*) as total_rows,
                    MIN(time) as earliest_date,
                    MAX(time) as latest_date,
                    COUNT(DISTINCT symbol) as symbol_count,
                    COUNT(DISTINCT timescale) as timescale_count
                FROM market_data
                WHERE timescale = '1day'
            """))
            stats = result.fetchone()
            
            response = {
                "table_exists": True,
                "total_rows": stats[0] if stats else 0,
                "earliest_date": stats[1].isoformat() if stats and stats[1] else None,
                "latest_date": stats[2].isoformat() if stats and stats[2] else None,
                "symbol_count": stats[3] if stats else 0,
                "timescale_count": stats[4] if stats else 0,
            }
            
            # If a specific timestamp was provided, check for data near that time
            if timestamp:
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
                
                result = await session.execute(text("""
                    SELECT 
                        COUNT(*) as rows_at_timestamp,
                        COUNT(DISTINCT symbol) as symbols_at_timestamp
                    FROM market_data
                    WHERE timescale = '1day'
                      AND time <= :timestamp
                      AND time >= :timestamp - INTERVAL '1 hour'
                """), {"timestamp": timestamp})
                
                timestamp_stats = result.fetchone()
                response["timestamp_check"] = {
                    "requested_timestamp": timestamp.isoformat(),
                    "rows_within_hour": timestamp_stats[0] if timestamp_stats else 0,
                    "symbols_within_hour": timestamp_stats[1] if timestamp_stats else 0,
                }
            
            return response
            
    except Exception as e:
        logger.error(f"Error checking historical data: {e}", exc_info=True)
        return {
            "error": str(e),
            "table_exists": False,
            "message": "TimescaleDB table may not exist or there may be a connection issue"
        }


# ============================================================================
# Request/Response Models
# ============================================================================

from app.types import ScreenerCriteria  # Use shared criteria model


class ScreenerRunResult(BaseModel):
    """Result of running the screener."""
    ticker_count: int
    tickers: List[str]
    results: Optional[List[Dict[str, Any]]] = None  # Full screener result data


# ============================================================================
# Screener Execution
# ============================================================================

@router.post("/screening-criteria/run", response_model=ScreenerRunResult)
async def run_screener_with_inline_criteria(
    criteria: ScreenerCriteria,
    timestamp: Optional[datetime] = Query(None, description="Historical timestamp for time-travel mode. None = live mode.")
) -> ScreenerRunResult:
    """
    Run the screener with inline criteria (no database save required).
    
    This endpoint allows running screeners with temporary criteria without
    creating a database record. Useful for testing filters.
    
    Args:
        criteria: Screening criteria parameters
        timestamp: Optional datetime for historical mode. If None, uses live data.
        
    Returns:
        List of tickers matching the criteria and count
    """
    import time
    request_start = time.time()
    logger.info(f"[ENDPOINT] POST /screening-criteria/run called - timestamp={timestamp}, criteria={criteria.model_dump(exclude_none=True)}")
    
    try:
        technical_filters = criteria.technical_filters
        
        # Extract parameters
        min_price = criteria.min_price
        max_price = criteria.max_price
        min_volume = criteria.min_volume
        min_change_percent = criteria.min_change_percent
        max_change_percent = criteria.max_change_percent
        min_relative_volume = criteria.min_relative_volume
        exclude_etfs = True if criteria.exclude_etfs is None else criteria.exclude_etfs
        asset_types = criteria.asset_types
        market_cap_min = criteria.market_cap_min
        market_cap_max = criteria.market_cap_max
        order_by = criteria.order_by or "rv14"
        limit = criteria.limit or 200
        
        logger.info(f"[ENDPOINT] Extracted params: min_rv={min_relative_volume}, timestamp={timestamp}")
        
        # Determine if historical or live mode
        if timestamp is not None:
            logger.info(f"[ENDPOINT] Timestamp mode check starting...")
            from datetime import timezone, timedelta
            from app.services.screener.screener import get_screener_service
            screener_service = get_screener_service()
            
            if not screener_service:
                logger.error("[ENDPOINT] Screener service not available!")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Screener service not available"
                )
            
            logger.info("[ENDPOINT] Screener service available, checking if recent timestamp...")
            # If timestamp is very recent (within last 5 minutes), use live mode instead
            # This ensures we get the most up-to-date data and matches live screener behavior
            now = datetime.now(timezone.utc) if timestamp.tzinfo else datetime.utcnow()
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            time_diff = (now - timestamp).total_seconds()
            use_live_for_recent = time_diff <= 300  # 5 minutes
            
            logger.info(f"[ENDPOINT] Time check: now={now}, timestamp={timestamp}, diff={time_diff:.0f}s, use_live={use_live_for_recent}")
            
            if use_live_for_recent:
                logger.info(f"[ENDPOINT] Using LIVE mode (timestamp is recent: {time_diff:.0f}s ago)")
                # Use centralized compute_live method (same as pure live mode)
                results = await screener_service.compute_live(
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
                    market_cap_max=market_cap_max
                )
            else:
                # Historical mode: query TimescaleDB
                hist_start = time.time()
                logger.info(f"[ENDPOINT] Using HISTORICAL mode at {timestamp}")
                logger.info(f"[ENDPOINT] Calling compute_historical with min_rv={min_relative_volume}...")
                
                results = await screener_service.compute_historical(
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
                    market_cap_max=market_cap_max
                )
                
                logger.info(f"[ENDPOINT] compute_historical returned {len(results)} results")
        else:
            # Live mode: use same code path as strategy engine
            from app.services.screener.screener import get_screener_service
            screener_service = get_screener_service()
            
            if not screener_service:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Screener service not available. Please ensure the server is fully started."
                )
            
            # Use the same method as strategy engine - fetch from TimescaleDB and compute
            # This ensures UI and strategies see the exact same results
            results = await screener_service.compute_live(
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
                market_cap_max=market_cap_max
            )
        
        # Extract ticker symbols
        tickers = [r["ticker"] for r in results]
        
        request_time = time.time() - request_start
        logger.info(f"[ENDPOINT] Screener run completed in {request_time:.2f}s: {len(tickers)} tickers matched (timestamp={timestamp})")
        
        # If historical mode returned no results and timestamp was provided, check if it's a data issue
        if timestamp and len(results) == 0 and not use_live_for_recent:
            logger.warning(
                f"Historical screener returned 0 results for {timestamp}. "
                "This may indicate no data in TimescaleDB. Check /api/screening-criteria/diagnostics/historical-data"
            )
        
        return ScreenerRunResult(
            ticker_count=len(tickers),
            tickers=tickers,
            results=results  # Include full result data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to run screener with inline criteria: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run screener: {str(e)}"
        )


@router.post("/screening-criteria/{criteria_id}/run", response_model=ScreenerRunResult)
async def run_screener_with_criteria(
    criteria_id: str,
    timestamp: Optional[datetime] = Query(None, description="Historical timestamp for time-travel mode. None = live mode.")
) -> ScreenerRunResult:
    """
    Run the screener with specific criteria and return matching tickers.
    
    Args:
        criteria_id: UUID of the screening criteria to use
        timestamp: Optional datetime for historical mode. If None, uses live data.
        
    Returns:
        List of tickers matching the criteria and count
    """
    try:
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
        
        params = ScreenerCriteria(**(criteria.criteria or {}))
        technical_filters = params.technical_filters
        
        # Extract parameters - use None to skip filters (more permissive)
        min_price = params.min_price
        max_price = params.max_price
        min_volume = params.min_volume
        min_change_percent = params.min_change_percent
        max_change_percent = params.max_change_percent
        exclude_etfs = True if params.exclude_etfs is None else params.exclude_etfs
        asset_types = params.asset_types
        market_cap_min = params.market_cap_min
        market_cap_max = params.market_cap_max
        order_by = params.order_by or "rv14"
        limit = params.limit or 200
        min_relative_volume = params.min_relative_volume

        # Determine if historical or live mode
        if timestamp is not None:
            from datetime import timezone, timedelta
            from app.services.screener.screener import get_screener_service
            screener_service = get_screener_service()
            
            if not screener_service:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Screener service not available"
                )
            
            # If timestamp is very recent (within last 5 minutes), use live mode instead
            # This ensures we get the most up-to-date data and matches live screener behavior
            now = datetime.now(timezone.utc) if timestamp.tzinfo else datetime.utcnow()
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            time_diff = (now - timestamp).total_seconds()
            use_live_for_recent = time_diff <= 300  # 5 minutes
            
            if use_live_for_recent:
                logger.info(f"Timestamp {timestamp} is recent ({time_diff:.0f}s ago), using live mode instead of historical")
                # Use centralized compute_live method (same as pure live mode)
                results = await screener_service.compute_live(
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
                    market_cap_max=market_cap_max
                )
            else:
                # Historical mode: query TimescaleDB
                logger.info(f"Running historical screener for criteria {criteria_id} at {timestamp}")
                
                results = await screener_service.compute_historical(
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
                    market_cap_max=market_cap_max
                )
        else:
            # Live mode: use same code path as strategy engine
            from app.services.screener.screener import get_screener_service
            screener_service = get_screener_service()
            
            if not screener_service:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Screener service not available. Please ensure the server is fully started."
                )
            
            # Use centralized compute_live method
            results = await screener_service.compute_live(
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
                market_cap_max=market_cap_max
            )
        
        # Extract ticker symbols
        tickers = [r["ticker"] for r in results]
        
        logger.info(f"Screener run for criteria {criteria_id}: {len(tickers)} tickers matched (timestamp={timestamp})")
        
        return ScreenerRunResult(
            ticker_count=len(tickers),
            tickers=tickers,
            results=results  # Include full result data
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

class CreateScreeningCriteriaRequest(BaseModel):
    """Request model for creating screening criteria."""
    name: str
    description: Optional[str] = None
    criteria: ScreenerCriteria


class UpdateScreeningCriteriaRequest(BaseModel):
    """Request model for updating screening criteria."""
    name: Optional[str] = None
    description: Optional[str] = None
    criteria: Optional[ScreenerCriteria] = None


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
            
            # Check if any funds are using this criteria
            fund_result = await session.execute(
                select(func.count(Fund.id)).where(
                    Fund.screening_criteria_id == criteria_id
                )
            )
            fund_count = fund_result.scalar()
            
            if fund_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Cannot delete screening criteria: {fund_count} fund(s) are using it"
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

