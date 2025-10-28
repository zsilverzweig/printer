"""
Admin API endpoints for managing asset loading and database operations.

Provides REST endpoints for:
- Starting asset loading tasks
- Checking loading status
- Cancelling running tasks
"""

import logging
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.asset_loader import (
    start_asset_loading_task,
    cancel_asset_loading_task,
    get_loading_status
)

logger = logging.getLogger("app.admin")

router = APIRouter()


class AssetLoadingResponse(BaseModel):
    """Response model for asset loading operations."""
    status_id: int
    message: str


class AssetStatusResponse(BaseModel):
    """Response model for asset loading status."""
    status: str
    total_tickers: int | None
    processed_tickers: int
    failed_tickers: int
    current_phase: str | None
    error_message: str | None
    started_at: str | None
    completed_at: str | None
    estimated_remaining: str | None
    progress_percentage: float


class CancelResponse(BaseModel):
    """Response model for cancel operation."""
    cancelled: bool
    message: str


@router.post("/assets/load/sample", response_model=AssetLoadingResponse)
async def start_sample_asset_loading() -> AssetLoadingResponse:
    """
    Load a single sample ticker for testing.
    
    This loads just one ticker (AAPL) to verify the integration works
    before running a full load.
    """
    try:
        result = await start_asset_loading_task(sample_mode=True)
        return AssetLoadingResponse(**result)
    except Exception as e:
        logger.error(f"Failed to start sample asset loading: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start sample asset loading: {str(e)}"
        )


@router.post("/assets/load", response_model=AssetLoadingResponse)
async def start_asset_loading() -> AssetLoadingResponse:
    """
    Start the full asset loading background task.
    
    This will begin loading ALL ticker details from Polygon API into
    the PostgreSQL database. Uses the same snapshot endpoint that the
    TCC (Trading Command Center) uses for reliability.
    
    Returns:
        AssetLoadingResponse with status_id and message
        
    Raises:
        HTTPException: If a task is already running
    """
    try:
        status_id = await start_asset_loading_task()
        return AssetLoadingResponse(
            status_id=status_id,
            message="Asset loading task started successfully"
        )
    except ValueError as e:
        if "already running" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Asset loading task is already running"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
    except Exception as e:
        logger.error(f"Failed to start asset loading task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start asset loading task"
        )


@router.get("/assets/status", response_model=AssetStatusResponse | None)
async def get_asset_loading_status() -> AssetStatusResponse | None:
    """
    Get the current asset loading status.
    
    Returns:
        AssetStatusResponse with current progress and status,
        or None if no loading task has been run
        
    Raises:
        HTTPException: If there's an error retrieving status
    """
    try:
        status_data = await get_loading_status()
        
        if not status_data:
            return None
        
        return AssetStatusResponse(**status_data)
        
    except Exception as e:
        logger.error(f"Failed to get asset loading status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve asset loading status"
        )


@router.post("/assets/cancel", response_model=CancelResponse)
async def cancel_asset_loading() -> CancelResponse:
    """
    Cancel the currently running asset loading task.
    
    This will gracefully stop the background task and mark it as cancelled.
    
    Returns:
        CancelResponse indicating whether the task was cancelled
        
    Raises:
        HTTPException: If there's an error cancelling the task
    """
    try:
        cancelled = await cancel_asset_loading_task()
        
        if cancelled:
            return CancelResponse(
                cancelled=True,
                message="Asset loading task cancelled successfully"
            )
        else:
            return CancelResponse(
                cancelled=False,
                message="No asset loading task is currently running"
            )
            
    except Exception as e:
        logger.error(f"Failed to cancel asset loading task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel asset loading task"
        )


@router.get("/assets/summary")
async def get_asset_summary() -> Dict[str, Any]:
    """
    Get a summary of the loaded asset data.
    
    Returns:
        Dictionary with counts and statistics about loaded ticker data
        
    Raises:
        HTTPException: If there's an error retrieving summary
    """
    try:
        from app.services.database import get_async_session
        from app.models.assets import TickerDetails
        from sqlalchemy import func, select
        
        async with get_async_session() as session:
            # Get total count
            total_result = await session.execute(select(func.count(TickerDetails.symbol)))
            total_count = total_result.scalar()
            
            # Get counts by exchange
            exchange_result = await session.execute(
                select(TickerDetails.primary_exchange, func.count(TickerDetails.symbol))
                .group_by(TickerDetails.primary_exchange)
                .order_by(func.count(TickerDetails.symbol).desc())
            )
            exchanges = dict(exchange_result.fetchall())
            
            # Get counts by type
            type_result = await session.execute(
                select(TickerDetails.type, func.count(TickerDetails.symbol))
                .group_by(TickerDetails.type)
                .order_by(func.count(TickerDetails.symbol).desc())
            )
            types = dict(type_result.fetchall())
            
            # Get counts by active status
            active_result = await session.execute(
                select(TickerDetails.active, func.count(TickerDetails.symbol))
                .group_by(TickerDetails.active)
            )
            active_counts = dict(active_result.fetchall())
            
            # Get counts by tradable status
            tradable_result = await session.execute(
                select(TickerDetails.tradable, func.count(TickerDetails.symbol))
                .group_by(TickerDetails.tradable)
            )
            tradable_counts = dict(tradable_result.fetchall())
            
            # Get data completeness stats
            completeness_result = await session.execute(
                select(
                    func.count(TickerDetails.market_cap).label("with_market_cap"),
                    func.count(TickerDetails.total_employees).label("with_employees"),
                    func.count(TickerDetails.sic_code).label("with_sic_code"),
                    func.count(TickerDetails.description).label("with_description")
                )
            )
            completeness = completeness_result.first()
            
            return {
                "total_tickers": total_count,
                "exchanges": exchanges,
                "types": types,
                "active_status": active_counts,
                "tradable_status": tradable_counts,
                "data_completeness": {
                    "with_market_cap": completeness.with_market_cap,
                    "with_employees": completeness.with_employees,
                    "with_sic_code": completeness.with_sic_code,
                    "with_description": completeness.with_description,
                    "market_cap_percentage": round(completeness.with_market_cap / total_count * 100, 1) if total_count > 0 else 0,
                    "employees_percentage": round(completeness.with_employees / total_count * 100, 1) if total_count > 0 else 0,
                    "sic_code_percentage": round(completeness.with_sic_code / total_count * 100, 1) if total_count > 0 else 0,
                    "description_percentage": round(completeness.with_description / total_count * 100, 1) if total_count > 0 else 0,
                }
            }
            
    except Exception as e:
        logger.error(f"Failed to get asset summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve asset summary"
        )
