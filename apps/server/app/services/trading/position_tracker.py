"""
Position Tracker Service

Provides utilities to calculate current positions from transaction history.
This is the source of truth for position quantities to prevent over-selling.
"""

import logging
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Transaction
from app.services.trading.constants import (
    POSITION_EPSILON,
    FLOAT_COMPARISON_EPSILON,
)

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
            if qty > FLOAT_COMPARISON_EPSILON
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


async def sync_positions_from_broker(
    session: AsyncSession,
    fund_id: str,
    broker_positions: list[Dict[str, Any]]
) -> Dict[str, float]:
    """
    Sync broker positions with transaction ledger.
    
    Compares positions reported by broker with our transaction history
    to identify discrepancies that need reconciliation.
    
    Args:
        session: Database session
        fund_id: Fund ID
        broker_positions: List of positions from broker (e.g., Alpaca)
                         Each dict should have 'symbol' and 'qty' keys
        
    Returns:
        Dictionary mapping symbol -> quantity discrepancy
        (positive = broker has more, negative = we have more in transactions)
    """
    try:
        # Get positions from our transaction ledger
        ledger_positions = await get_all_positions_from_transactions(session, fund_id)
        
        # Build broker position dict
        broker_dict = {
            pos["symbol"]: float(pos["qty"]) 
            for pos in broker_positions
        }
        
        # Find all symbols (union of both sources)
        all_symbols = set(ledger_positions.keys()) | set(broker_dict.keys())
        
        discrepancies = {}
        for symbol in all_symbols:
            ledger_qty = ledger_positions.get(symbol, 0.0)
            broker_qty = broker_dict.get(symbol, 0.0)
            
            diff = broker_qty - ledger_qty
            
            # Only report discrepancies > POSITION_EPSILON shares (float tolerance)
            if abs(diff) > POSITION_EPSILON:
                discrepancies[symbol] = diff
                logger.warning(
                    f"Position discrepancy for {symbol}: "
                    f"broker={broker_qty:.2f}, ledger={ledger_qty:.2f}, "
                    f"diff={diff:+.2f}"
                )
        
        if discrepancies:
            logger.warning(
                f"Found {len(discrepancies)} position discrepancies for fund {fund_id[:8]}"
            )
        else:
            logger.debug(
                f"All positions in sync for fund {fund_id[:8]} "
                f"({len(all_symbols)} symbols checked)"
            )
        
        return discrepancies
        
    except Exception as e:
        logger.error(
            f"Error syncing positions from broker for fund {fund_id}: {e}",
            exc_info=True
        )
        raise


async def validate_position_for_trade(
    session: AsyncSession,
    fund_id: str,
    symbol: str,
    side: str,
    quantity: float
) -> tuple[bool, Optional[str]]:
    """
    Validate trade against current position.
    
    Prevents over-selling and validates position exists for sells.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        side: "buy" or "sell"
        quantity: Quantity to trade
        
    Returns:
        (is_valid, error_message)
        If is_valid is False, error_message explains why
    """
    try:
        # For buys, always valid (assuming balance checks elsewhere)
        if side == "buy":
            return True, None
        
        # For sells, check we have enough to sell
        current_position = await get_position_quantity_from_transactions(
            session, fund_id, symbol
        )
        
        if current_position < FLOAT_COMPARISON_EPSILON:
            return False, f"No position to sell (current: {current_position:.4f})"
        
        if quantity > current_position + POSITION_EPSILON:
            return False, (
                f"Insufficient position: attempting to sell {quantity:.2f} "
                f"but only own {current_position:.2f}"
            )
        
        return True, None
        
    except Exception as e:
        logger.error(
            f"Error validating trade for {symbol}: {e}",
            exc_info=True
        )
        return False, f"Validation error: {str(e)}"


async def get_position_context(
    session: AsyncSession,
    fund_id: str,
    symbol: str
) -> Optional[Dict[str, Any]]:
    """
    Get full position context from transaction history.
    
    Consolidates logic for retrieving entry price, entry time,
    strategy state, and high water mark from transactions.
    
    Args:
        session: Database session
        fund_id: Fund ID
        symbol: Stock symbol
        
    Returns:
        Dictionary with position context or None if no position
        Contains: entry_price, entry_time, strategy_state, high_water_mark, quantity
    """
    try:
        from datetime import datetime
        
        # Get all buy transactions for this symbol
        stmt = select(Transaction).where(
            Transaction.fund_id == fund_id,
            Transaction.symbol == symbol,
            Transaction.side == "buy"
        ).order_by(Transaction.timestamp.asc())
        
        result = await session.execute(stmt)
        buy_transactions = result.scalars().all()
        
        if not buy_transactions:
            return None
        
        # Calculate weighted average entry price
        total_qty = sum(t.quantity for t in buy_transactions)
        if total_qty <= 0:
            return None
        
        weighted_sum = sum(t.quantity * t.price for t in buy_transactions)
        entry_price = weighted_sum / total_qty
        
        # Use first buy as entry time
        entry_time = buy_transactions[0].timestamp
        
        # Get most recent strategy state and high water mark
        latest_transaction = buy_transactions[-1]
        strategy_state = latest_transaction.strategy_state or {}
        high_water_mark = latest_transaction.high_water_mark
        
        # Get current net position quantity
        quantity = await get_position_quantity_from_transactions(
            session, fund_id, symbol
        )
        
        return {
            "entry_price": entry_price,
            "entry_time": entry_time,
            "strategy_state": strategy_state,
            "high_water_mark": high_water_mark,
            "quantity": quantity,
        }
        
    except Exception as e:
        logger.error(
            f"Error getting position context for {symbol}: {e}",
            exc_info=True
        )
        return None

