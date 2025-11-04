"""Trading API endpoints."""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from app.services.trading.alpaca_service import alpaca_service, AlpacaService
from app.services.core.database import get_async_session
from app.models.strategies import Fund

logger = logging.getLogger("app.routers.trading")

router = APIRouter()


class OrderRequest(BaseModel):
    """Request model for placing orders."""
    symbol: str
    qty: float
    side: str
    order_type: str = "market"
    time_in_force: str = "gtc"  # day, gtc, ioc, fok
    notional: float = None  # For notional orders


@router.get("/account")
async def get_account():
    """Get account info (buying power, equity, cash)"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        account_data = await alpaca_service.get_account()
        return {"account": account_data}
    except Exception as e:
        logger.error(f"Failed to get account info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get account info: {str(e)}")


@router.get("/positions")
async def get_positions():
    """Get all current positions"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        positions = await alpaca_service.get_positions()
        return {"positions": positions}
    except Exception as e:
        logger.error(f"Failed to get positions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get positions: {str(e)}")


@router.get("/orders")
async def get_orders(status: str = "all", limit: int = 25):
    """Get order history"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        # For now, return empty orders - can be implemented later
        # when we add get_orders method to AlpacaService
        return {"orders": []}
    except Exception as e:
        logger.error(f"Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get orders: {str(e)}")


@router.post("/orders")
async def place_order(request: OrderRequest):
    """Place a trading order"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        # Use qty if provided, otherwise use notional
        result = await alpaca_service.place_market_order(
            symbol=request.symbol,
            qty=request.qty if request.qty else None,
            notional=request.notional if request.notional else None,
            side=request.side,
            time_in_force=request.time_in_force
        )
        return {"order": result}
    except Exception as e:
        logger.error(f"Failed to place order: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to place order: {str(e)}")


@router.get("/quote")
async def get_quote(symbol: str):
    """Get latest quote for a symbol"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        quote = await alpaca_service.get_quote(symbol)
        return {"quote": quote}
    except Exception as e:
        logger.error(f"Failed to get quote for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get quote for {symbol}: {str(e)}")


@router.get("/alpaca/account-summary")
async def get_alpaca_account_summary():
    """Get Alpaca account balances and fund allocations for paper and real trading"""
    try:
        # Initialize both paper and real trading services
        paper_service = AlpacaService(paper_trading=True)
        real_service = AlpacaService(paper_trading=False)
        
        # Get account balances
        paper_balance = 0.0
        real_balance = 0.0
        
        if paper_service.is_available():
            try:
                paper_account = paper_service.client.get_account()
                paper_balance = float(paper_account.cash)
            except Exception as e:
                logger.warning(f"Failed to get paper trading account: {e}")
        
        if real_service.is_available():
            try:
                real_account = real_service.client.get_account()
                real_balance = float(real_account.cash)
            except Exception as e:
                logger.warning(f"Failed to get real trading account: {e}")
        
        # Calculate total allocated across funds
        async with get_async_session() as session:
            result = await session.execute(
                select(func.sum(Fund.balance), Fund.mode).group_by(Fund.mode)
            )
            allocations = {mode: float(total) if total else 0.0 for total, mode in result}
        
        paper_allocated = allocations.get("sim", 0.0)
        real_allocated = allocations.get("real", 0.0)
        
        return {
            "paper": {
                "balance": paper_balance,
                "allocated": paper_allocated,
                "available": paper_balance - paper_allocated,
                "allocated_percent": (paper_allocated / paper_balance * 100) if paper_balance > 0 else 0,
            },
            "real": {
                "balance": real_balance,
                "allocated": real_allocated,
                "available": real_balance - real_allocated,
                "allocated_percent": (real_allocated / real_balance * 100) if real_balance > 0 else 0,
            }
        }
    except Exception as e:
        logger.error(f"Failed to get Alpaca account summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

