"""
Fund management API router.

Provides endpoints for creating, managing, and controlling trading funds:
- Create/list funds
- Create/update strategies
- Start/stop trading
- Query status and positions
"""

import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.strategies import Fund, ScreeningCriteria, Order, Transaction
from app.services.database import get_async_session
from app.services.engine_registry import (
    register_engine,
    get_engine,
    unregister_engine,
    list_running_funds
)
from app.services.strategy_factory import create_strategy_engine

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response Models
class CreateFundInput(BaseModel):
    name: str
    description: Optional[str] = None
    mode: str = "sim"  # "sim" or "real"
    initial_balance: float = 10000.0
    
    # Strategy configuration
    strategy_id: Optional[str] = None
    strategy_config: dict = {}
    screening_criteria_id: Optional[str] = None
    
    # Risk parameters (optional - None means no limit)
    max_loss_percent: Optional[float] = None
    max_loss_dollars: Optional[float] = None
    max_giveback_percent: Optional[float] = None
    max_order_age_seconds: Optional[int] = 60
    
    # Position sizing
    size_per_trade: float = 1000.0
    min_bet_percent: Optional[float] = None
    max_bet_percent: Optional[float] = None
    max_total_exposure: Optional[float] = None
    
    # Trading time windows
    trading_start_time: Optional[str] = None
    trading_end_time: Optional[str] = None
    timezone: Optional[str] = None


class UpdateFundInput(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    balance: Optional[float] = None
    
    # Strategy configuration
    strategy_id: Optional[str] = None
    strategy_config: Optional[dict] = None
    screening_criteria_id: Optional[str] = None
    
    # Risk parameters
    max_loss_percent: Optional[float] = None
    max_loss_dollars: Optional[float] = None
    max_giveback_percent: Optional[float] = None
    max_order_age_seconds: Optional[int] = None
    
    # Position sizing
    size_per_trade: Optional[float] = None
    min_bet_percent: Optional[float] = None
    max_bet_percent: Optional[float] = None
    max_total_exposure: Optional[float] = None
    
    # Trading time windows
    trading_start_time: Optional[str] = None
    trading_end_time: Optional[str] = None
    timezone: Optional[str] = None


class FundResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    mode: str
    balance: float
    status: str
    
    # Strategy configuration
    strategy_id: Optional[str]
    strategy_config: dict
    screening_criteria_id: Optional[str]
    
    # Risk parameters
    max_loss_percent: Optional[float]
    max_loss_dollars: Optional[float]
    max_giveback_percent: Optional[float]
    max_order_age_seconds: Optional[int]
    
    # Position sizing
    size_per_trade: float
    min_bet_percent: Optional[float]
    max_bet_percent: Optional[float]
    max_total_exposure: Optional[float]
    
    # Trading time windows
    trading_start_time: Optional[str]
    trading_end_time: Optional[str]
    timezone: Optional[str]
    
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class PositionResponse(BaseModel):
    symbol: str
    entry_price: float
    current_price: Optional[float]
    quantity: float
    pnl: Optional[float]
    pnl_percent: Optional[float]
    entry_time: str


class StatusResponse(BaseModel):
    status: str
    trading: bool
    active_positions: int = 0
    monitored_symbols: int = 0
    positions: List[PositionResponse] = []


class OrderResponse(BaseModel):
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
    alpaca_order_id: str

    class Config:
        from_attributes = True


class TransactionResponse(BaseModel):
    id: str
    symbol: str
    side: str
    quantity: float
    price: float
    total_value: float
    timestamp: str
    
    class Config:
        from_attributes = True


# Helper function to serialize Fund to dict
def serialize_fund(fund: Fund) -> dict:
    """Convert a Fund model instance to a response dict."""
    return {
        "id": fund.id,
        "name": fund.name,
        "description": fund.description,
        "mode": fund.mode,
        "balance": fund.balance,
        "status": fund.status,
        "strategy_id": fund.strategy_id,
        "strategy_config": fund.strategy_config,
        "screening_criteria_id": fund.screening_criteria_id,
        "max_loss_percent": fund.max_loss_percent,
        "max_loss_dollars": fund.max_loss_dollars,
        "max_giveback_percent": fund.max_giveback_percent,
        "max_order_age_seconds": fund.max_order_age_seconds,
        "size_per_trade": fund.size_per_trade,
        "min_bet_percent": fund.min_bet_percent,
        "max_bet_percent": fund.max_bet_percent,
        "max_total_exposure": fund.max_total_exposure,
        "trading_start_time": fund.trading_start_time,
        "trading_end_time": fund.trading_end_time,
        "timezone": fund.timezone,
        "created_at": fund.created_at.isoformat(),
        "updated_at": fund.updated_at.isoformat(),
    }


# Endpoints

@router.post("/funds", response_model=FundResponse)
async def create_fund(fund_data: CreateFundInput) -> dict:
    """Create a new fund."""
    try:
        async with get_async_session() as session:
            fund = Fund(
                id=str(uuid.uuid4()),
                name=fund_data.name,
                description=fund_data.description,
                mode=fund_data.mode,
                balance=fund_data.initial_balance,
                status="paused",
                strategy_id=fund_data.strategy_id,
                strategy_config=fund_data.strategy_config,
                screening_criteria_id=fund_data.screening_criteria_id,
                max_loss_percent=fund_data.max_loss_percent,
                max_loss_dollars=fund_data.max_loss_dollars,
                max_giveback_percent=fund_data.max_giveback_percent,
                max_order_age_seconds=fund_data.max_order_age_seconds,
                size_per_trade=fund_data.size_per_trade,
                min_bet_percent=fund_data.min_bet_percent,
                max_bet_percent=fund_data.max_bet_percent,
                max_total_exposure=fund_data.max_total_exposure,
                trading_start_time=fund_data.trading_start_time,
                trading_end_time=fund_data.trading_end_time,
                timezone=fund_data.timezone,
            )
            session.add(fund)
            await session.commit()
            await session.refresh(fund)
            
            logger.info(f"Created fund: {fund.id} ({fund.name})")
            return serialize_fund(fund)
            
    except Exception as e:
        logger.error(f"Error creating fund: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds", response_model=List[FundResponse])
async def list_funds() -> List[dict]:
    """List all funds."""
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            result = await session.execute(select(Fund))
            funds = result.scalars().all()
            return [serialize_fund(fund) for fund in funds]
            
    except Exception as e:
        logger.error(f"Error listing funds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}", response_model=FundResponse)
async def get_fund(fund_id: str) -> dict:
    """Get a specific fund by ID."""
    try:
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            return serialize_fund(fund)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fund: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/funds/{fund_id}", response_model=FundResponse)
async def update_fund(fund_id: str, update_data: UpdateFundInput) -> dict:
    """Update a fund's properties."""
    try:
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Check if fund is actively trading
            engine = get_engine(fund_id)
            if engine and update_data.balance is not None:
                logger.warning(
                    f"Cannot update balance for fund {fund_id} while trading. "
                    "Stop the fund first."
                )
                raise HTTPException(
                    status_code=400,
                    detail="Cannot update balance while fund is actively trading. Stop the fund first."
                )
            
            # Update fields if provided
            if update_data.name is not None:
                fund.name = update_data.name
            if update_data.description is not None:
                fund.description = update_data.description
            if update_data.balance is not None:
                fund.balance = update_data.balance
                logger.info(f"Updated fund {fund_id} balance to ${fund.balance:.2f}")
            
            # Strategy configuration
            if update_data.strategy_id is not None:
                fund.strategy_id = update_data.strategy_id
            if update_data.strategy_config is not None:
                fund.strategy_config = update_data.strategy_config
            if update_data.screening_criteria_id is not None:
                fund.screening_criteria_id = update_data.screening_criteria_id
            
            # Risk parameters
            if update_data.max_loss_percent is not None:
                fund.max_loss_percent = update_data.max_loss_percent
            if update_data.max_loss_dollars is not None:
                fund.max_loss_dollars = update_data.max_loss_dollars
            if update_data.max_giveback_percent is not None:
                fund.max_giveback_percent = update_data.max_giveback_percent
            if update_data.max_order_age_seconds is not None:
                fund.max_order_age_seconds = update_data.max_order_age_seconds
            
            # Position sizing
            if update_data.size_per_trade is not None:
                fund.size_per_trade = update_data.size_per_trade
            if update_data.min_bet_percent is not None:
                fund.min_bet_percent = update_data.min_bet_percent
            if update_data.max_bet_percent is not None:
                fund.max_bet_percent = update_data.max_bet_percent
            if update_data.max_total_exposure is not None:
                fund.max_total_exposure = update_data.max_total_exposure
            
            # Trading time windows
            if update_data.trading_start_time is not None:
                fund.trading_start_time = update_data.trading_start_time
            if update_data.trading_end_time is not None:
                fund.trading_end_time = update_data.trading_end_time
            if update_data.timezone is not None:
                fund.timezone = update_data.timezone
            
            await session.commit()
            await session.refresh(fund)
            return serialize_fund(fund)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating fund: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/funds/{fund_id}/start")
async def start_trading(fund_id: str) -> dict:
    """Start trading for a fund."""
    try:
        # Check if already running
        if get_engine(fund_id):
            raise HTTPException(status_code=400, detail="Fund already trading")
        
        async with get_async_session() as session:
            # Load fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            logger.info(
                f"🎬 START REQUEST: Fund loaded from database: "
                f"id={fund.id}, name={fund.name}, balance=${fund.balance:.2f}, "
                f"mode={fund.mode}, status={fund.status}, strategy_id={fund.strategy_id}"
            )
            
            # Validate strategy configuration
            if not fund.strategy_id:
                raise HTTPException(
                    status_code=400, 
                    detail="Fund has no strategy configured. Please configure a strategy first."
                )
            
            logger.info(
                f"🎬 START REQUEST: Strategy config: "
                f"strategy_id={fund.strategy_id}, "
                f"size_per_trade=${fund.size_per_trade:.2f}, "
                f"max_bet_percent={fund.max_bet_percent}, "
                f"min_bet_percent={fund.min_bet_percent}"
            )
            
            # Create and start engine
            logger.info(f"🎬 START REQUEST: Creating strategy engine for fund {fund_id} ({fund.name})")
            engine = await create_strategy_engine(fund=fund)
            await engine.start()
            
            # Register engine
            register_engine(fund_id, engine)
            logger.info(f"🎬 START REQUEST: Engine registered in global registry")
            
            # Update fund status
            fund.status = "active"
            await session.commit()
            
            logger.info(f"✅ Trading started successfully for fund {fund_id}")
            
            # Broadcast startup event
            from app.routers.realtime import broadcast_trading_activity
            from datetime import datetime, timezone
            await broadcast_trading_activity({
                "fund_id": str(fund_id),
                "fund_name": fund.name,
                "event_type": "startup",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message": f"Trading engine started for {fund.name}",
                "details": {
                    "balance": fund.balance,
                    "mode": fund.mode,
                    "strategy": fund.strategy_id,
                    "size_per_trade": fund.size_per_trade,
                    "max_bet_percent": fund.max_bet_percent,
                }
            })
            
            return {
                "status": "started",
                "fund_id": fund_id,
                "fund_name": fund.name,
                "execution_strategy_id": fund.strategy_id,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting trading for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/stop")
async def stop_trading(fund_id: str) -> dict:
    """Stop trading for a fund."""
    try:
        engine = get_engine(fund_id)
        
        if engine:
            # Stop and unregister engine
            logger.info(f"Stopping trading for fund {fund_id}")
            await engine.stop()
            unregister_engine(fund_id)
            logger.info(f"✓ Trading engine stopped for fund {fund_id}")
        else:
            logger.info(f"No active engine for fund {fund_id}, updating status only")
        
        # Update fund status regardless of whether engine was running
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            fund.status = "paused"
            await session.commit()
            logger.info(f"✓ Fund {fund_id} status updated to paused")
        
        return {
            "status": "stopped",
            "fund_id": fund_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping trading for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/status", response_model=StatusResponse)
async def get_fund_status(fund_id: str) -> dict:
    """Get current trading status and metrics."""
    try:
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            engine = get_engine(fund_id)
            
            if not engine:
                return {
                    "status": fund.status,
                    "trading": False,
                    "active_positions": 0,
                    "monitored_symbols": 0,
                    "positions": [],
                }
            
            # Get positions from engine (which queries Alpaca)
            active_positions = await engine.get_active_positions()
            
            positions = []
            for position in active_positions.values():
                positions.append({
                    "symbol": position.symbol,
                    "entry_price": position.entry_price,
                    "current_price": position.current_price,
                    "quantity": position.quantity,
                    "pnl": position.unrealized_pnl,
                    "pnl_percent": position.unrealized_pnl_percent,
                    "entry_time": position.entry_time.isoformat(),
                })
            
            return {
                "status": fund.status,
                "trading": True,
                "active_positions": len(active_positions),
                "monitored_symbols": len(engine.monitored_symbols),
                "positions": positions,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting status for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/running/list")
async def list_running_funds_endpoint() -> dict:
    """List all funds that are currently trading."""
    try:
        running_fund_ids = list_running_funds()
        
        # Get fund details for each running fund
        async with get_async_session() as session:
            funds_data = []
            for fund_id in running_fund_ids:
                fund = await session.get(Fund, fund_id)
                if fund:
                    engine = get_engine(fund_id)
                    # Get position count from engine
                    active_positions = await engine.get_active_positions() if engine else {}
                    funds_data.append({
                        "id": fund.id,
                        "name": fund.name,
                        "mode": fund.mode,
                        "status": fund.status,
                        "active_positions": len(active_positions),
                        "monitored_symbols": len(engine.monitored_symbols) if engine else 0,
                    })
            
            return {
                "count": len(funds_data),
                "funds": funds_data,
            }
    except Exception as e:
        logger.error(f"Error listing running funds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/orders", response_model=List[OrderResponse])
async def get_fund_orders(fund_id: str, limit: int = 100) -> List[dict]:
    """Get order history for a fund."""
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            stmt = (
                select(Order)
                .where(Order.fund_id == fund_id)
                .order_by(Order.submitted_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            orders = result.scalars().all()
            
            return [
                {
                    "id": order.id,
                    "symbol": order.symbol,
                    "side": order.side,
                    "quantity": order.quantity,
                    "status": order.status,
                    "order_type": order.order_type,
                    "submitted_at": order.submitted_at.isoformat(),
                    "filled_at": order.filled_at.isoformat() if order.filled_at else None,
                    "filled_qty": order.filled_qty,
                    "filled_avg_price": order.filled_avg_price,
                    "alpaca_order_id": order.alpaca_order_id,
                }
                for order in orders
            ]
    except Exception as e:
        logger.error(f"Error getting orders for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/transactions", response_model=List[TransactionResponse])
async def get_fund_transactions(fund_id: str, limit: int = 100) -> List[dict]:
    """Get transaction ledger for a fund."""
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            stmt = (
                select(Transaction)
                .where(Transaction.fund_id == fund_id)
                .order_by(Transaction.timestamp.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            transactions = result.scalars().all()
            
            return [
                {
                    "id": txn.id,
                    "symbol": txn.symbol,
                    "side": txn.side,
                    "quantity": txn.quantity,
                    "price": txn.price,
                    "total_value": txn.total_value,
                    "timestamp": txn.timestamp.isoformat(),
                }
                for txn in transactions
            ]
    except Exception as e:
        logger.error(f"Error getting transactions for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

