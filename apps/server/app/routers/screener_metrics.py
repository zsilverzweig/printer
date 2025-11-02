"""
API endpoints for screener metrics management.

Provides admin endpoints to manually trigger calculations and check status.
"""

import asyncio
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.screener.screener_metrics_job import run_daily_metrics_calculation
from app.services.screener.screener_metrics_storage import get_metrics_coverage


router = APIRouter(tags=["screener-metrics"])


class CalculateMetricsRequest(BaseModel):
    """Request to calculate metrics for a specific date."""
    date: Optional[str] = None  # Format: YYYY-MM-DD, defaults to yesterday


class BackfillRequest(BaseModel):
    """Request to backfill metrics for a date range."""
    start_date: str  # Format: YYYY-MM-DD
    end_date: str    # Format: YYYY-MM-DD


@router.post("/api/screener-metrics/calculate")
async def trigger_calculation(request: CalculateMetricsRequest = CalculateMetricsRequest()):
    """
    Manually trigger metrics calculation for a specific date.
    
    Args:
        request: Optional date to calculate for (default: yesterday)
        
    Returns:
        Calculation results summary
    """
    try:
        # Parse date if provided
        target_date = None
        if request.date:
            target_date = datetime.strptime(request.date, "%Y-%m-%d").date()
        
        # Run calculation
        result = await run_daily_metrics_calculation(target_date)
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation failed: {e}")


@router.post("/api/screener-metrics/backfill")
async def trigger_backfill(request: BackfillRequest):
    """
    Trigger backfill for a date range.
    
    Runs in background. Use /status endpoint to check progress.
    
    Args:
        request: Start and end dates for backfill
        
    Returns:
        Status message
    """
    try:
        # Parse dates
        start_date = datetime.strptime(request.start_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d").date()
        
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date must be before end_date")
        
        # Import backfill function
        from app.services.screener.screener_metrics_job import run_daily_metrics_calculation
        
        # Run in background for each date
        async def backfill_range():
            current_date = start_date
            while current_date <= end_date:
                # Skip weekends
                if current_date.weekday() < 5:
                    await run_daily_metrics_calculation(current_date)
                current_date += datetime.timedelta(days=1)
        
        # Start background task
        asyncio.create_task(backfill_range())
        
        days = (end_date - start_date).days + 1
        return {
            "status": "started",
            "start_date": request.start_date,
            "end_date": request.end_date,
            "total_days": days,
            "message": f"Backfill started for {days} days. Use /status endpoint to check progress."
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backfill failed to start: {e}")


@router.get("/api/screener-metrics/status")
async def get_status():
    """
    Get metrics coverage statistics.
    
    Returns information about how many symbols and dates have metrics calculated.
    
    Returns:
        Coverage statistics
    """
    try:
        stats = await get_metrics_coverage()
        
        if not stats:
            return {
                "status": "empty",
                "message": "No metrics calculated yet. Run /calculate or /backfill to populate."
            }
        
        return {
            "status": "ok",
            **stats
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get status: {e}")

