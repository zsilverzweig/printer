"""
Backtest API endpoints.

Provides endpoints for running backtests, querying results, and managing backtest execution.
"""

import asyncio
import json
import logging
from datetime import date, datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from starlette.websockets import WebSocketState
from pydantic import BaseModel, Field
from sqlalchemy import select, and_

from app.models.strategies import Backtest, Fund, Order, Transaction, Trade
from app.models.backtests import BacktestEvent
from app.services.core.database import get_async_session
from app.services.backtest.backtest_coordinator import BacktestCoordinator
from app.services.backtest.screener_backtest_service import ScreenerBacktestService
from app.services.backtest.progress_broker import backtest_progress_broker

logger = logging.getLogger(__name__)

router = APIRouter()


def _serialize_backtest_event(event: BacktestEvent) -> Dict[str, Any]:
    return {
        "id": event.id,
        "backtest_id": event.backtest_id,
        "fund_id": event.fund_id,
        "event_type": event.event_type,
        "simulated_time": event.simulated_time.isoformat() if event.simulated_time else None,
        "sequence": event.sequence,
        "message": event.message,
        "details": event.details or {},
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


async def _load_backtest_events(backtest_id: str) -> List[Dict[str, Any]]:
    async with get_async_session() as session:
        stmt = (
            select(BacktestEvent)
            .where(BacktestEvent.backtest_id == backtest_id)
            .order_by(BacktestEvent.created_at, BacktestEvent.sequence)
        )
        result = await session.execute(stmt)
        events = result.scalars().all()
    return [_serialize_backtest_event(event) for event in events]


# Request/Response Models
class RunBacktestRequest(BaseModel):
    fund_id: str
    date: str  # YYYY-MM-DD format
    monitoring_interval_minutes: Optional[int] = Field(
        default=None, ge=1, le=30
    )
    duration_minutes: Optional[int] = Field(
        default=None, ge=10, le=391
    )


class StrategyScreenerCombo(BaseModel):
    strategy_id: str
    strategy_config: dict = {}
    screening_criteria_id: Optional[str] = None


class MultiStrategyBacktestRequest(BaseModel):
    fund_template_id: str
    date: str  # YYYY-MM-DD format
    combinations: List[StrategyScreenerCombo]


class MultiStrategyBacktestResponse(BaseModel):
    parent_run_id: str
    backtests: List[Dict[str, Any]]
    summary: Dict[str, Any]


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


class ScreenerBacktestRunRequest(BaseModel):
    date: date
    interval_minutes: int = Field(60, ge=1, le=360)
    fund_ids: Optional[List[str]] = Field(
        default=None,
        description="Optional fund IDs to limit screener backtest scope",
        min_items=1,
    )


class ScreenerBacktestPointResponse(BaseModel):
    timestamp_utc: datetime
    timestamp_local: datetime
    count: int
    tickers: List[str]


class ScreenerBacktestSeriesResponse(BaseModel):
    criteria_id: str
    criteria_name: str
    description: Optional[str]
    total_hits: int
    unique_ticker_count: int
    points: List[ScreenerBacktestPointResponse]


class ScreenerBacktestResponse(BaseModel):
    date: date
    start_utc: datetime
    end_utc: datetime
    interval_minutes: int
    criteria_count: int
    series: List[ScreenerBacktestSeriesResponse]


@router.post("/screener/run", response_model=ScreenerBacktestResponse)
async def run_screener_backtest(request: ScreenerBacktestRunRequest):
    """
    Run screener backtests across all screening criteria for a given date.

    Executes each screener at hourly intervals (configurable) across the
    regular trading session and returns the aggregated match counts.
    """
    service = ScreenerBacktestService()

    try:
        result = await service.run(
            target_date=request.date,
            interval_minutes=request.interval_minutes,
            fund_ids=request.fund_ids,
        )

        series_payload = [
            ScreenerBacktestSeriesResponse(
                criteria_id=series.criteria_id,
                criteria_name=series.criteria_name,
                description=series.description,
                total_hits=series.total_hits,
                unique_ticker_count=series.unique_ticker_count,
                points=[
                    ScreenerBacktestPointResponse(
                        timestamp_utc=point.timestamp_utc,
                        timestamp_local=point.timestamp_local,
                        count=point.count,
                        tickers=list(point.tickers),
                    )
                    for point in series.points
                ],
            )
            for series in result.series
        ]

        return ScreenerBacktestResponse(
            date=result.date,
            start_utc=result.start_utc,
            end_utc=result.end_utc,
            interval_minutes=result.interval_minutes,
            criteria_count=len(series_payload),
            series=series_payload,
        )

    except ValueError as exc:
        logger.error("Validation error running screener backtest: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Service unavailable for screener backtest: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error running screener backtest: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to run screener backtest: {str(exc)}",
        ) from exc


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
        backtest_id = await coordinator.run_backtest(
            request.fund_id,
            backtest_date,
            monitoring_interval_minutes=request.monitoring_interval_minutes,
            duration_minutes=request.duration_minutes,
        )
        
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


@router.get("/{backtest_id}/events")
async def get_backtest_events(backtest_id: str, limit: int = 1000):
    """
    Return persisted backtest events for initial page load.
    """
    async with get_async_session() as session:
        stmt = (
            select(BacktestEvent)
            .where(BacktestEvent.backtest_id == backtest_id)
            .order_by(BacktestEvent.created_at, BacktestEvent.sequence)
            .limit(limit)
        )
        result = await session.execute(stmt)
        events = result.scalars().all()

    return {
        "backtest_id": backtest_id,
        "events": [_serialize_backtest_event(event) for event in events],
    }


@router.get("/{backtest_id}/stream")
async def stream_backtest_progress(backtest_id: str):
    """
    Stream backtest events as newline-delimited JSON payloads.
    """

    async def event_generator():
        history = await _load_backtest_events(backtest_id)
        for event in history:
            yield (json.dumps(event) + "\n").encode("utf-8")

        try:
            async with backtest_progress_broker.stream(backtest_id) as queue:
                while True:
                    payload = await queue.get()
                    yield (json.dumps(payload) + "\n").encode("utf-8")
        except asyncio.CancelledError:
            logger.debug("Backtest stream cancelled for %s", backtest_id)
            return

    return StreamingResponse(event_generator(), media_type="application/json")


@router.websocket("/ws/{backtest_id}")
async def backtest_progress_websocket(websocket: WebSocket, backtest_id: str):
    """
    WebSocket endpoint for live backtest progress updates.
    """
    await websocket.accept()
    try:
        history = await _load_backtest_events(backtest_id)
        for event in history:
            await websocket.send_json(event)

        async with backtest_progress_broker.stream(backtest_id) as queue:
            while True:
                payload = await queue.get()
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        logger.info("Backtest progress WebSocket disconnected for %s", backtest_id)
    except Exception as exc:
        logger.error("Backtest progress WebSocket error for %s: %s", backtest_id, exc, exc_info=True)
        await websocket.close(code=1011)
    finally:
        if websocket.application_state != WebSocketState.DISCONNECTED:
            await websocket.close()


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


@router.get("/{backtest_id}/metrics")
async def get_backtest_metrics(backtest_id: str):
    """
    Return aggregated metrics for a backtest.
    """
    async with get_async_session() as session:
        backtest = await session.get(Backtest, backtest_id)
        if not backtest:
            raise HTTPException(status_code=404, detail=f"Backtest {backtest_id} not found")

        metadata = backtest.backtest_metadata or {}
        metrics = metadata.get("metrics") or {}

        return {
            "backtest_id": backtest_id,
            "metrics": metrics,
        }


@router.post("/run-multi", response_model=MultiStrategyBacktestResponse)
async def run_multi_strategy_backtest(request: MultiStrategyBacktestRequest):
    """
    Run backtests for multiple strategy/screener combinations on the same day.
    
    Each combination gets its own temporary backtest fund (created from template),
    runs independently with the same starting balance, and results are linked
    via parent_run_id.
    
    Args:
        request: Multi-strategy backtest configuration
        
    Returns:
        Summary with all backtest results and aggregated statistics
    """
    try:
        # Parse date
        backtest_date = datetime.strptime(request.date, "%Y-%m-%d").date()
        
        # Validate template fund exists
        async with get_async_session() as session:
            template_fund = await session.get(Fund, request.fund_template_id)
            if not template_fund:
                raise HTTPException(status_code=404, detail=f"Template fund {request.fund_template_id} not found")
        
        # Convert combinations to dict format
        combinations = [
            {
                "strategy_id": combo.strategy_id,
                "strategy_config": combo.strategy_config,
                "screening_criteria_id": combo.screening_criteria_id,
            }
            for combo in request.combinations
        ]
        
        # Run multi-strategy backtest
        coordinator = BacktestCoordinator()
        result = await coordinator.run_multi_strategy_backtest(
            template_fund_id=request.fund_template_id,
            backtest_date=backtest_date,
            combinations=combinations
        )
        
        return result
    
    except ValueError as e:
        logger.error(f"Validation error running multi-strategy backtest: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error running multi-strategy backtest: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to run multi-strategy backtest: {str(e)}")


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

