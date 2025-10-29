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

from app.models.strategies import Fund, Strategy, ScreeningCriteria
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


class CreateStrategyInput(BaseModel):
    execution_strategy_id: str
    screening_criteria_id: Optional[str] = None
    execution_config: dict = {}
    
    # Risk parameters (optional - None means no limit)
    max_loss_percent: Optional[float] = None
    max_loss_dollars: Optional[float] = None
    max_giveback_percent: Optional[float] = None
    
    # Position sizing
    size_per_trade: float = 1000.0
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
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class StrategyResponse(BaseModel):
    id: str
    fund_id: str
    execution_strategy_id: str
    screening_criteria_id: Optional[str]
    execution_config: dict
    max_loss_percent: Optional[float]
    max_loss_dollars: Optional[float]
    max_giveback_percent: Optional[float]
    size_per_trade: float
    min_bet_percent: Optional[float]
    max_bet_percent: Optional[float]
    max_total_exposure: Optional[float]
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
                status="paused",  # Start paused
            )
            session.add(fund)
            await session.commit()
            await session.refresh(fund)
            
            logger.info(f"Created fund: {fund.id} ({fund.name})")
            
            return {
                "id": fund.id,
                "name": fund.name,
                "description": fund.description,
                "mode": fund.mode,
                "balance": fund.balance,
                "status": fund.status,
                "created_at": fund.created_at.isoformat(),
                "updated_at": fund.updated_at.isoformat(),
            }
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
            
            return [
                {
                    "id": fund.id,
                    "name": fund.name,
                    "description": fund.description,
                    "mode": fund.mode,
                    "balance": fund.balance,
                    "status": fund.status,
                    "created_at": fund.created_at.isoformat(),
                    "updated_at": fund.updated_at.isoformat(),
                }
                for fund in funds
            ]
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
            
            return {
                "id": fund.id,
                "name": fund.name,
                "description": fund.description,
                "mode": fund.mode,
                "balance": fund.balance,
                "status": fund.status,
                "created_at": fund.created_at.isoformat(),
                "updated_at": fund.updated_at.isoformat(),
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fund: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/strategy", response_model=StrategyResponse)
async def get_strategy(fund_id: str) -> dict:
    """Get strategy for a fund."""
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            result = await session.execute(
                select(Strategy).where(Strategy.fund_id == fund_id)
            )
            strategy = result.scalar_one_or_none()
            
            if not strategy:
                raise HTTPException(status_code=404, detail="Strategy not found for this fund")
            
            return {
                "id": strategy.id,
                "fund_id": strategy.fund_id,
                "execution_strategy_id": strategy.execution_strategy_id,
                "screening_criteria_id": strategy.screening_criteria_id,
                "execution_config": strategy.execution_config,
                "max_loss_percent": strategy.max_loss_percent,
                "max_loss_dollars": strategy.max_loss_dollars,
                "max_giveback_percent": strategy.max_giveback_percent,
                "size_per_trade": strategy.size_per_trade,
                "min_bet_percent": strategy.min_bet_percent,
                "max_bet_percent": strategy.max_bet_percent,
                "max_total_exposure": strategy.max_total_exposure,
                "trading_start_time": strategy.trading_start_time,
                "trading_end_time": strategy.trading_end_time,
                "timezone": strategy.timezone,
                "created_at": strategy.created_at.isoformat(),
                "updated_at": strategy.updated_at.isoformat(),
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting strategy: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/strategy", response_model=StrategyResponse)
async def create_or_update_strategy(fund_id: str, strategy_data: CreateStrategyInput) -> dict:
    """Create or update strategy for a fund."""
    try:
        async with get_async_session() as session:
            # Verify fund exists
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Check if strategy already exists for this fund
            from sqlalchemy import select
            result = await session.execute(
                select(Strategy).where(Strategy.fund_id == fund_id)
            )
            existing_strategy = result.scalar_one_or_none()
            
            if existing_strategy:
                # Update existing strategy
                existing_strategy.execution_strategy_id = strategy_data.execution_strategy_id
                existing_strategy.screening_criteria_id = strategy_data.screening_criteria_id
                existing_strategy.execution_config = strategy_data.execution_config
                existing_strategy.max_loss_percent = strategy_data.max_loss_percent
                existing_strategy.max_loss_dollars = strategy_data.max_loss_dollars
                existing_strategy.max_giveback_percent = strategy_data.max_giveback_percent
                existing_strategy.size_per_trade = strategy_data.size_per_trade
                existing_strategy.min_bet_percent = strategy_data.min_bet_percent
                existing_strategy.max_bet_percent = strategy_data.max_bet_percent
                existing_strategy.max_total_exposure = strategy_data.max_total_exposure
                existing_strategy.trading_start_time = strategy_data.trading_start_time
                existing_strategy.trading_end_time = strategy_data.trading_end_time
                existing_strategy.timezone = strategy_data.timezone
                
                strategy = existing_strategy
                logger.info(f"Updated strategy for fund {fund_id}")
            else:
                # Create new strategy
                strategy = Strategy(
                    id=str(uuid.uuid4()),
                    fund_id=fund_id,
                    execution_strategy_id=strategy_data.execution_strategy_id,
                    screening_criteria_id=strategy_data.screening_criteria_id,
                    execution_config=strategy_data.execution_config,
                    max_loss_percent=strategy_data.max_loss_percent,
                    max_loss_dollars=strategy_data.max_loss_dollars,
                    max_giveback_percent=strategy_data.max_giveback_percent,
                    size_per_trade=strategy_data.size_per_trade,
                    min_bet_percent=strategy_data.min_bet_percent,
                    max_bet_percent=strategy_data.max_bet_percent,
                    max_total_exposure=strategy_data.max_total_exposure,
                    trading_start_time=strategy_data.trading_start_time,
                    trading_end_time=strategy_data.trading_end_time,
                    timezone=strategy_data.timezone,
                )
                session.add(strategy)
                logger.info(f"Created strategy for fund {fund_id}")
            
            await session.commit()
            await session.refresh(strategy)
            
            return {
                "id": strategy.id,
                "fund_id": strategy.fund_id,
                "execution_strategy_id": strategy.execution_strategy_id,
                "screening_criteria_id": strategy.screening_criteria_id,
                "execution_config": strategy.execution_config,
                "max_loss_percent": strategy.max_loss_percent,
                "max_loss_dollars": strategy.max_loss_dollars,
                "max_giveback_percent": strategy.max_giveback_percent,
                "size_per_trade": strategy.size_per_trade,
                "min_bet_percent": strategy.min_bet_percent,
                "max_bet_percent": strategy.max_bet_percent,
                "max_total_exposure": strategy.max_total_exposure,
                "trading_start_time": strategy.trading_start_time,
                "trading_end_time": strategy.trading_end_time,
                "timezone": strategy.timezone,
                "created_at": strategy.created_at.isoformat(),
                "updated_at": strategy.updated_at.isoformat(),
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating/updating strategy: {e}", exc_info=True)
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
            
            # Load strategy
            from sqlalchemy import select
            result = await session.execute(
                select(Strategy).where(Strategy.fund_id == fund_id)
            )
            strategy = result.scalar_one_or_none()
            if not strategy:
                raise HTTPException(status_code=404, detail="Strategy not found for this fund")
            
            # Create and start engine
            logger.info(f"Starting trading for fund {fund_id} ({fund.name})")
            engine = await create_strategy_engine(fund=fund, strategy=strategy)
            await engine.start()
            
            # Register engine
            register_engine(fund_id, engine)
            
            # Update fund status
            fund.status = "active"
            await session.commit()
            
            logger.info(f"✓ Trading started for fund {fund_id}")
            
            return {
                "status": "started",
                "fund_id": fund_id,
                "fund_name": fund.name,
                "execution_strategy_id": strategy.execution_strategy_id,
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
            
            # Get positions from running engine
            positions = []
            for position in engine.active_positions.values():
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
                "active_positions": len(engine.active_positions),
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
                    funds_data.append({
                        "id": fund.id,
                        "name": fund.name,
                        "mode": fund.mode,
                        "status": fund.status,
                        "active_positions": len(engine.active_positions) if engine else 0,
                        "monitored_symbols": len(engine.monitored_symbols) if engine else 0,
                    })
            
            return {
                "count": len(funds_data),
                "funds": funds_data,
            }
    except Exception as e:
        logger.error(f"Error listing running funds: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

