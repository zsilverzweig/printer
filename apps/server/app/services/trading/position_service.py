"""
Position Service

Manages position state incrementally updated with each transaction.
Replaces expensive FIFO calculations from transaction history.

Uses FIFO (First In, First Out) cost basis calculation:
- Buy: Adds to position, recalculates weighted average entry price
- Sell: Reduces position, maintains cost basis of remaining shares (FIFO)
"""

import logging
import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Position, Transaction
from app.services.core.time_context import get_current_time
from app.services.trading.constants import FLOAT_COMPARISON_EPSILON

logger = logging.getLogger(__name__)


async def get_position(
    session: AsyncSession,
    fund_id: str,
    symbol: str
) -> Optional[Position]:
    """
    Get position for a symbol in a fund.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        
    Returns:
        Position record or None if no position exists
    """
    stmt = select(Position).where(
        Position.fund_id == fund_id,
        Position.symbol == symbol
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_all_positions(
    session: AsyncSession,
    fund_id: str
) -> list[Position]:
    """
    Get all positions for a fund.
    
    Args:
        session: Database session
        fund_id: Fund ID
        
    Returns:
        List of Position records
    """
    stmt = select(Position).where(
        Position.fund_id == fund_id
    ).where(
        Position.quantity > FLOAT_COMPARISON_EPSILON  # Only non-zero positions
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_position_on_transaction(
    session: AsyncSession,
    transaction: Transaction,
    trade_id: Optional[str] = None
) -> Optional[Position]:
    """
    Update position incrementally based on a transaction.
    
    Uses FIFO cost basis calculation:
    - Buy: Adds to position, recalculates weighted average entry price
    - Sell: Reduces position, maintains cost basis of remaining shares (FIFO)
    
    Args:
        session: Database session
        transaction: Transaction record (must be committed or flushed)
        trade_id: Optional trade_id to link position to Trade
        
    Returns:
        Updated Position record, or None if position was closed
    """
    try:
        fund_id = transaction.fund_id
        symbol = transaction.symbol
        side = transaction.side
        quantity = transaction.quantity
        price = transaction.price
        
        # Get existing position
        position = await get_position(session, fund_id, symbol)
        
        if side == "buy":
            # BUY: Add to position
            if position:
                # Update existing position
                # New weighted average: (old_cost + new_cost) / (old_qty + new_qty)
                old_cost = position.cost_basis
                new_cost = quantity * price
                old_qty = position.quantity
                new_qty = old_qty + quantity
                
                position.cost_basis = old_cost + new_cost
                position.quantity = new_qty
                position.avg_entry_price = position.cost_basis / new_qty if new_qty > 0 else 0.0
                
                # Update trade_id if provided and position doesn't have one
                if trade_id and not position.trade_id:
                    position.trade_id = trade_id
                
                position.updated_at = get_current_time()
                
                logger.debug(
                    f"Updated position {symbol}: qty {old_qty:.2f} → {new_qty:.2f}, "
                    f"avg_entry ${position.avg_entry_price:.2f} → ${position.avg_entry_price:.2f}"
                )
            else:
                # Create new position
                position = Position(
                    id=str(uuid.uuid4()),
                    fund_id=fund_id,
                    symbol=symbol,
                    trade_id=trade_id,
                    quantity=quantity,
                    avg_entry_price=price,
                    cost_basis=quantity * price,
                )
                session.add(position)
                
                logger.debug(
                    f"Created position {symbol}: qty {quantity:.2f}, "
                    f"avg_entry ${price:.2f}, cost_basis ${quantity * price:.2f}"
                )
            
            return position
            
        else:  # sell
            # SELL: Reduce position (FIFO - sell oldest shares first)
            if not position:
                logger.warning(
                    f"Attempted to sell {quantity:.2f} {symbol} but no position exists. "
                    f"This should be caught by validation before transaction creation."
                )
                return None
            
            if position.quantity < quantity - FLOAT_COMPARISON_EPSILON:
                logger.error(
                    f"Attempted to sell {quantity:.2f} {symbol} but only have "
                    f"{position.quantity:.2f}. This should be caught by validation."
                )
                # Cap to available quantity
                quantity = position.quantity
            
            # FIFO: When selling, we're selling the oldest shares at current avg_entry_price
            # So we reduce cost_basis proportionally
            remaining_qty = position.quantity - quantity
            
            if remaining_qty <= FLOAT_COMPARISON_EPSILON:
                # Position closed - delete it
                await session.delete(position)
                logger.debug(f"Closed position {symbol} (sold all {position.quantity:.2f} shares)")
                return None
            else:
                # Reduce cost basis proportionally (FIFO: selling oldest shares)
                # Cost basis of sold shares = quantity * avg_entry_price
                sold_cost_basis = quantity * position.avg_entry_price
                position.cost_basis -= sold_cost_basis
                position.quantity = remaining_qty
                # avg_entry_price stays the same (we're selling oldest shares, remaining keep their cost)
                # But recalculate to avoid floating point drift
                position.avg_entry_price = position.cost_basis / remaining_qty if remaining_qty > 0 else 0.0
                position.updated_at = get_current_time()
                
                logger.debug(
                    f"Reduced position {symbol}: qty {position.quantity + quantity:.2f} → {remaining_qty:.2f}, "
                    f"cost_basis ${position.cost_basis + sold_cost_basis:.2f} → ${position.cost_basis:.2f}, "
                    f"avg_entry ${position.avg_entry_price:.2f}"
                )
                
                return position
                
    except Exception as e:
        logger.error(
            f"Error updating position for {transaction.symbol} {transaction.side}: {e}",
            exc_info=True
        )
        raise


async def create_position_for_trade(
    session: AsyncSession,
    fund_id: str,
    symbol: str,
    trade_id: str,
    entry_quantity: float,
    entry_price: float
) -> Position:
    """
    Create a position linked to a Trade.
    
    Called when a Trade opens to create the initial position.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        trade_id: Trade ID that opened this position
        entry_quantity: Initial quantity
        entry_price: Entry price
        
    Returns:
        Created Position record
    """
    # Check if position already exists (shouldn't happen, but handle gracefully)
    existing = await get_position(session, fund_id, symbol)
    if existing:
        # Update existing position with trade_id if not set
        if not existing.trade_id:
            existing.trade_id = trade_id
            logger.debug(f"Linked existing position {symbol} to trade {trade_id}")
        return existing
    
    position = Position(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol=symbol,
        trade_id=trade_id,
        quantity=entry_quantity,
        avg_entry_price=entry_price,
        cost_basis=entry_quantity * entry_price,
    )
    session.add(position)
    
    logger.debug(
        f"Created position {symbol} for trade {trade_id}: "
        f"qty {entry_quantity:.2f}, avg_entry ${entry_price:.2f}"
    )
    
    return position


async def close_position_for_trade(
    session: AsyncSession,
    fund_id: str,
    symbol: str
) -> Optional[Position]:
    """
    Close a position when its Trade closes.
    
    This is called when a Trade closes. The position should already be at zero
    quantity from sell transactions, but we verify and clean up if needed.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        
    Returns:
        Position record if still exists (should be None if properly closed)
    """
    position = await get_position(session, fund_id, symbol)
    
    if position:
        if position.quantity <= FLOAT_COMPARISON_EPSILON:
            # Position is already closed (zero quantity) - delete it
            await session.delete(position)
            logger.debug(f"Deleted zero-quantity position {symbol}")
            return None
        else:
            # Position still has quantity - this shouldn't happen if Trade is closing
            logger.warning(
                f"Position {symbol} still has quantity {position.quantity:.2f} when trade closed. "
                f"Keeping position (may be from multiple trades)."
            )
            # Clear trade_id since the trade is closed
            position.trade_id = None
            return position
    
    return None


