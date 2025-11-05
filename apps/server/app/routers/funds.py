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
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Fund, ScreeningCriteria, Order, Transaction, Transfer, Trade, DefaultRiskSettings
from app.models.events import StrategyEngineEvent, Event
from app.services.core.database import get_async_session
from app.services.analytics.trade_builder import TradeBuilder
from app.services.strategies.engine_registry import (
    register_engine,
    get_engine,
    unregister_engine,
    list_running_funds
)
from app.services.strategies.strategy_factory import create_strategy_engine
from app.strategies.registry import get_strategy_metadata

logger = logging.getLogger(__name__)

router = APIRouter()


# Request/Response Models
class CreateFundInput(BaseModel):
    name: str
    mode: str = "sim"  # "sim" or "real"
    initial_balance: Optional[float] = None  # Deprecated: Fund always starts with 0 balance
    
    # UI customization
    icon: Optional[str] = None
    icon_color: Optional[str] = None
    
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
    balance: Optional[float] = None
    
    # UI customization
    icon: Optional[str] = None
    icon_color: Optional[str] = None
    
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
    
    # AI cost tracking
    total_ai_cost: float
    ai_cost_mtd: float
    ai_cost_ytd: float
    last_ai_cost_reset: Optional[str]
    status: str
    archived: bool
    
    # UI customization
    icon: Optional[str]
    icon_color: Optional[str]
    
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
    size_per_trade: Optional[float]
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


# Helper functions to serialize models to dicts
def serialize_fund(fund: Fund) -> dict:
    """Convert a Fund model instance to a response dict."""
    return {
        "id": fund.id,
        "name": fund.name,
        "description": fund.description,
        "mode": fund.mode,
        "balance": fund.balance,
        "status": fund.status,
        "archived": getattr(fund, "archived", False),  # Default to False if field doesn't exist yet
        "icon": getattr(fund, "icon", None),  # Default to None if field doesn't exist yet
        "icon_color": getattr(fund, "icon_color", None),  # Default to None if field doesn't exist yet
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
        # AI cost tracking
        "total_ai_cost": getattr(fund, "total_ai_cost", 0.0),
        "ai_cost_mtd": getattr(fund, "ai_cost_mtd", 0.0),
        "ai_cost_ytd": getattr(fund, "ai_cost_ytd", 0.0),
        "last_ai_cost_reset": fund.last_ai_cost_reset.isoformat() + "Z" if getattr(fund, "last_ai_cost_reset", None) else None,
        "created_at": fund.created_at.isoformat() + "Z",  # Add Z to indicate UTC
        "updated_at": fund.updated_at.isoformat() + "Z",  # Add Z to indicate UTC
    }


def serialize_order(order: Order) -> dict:
    """Convert an Order model instance to a response dict."""
    # Generate mock Alpaca order ID for backtest orders that don't have one
    alpaca_order_id = order.alpaca_order_id
    if not alpaca_order_id and order.backtest_id:
        alpaca_order_id = f"BT_{order.id}"
    elif not alpaca_order_id:
        # Fallback for any order without an Alpaca ID (shouldn't happen in production)
        alpaca_order_id = order.id
    
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
        "alpaca_order_id": alpaca_order_id,
    }


def serialize_transaction(txn: Transaction) -> dict:
    """Convert a Transaction model instance to a response dict."""
    return {
        "id": txn.id,
        "symbol": txn.symbol,
        "side": txn.side,
        "quantity": txn.quantity,
        "price": txn.price,
        "total_value": txn.total_value,
        "timestamp": txn.timestamp.isoformat() + "Z",
    }


def serialize_transfer(transfer: Transfer) -> dict:
    """Convert a Transfer model instance to a response dict."""
    return {
        "id": transfer.id,
        "fund_id": transfer.fund_id,
        "amount": transfer.amount,
        "transfer_type": transfer.transfer_type,
        "notes": transfer.notes,
        "timestamp": transfer.timestamp.isoformat() + "Z",
    }


def serialize_trade(trade: Trade) -> dict:
    """Convert a Trade model instance to a response dict."""
    return {
        "id": trade.id,
        "fund_id": trade.fund_id,
        "symbol": trade.symbol,
        "entry_time": trade.entry_time.isoformat() + "Z" if trade.entry_time else None,
        "exit_time": trade.exit_time.isoformat() + "Z" if trade.exit_time else None,
        "entry_price": trade.entry_price,
        "exit_price": trade.exit_price,
        "entry_quantity": trade.entry_quantity,
        "exit_quantity": trade.exit_quantity,
        "realized_pnl": trade.realized_pnl,
        "realized_pnl_percent": trade.realized_pnl_percent,
        "hold_duration_seconds": trade.hold_duration_seconds,
        "status": trade.status,
        "strategy_id": trade.strategy_id,
        "screening_criteria_id": trade.screening_criteria_id,
        "ai_confidence": trade.ai_confidence,
        "commission_fees": trade.commission_fees,
        "max_adverse_excursion": trade.max_adverse_excursion,
        "max_favorable_excursion": trade.max_favorable_excursion,
    }


async def get_fund_snapshot(fund_id: str, limit: int = 100) -> dict:
    """
    Get a complete snapshot of fund data for real-time WebSocket connections.
    
    Returns fund details, recent orders, transactions, transfers, current positions, and performance metrics.
    """
    async with get_async_session() as session:
        # Get fund
        fund = await session.get(Fund, fund_id)
        if not fund:
            return None
        
        # Get recent orders
        stmt = (
            select(Order)
            .where(Order.fund_id == fund_id)
            .order_by(Order.submitted_at.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        orders = [serialize_order(order) for order in result.scalars().all()]
        
        # Get recent transactions
        stmt = (
            select(Transaction)
            .where(Transaction.fund_id == fund_id)
            .order_by(Transaction.timestamp.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        transactions = [serialize_transaction(txn) for txn in result.scalars().all()]
        
        # Get recent transfers
        stmt = (
            select(Transfer)
            .where(Transfer.fund_id == fund_id)
            .order_by(Transfer.timestamp.desc())
            .limit(limit)
        )
        result = await session.execute(stmt)
        transfers = [serialize_transfer(transfer) for transfer in result.scalars().all()]
        
    # Get current positions with prices (outside session to avoid blocking)
    positions_data = await _get_positions_for_websocket(fund_id)
    
    # Get performance metrics
    performance_data = await _calculate_fund_performance(fund_id)
    
    return {
        "fund": serialize_fund(fund),
        "orders": orders,
        "transactions": transactions,
        "transfers": transfers,
        "positions": positions_data["positions"],
        "positions_summary": positions_data["summary"],
        "performance": performance_data,
    }


async def _get_positions_for_websocket(fund_id: str) -> dict:
    """
    Get current positions with market prices for WebSocket updates.
    This is a simplified version that doesn't raise HTTP exceptions.
    """
    try:
        async with get_async_session() as session:
            # Calculate positions from transaction history
            stmt = select(
                Transaction.symbol,
                Transaction.side,
                Transaction.quantity,
                Transaction.price,
                Transaction.total_value
            ).where(
                Transaction.fund_id == fund_id
            ).order_by(Transaction.timestamp.asc())
            
            result = await session.execute(stmt)
            transactions = result.all()
            
            # Calculate net positions with cost basis
            position_tracker = {}
            for symbol, side, quantity, price, total_value in transactions:
                if symbol not in position_tracker:
                    position_tracker[symbol] = {
                        "quantity": 0.0,
                        "total_cost": 0.0,
                    }
                
                if side == "buy":
                    position_tracker[symbol]["quantity"] += quantity
                    position_tracker[symbol]["total_cost"] += total_value
                else:  # sell
                    # FIFO: reduce quantity and proportional cost
                    if position_tracker[symbol]["quantity"] > 0:
                        avg_cost_per_share = position_tracker[symbol]["total_cost"] / position_tracker[symbol]["quantity"]
                        position_tracker[symbol]["quantity"] -= quantity
                        position_tracker[symbol]["total_cost"] -= (quantity * avg_cost_per_share)
            
            # Filter to only positive positions
            current_positions = []
            for symbol, data in position_tracker.items():
                if data["quantity"] > 0.001:
                    avg_entry_price = data["total_cost"] / data["quantity"] if data["quantity"] > 0 else 0
                    current_positions.append({
                        "symbol": symbol,
                        "quantity": data["quantity"],
                        "avg_entry_price": avg_entry_price,
                        "cost_basis": data["total_cost"],
                    })
        
        # Fetch current market prices in a single batch call (outside session)
        from app.services.market.price_service import get_price_service
        price_service = get_price_service()
        
        # Get all symbols to fetch prices for
        symbols = [p["symbol"] for p in current_positions]
        
        # Batch fetch all prices at once from database (much faster than API calls)
        current_prices = await price_service.get_latest_prices_batch(symbols)
        
        positions_with_prices = []
        total_market_value = 0.0
        total_unrealized_pl = 0.0
        
        for position in current_positions:
            symbol = position["symbol"]
            current_price = current_prices.get(symbol)
            
            if current_price is not None:
                # We have a current price - calculate P&L
                market_value = position["quantity"] * current_price
                unrealized_pl = market_value - position["cost_basis"]
                unrealized_plpc = (unrealized_pl / position["cost_basis"] * 100) if position["cost_basis"] > 0 else 0
                
                positions_with_prices.append({
                    "symbol": symbol,
                    "quantity": position["quantity"],
                    "avg_entry_price": position["avg_entry_price"],
                    "current_price": current_price,
                    "cost_basis": position["cost_basis"],
                    "market_value": market_value,
                    "unrealized_pl": unrealized_pl,
                    "unrealized_plpc": unrealized_plpc,
                })
                
                total_market_value += market_value
                total_unrealized_pl += unrealized_pl
            else:
                # No current price available - use cost basis as fallback
                logger.warning(f"No current price available for {symbol}, using cost basis")
                positions_with_prices.append({
                    "symbol": symbol,
                    "quantity": position["quantity"],
                    "avg_entry_price": position["avg_entry_price"],
                    "current_price": None,
                    "cost_basis": position["cost_basis"],
                    "market_value": position["cost_basis"],
                    "unrealized_pl": 0.0,
                    "unrealized_plpc": 0.0,
                })
                total_market_value += position["cost_basis"]
        
        return {
            "positions": positions_with_prices,
            "summary": {
                "position_count": len(positions_with_prices),
                "total_market_value": total_market_value,
                "total_unrealized_pl": total_unrealized_pl,
            },
        }
    except Exception as e:
        logger.error(f"Error getting positions for WebSocket: {e}")
        return {
            "positions": [],
            "summary": {
                "position_count": 0,
                "total_market_value": 0.0,
                "total_unrealized_pl": 0.0,
            },
        }


async def _calculate_fund_performance(fund_id: str) -> dict:
    """
    Calculate fund performance metrics including day performance.
    
    Returns:
        dict with keys:
        - cash_balance: Current cash balance
        - position_value: Current market value of positions
        - aum: Assets under management (cash + positions)
        - day_change: Dollar change since start of day
        - day_change_percent: Percentage change since start of day
        - total_return: Total return since fund inception
        - total_return_percent: Total return percentage since fund inception
    """
    try:
        from datetime import timedelta
        
        async with get_async_session() as session:
            # Get all transfers and transactions
            transfers_stmt = select(Transfer).where(Transfer.fund_id == fund_id).order_by(Transfer.timestamp.asc())
            transactions_stmt = select(Transaction).where(Transaction.fund_id == fund_id).order_by(Transaction.timestamp.asc())
            
            transfers_result = await session.execute(transfers_stmt)
            transactions_result = await session.execute(transactions_stmt)
            
            transfers = list(transfers_result.scalars().all())
            transactions = list(transactions_result.scalars().all())
        
        # Calculate current cash balance
        total_deposits = sum(t.amount for t in transfers if t.transfer_type == "deposit")
        total_withdrawals = sum(t.amount for t in transfers if t.transfer_type == "withdrawal")
        total_buys = sum(t.total_value for t in transactions if t.side == "buy")
        total_sells = sum(t.total_value for t in transactions if t.side == "sell")
        cash_balance = total_deposits - total_withdrawals - total_buys + total_sells
        
        # Get current position value
        positions_data = await _get_positions_for_websocket(fund_id)
        position_value = positions_data["summary"]["total_market_value"]
        unrealized_pl = positions_data["summary"]["total_unrealized_pl"]
        
        # Current AUM
        current_aum = cash_balance + position_value
        
        # Total net deposits (for calculating total return %)
        total_net_deposits = total_deposits - total_withdrawals
        
        # Calculate day performance
        now = datetime.now(timezone.utc)
        # Use 24 hours ago for simplicity (could be enhanced to use market open time)
        day_start = now - timedelta(hours=24)
        
        # Get transfers and transactions before day start
        # Handle timezone-naive timestamps from database by converting to UTC
        def make_aware(dt: datetime) -> datetime:
            """Convert naive datetime to UTC-aware if needed."""
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt
        
        day_start_transfers = [t for t in transfers if make_aware(t.timestamp) < day_start]
        day_start_transactions = [t for t in transactions if make_aware(t.timestamp) < day_start]
        
        # Calculate starting cash balance (24 hours ago)
        day_start_deposits = sum(t.amount for t in day_start_transfers if t.transfer_type == "deposit")
        day_start_withdrawals = sum(t.amount for t in day_start_transfers if t.transfer_type == "withdrawal")
        day_start_buys = sum(t.total_value for t in day_start_transactions if t.side == "buy")
        day_start_sells = sum(t.total_value for t in day_start_transactions if t.side == "sell")
        day_start_cash = day_start_deposits - day_start_withdrawals - day_start_buys + day_start_sells
        
        # Calculate starting position value (24 hours ago)
        # Build position tracker at day start
        day_start_position_tracker = {}
        for txn in day_start_transactions:
            if txn.symbol not in day_start_position_tracker:
                day_start_position_tracker[txn.symbol] = {
                    "quantity": 0.0,
                    "total_cost": 0.0,
                }
            
            if txn.side == "buy":
                day_start_position_tracker[txn.symbol]["quantity"] += txn.quantity
                day_start_position_tracker[txn.symbol]["total_cost"] += txn.total_value
            else:  # sell
                if day_start_position_tracker[txn.symbol]["quantity"] > 0:
                    avg_cost_per_share = day_start_position_tracker[txn.symbol]["total_cost"] / day_start_position_tracker[txn.symbol]["quantity"]
                    day_start_position_tracker[txn.symbol]["quantity"] -= txn.quantity
                    day_start_position_tracker[txn.symbol]["total_cost"] -= (txn.quantity * avg_cost_per_share)
        
        # Get current prices for positions held at day start
        from app.services.market.price_service import get_price_service
        price_service = get_price_service()
        
        # Get all symbols we need prices for
        day_start_symbols = [s for s, d in day_start_position_tracker.items() if d["quantity"] > 0.001]
        day_start_prices = await price_service.get_latest_prices_batch(day_start_symbols)
        
        day_start_position_value = 0.0
        for symbol, data in day_start_position_tracker.items():
            if data["quantity"] > 0.001:
                # Use current price as proxy for day-start price
                # (In a production system, you'd want to fetch historical intraday prices)
                current_price = day_start_prices.get(symbol)
                if current_price:
                    day_start_position_value += data["quantity"] * current_price
                else:
                    logger.warning(f"Could not fetch price for {symbol} for day performance")
                    # Fallback to cost basis
                    day_start_position_value += data["total_cost"]
        
        day_start_aum = day_start_cash + day_start_position_value
        
        # Calculate net transfers during the day
        day_transfers = [t for t in transfers if make_aware(t.timestamp) >= day_start]
        net_day_transfers = sum(t.amount for t in day_transfers if t.transfer_type == "deposit") - \
                           sum(t.amount for t in day_transfers if t.transfer_type == "withdrawal")
        
        # Day performance = Current AUM - Starting AUM - Net Transfers
        day_change = current_aum - day_start_aum - net_day_transfers
        
        # Day performance percentage (based on starting AUM, excluding new deposits)
        day_change_percent = 0.0
        if day_start_aum > 0:
            day_change_percent = (day_change / day_start_aum) * 100
        
        # Total return since inception
        total_return = current_aum - total_net_deposits
        total_return_percent = 0.0
        if total_net_deposits > 0:
            total_return_percent = (total_return / total_net_deposits) * 100
        
        return {
            "cash_balance": cash_balance,
            "position_value": position_value,
            "aum": current_aum,
            "day_change": day_change,
            "day_change_percent": day_change_percent,
            "total_return": total_return,
            "total_return_percent": total_return_percent,
            "unrealized_pl": unrealized_pl,
        }
    except Exception as e:
        logger.error(f"Error calculating fund performance: {e}", exc_info=True)
        return {
            "cash_balance": 0.0,
            "position_value": 0.0,
            "aum": 0.0,
            "day_change": 0.0,
            "day_change_percent": 0.0,
            "total_return": 0.0,
            "total_return_percent": 0.0,
            "unrealized_pl": 0.0,
        }


# Endpoints

@router.post("/funds", response_model=FundResponse)
async def create_fund(fund_data: CreateFundInput) -> dict:
    """Create a new fund."""
    try:
        # Generate description from strategy if available
        description = None
        if fund_data.strategy_id:
            try:
                strategy_metadata = get_strategy_metadata(fund_data.strategy_id)
                description = strategy_metadata.get("description")
            except Exception as e:
                logger.warning(f"Could not get strategy description for {fund_data.strategy_id}: {e}")
        
        async with get_async_session() as session:
            fund = Fund(
                id=str(uuid.uuid4()),
                name=fund_data.name,
                description=description,
                mode=fund_data.mode,
                balance=0.0,  # Start with 0 cash, user must deposit
                status="paused",
                icon=fund_data.icon,
                icon_color=fund_data.icon_color,
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
async def list_funds(include_archived: bool = False) -> List[dict]:
    """
    List all funds.
    
    Args:
        include_archived: If True, include archived funds. Default False.
    """
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            stmt = select(Fund)
            
            # Filter out archived funds by default
            if not include_archived:
                # Use getattr to handle case where column doesn't exist yet
                try:
                    stmt = stmt.where(Fund.archived == False)
                except Exception:
                    # If archived column doesn't exist yet, just return all funds
                    pass
            
            result = await session.execute(stmt)
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
            if update_data.balance is not None:
                fund.balance = update_data.balance
                logger.info(f"Updated fund {fund_id} balance to ${fund.balance:.2f}")
            
            # UI customization
            if update_data.icon is not None:
                fund.icon = update_data.icon
            if update_data.icon_color is not None:
                fund.icon_color = update_data.icon_color
            
            # Strategy configuration
            if update_data.strategy_id is not None:
                fund.strategy_id = update_data.strategy_id
                # Auto-update description from strategy
                try:
                    strategy_metadata = get_strategy_metadata(update_data.strategy_id)
                    fund.description = strategy_metadata.get("description")
                except Exception as e:
                    logger.warning(f"Could not get strategy description for {update_data.strategy_id}: {e}")
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


@router.post("/funds/{fund_id}/stop-and-liquidate")
async def stop_and_liquidate(fund_id: str) -> dict:
    """
    Emergency stop: Cancel all pending orders, liquidate all positions, and pause the fund.
    
    This is a safety feature for immediately exiting all positions.
    """
    try:
        async with get_async_session() as session:
            # Get the fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Stop the strategy engine if running
            engine = get_engine(fund_id)
            if engine:
                logger.info(f"🛑 Stopping strategy engine for fund {fund_id}")
                await engine.stop()
                unregister_engine(fund_id)
            
            # Update fund status to paused
            fund.status = "paused"
            await session.commit()
            
            logger.info(f"🛑 Fund {fund_id} ({fund.name}) stopped and liquidating")
            
            # Get Alpaca service
            from app.services.trading.alpaca_service import AlpacaService
            alpaca_service = AlpacaService(paper_trading=(fund.mode == "sim"))
            
            cancelled_orders = []
            liquidated_positions = []
            errors = []
            
            # 1. Cancel all pending orders
            try:
                logger.info(f"🚫 Cancelling all pending orders for fund {fund_id}")
                stmt = select(Order).where(
                    and_(Order.fund_id == fund_id, Order.status == "pending")
                )
                result = await session.execute(stmt)
                pending_orders = result.scalars().all()
                
                for order in pending_orders:
                    try:
                        if order.alpaca_order_id:
                            await alpaca_service.cancel_order(order.alpaca_order_id)
                            order.status = "canceled"
                            cancelled_orders.append({
                                "symbol": order.symbol,
                                "side": order.side,
                                "quantity": order.quantity,
                                "order_id": order.id,
                                "alpaca_order_id": order.alpaca_order_id
                            })
                            logger.info(f"✅ Cancelled order: {order.symbol} {order.side} {order.quantity}")
                    except Exception as e:
                        error_msg = f"Failed to cancel order {order.id}: {str(e)}"
                        logger.error(error_msg)
                        errors.append(error_msg)
                
                await session.commit()
                logger.info(f"✅ Cancelled {len(cancelled_orders)} pending orders")
                
            except Exception as e:
                error_msg = f"Error cancelling orders: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
            
            # 2. Liquidate all positions
            try:
                logger.info(f"💰 Liquidating all positions for fund {fund_id}")
                
                # Get positions from Alpaca (source of truth)
                if alpaca_service.is_available():
                    positions = await alpaca_service.get_positions()
                    
                    for position in positions:
                        try:
                            symbol = position["symbol"]
                            quantity = float(position["qty"])
                            
                            logger.info(f"🔨 Liquidating {symbol}: {quantity} shares")
                            
                            # Place market sell order
                            order_result = await alpaca_service.place_market_order(
                                symbol=symbol,
                                qty=quantity,
                                side="sell",
                                time_in_force="day"
                            )
                            
                            # Create order record
                            liquidation_order = Order(
                                id=str(uuid.uuid4()),
                                alpaca_order_id=order_result["id"],
                                fund_id=fund_id,
                                symbol=symbol,
                                side="sell",
                                quantity=quantity,
                                order_type="market",
                                status="pending",
                                submitted_at=datetime.utcnow(),
                            )
                            session.add(liquidation_order)
                            
                            liquidated_positions.append({
                                "symbol": symbol,
                                "quantity": quantity,
                                "order_id": liquidation_order.id,
                                "alpaca_order_id": order_result["id"]
                            })
                            
                            logger.info(f"✅ Liquidation order placed: {symbol} sell {quantity}")
                            
                        except Exception as e:
                            error_msg = f"Failed to liquidate {position['symbol']}: {str(e)}"
                            logger.error(error_msg)
                            errors.append(error_msg)
                    
                    await session.commit()
                    logger.info(f"✅ Placed liquidation orders for {len(liquidated_positions)} positions")
                else:
                    error_msg = "Alpaca service not available for liquidation"
                    logger.error(error_msg)
                    errors.append(error_msg)
                    
            except Exception as e:
                error_msg = f"Error liquidating positions: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund.name,
                "fund_status": "paused",
                "cancelled_orders": cancelled_orders,
                "liquidated_positions": liquidated_positions,
                "errors": errors,
                "message": f"Stopped trading, cancelled {len(cancelled_orders)} orders, liquidating {len(liquidated_positions)} positions"
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in stop and liquidate for fund {fund_id}: {e}", exc_info=True)
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
                    "entry_time": position.entry_time.isoformat() + "Z",  # Add Z to indicate UTC
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
            
            return [serialize_order(order) for order in orders]
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
            
            return [serialize_transaction(txn) for txn in transactions]
    except Exception as e:
        logger.error(f"Error getting transactions for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/trades")
async def get_fund_trades(
    fund_id: str,
    status: Optional[str] = None,
    limit: int = 100
) -> List[dict]:
    """Get trades for a fund."""
    try:
        async with get_async_session() as session:
            # Verify fund exists
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            from sqlalchemy import select
            stmt = (
                select(Trade)
                .where(Trade.fund_id == fund_id)
            )
            
            # Filter by status if provided
            if status:
                stmt = stmt.where(Trade.status == status)
            
            stmt = stmt.order_by(Trade.entry_time.desc()).limit(limit)
            
            result = await session.execute(stmt)
            trades = result.scalars().all()
            
            return [serialize_trade(trade) for trade in trades]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting trades for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/positions/summary")
async def get_fund_positions_summary(fund_id: str) -> dict:
    """
    Get current positions summary with market values and unrealized P&L.
    Works even when fund is not running by calculating from transaction history
    and fetching current prices.
    """
    try:
        from sqlalchemy import select
        
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Calculate positions from transaction history
            stmt = select(
                Transaction.symbol,
                Transaction.side,
                Transaction.quantity,
                Transaction.price,
                Transaction.total_value
            ).where(
                Transaction.fund_id == fund_id
            ).order_by(Transaction.timestamp.asc())
            
            result = await session.execute(stmt)
            transactions = result.all()
            
            # Calculate net positions with cost basis
            position_tracker = {}
            for symbol, side, quantity, price, total_value in transactions:
                if symbol not in position_tracker:
                    position_tracker[symbol] = {
                        "quantity": 0.0,
                        "total_cost": 0.0,
                    }
                
                if side == "buy":
                    position_tracker[symbol]["quantity"] += quantity
                    position_tracker[symbol]["total_cost"] += total_value
                else:  # sell
                    # FIFO: reduce quantity and proportional cost
                    if position_tracker[symbol]["quantity"] > 0:
                        avg_cost_per_share = position_tracker[symbol]["total_cost"] / position_tracker[symbol]["quantity"]
                        position_tracker[symbol]["quantity"] -= quantity
                        position_tracker[symbol]["total_cost"] -= (quantity * avg_cost_per_share)
            
            # Filter to only positive positions and calculate metrics
            current_positions = []
            for symbol, data in position_tracker.items():
                if data["quantity"] > 0.001:
                    avg_entry_price = data["total_cost"] / data["quantity"] if data["quantity"] > 0 else 0
                    current_positions.append({
                        "symbol": symbol,
                        "quantity": data["quantity"],
                        "avg_entry_price": avg_entry_price,
                        "cost_basis": data["total_cost"],
                    })
            
            # Fetch current market prices in batch
            from app.services.market.price_service import get_price_service
            price_service = get_price_service()
            
            symbols = [p["symbol"] for p in current_positions]
            current_prices = await price_service.get_latest_prices_batch(symbols)
            
            positions_with_prices = []
            total_market_value = 0.0
            total_unrealized_pl = 0.0
            
            for position in current_positions:
                current_price = current_prices.get(position["symbol"])
                
                if current_price is not None:
                    # We have a current price - calculate P&L
                    market_value = position["quantity"] * current_price
                    unrealized_pl = market_value - position["cost_basis"]
                    unrealized_plpc = (unrealized_pl / position["cost_basis"] * 100) if position["cost_basis"] > 0 else 0
                    
                    positions_with_prices.append({
                        "symbol": position["symbol"],
                        "quantity": position["quantity"],
                        "avg_entry_price": position["avg_entry_price"],
                        "current_price": current_price,
                        "cost_basis": position["cost_basis"],
                        "market_value": market_value,
                        "unrealized_pl": unrealized_pl,
                        "unrealized_plpc": unrealized_plpc,
                    })
                    
                    total_market_value += market_value
                    total_unrealized_pl += unrealized_pl
                else:
                    # No current price available - use cost basis as fallback
                    logger.warning(f"Could not fetch price for {position['symbol']}, using cost basis")
                    positions_with_prices.append({
                        "symbol": position["symbol"],
                        "quantity": position["quantity"],
                        "avg_entry_price": position["avg_entry_price"],
                        "current_price": None,
                        "cost_basis": position["cost_basis"],
                        "market_value": position["cost_basis"],  # Use cost basis as fallback
                        "unrealized_pl": 0.0,  # Unknown, assume breakeven
                        "unrealized_plpc": 0.0,
                    })
                    
                    # Add to totals using cost basis
                    total_market_value += position["cost_basis"]
                    # Don't add to unrealized_pl since we don't know the real value
            
            return {
                "fund_id": fund_id,
                "positions": positions_with_prices,
                "summary": {
                    "position_count": len(positions_with_prices),
                    "total_market_value": total_market_value,
                    "total_unrealized_pl": total_unrealized_pl,
                },
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting positions summary for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/positions")
async def get_fund_positions(fund_id: str) -> dict:
    """
    Get current positions for a fund.
    Includes validation against Alpaca to detect sync issues.
    """
    try:
        # Get fund to determine mode
        fund_mode = None
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            fund_mode = fund.mode  # Store mode value while in session
        
        # Get engine if running (for reference)
        engine = get_engine(fund_id)
        
        # Get positions from Alpaca - always fetch, regardless of whether fund is running
        alpaca_positions = []
        try:
            # Create Alpaca service based on fund mode
            from app.services.trading.alpaca_service import AlpacaService
            
            if engine:
                # Use engine's alpaca service if available (already initialized)
                alpaca_service = engine.alpaca_service
            else:
                # Create a temporary alpaca service for this fund's mode
                alpaca_service = AlpacaService(paper_trading=(fund_mode == "sim"))
            
            if alpaca_service and alpaca_service.is_available():
                alpaca_positions_raw = await alpaca_service.get_positions()
                alpaca_positions = [
                    {
                        "symbol": p["symbol"],
                        "qty": p["qty"],
                        "avg_entry_price": p["avg_entry_price"],
                        "current_price": p["current_price"],
                        "market_value": p["market_value"],
                        "unrealized_pl": p["unrealized_pl"],
                        "unrealized_plpc": p["unrealized_plpc"],
                    }
                    for p in alpaca_positions_raw
                ]
                logger.debug(f"Fetched {len(alpaca_positions)} positions from Alpaca for fund {fund_id}")
            else:
                logger.warning(f"Alpaca service not available for fund {fund_id}")
        except Exception as e:
            logger.error(f"Error getting Alpaca positions for fund {fund_id}: {e}", exc_info=True)
        
        # Get positions from our database (via transactions)
        from sqlalchemy import select, and_, func, distinct
        async with get_async_session() as session:
            # Get transactions for this fund
            stmt = select(
                Transaction.symbol,
                Transaction.side,
                Transaction.quantity
            ).where(
                Transaction.fund_id == fund_id
            ).order_by(Transaction.timestamp.asc())
            
            result = await session.execute(stmt)
            transactions = result.all()
            
            # Calculate net positions for this fund
            position_tracker = {}
            for symbol, side, quantity in transactions:
                if symbol not in position_tracker:
                    position_tracker[symbol] = 0
                
                if side == "buy":
                    position_tracker[symbol] += quantity
                else:  # sell
                    position_tracker[symbol] -= quantity
            
            # Filter to only positive positions
            db_positions = [
                {
                    "symbol": symbol,
                    "qty": qty,
                    "source": "database"
                }
                for symbol, qty in position_tracker.items()
                if qty > 0.001
            ]
            
            # Get all symbols that have OPEN positions in OTHER funds of the SAME mode
            # (excluding current fund). We only filter positions from funds with the same mode
            # because sim and real trading use different Alpaca accounts.
            # We need to calculate net positions for each other fund to find open positions
            other_funds_transactions_stmt = select(
                Transaction.fund_id,
                Transaction.symbol,
                Transaction.side,
                Transaction.quantity,
                Fund.mode
            ).join(
                Fund, Transaction.fund_id == Fund.id
            ).where(
                and_(
                    Transaction.fund_id != fund_id,
                    Fund.mode == fund_mode  # Only check funds with same mode
                )
            )
            
            other_funds_result = await session.execute(other_funds_transactions_stmt)
            other_funds_transactions = other_funds_result.all()
            
            # Calculate net positions for each symbol in other funds of the same mode
            other_funds_positions = {}
            for other_fund_id, symbol, side, quantity, other_fund_mode in other_funds_transactions:
                key = (other_fund_id, symbol)
                if key not in other_funds_positions:
                    other_funds_positions[key] = 0
                
                if side == "buy":
                    other_funds_positions[key] += quantity
                else:  # sell
                    other_funds_positions[key] -= quantity
            
            # Get symbols that have open positions (qty > 0.001) in other funds of the same mode
            symbols_in_other_funds = {
                symbol for (fund_id, symbol), qty in other_funds_positions.items()
                if qty > 0.001
            }
        
        # Filter out Alpaca positions that are already tracked by other funds
        # These positions belong to other funds, so we shouldn't show them here
        filtered_alpaca_positions = [
            pos for pos in alpaca_positions
            if pos["symbol"] not in symbols_in_other_funds
        ]
        
        # Compare and detect sync issues (only for positions not in other funds)
        alpaca_symbols = {p["symbol"] for p in filtered_alpaca_positions}
        db_symbols = {p["symbol"] for p in db_positions}
        
        sync_issues = {
            "in_alpaca_not_db": list(alpaca_symbols - db_symbols),
            "in_db_not_alpaca": list(db_symbols - alpaca_symbols),
        }
        
        return {
            "fund_id": fund_id,
            "fund_mode": fund_mode,
            "is_running": engine is not None,
            "alpaca_positions": filtered_alpaca_positions,
            "database_positions": db_positions,
            "sync_issues": sync_issues,
            "has_sync_issues": bool(sync_issues["in_alpaca_not_db"] or sync_issues["in_db_not_alpaca"]),
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting positions for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _recreate_missing_trade(
    session: AsyncSession,
    order: Order,
    trade_id: str
) -> Optional[Trade]:
    """
    Attempt to recreate a missing trade record from order and transactions.
    
    Returns the created Trade if successful, None if not enough data available.
    """
    try:
        # Get all transactions for this order
        result = await session.execute(
            select(Transaction).where(
                Transaction.order_id == order.id
            ).order_by(Transaction.timestamp)
        )
        order_transactions = result.scalars().all()
        
        if not order_transactions:
            logger.debug(f"No transactions found for order {order.id}, cannot recreate trade")
            return None
        
        trade_builder = TradeBuilder(session)
        
        if order.side == "buy":
            # This is an entry order - look for matching exit transactions
            # First, check if there's already an open trade for this symbol
            existing_open_trade = await trade_builder.get_open_trade_for_symbol(
                order.fund_id,
                order.symbol
            )
            
            if existing_open_trade:
                # Trade already exists, just update the order's trade_id
                order.trade_id = existing_open_trade.id
                await session.flush()
                return existing_open_trade
            
            # Create new trade from entry transactions
            trade = await trade_builder.create_trade_from_entry(
                trade_id=trade_id,
                fund_id=order.fund_id,
                symbol=order.symbol,
                entry_order_id=order.id,
                entry_transactions=list(order_transactions),
                strategy_id=None,  # Will be None if not available
                screening_criteria_id=None,
                ai_confidence=None,
                ai_reasoning=None,
            )
            
            # Update order with trade_id
            order.trade_id = trade_id
            await session.flush()
            
            logger.info(f"✅ Recreated trade {trade_id} from buy order {order.id}")
            return trade
            
        elif order.side == "sell":
            # This is an exit order - need to find matching entry transactions
            # Find buy transactions for this symbol that don't have a trade_id yet
            # or find the open trade for this symbol
            existing_open_trade = await trade_builder.get_open_trade_for_symbol(
                order.fund_id,
                order.symbol
            )
            
            if existing_open_trade:
                # Close the existing trade
                trade = await trade_builder.close_trade(
                    trade_id=existing_open_trade.id,
                    exit_order_id=order.id,
                    exit_transactions=list(order_transactions)
                )
                order.trade_id = trade.id
                await session.flush()
                
                logger.info(f"✅ Recreated and closed trade {trade.id} from sell order {order.id}")
                return trade
            else:
                # No open trade found - try to find matching buy transactions
                # Get buy transactions for this symbol without trade_id, sorted by time
                buy_result = await session.execute(
                    select(Transaction).where(
                        and_(
                            Transaction.fund_id == order.fund_id,
                            Transaction.symbol == order.symbol,
                            Transaction.side == "buy",
                            Transaction.trade_id.is_(None)
                        )
                    ).order_by(Transaction.timestamp)
                )
                buy_transactions = list(buy_result.scalars().all())
                
                if not buy_transactions:
                    logger.debug(f"No matching buy transactions found for sell order {order.id}")
                    return None
                
                # Match using FIFO - use the oldest buy transaction(s)
                sell_qty = sum(txn.quantity for txn in order_transactions)
                matched_buy_txns = []
                remaining_qty = sell_qty
                
                for buy_txn in buy_transactions:
                    if remaining_qty <= 0:
                        break
                    matched_buy_txns.append(buy_txn)
                    remaining_qty -= buy_txn.quantity
                
                if remaining_qty > 0:
                    # Partial match - still create the trade
                    logger.warning(
                        f"Partial match for trade {trade_id}: "
                        f"sell qty {sell_qty}, matched buy qty {sell_qty - remaining_qty}"
                    )
                
                # Create trade from matched buy and sell transactions
                entry_qty = sum(txn.quantity for txn in matched_buy_txns)
                entry_cost = sum(txn.total_value for txn in matched_buy_txns)
                avg_entry_price = entry_cost / entry_qty if entry_qty > 0 else 0.0
                entry_time = min(txn.timestamp for txn in matched_buy_txns)
                entry_order_id = matched_buy_txns[0].order_id
                
                exit_qty = sum(txn.quantity for txn in order_transactions)
                exit_proceeds = sum(txn.total_value for txn in order_transactions)
                avg_exit_price = exit_proceeds / exit_qty if exit_qty > 0 else 0.0
                exit_time = max(txn.timestamp for txn in order_transactions)
                
                realized_pnl = exit_proceeds - (avg_entry_price * min(entry_qty, exit_qty))
                realized_pnl_percent = (realized_pnl / (avg_entry_price * min(entry_qty, exit_qty)) * 100) if avg_entry_price > 0 else 0.0
                hold_duration = (exit_time - entry_time).total_seconds()
                
                trade = Trade(
                    id=trade_id,
                    fund_id=order.fund_id,
                    symbol=order.symbol,
                    entry_order_id=entry_order_id,
                    entry_time=entry_time,
                    entry_price=avg_entry_price,
                    entry_quantity=entry_qty,
                    exit_order_id=order.id,
                    exit_time=exit_time,
                    exit_price=avg_exit_price,
                    exit_quantity=exit_qty,
                    realized_pnl=realized_pnl,
                    realized_pnl_percent=realized_pnl_percent,
                    hold_duration_seconds=int(hold_duration),
                    status="closed",
                    trade_metadata={"recreated": True, "from_validation": True}
                )
                
                session.add(trade)
                
                # Update transactions with trade_id
                for txn in matched_buy_txns + order_transactions:
                    txn.trade_id = trade_id
                
                # Update orders with trade_id
                order.trade_id = trade_id
                for buy_txn in matched_buy_txns:
                    if buy_txn.order_id:
                        buy_order_result = await session.execute(
                            select(Order).where(Order.id == buy_txn.order_id)
                        )
                        buy_order = buy_order_result.scalar_one_or_none()
                        if buy_order and not buy_order.trade_id:
                            buy_order.trade_id = trade_id
                
                await session.flush()
                
                logger.info(f"✅ Recreated closed trade {trade_id} from sell order {order.id} with matched buy transactions")
                return trade
        
        return None
        
    except Exception as e:
        logger.error(f"Error recreating trade {trade_id} for order {order.id}: {e}", exc_info=True)
        return None


@router.post("/funds/{fund_id}/orders/{order_id}/validate")
async def validate_order(fund_id: str, order_id: str) -> dict:
    """
    Validate an order against Alpaca to check if it's synced.
    Also attempts to recreate missing trade records if the order has a trade_id but the trade doesn't exist.
    """
    try:
        async with get_async_session() as session:
            # Get order
            order = await session.get(Order, order_id)
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            
            if order.fund_id != fund_id:
                raise HTTPException(status_code=403, detail="Order does not belong to this fund")
            
            # Get fund to determine mode
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Check if order has a trade_id but trade doesn't exist - try to recreate it
            trade_recreated = False
            trade_recreation_error = None
            order_trade_id = order.trade_id  # Store before any commits to avoid detached object issues
            if order_trade_id:
                trade_result = await session.execute(
                    select(Trade).where(Trade.id == order_trade_id)
                )
                existing_trade = trade_result.scalar_one_or_none()
                
                if not existing_trade:
                    # Trade is missing - try to recreate it
                    logger.info(f"Trade {order_trade_id} is missing for order {order_id}, attempting to recreate...")
                    recreated_trade = await _recreate_missing_trade(
                        session,
                        order,
                        order_trade_id
                    )
                    
                    if recreated_trade:
                        await session.commit()
                        trade_recreated = True
                        logger.info(f"✅ Successfully recreated trade {order_trade_id} for order {order_id}")
                    else:
                        # Revert any changes if trade creation failed
                        await session.rollback()
                        trade_recreation_error = "Could not recreate trade: insufficient transaction data"
                        logger.warning(f"⚠️  Failed to recreate trade {order_trade_id} for order {order_id}")
            
            # Check if we can validate (need Alpaca order ID)
            if not order.alpaca_order_id or order.alpaca_order_id.strip() == "":
                response = {
                    "order_id": order_id,
                    "is_synced": False,
                    "is_orphaned": True,
                    "reason": "Missing Alpaca order ID",
                }
                if trade_recreated:
                    response["trade_recreated"] = True
                elif trade_recreation_error:
                    response["trade_recreation_error"] = trade_recreation_error
                return response
            
            # Get engine to access Alpaca service
            engine = get_engine(fund_id)
            if not engine:
                response = {
                    "order_id": order_id,
                    "is_synced": None,
                    "reason": "Fund is not running, cannot validate",
                }
                if trade_recreated:
                    response["trade_recreated"] = True
                elif trade_recreation_error:
                    response["trade_recreation_error"] = trade_recreation_error
                return response
            
            # Query Alpaca
            try:
                alpaca_order = engine.alpaca_service.client.get_order_by_id(order.alpaca_order_id)
                
                response = {
                    "order_id": order_id,
                    "is_synced": True,
                    "is_orphaned": False,
                    "alpaca_status": str(alpaca_order.status.value),
                    "db_status": order.status,
                    "status_matches": str(alpaca_order.status.value).lower() == order.status.lower(),
                }
                if trade_recreated:
                    response["trade_recreated"] = True
                elif trade_recreation_error:
                    response["trade_recreation_error"] = trade_recreation_error
                return response
            
            except Exception as e:
                if "not found" in str(e).lower() or "404" in str(e):
                    response = {
                        "order_id": order_id,
                        "is_synced": False,
                        "is_orphaned": True,
                        "reason": "Order not found in Alpaca",
                    }
                    if trade_recreated:
                        response["trade_recreated"] = True
                    elif trade_recreation_error:
                        response["trade_recreation_error"] = trade_recreation_error
                    return response
                raise
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating order {order_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/funds/{fund_id}/orders/{order_id}")
async def delete_order(fund_id: str, order_id: str) -> dict:
    """
    Delete an order record from the database.
    Use this to clean up orphaned orders that are not synced with Alpaca.
    """
    try:
        async with get_async_session() as session:
            # Get order
            order = await session.get(Order, order_id)
            if not order:
                raise HTTPException(status_code=404, detail="Order not found")
            
            if order.fund_id != fund_id:
                raise HTTPException(status_code=403, detail="Order does not belong to this fund")
            
            # Only allow deletion of failed/canceled orders or orphaned orders
            if order.status not in ["failed", "canceled"] and order.alpaca_order_id:
                raise HTTPException(
                    status_code=400,
                    detail="Can only delete failed, canceled, or orphaned orders"
                )
            
            symbol = order.symbol
            side = order.side
            
            await session.delete(order)
            await session.commit()
            
            logger.info(f"🗑️  Deleted order {order_id}: {symbol} {side}")
            
            return {
                "success": True,
                "message": f"Deleted order {symbol} {side}",
                "order_id": order_id,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting order {order_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# Pydantic models for transfers
class TransferResponse(BaseModel):
    id: str
    fund_id: str
    amount: float
    transfer_type: str
    notes: Optional[str]
    timestamp: str


class CreateTransferInput(BaseModel):
    amount: float
    transfer_type: str  # deposit/withdrawal
    notes: Optional[str] = None


@router.get("/funds/{fund_id}/transfers")
async def get_fund_transfers(fund_id: str, limit: int = 100) -> List[dict]:
    """Get transfer history for a fund."""
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            stmt = (
                select(Transfer)
                .where(Transfer.fund_id == fund_id)
                .order_by(Transfer.timestamp.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            transfers = result.scalars().all()
            
            return [serialize_transfer(transfer) for transfer in transfers]
    except Exception as e:
        logger.error(f"Error getting transfers for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/transfers")
async def create_transfer(fund_id: str, transfer_input: CreateTransferInput) -> dict:
    """
    Create a new transfer (deposit or withdrawal).
    This will also update the fund balance.
    """
    try:
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Validate transfer
            if transfer_input.amount <= 0:
                raise HTTPException(status_code=400, detail="Amount must be positive")
            
            if transfer_input.transfer_type not in ["deposit", "withdrawal"]:
                raise HTTPException(
                    status_code=400,
                    detail="transfer_type must be 'deposit' or 'withdrawal'"
                )
            
            # Block transfers when fund is actively trading
            if fund.status == "active":
                raise HTTPException(
                    status_code=400,
                    detail="Cannot transfer funds while trading is active. Stop the fund first."
                )
            
            # For withdrawals, check if fund has sufficient balance
            if transfer_input.transfer_type == "withdrawal":
                if transfer_input.amount > fund.balance:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient balance. Fund has ${fund.balance:.2f}, withdrawal requested: ${transfer_input.amount:.2f}"
                    )
            
            # Create transfer record
            transfer_id = str(uuid.uuid4())
            transfer = Transfer(
                id=transfer_id,
                fund_id=fund_id,
                amount=transfer_input.amount,
                transfer_type=transfer_input.transfer_type,
                notes=transfer_input.notes,
                timestamp=datetime.utcnow(),
            )
            session.add(transfer)
            
            # Update fund balance
            if transfer_input.transfer_type == "deposit":
                fund.balance += transfer_input.amount
                logger.info(
                    f"💰 Deposit: ${transfer_input.amount:.2f} → Fund {fund_id} "
                    f"(new balance: ${fund.balance:.2f})"
                )
            else:  # withdrawal
                fund.balance -= transfer_input.amount
                logger.info(
                    f"💸 Withdrawal: ${transfer_input.amount:.2f} ← Fund {fund_id} "
                    f"(new balance: ${fund.balance:.2f})"
                )
            
            await session.commit()
            
            # Refresh balance in running engine if fund is active
            from app.services.strategies.engine_registry import get_engine
            engine = get_engine(fund_id)
            if engine:
                await engine.refresh_fund_balance()
                logger.info(f"✅ Refreshed balance in running engine for fund {fund_id}")
            
            return {
                "id": transfer.id,
                "fund_id": transfer.fund_id,
                "amount": transfer.amount,
                "transfer_type": transfer.transfer_type,
                "notes": transfer.notes,
                "timestamp": transfer.timestamp.isoformat() + "Z",  # Add Z to indicate UTC
                "new_balance": fund.balance,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating transfer for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/archive")
async def archive_fund(fund_id: str) -> dict:
    """
    Archive a fund (hide from main list).
    Fund must be stopped (not trading) to archive.
    """
    try:
        # Check if fund is actively trading
        engine = get_engine(fund_id)
        if engine:
            raise HTTPException(
                status_code=400,
                detail="Cannot archive fund while it is actively trading. Stop the fund first."
            )
        
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Archive the fund
            fund.archived = True
            await session.commit()
            
            logger.info(f"📦 Archived fund {fund_id} ({fund.name})")
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund.name,
                "archived": True,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/unarchive")
async def unarchive_fund(fund_id: str) -> dict:
    """
    Unarchive a fund (show in main list again).
    """
    try:
        async with get_async_session() as session:
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Unarchive the fund
            fund.archived = False
            await session.commit()
            
            logger.info(f"📂 Unarchived fund {fund_id} ({fund.name})")
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund.name,
                "archived": False,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funds/{fund_id}/reconcile")
async def reconcile_fund_balance(fund_id: str) -> dict:
    """
    Check if fund balance matches ledger calculation.
    For diagnostics - not a source of truth due to timing issues.
    
    Calculates what balance SHOULD be based on:
    - Transfers (deposits/withdrawals)
    - Transactions (buys/sells that have filled)
    """
    try:
        async with get_async_session() as session:
            from sqlalchemy import select
            
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Get all transfers
            stmt = select(Transfer).where(Transfer.fund_id == fund_id)
            result = await session.execute(stmt)
            transfers = result.scalars().all()
            
            # Get all transactions
            stmt = select(Transaction).where(Transaction.fund_id == fund_id)
            result = await session.execute(stmt)
            transactions = result.scalars().all()
            
            # Calculate ledger balance
            # Cash = Deposits - Withdrawals - Buys + Sells
            total_deposits = sum(t.amount for t in transfers if t.transfer_type == "deposit")
            total_withdrawals = sum(t.amount for t in transfers if t.transfer_type == "withdrawal")
            total_buys = sum(t.total_value for t in transactions if t.side == "buy")
            total_sells = sum(t.total_value for t in transactions if t.side == "sell")
            
            ledger_balance = total_deposits - total_withdrawals - total_buys + total_sells
            
            # Calculate discrepancy
            discrepancy = fund.balance - ledger_balance
            is_synced = abs(discrepancy) < 0.01
            
            logger.info(
                f"🔍 Reconciliation for fund {fund_id}: "
                f"current=${fund.balance:.2f}, ledger=${ledger_balance:.2f}, "
                f"discrepancy=${discrepancy:.2f}, synced={is_synced}"
            )
            
            return {
                "fund_id": fund_id,
                "fund_name": fund.name,
                "current_balance": fund.balance,
                "ledger_balance": ledger_balance,
                "discrepancy": discrepancy,
                "is_synced": is_synced,
                "breakdown": {
                    "deposits": total_deposits,
                    "withdrawals": total_withdrawals,
                    "buys": total_buys,
                    "sells": total_sells,
                },
                "warning": "Ledger calculation is for diagnostics only - timing issues may cause temporary discrepancies"
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reconciling fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/positions/{symbol}/close-orphaned")
async def close_orphaned_position(fund_id: str, symbol: str) -> dict:
    """
    Close out an orphaned position that exists in the database but not in Alpaca.
    
    This creates a matching sell transaction to zero out the position in the database.
    This is useful when a position was sold in Alpaca but the sync failed or 
    the position was manually closed outside of the trading system.
    """
    try:
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Calculate current position from transactions
            from sqlalchemy import select, and_
            
            stmt = select(
                Transaction.side,
                Transaction.quantity,
                Transaction.price
            ).where(
                and_(
                    Transaction.fund_id == fund_id,
                    Transaction.symbol == symbol
                )
            ).order_by(Transaction.timestamp.asc())
            
            result = await session.execute(stmt)
            transactions = result.all()
            
            if not transactions:
                raise HTTPException(
                    status_code=404,
                    detail=f"No transactions found for {symbol}"
                )
            
            # Calculate net position and cost basis
            net_quantity = 0.0
            total_cost = 0.0
            
            for side, quantity, price in transactions:
                if side == "buy":
                    net_quantity += quantity
                    total_cost += (quantity * price)
                else:  # sell
                    if net_quantity > 0:
                        avg_cost = total_cost / net_quantity
                        net_quantity -= quantity
                        total_cost -= (quantity * avg_cost)
            
            if net_quantity <= 0.001:
                raise HTTPException(
                    status_code=400,
                    detail=f"Position for {symbol} is already closed (quantity: {net_quantity})"
                )
            
            # Verify position doesn't exist in Alpaca
            engine = get_engine(fund_id)
            if engine:
                try:
                    alpaca_positions = await engine.alpaca_service.get_positions()
                    alpaca_symbols = {p["symbol"] for p in alpaca_positions}
                    
                    if symbol in alpaca_symbols:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Position {symbol} exists in Alpaca. Cannot close as orphaned."
                        )
                except HTTPException:
                    raise  # Re-raise HTTP exceptions
                except Exception as e:
                    logger.warning(f"Could not verify Alpaca positions: {e}")
                    # Continue anyway if Alpaca check fails
            
            # Calculate average entry price
            avg_entry_price = total_cost / net_quantity if net_quantity > 0 else 0.0
            
            # Try to find the actual Alpaca sell order to get the real exit price
            exit_price = avg_entry_price  # Default to breakeven if we can't find the order
            alpaca_sell_order_id = None
            matched_order = None
            
            if engine:
                try:
                    # Get recent filled orders from Alpaca
                    alpaca_orders = await engine.alpaca_service.get_orders(
                        symbol=symbol,
                        status="closed",  # Only look at closed/filled orders
                        limit=50  # Look at last 50 orders
                    )
                    
                    # Find sell orders that match our quantity (approximately)
                    for order in alpaca_orders:
                        if (order.get("side") == "sell" and 
                            order.get("symbol") == symbol and
                            order.get("filled_qty") and
                            abs(float(order.get("filled_qty", 0)) - net_quantity) < 0.01):  # Match within 0.01 shares
                            
                            # Found a matching sell order!
                            matched_order = order
                            exit_price = float(order.get("filled_avg_price", avg_entry_price))
                            alpaca_sell_order_id = order.get("id")
                            logger.info(
                                f"🔍 Found matching Alpaca sell order for {symbol}: "
                                f"order_id={alpaca_sell_order_id}, "
                                f"qty={order.get('filled_qty')}, "
                                f"price=${exit_price:.2f}"
                            )
                            break
                    
                    if not matched_order:
                        logger.warning(
                            f"⚠️  Could not find matching Alpaca sell order for {symbol} "
                            f"(quantity: {net_quantity}). Using breakeven price."
                        )
                except Exception as e:
                    logger.warning(f"Could not fetch Alpaca orders for price discovery: {e}")
                    # Continue with breakeven price
            
            # Calculate P&L
            realized_pl = (exit_price - avg_entry_price) * net_quantity
            
            # Create closing transaction with actual exit price
            closing_transaction = Transaction(
                id=str(uuid.uuid4()),
                order_id=str(uuid.uuid4()),  # Dummy order ID for orphaned cleanup
                alpaca_order_id=alpaca_sell_order_id,  # Link to actual Alpaca order if found
                fund_id=fund_id,
                symbol=symbol,
                side="sell",
                quantity=net_quantity,
                price=exit_price,  # Use actual exit price from Alpaca or entry price as fallback
                total_value=net_quantity * exit_price,
                timestamp=datetime.utcnow(),
                high_water_mark=None,
                strategy_state={
                    "source": "orphaned_cleanup", 
                    "reason": "Position closed due to Alpaca sync mismatch",
                    "matched_alpaca_order": alpaca_sell_order_id if alpaca_sell_order_id else None,
                    "price_source": "alpaca_order" if alpaca_sell_order_id else "breakeven",
                    "realized_pl": realized_pl,
                },
            )
            
            # Create corresponding order record for audit trail
            closing_order = Order(
                id=closing_transaction.order_id,
                alpaca_order_id="",  # Empty for orphaned cleanup
                fund_id=fund_id,
                symbol=symbol,
                side="sell",
                quantity=net_quantity,
                order_type="manual_cleanup",
                status="filled",
                submitted_at=datetime.utcnow(),
                filled_at=datetime.utcnow(),
                filled_qty=net_quantity,
                filled_avg_price=avg_entry_price,
            )
            
            session.add(closing_order)
            session.add(closing_transaction)
            
            # Update fund balance (add back the sale proceeds)
            fund.balance += closing_transaction.total_value
            
            await session.commit()
            
            logger.info(
                f"🔧 Closed orphaned position for fund {fund_id}: {symbol} "
                f"- {net_quantity} shares @ ${exit_price:.2f} "
                f"(entry: ${avg_entry_price:.2f}, P&L: ${realized_pl:+.2f}, "
                f"proceeds: ${closing_transaction.total_value:.2f})"
            )
            
            return {
                "success": True,
                "message": f"Closed orphaned position for {symbol}",
                "fund_id": fund_id,
                "symbol": symbol,
                "quantity_closed": net_quantity,
                "avg_entry_price": avg_entry_price,
                "exit_price": exit_price,
                "realized_pl": realized_pl,
                "proceeds": closing_transaction.total_value,
                "new_balance": fund.balance,
                "transaction_id": closing_transaction.id,
                "matched_alpaca_order_id": alpaca_sell_order_id,
                "price_source": "alpaca_order" if alpaca_sell_order_id else "breakeven",
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing orphaned position {symbol} for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/positions/close-all-orphaned")
async def close_all_orphaned_positions(fund_id: str) -> dict:
    """
    Close all orphaned positions that exist in the database but not in Alpaca.
    
    This is a batch operation that:
    1. Identifies all database positions not in Alpaca
    2. Closes each one by creating matching sell transactions
    3. Returns a summary of all positions closed
    
    This is useful for cleaning up multiple sync issues at once after a
    fund was stopped or when multiple positions were manually closed in Alpaca.
    """
    try:
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Get list of orphaned positions (in DB but not in Alpaca)
            from sqlalchemy import select, and_
            
            # Calculate all database positions from transactions
            stmt = select(
                Transaction.symbol,
                Transaction.side,
                Transaction.quantity,
                Transaction.price
            ).where(
                Transaction.fund_id == fund_id
            ).order_by(Transaction.timestamp.asc())
            
            result = await session.execute(stmt)
            transactions = result.all()
            
            # Calculate net positions
            position_tracker = {}
            for symbol, side, quantity, price in transactions:
                if symbol not in position_tracker:
                    position_tracker[symbol] = {"quantity": 0.0, "total_cost": 0.0}
                
                if side == "buy":
                    position_tracker[symbol]["quantity"] += quantity
                    position_tracker[symbol]["total_cost"] += (quantity * price)
                else:  # sell
                    if position_tracker[symbol]["quantity"] > 0:
                        avg_cost = position_tracker[symbol]["total_cost"] / position_tracker[symbol]["quantity"]
                        position_tracker[symbol]["quantity"] -= quantity
                        position_tracker[symbol]["total_cost"] -= (quantity * avg_cost)
            
            # Filter to positions with non-zero quantity
            db_positions = {
                symbol: data 
                for symbol, data in position_tracker.items() 
                if data["quantity"] > 0.001
            }
            
            if not db_positions:
                return {
                    "success": True,
                    "message": "No database positions to close",
                    "positions_closed": [],
                    "total_closed": 0,
                }
            
            # Get Alpaca positions to identify orphans
            alpaca_symbols = set()
            engine = get_engine(fund_id)
            if engine:
                try:
                    alpaca_positions = await engine.alpaca_service.get_positions()
                    alpaca_symbols = {p["symbol"] for p in alpaca_positions}
                except Exception as e:
                    logger.warning(f"Could not fetch Alpaca positions: {e}")
                    # If we can't get Alpaca positions, we'll close all DB positions
            
            # Identify orphaned positions (in DB but not in Alpaca)
            orphaned_symbols = [
                symbol for symbol in db_positions.keys()
                if symbol not in alpaca_symbols
            ]
            
            if not orphaned_symbols:
                return {
                    "success": True,
                    "message": "No orphaned positions found (all database positions exist in Alpaca)",
                    "positions_closed": [],
                    "total_closed": 0,
                }
            
            # Close each orphaned position
            closed_positions = []
            total_pl = 0.0
            total_proceeds = 0.0
            
            for symbol in orphaned_symbols:
                try:
                    data = db_positions[symbol]
                    net_quantity = data["quantity"]
                    total_cost = data["total_cost"]
                    avg_entry_price = total_cost / net_quantity if net_quantity > 0 else 0.0
                    
                    # Try to find matching Alpaca sell order for actual exit price
                    exit_price = avg_entry_price  # Default to breakeven
                    alpaca_sell_order_id = None
                    
                    if engine:
                        try:
                            alpaca_orders = await engine.alpaca_service.get_orders(
                                symbol=symbol,
                                status="closed",
                                limit=50
                            )
                            
                            # Find matching sell order
                            for order in alpaca_orders:
                                if (order.get("side") == "sell" and 
                                    order.get("symbol") == symbol and
                                    order.get("filled_qty") and
                                    abs(float(order.get("filled_qty", 0)) - net_quantity) < 0.01):
                                    
                                    exit_price = float(order.get("filled_avg_price", avg_entry_price))
                                    alpaca_sell_order_id = order.get("id")
                                    logger.info(
                                        f"Found matching sell order for {symbol}: "
                                        f"order_id={alpaca_sell_order_id}, price=${exit_price:.2f}"
                                    )
                                    break
                        except Exception as e:
                            logger.warning(f"Could not fetch Alpaca orders for {symbol}: {e}")
                    
                    # Calculate P&L
                    realized_pl = (exit_price - avg_entry_price) * net_quantity
                    total_pl += realized_pl
                    
                    # Create closing transaction
                    closing_transaction = Transaction(
                        id=str(uuid.uuid4()),
                        order_id=str(uuid.uuid4()),
                        alpaca_order_id=alpaca_sell_order_id,
                        fund_id=fund_id,
                        symbol=symbol,
                        side="sell",
                        quantity=net_quantity,
                        price=exit_price,
                        total_value=net_quantity * exit_price,
                        timestamp=datetime.utcnow(),
                        high_water_mark=None,
                        strategy_state={
                            "source": "orphaned_cleanup_batch",
                            "reason": "Position closed via Close All Orphaned action",
                            "matched_alpaca_order": alpaca_sell_order_id if alpaca_sell_order_id else None,
                            "price_source": "alpaca_order" if alpaca_sell_order_id else "breakeven",
                            "realized_pl": realized_pl,
                        },
                    )
                    
                    # Create order record
                    closing_order = Order(
                        id=closing_transaction.order_id,
                        alpaca_order_id="",
                        fund_id=fund_id,
                        symbol=symbol,
                        side="sell",
                        quantity=net_quantity,
                        order_type="manual_cleanup",
                        status="filled",
                        submitted_at=datetime.utcnow(),
                        filled_at=datetime.utcnow(),
                        filled_qty=net_quantity,
                        filled_avg_price=avg_entry_price,
                    )
                    
                    session.add(closing_order)
                    session.add(closing_transaction)
                    
                    # Update fund balance
                    fund.balance += closing_transaction.total_value
                    total_proceeds += closing_transaction.total_value
                    
                    closed_positions.append({
                        "symbol": symbol,
                        "quantity_closed": net_quantity,
                        "avg_entry_price": avg_entry_price,
                        "exit_price": exit_price,
                        "realized_pl": realized_pl,
                        "proceeds": closing_transaction.total_value,
                        "price_source": "alpaca_order" if alpaca_sell_order_id else "breakeven",
                    })
                    
                    logger.info(
                        f"Closed orphaned position: {symbol} - {net_quantity} shares "
                        f"@ ${exit_price:.2f} (P&L: ${realized_pl:+.2f})"
                    )
                    
                except Exception as e:
                    logger.error(f"Error closing orphaned position {symbol}: {e}")
                    # Continue with other positions even if one fails
                    closed_positions.append({
                        "symbol": symbol,
                        "error": str(e),
                    })
            
            await session.commit()
            
            logger.info(
                f"Closed {len(closed_positions)} orphaned positions for fund {fund_id}: "
                f"Total P&L: ${total_pl:+.2f}, Total proceeds: ${total_proceeds:.2f}"
            )
            
            return {
                "success": True,
                "message": f"Successfully closed {len(closed_positions)} orphaned position(s)",
                "fund_id": fund_id,
                "positions_closed": closed_positions,
                "total_closed": len(closed_positions),
                "total_pl": total_pl,
                "total_proceeds": total_proceeds,
                "new_balance": fund.balance,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error closing all orphaned positions for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/funds/{fund_id}/reconcile-positions")
async def reconcile_fund_positions(fund_id: str) -> dict:
    """
    Manually trigger full position reconciliation for a fund.
    
    Checks all positions against Alpaca's records and auto-corrects
    discrepancies using the Activities API as the source of truth.
    
    This operation:
    1. Compares DB positions (from transaction ledger) with Alpaca positions
    2. Identifies discrepancies
    3. Auto-corrects by querying Activities API for missing fills
    4. Creates missing Transaction records
    5. Logs all actions to strategy_engine_events
    
    Returns summary of reconciliation results including:
    - Total positions checked
    - Discrepancies found
    - Corrections applied
    - Detailed discrepancy info
    """
    try:
        async with get_async_session() as session:
            # Verify fund exists
            stmt = select(Fund).where(Fund.id == fund_id)
            result = await session.execute(stmt)
            fund = result.scalar_one_or_none()
            
            if not fund:
                raise HTTPException(status_code=404, detail=f"Fund {fund_id} not found")
            
            # Get Alpaca service from engine if running, otherwise create new one
            from app.services.strategies.engine_registry import get_engine
            from app.services.trading.alpaca_service import AlpacaService
            from app.services.trading.trading_reconciliation_service import TradingReconciliationService
            
            engine = get_engine(fund_id)
            if engine:
                alpaca_service = engine.alpaca_service
            else:
                # Fund not running, create temporary Alpaca service
                alpaca_service = AlpacaService(paper_trading=(fund.mode == "sim"))
            
            # Run reconciliation
            trading_reconciliation = TradingReconciliationService(alpaca_service)
            result = await trading_reconciliation.reconcile_fund_positions(
                session=session,
                fund_id=fund_id,
                lookback_hours=24
            )
            
            logger.info(
                f"Manual reconciliation completed for fund {fund_id[:8]}: "
                f"{result['total_discrepancies']} discrepancies, "
                f"{result.get('corrections_applied', 0)} corrections applied"
            )
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund.name,
                "status": result["status"],
                "total_discrepancies": result["total_discrepancies"],
                "corrections_applied": result.get("corrections_applied", 0),
                "discrepancies": result["discrepancies"],
                "message": (
                    "All positions in sync" if result["status"] == "in_sync"
                    else f"Found {result['total_discrepancies']} discrepancies, applied {result.get('corrections_applied', 0)} corrections"
                )
            }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reconcile positions for fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Position reconciliation failed: {str(e)}"
        )


@router.post("/funds/{fund_id}/reset")
async def reset_fund(fund_id: str) -> dict:
    """
    Reset a fund to zero balance by clearing all history.
    
    This will:
    - Delete all strategy engine events
    - Delete all trades
    - Delete all orders
    - Delete all transactions
    - Delete all transfers
    - Set balance to 0
    
    Fund must be stopped (not actively trading) to reset.
    """
    try:
        # Check if fund is actively trading
        engine = get_engine(fund_id)
        if engine:
            raise HTTPException(
                status_code=400,
                detail="Cannot reset fund while it is actively trading. Stop the fund first."
            )
        
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Delete all related records
            from sqlalchemy import select, delete, func
            
            # Count records before deletion
            events_count = await session.scalar(
                select(func.count()).select_from(StrategyEngineEvent).where(StrategyEngineEvent.fund_id == fund_id)
            ) or 0
            trades_count = await session.scalar(
                select(func.count()).select_from(Trade).where(Trade.fund_id == fund_id)
            ) or 0
            orders_count = await session.scalar(
                select(func.count()).select_from(Order).where(Order.fund_id == fund_id)
            ) or 0
            transactions_count = await session.scalar(
                select(func.count()).select_from(Transaction).where(Transaction.fund_id == fund_id)
            ) or 0
            transfers_count = await session.scalar(
                select(func.count()).select_from(Transfer).where(Transfer.fund_id == fund_id)
            ) or 0
            
            logger.info(
                f"🔄 RESET REQUEST for fund {fund_id} ({fund.name}): "
                f"{events_count} strategy engine events, {trades_count} trades, {orders_count} orders, "
                f"{transactions_count} transactions, {transfers_count} transfers, current balance: ${fund.balance:.2f}"
            )
            
            # Delete in correct order due to foreign key constraints
            # 1. Delete strategy engine events
            # First get the event IDs to delete the parent Event records
            strategy_events_stmt = select(StrategyEngineEvent.id).where(StrategyEngineEvent.fund_id == fund_id)
            result = await session.execute(strategy_events_stmt)
            event_ids = [row[0] for row in result.all()]
            
            # Delete child records (StrategyEngineEvent)
            await session.execute(
                delete(StrategyEngineEvent).where(StrategyEngineEvent.fund_id == fund_id)
            )
            
            # Delete parent records (Event) if any were found
            if event_ids:
                await session.execute(
                    delete(Event).where(Event.id.in_(event_ids))
                )
            
            # 2. Delete transactions (they reference both trades and orders)
            await session.execute(
                delete(Transaction).where(Transaction.fund_id == fund_id)
            )
            
            # 3. Delete trades (they reference orders via entry_order_id/exit_order_id)
            await session.execute(
                delete(Trade).where(Trade.fund_id == fund_id)
            )
            
            # 4. Delete orders (no longer referenced by transactions or trades)
            await session.execute(
                delete(Order).where(Order.fund_id == fund_id)
            )
            
            # 5. Delete transfers (independent)
            await session.execute(
                delete(Transfer).where(Transfer.fund_id == fund_id)
            )
            
            # Reset balance
            old_balance = fund.balance
            fund.balance = 0.0
            
            await session.commit()
            
            logger.info(
                f"✅ Fund {fund_id} ({fund.name}) reset complete: "
                f"Deleted {events_count} strategy engine events, {trades_count} trades, {orders_count} orders, "
                f"{transactions_count} transactions, {transfers_count} transfers. Balance: ${old_balance:.2f} → $0.00"
            )
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund.name,
                "deleted": {
                    "strategy_engine_events": events_count,
                    "trades": trades_count,
                    "orders": orders_count,
                    "transactions": transactions_count,
                    "transfers": transfers_count,
                },
                "old_balance": old_balance,
                "new_balance": 0.0,
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/funds/{fund_id}")
async def delete_fund(fund_id: str) -> dict:
    """
    Delete a fund and all its associated data.
    
    This will:
    - Delete all strategy engine events
    - Delete all trades
    - Delete all orders
    - Delete all transactions
    - Delete all transfers
    - Delete all AI costs
    - Delete the fund itself
    
    Fund must be stopped (not actively trading) to delete.
    """
    try:
        # Check if fund is actively trading
        engine = get_engine(fund_id)
        if engine:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete fund while it is actively trading. Stop the fund first."
            )
        
        async with get_async_session() as session:
            # Get fund
            fund = await session.get(Fund, fund_id)
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            fund_name = fund.name
            
            # Delete all related records (same as reset)
            from sqlalchemy import select, delete, func
            from app.models.strategies import AICost
            
            # Count records before deletion
            events_count = await session.scalar(
                select(func.count()).select_from(StrategyEngineEvent).where(StrategyEngineEvent.fund_id == fund_id)
            ) or 0
            trades_count = await session.scalar(
                select(func.count()).select_from(Trade).where(Trade.fund_id == fund_id)
            ) or 0
            orders_count = await session.scalar(
                select(func.count()).select_from(Order).where(Order.fund_id == fund_id)
            ) or 0
            transactions_count = await session.scalar(
                select(func.count()).select_from(Transaction).where(Transaction.fund_id == fund_id)
            ) or 0
            transfers_count = await session.scalar(
                select(func.count()).select_from(Transfer).where(Transfer.fund_id == fund_id)
            ) or 0
            ai_costs_count = await session.scalar(
                select(func.count()).select_from(AICost).where(AICost.fund_id == fund_id)
            ) or 0
            
            logger.info(
                f"🗑️ DELETE REQUEST for fund {fund_id} ({fund_name}): "
                f"{events_count} strategy engine events, {trades_count} trades, {orders_count} orders, "
                f"{transactions_count} transactions, {transfers_count} transfers, "
                f"{ai_costs_count} AI costs"
            )
            
            # Delete in correct order due to foreign key constraints
            # 1. Delete strategy engine events
            strategy_events_stmt = select(StrategyEngineEvent.id).where(StrategyEngineEvent.fund_id == fund_id)
            result = await session.execute(strategy_events_stmt)
            event_ids = [row[0] for row in result.all()]
            
            # Delete child records (StrategyEngineEvent)
            await session.execute(
                delete(StrategyEngineEvent).where(StrategyEngineEvent.fund_id == fund_id)
            )
            
            # Delete parent records (Event) if any were found
            if event_ids:
                await session.execute(
                    delete(Event).where(Event.id.in_(event_ids))
                )
            
            # 2. Delete transactions (they reference both trades and orders)
            await session.execute(
                delete(Transaction).where(Transaction.fund_id == fund_id)
            )
            
            # 3. Delete trades (they reference orders via entry_order_id/exit_order_id)
            await session.execute(
                delete(Trade).where(Trade.fund_id == fund_id)
            )
            
            # 4. Delete orders (no longer referenced by transactions or trades)
            await session.execute(
                delete(Order).where(Order.fund_id == fund_id)
            )
            
            # 5. Delete transfers (independent)
            await session.execute(
                delete(Transfer).where(Transfer.fund_id == fund_id)
            )
            
            # 6. Delete AI costs
            await session.execute(
                delete(AICost).where(AICost.fund_id == fund_id)
            )
            
            # 7. Delete the fund itself
            await session.delete(fund)
            
            await session.commit()
            
            logger.info(
                f"✅ DELETE COMPLETE: {fund_name} - "
                f"Deleted {events_count} events, {trades_count} trades, {orders_count} orders, "
                f"{transactions_count} transactions, {transfers_count} transfers, "
                f"{ai_costs_count} AI costs, and the fund itself"
            )
            
            return {
                "success": True,
                "fund_id": fund_id,
                "fund_name": fund_name,
                "deleted": {
                    "events": events_count,
                    "trades": trades_count,
                    "orders": orders_count,
                    "transactions": transactions_count,
                    "transfers": transfers_count,
                    "ai_costs": ai_costs_count,
                },
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting fund {fund_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class DefaultRiskSettingsInput(BaseModel):
    """Input model for updating default risk settings."""
    max_loss_percent: Optional[float] = None
    max_loss_dollars: Optional[float] = None
    max_giveback_percent: Optional[float] = None
    max_order_age_seconds: Optional[int] = None
    size_per_trade: Optional[float] = None
    min_bet_percent: Optional[float] = None
    max_bet_percent: Optional[float] = None
    max_total_exposure: Optional[float] = None


class DefaultRiskSettingsResponse(BaseModel):
    """Response model for default risk settings."""
    max_loss_percent: Optional[float]
    max_loss_dollars: Optional[float]
    max_giveback_percent: Optional[float]
    max_order_age_seconds: int
    size_per_trade: float
    min_bet_percent: Optional[float]
    max_bet_percent: Optional[float]
    max_total_exposure: Optional[float]
    updated_at: str

    class Config:
        from_attributes = True


@router.get("/default-risk-settings", response_model=DefaultRiskSettingsResponse)
async def get_default_risk_settings():
    """Get default risk management settings."""
    try:
        async with get_async_session() as session:
            stmt = select(DefaultRiskSettings).where(DefaultRiskSettings.id == 'default')
            result = await session.execute(stmt)
            settings = result.scalar_one_or_none()
            
            if not settings:
                # Create default record if it doesn't exist
                settings = DefaultRiskSettings(
                    id='default',
                    max_order_age_seconds=60,
                    size_per_trade=1000.0
                )
                session.add(settings)
                await session.commit()
                await session.refresh(settings)
            
            return DefaultRiskSettingsResponse(
                max_loss_percent=settings.max_loss_percent,
                max_loss_dollars=settings.max_loss_dollars,
                max_giveback_percent=settings.max_giveback_percent,
                max_order_age_seconds=settings.max_order_age_seconds,
                size_per_trade=settings.size_per_trade,
                min_bet_percent=settings.min_bet_percent,
                max_bet_percent=settings.max_bet_percent,
                max_total_exposure=settings.max_total_exposure,
                updated_at=settings.updated_at.isoformat() if settings.updated_at else datetime.now(timezone.utc).isoformat()
            )
    except Exception as e:
        logger.error(f"Error getting default risk settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/default-risk-settings", response_model=DefaultRiskSettingsResponse)
async def update_default_risk_settings(input: DefaultRiskSettingsInput):
    """Update default risk management settings."""
    try:
        async with get_async_session() as session:
            stmt = select(DefaultRiskSettings).where(DefaultRiskSettings.id == 'default')
            result = await session.execute(stmt)
            settings = result.scalar_one_or_none()
            
            if not settings:
                # Create default record if it doesn't exist
                settings = DefaultRiskSettings(id='default')
                session.add(settings)
            
            # Update only provided fields
            if input.max_loss_percent is not None:
                settings.max_loss_percent = input.max_loss_percent
            if input.max_loss_dollars is not None:
                settings.max_loss_dollars = input.max_loss_dollars
            if input.max_giveback_percent is not None:
                settings.max_giveback_percent = input.max_giveback_percent
            if input.max_order_age_seconds is not None:
                settings.max_order_age_seconds = input.max_order_age_seconds
            if input.size_per_trade is not None:
                settings.size_per_trade = input.size_per_trade
            if input.min_bet_percent is not None:
                settings.min_bet_percent = input.min_bet_percent
            if input.max_bet_percent is not None:
                settings.max_bet_percent = input.max_bet_percent
            if input.max_total_exposure is not None:
                settings.max_total_exposure = input.max_total_exposure
            
            settings.updated_at = datetime.now(timezone.utc)
            
            await session.commit()
            await session.refresh(settings)
            
            return DefaultRiskSettingsResponse(
                max_loss_percent=settings.max_loss_percent,
                max_loss_dollars=settings.max_loss_dollars,
                max_giveback_percent=settings.max_giveback_percent,
                max_order_age_seconds=settings.max_order_age_seconds,
                size_per_trade=settings.size_per_trade,
                min_bet_percent=settings.min_bet_percent,
                max_bet_percent=settings.max_bet_percent,
                max_total_exposure=settings.max_total_exposure,
                updated_at=settings.updated_at.isoformat()
            )
    except Exception as e:
        logger.error(f"Error updating default risk settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

