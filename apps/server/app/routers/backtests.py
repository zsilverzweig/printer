"""
Backtest API endpoints.

Provides endpoints for running backtests, querying results, and managing backtest execution.
"""

import logging
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_

from app.models.strategies import Backtest, Fund, Order, Transaction, Trade
from app.services.core.database import get_async_session
from app.services.backtest.backtest_coordinator import BacktestCoordinator

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response Models
class RunBacktestRequest(BaseModel):
    fund_id: str
    date: str  # YYYY-MM-DD format


class BacktestResponse(BaseModel):
    id: str
    fund_id: str
    fund_name: Optional[str]
    date: str
    status: str
    strategy_id: Optional[str]
    screening_criteria_id: Optional[str]
    screening_criteria_name: Optional[str]
    
    # Results
    starting_balance: float
    ending_balance: Optional[float]
    total_pnl: Optional[float]
    total_pnl_percent: Optional[float]
    total_trades: int
    winning_trades: int
    losing_trades: int
    total_orders: int
    filled_orders: int
    cancelled_orders: int
    
    # Timing
    started_at: str
    completed_at: Optional[str]
    
    # Error tracking
    error_message: Optional[str]
    
    class Config:
        from_attributes = True


class BacktestOrderResponse(BaseModel):
    id: str
    symbol: str
    side: str
    quantity: float
    status: str
    order_type: str
    submitted_at: str
    filled_at: Optional[str]
    filled_qty: Optional[float]
    filled_avg_price: Optional[float]
    
    class Config:
        from_attributes = True


class BacktestTradeResponse(BaseModel):
    id: str
    symbol: str
    entry_price: float
    entry_time: str
    exit_price: Optional[float]
    exit_time: Optional[str]
    quantity: float
    realized_pnl: Optional[float]
    realized_pnl_percent: Optional[float]
    status: str
    
    class Config:
        from_attributes = True


@router.post("/run", response_model=BacktestResponse)
async def run_backtest(request: RunBacktestRequest):
    """
    Start a backtest for a fund on a specific date.
    
    Args:
        request: Backtest configuration with fund_id and date
        
    Returns:
        Backtest record with initial status
        
    Raises:
        HTTPException: If fund not found or backtest fails
    """
    try:
        # Parse date
        backtest_date = datetime.strptime(request.date, "%Y-%m-%d").date()
        
        # Validate fund exists
        async with get_async_session() as session:
            fund = await session.get(Fund, request.fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail=f"Fund {request.fund_id} not found")
        
        # Run backtest
        coordinator = BacktestCoordinator()
        backtest_id = await coordinator.run_backtest(request.fund_id, backtest_date)
        
        # Get backtest record
        async with get_async_session() as session:
            backtest = await session.get(Backtest, backtest_id)
            if not backtest:
                raise HTTPException(status_code=500, detail="Backtest created but not found")
            
            return _serialize_backtest(backtest)
    
    except ValueError as e:
        logger.error(f"Validation error running backtest: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error running backtest: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to run backtest: {str(e)}")


@router.get("/{backtest_id}", response_model=BacktestResponse)
async def get_backtest(backtest_id: str):
    """
    Get backtest details by ID.
    
    Args:
        backtest_id: Backtest ID to retrieve
        
    Returns:
        Backtest record with results
        
    Raises:
        HTTPException: If backtest not found
    """
    async with get_async_session() as session:
        backtest = await session.get(Backtest, backtest_id)
        
        if not backtest:
            raise HTTPException(status_code=404, detail=f"Backtest {backtest_id} not found")
        
        return _serialize_backtest(backtest)


@router.get("/{backtest_id}/orders")
async def get_backtest_orders(backtest_id: str, limit: int = 100):
    """
    Get orders from a backtest.
    
    Args:
        backtest_id: Backtest ID
        limit: Maximum number of orders to return
        
    Returns:
        List of orders from the backtest
    """
    async with get_async_session() as session:
        # Verify backtest exists
        backtest = await session.get(Backtest, backtest_id)
        if not backtest:
            raise HTTPException(status_code=404, detail=f"Backtest {backtest_id} not found")
        
        # Get orders
        stmt = (
            select(Order)
            .where(Order.backtest_id == backtest_id)
            .order_by(Order.submitted_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        orders = result.scalars().all()
        
        return {
            "backtest_id": backtest_id,
            "orders": [_serialize_order(order) for order in orders],
            "total": len(orders)
        }


@router.get("/{backtest_id}/trades")
async def get_backtest_trades(backtest_id: str, limit: int = 100):
    """
    Get trades from a backtest.
    
    Args:
        backtest_id: Backtest ID
        limit: Maximum number of trades to return
        
    Returns:
        List of trades from the backtest
    """
    async with get_async_session() as session:
        # Verify backtest exists
        backtest = await session.get(Backtest, backtest_id)
        if not backtest:
            raise HTTPException(status_code=404, detail=f"Backtest {backtest_id} not found")
        
        # Get trades
        stmt = (
            select(Trade)
            .where(Trade.backtest_id == backtest_id)
            .order_by(Trade.entry_time.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        trades = result.scalars().all()
        
        return {
            "backtest_id": backtest_id,
            "trades": [_serialize_trade(trade) for trade in trades],
            "total": len(trades)
        }


@router.get("")
async def list_backtests(
    fund_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """
    List backtests, optionally filtered by fund and status.
    
    Args:
        fund_id: Optional fund ID to filter by
        status: Optional status filter ('running', 'completed', 'failed')
        limit: Maximum number of results
        offset: Number of results to skip
        
    Returns:
        List of backtests with live transaction counts
    """
    async with get_async_session() as session:
        stmt = select(Backtest).order_by(Backtest.started_at.desc())
        
        if fund_id:
            stmt = stmt.where(Backtest.fund_id == fund_id)
        
        if status:
            stmt = stmt.where(Backtest.status == status)
        
        stmt = stmt.limit(limit).offset(offset)
        
        result = await session.execute(stmt)
        backtests = result.scalars().all()
        
        # For running backtests, get live order/transaction counts
        backtest_data = []
        for bt in backtests:
            bt_dict = _serialize_backtest(bt)
            
            if bt.status == 'running':
                # Get live counts
                order_stmt = select(Order).where(Order.backtest_id == bt.id)
                order_result = await session.execute(order_stmt)
                orders = order_result.scalars().all()
                
                txn_stmt = select(Transaction).where(Transaction.backtest_id == bt.id)
                txn_result = await session.execute(txn_stmt)
                transactions = txn_result.scalars().all()
                
                bt_dict["live_orders"] = len(orders)
                bt_dict["live_filled"] = sum(1 for o in orders if o.status == 'filled')
                bt_dict["live_transactions"] = len(transactions)
            
            backtest_data.append(bt_dict)
        
        return {
            "backtests": backtest_data,
            "total": len(backtests),
            "limit": limit,
            "offset": offset
        }


# Helper serialization functions
def _serialize_backtest(backtest: Backtest) -> dict:
    """Convert Backtest model to response dict."""
    return {
        "id": backtest.id,
        "fund_id": backtest.fund_id,
        "fund_name": backtest.fund_name,
        "date": backtest.date.isoformat() if backtest.date else None,
        "status": backtest.status,
        "strategy_id": backtest.strategy_id,
        "screening_criteria_id": backtest.screening_criteria_id,
        "screening_criteria_name": backtest.screening_criteria_name,
        "starting_balance": backtest.starting_balance,
        "ending_balance": backtest.ending_balance,
        "total_pnl": backtest.total_pnl,
        "total_pnl_percent": backtest.total_pnl_percent,
        "total_trades": backtest.total_trades,
        "winning_trades": backtest.winning_trades,
        "losing_trades": backtest.losing_trades,
        "total_orders": backtest.total_orders,
        "filled_orders": backtest.filled_orders,
        "cancelled_orders": backtest.cancelled_orders,
        "started_at": backtest.started_at.isoformat() if backtest.started_at else None,
        "completed_at": backtest.completed_at.isoformat() if backtest.completed_at else None,
        "error_message": backtest.error_message,
    }


def _serialize_order(order: Order) -> dict:
    """Convert Order model to response dict."""
    return {
        "id": order.id,
        "symbol": order.symbol,
        "side": order.side,
        "quantity": order.quantity,
        "status": order.status,
        "order_type": order.order_type,
        "submitted_at": order.submitted_at.isoformat() if order.submitted_at else None,
        "filled_at": order.filled_at.isoformat() if order.filled_at else None,
        "filled_qty": order.filled_qty,
        "filled_avg_price": order.filled_avg_price,
    }


def _serialize_trade(trade: Trade) -> dict:
    """Convert Trade model to response dict."""
    return {
        "id": trade.id,
        "symbol": trade.symbol,
        "entry_price": trade.entry_price,
        "entry_time": trade.entry_time.isoformat() + "Z" if trade.entry_time else None,
        "exit_price": trade.exit_price,
        "exit_time": trade.exit_time.isoformat() + "Z" if trade.exit_time else None,
        "quantity": trade.entry_quantity,
        "realized_pnl": trade.realized_pnl,
        "realized_pnl_percent": trade.realized_pnl_percent,
        "status": trade.status,
    }

