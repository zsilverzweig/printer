"""NOC configuration API endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class NocConfigUpdate(BaseModel):
    """Request model for updating NOC filter configuration."""
    timeframe: Optional[str] = None  # "1m", "5m", "1h", "close"
    min_change_percent: Optional[float] = None
    screener_criteria_id: Optional[str] = None  # Optional saved screener ID


@router.get("/config")
async def get_noc_config():
    """Get current NOC service filter configuration."""
    from app.routers.realtime import noc_service
    
    if noc_service is None:
        raise HTTPException(
            status_code=503,
            detail="NOC service not initialized. Connect to /noc/ws first."
        )
    
    return {
        "timeframe": noc_service.timeframe,
        "min_change_percent": noc_service.min_change_percent,
        "screener_criteria_id": noc_service.screener_criteria_id,
    }


@router.post("/config")
async def update_noc_config(config: NocConfigUpdate):
    """Update NOC service filter configuration.
    
    This updates the in-memory settings used by the NOC service.
    Changes take effect on the next broadcast cycle.
    """
    from app.routers.realtime import noc_service
    
    if noc_service is None:
        raise HTTPException(
            status_code=503,
            detail="NOC service not initialized. Connect to /noc/ws first."
        )
    
    # Update settings
    if config.timeframe is not None:
        valid_timeframes = ["1m", "5m", "1h", "close"]
        if config.timeframe not in valid_timeframes:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timeframe. Must be one of: {valid_timeframes}"
            )
        noc_service.timeframe = config.timeframe
    
    if config.min_change_percent is not None:
        if config.min_change_percent < 0:
            raise HTTPException(
                status_code=400,
                detail="min_change_percent must be >= 0"
            )
        noc_service.min_change_percent = config.min_change_percent
    
    if config.screener_criteria_id is not None:
        if config.screener_criteria_id == "default" or config.screener_criteria_id == "":
            noc_service.screener_criteria_id = None
        else:
            noc_service.screener_criteria_id = config.screener_criteria_id
    
    return {
        "status": "success",
        "config": {
            "timeframe": noc_service.timeframe,
            "min_change_percent": noc_service.min_change_percent,
            "screener_criteria_id": noc_service.screener_criteria_id,
        }
    }

