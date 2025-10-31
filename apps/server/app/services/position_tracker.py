"""
Position Tracker Service

Provides utilities to calculate current positions from transaction history.
This is the source of truth for position quantities to prevent over-selling.
"""

import logging
from typing import Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Transaction

logger = logging.getLogger(__name__)


async def get_position_quantity_from_transactions(
    session: AsyncSession,
    fund_id: str,
    symbol: str
) -> float:
    """
    Calculate current position quantity from transaction ledger.
    
    Uses simple net position calculation: sum(buys) - sum(sells).
    This is the source of truth for position validation.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        
    Returns:
        Current position quantity (net shares owned)
    """
    try:
        # Query all transactions for this fund+symbol, ordered chronologically
        stmt = (
            select(Transaction)
            .where(
                Transaction.fund_id == fund_id,
                Transaction.symbol == symbol
            )
            .order_by(Transaction.timestamp.asc())
        )
        
        result = await session.execute(stmt)
        transactions = result.scalars().all()
        
        # Calculate net position: buys add, sells subtract
        net_position = 0.0
        
        for txn in transactions:
            if txn.side == "buy":
                net_position += txn.quantity
            else:  # sell
                net_position -= txn.quantity
        
        logger.debug(
            f"Position calculated for {symbol} in fund {fund_id[:8]}: "
            f"{net_position:.2f} shares from {len(transactions)} transactions"
        )
        
        return net_position
        
    except Exception as e:
        logger.error(
            f"Error calculating position for {symbol} in fund {fund_id}: {e}",
            exc_info=True
        )
        raise


async def get_all_positions_from_transactions(
    session: AsyncSession,
    fund_id: str
) -> Dict[str, float]:
    """
    Calculate all current positions for a fund from transaction history.
    
    Args:
        session: Database session
        fund_id: Fund ID
        
    Returns:
        Dictionary mapping symbol -> quantity for all non-zero positions
    """
    try:
        # Query all transactions for this fund
        stmt = (
            select(Transaction)
            .where(Transaction.fund_id == fund_id)
            .order_by(Transaction.timestamp.asc())
        )
        
        result = await session.execute(stmt)
        transactions = result.scalars().all()
        
        # Calculate net positions by symbol
        positions: Dict[str, float] = {}
        
        for txn in transactions:
            symbol = txn.symbol
            if symbol not in positions:
                positions[symbol] = 0.0
            
            if txn.side == "buy":
                positions[symbol] += txn.quantity
            else:  # sell
                positions[symbol] -= txn.quantity
        
        # Filter out zero/negative positions
        active_positions = {
            symbol: qty 
            for symbol, qty in positions.items() 
            if qty > 0.001  # Small epsilon for float comparison
        }
        
        logger.debug(
            f"Calculated {len(active_positions)} active positions for fund {fund_id[:8]} "
            f"from {len(transactions)} transactions"
        )
        
        return active_positions
        
    except Exception as e:
        logger.error(
            f"Error calculating all positions for fund {fund_id}: {e}",
            exc_info=True
        )
        raise

