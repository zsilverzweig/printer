"""
API endpoints for execution strategies.

Provides endpoints to:
- List available execution strategies
- Get strategy metadata and configuration schema
- Future: Backtest strategies
"""

from typing import Dict, Any
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from app.strategies.registry import list_strategies, get_strategy_metadata

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


@router.get("")
async def get_strategies() -> JSONResponse:
    """
    Get list of all available execution strategies.
    
    Returns:
        List of strategy IDs with basic metadata
    """
    try:
        all_metadata = get_strategy_metadata()
        
        # Convert to list format
        strategies = [
            {
                "id": metadata["id"],
                "name": metadata["name"],
                "strategyType": metadata["strategyType"],
                "expectedTimeframe": metadata["expectedTimeframe"],
            }
            for metadata in all_metadata.values()
        ]
        
        return JSONResponse(content=strategies)
    
    except Exception as e:
        logger.error(f"Error listing strategies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{strategy_id}")
async def get_strategy_detail(strategy_id: str) -> JSONResponse:
    """
    Get detailed metadata for a specific strategy.
    
    Args:
        strategy_id: Strategy identifier (e.g., "bull_flag")
        
    Returns:
        Complete strategy metadata including configuration schema
    """
    try:
        metadata = get_strategy_metadata(strategy_id)
        return JSONResponse(content=metadata)
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting strategy {strategy_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{strategy_id}/validate")
async def validate_strategy_config(
    strategy_id: str,
    config: Dict[str, Any]
) -> JSONResponse:
    """
    Validate a strategy configuration.
    
    Args:
        strategy_id: Strategy identifier
        config: Configuration to validate
        
    Returns:
        Validation result
    """
    try:
        from app.strategies.registry import get_strategy
        
        # Try to instantiate with the config
        strategy = get_strategy(strategy_id, config)
        strategy.validate_config(config)
        
        return JSONResponse(content={
            "valid": True,
            "message": "Configuration is valid"
        })
    
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={
                "valid": False,
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f"Error validating config for {strategy_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Future endpoint for backtesting
@router.post("/{strategy_id}/backtest")
async def backtest_strategy(
    strategy_id: str,
    backtest_params: Dict[str, Any]
) -> JSONResponse:
    """
    Backtest a strategy (future implementation).
    
    Args:
        strategy_id: Strategy identifier
        backtest_params: Backtesting parameters
        
    Returns:
        Backtest results
    """
    raise HTTPException(
        status_code=501,
        detail="Backtesting not yet implemented"
    )


