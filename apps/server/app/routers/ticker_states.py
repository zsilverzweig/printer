"""
Ticker States API Router

Endpoints for querying ticker lifecycle states and transition history.
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select, and_

from app.models.strategies import TickerState
from app.services.core.database import get_async_session
from app.services.strategies.ticker_state_service import get_ticker_state_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/funds/{fund_id}/ticker-states")
async def get_ticker_states(
    fund_id: str,
    state: Optional[str] = Query(None, description="Filter by state (screened, setup, entered, filled, exited, removed)")
) -> List[dict]:
    """
    Get all ticker states for a fund, optionally filtered by state.
    
    Args:
        fund_id: Fund ID
        state: Optional state filter
        
    Returns:
        List of ticker state records
    """
    try:
        ticker_state_service = get_ticker_state_service()
        states = await ticker_state_service.get_fund_tickers_by_state(fund_id, state)
        
        return [s.to_dict() for s in states]
    
    except Exception as e:
        logger.error(f"Error fetching ticker states for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/ticker-states/{ticker}")
async def get_ticker_state(
    fund_id: str,
    ticker: str
) -> dict:
    """
    Get current state for a specific ticker.
    
    Args:
        fund_id: Fund ID
        ticker: Ticker symbol
        
    Returns:
        Ticker state record
    """
    try:
        ticker_state_service = get_ticker_state_service()
        state = await ticker_state_service.get_ticker_state(fund_id, ticker)
        
        if not state:
            raise HTTPException(status_code=404, detail=f"Ticker state not found for {ticker}")
        
        return state.to_dict()
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ticker state for {fund_id}/{ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/ticker-states/{ticker}/history")
async def get_ticker_history(
    fund_id: str,
    ticker: str
) -> dict:
    """
    Get transition history for a specific ticker.
    
    Args:
        fund_id: Fund ID
        ticker: Ticker symbol
        
    Returns:
        Ticker state with full transition history
    """
    try:
        ticker_state_service = get_ticker_state_service()
        state = await ticker_state_service.get_ticker_state(fund_id, ticker)
        
        if not state:
            raise HTTPException(status_code=404, detail=f"Ticker state not found for {ticker}")
        
        return {
            'ticker': state.ticker,
            'current_state': state.current_state,
            'transitions': state.state_transitions or [],
            'last_screened_at': state.last_screened_at.isoformat() if state.last_screened_at else None,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ticker history for {fund_id}/{ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

