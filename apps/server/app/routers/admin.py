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
from app.services.float_scraper import (
    start_float_scraping_task,
    cancel_float_scraping_task,
    get_float_scraping_status
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
    Get a summary of the loaded asset data, with focus on CS (Common Stock) metrics.
    
    Returns:
        Dictionary with counts and statistics about loaded ticker data,
        including float metrics completeness for CS stocks
        
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
            
            # Get CS stock count
            cs_result = await session.execute(
                select(func.count(TickerDetails.symbol))
                .where(TickerDetails.type == "CS")
                .where(TickerDetails.active == True)
            )
            cs_count = cs_result.scalar()
            
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
            
            # Get data completeness stats for all tickers
            completeness_result = await session.execute(
                select(
                    func.count(TickerDetails.market_cap).label("with_market_cap"),
                    func.count(TickerDetails.total_employees).label("with_employees"),
                    func.count(TickerDetails.sic_code).label("with_sic_code"),
                    func.count(TickerDetails.description).label("with_description")
                )
            )
            completeness = completeness_result.first()
            
            # Get data completeness for CS stocks only
            cs_completeness_result = await session.execute(
                select(
                    func.count(TickerDetails.market_cap).label("with_market_cap"),
                    func.count(TickerDetails.total_employees).label("with_employees"),
                    func.count(TickerDetails.sic_code).label("with_sic_code"),
                    func.count(TickerDetails.description).label("with_description"),
                    func.count(TickerDetails.public_float).label("with_float"),
                    func.count(TickerDetails.short_percent_of_float).label("with_short_percent"),
                    func.count(TickerDetails.outstanding_shares_scraped).label("with_outstanding")
                )
                .where(TickerDetails.type == "CS")
                .where(TickerDetails.active == True)
            )
            cs_completeness = cs_completeness_result.first()
            
            return {
                "total_tickers": total_count,
                "cs_stocks": cs_count,
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
                },
                "cs_data_quality": {
                    "total_cs_stocks": cs_count,
                    "with_market_cap": cs_completeness.with_market_cap,
                    "with_employees": cs_completeness.with_employees,
                    "with_sic_code": cs_completeness.with_sic_code,
                    "with_description": cs_completeness.with_description,
                    "with_public_float": cs_completeness.with_float,
                    "with_short_percent": cs_completeness.with_short_percent,
                    "with_outstanding_shares": cs_completeness.with_outstanding,
                    "market_cap_percentage": round(cs_completeness.with_market_cap / cs_count * 100, 1) if cs_count > 0 else 0,
                    "employees_percentage": round(cs_completeness.with_employees / cs_count * 100, 1) if cs_count > 0 else 0,
                    "sic_code_percentage": round(cs_completeness.with_sic_code / cs_count * 100, 1) if cs_count > 0 else 0,
                    "description_percentage": round(cs_completeness.with_description / cs_count * 100, 1) if cs_count > 0 else 0,
                    "float_percentage": round(cs_completeness.with_float / cs_count * 100, 1) if cs_count > 0 else 0,
                    "short_percent_percentage": round(cs_completeness.with_short_percent / cs_count * 100, 1) if cs_count > 0 else 0,
                    "outstanding_percentage": round(cs_completeness.with_outstanding / cs_count * 100, 1) if cs_count > 0 else 0,
                }
            }
            
    except Exception as e:
        logger.error(f"Failed to get asset summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve asset summary"
        )


@router.post("/float/scrape/sample", response_model=AssetLoadingResponse)
async def start_sample_float_scraping() -> AssetLoadingResponse:
    """
    Scrape float data for one sample ticker for testing.
    
    This scrapes just one ticker (AAPL) to verify the integration works
    before running a full scrape.
    """
    try:
        result = await start_float_scraping_task(sample_mode=True)
        return AssetLoadingResponse(**result)
    except Exception as e:
        logger.error(f"Failed to start sample float scraping: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start sample float scraping: {str(e)}"
        )


@router.post("/float/scrape", response_model=AssetLoadingResponse)
async def start_float_scraping() -> AssetLoadingResponse:
    """
    Start the full float scraping background task.
    
    This will begin scraping float metrics (public float, short % of float,
    outstanding shares) from knowthefloat.com for all CS (Common Stock) type
    tickers in the database.
    
    Returns:
        AssetLoadingResponse with status_id and message
        
    Raises:
        HTTPException: If a task is already running
    """
    try:
        result = await start_float_scraping_task()
        return AssetLoadingResponse(**result)
    except ValueError as e:
        if "already running" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Float scraping task is already running"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
    except Exception as e:
        logger.error(f"Failed to start float scraping task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start float scraping task"
        )


@router.get("/float/status", response_model=AssetStatusResponse | None)
async def get_float_status() -> AssetStatusResponse | None:
    """
    Get the current float scraping status.
    
    Returns:
        AssetStatusResponse with current progress and status,
        or None if no scraping task has been run
        
    Raises:
        HTTPException: If there's an error retrieving status
    """
    try:
        status_data = await get_float_scraping_status()
        
        if not status_data:
            return None
        
        return AssetStatusResponse(**status_data)
        
    except Exception as e:
        logger.error(f"Failed to get float scraping status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve float scraping status"
        )


@router.post("/float/cancel", response_model=CancelResponse)
async def cancel_float_scraping() -> CancelResponse:
    """
    Cancel the currently running float scraping task.
    
    This will gracefully stop the background task and mark it as cancelled.
    
    Returns:
        CancelResponse indicating whether the task was cancelled
        
    Raises:
        HTTPException: If there's an error cancelling the task
    """
    try:
        cancelled = await cancel_float_scraping_task()
        
        if cancelled:
            return CancelResponse(
                cancelled=True,
                message="Float scraping task cancelled successfully"
            )
        else:
            return CancelResponse(
                cancelled=False,
                message="No float scraping task is currently running"
            )
            
    except Exception as e:
        logger.error(f"Failed to cancel float scraping task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel float scraping task"
        )
