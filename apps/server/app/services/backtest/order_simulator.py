"""
Order Simulator for Backtesting.

Simulates order fills during backtests using next minute's open price.
This provides realistic execution without requiring actual broker interaction.
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Order, Transaction, Fund
from app.services.core.database import get_async_session
from app.services.core.time_context import get_backtest_id

logger = logging.getLogger(__name__)


class OrderSimulator:
    """
    Simulates order fills during backtests.
    
    Uses simple fill model: orders fill at next minute's open price.
    More sophisticated models (slippage, partial fills) can be added later.
    """
    
    async def simulate_fill(
        self,
        order: Order,
        next_bar: Dict[str, Any],
        session: AsyncSession,
        update_fund_balance: bool = False
    ) -> Transaction:
        """
        Simulate order fill at next minute's open price.
        
        Args:
            order: Order to fill
            next_bar: Next minute bar with OHLCV data
            session: Database session for transaction
            
        Returns:
            Transaction record for the simulated fill
        """
        # Get fill price from next bar's open
        fill_price = float(next_bar['open'])
        fill_time = next_bar['time']
        
        logger.info(
            f"Simulating fill for order {order.id}: {order.side} {order.quantity} {order.symbol} "
            f"at ${fill_price:.2f} (next bar open)"
        )
        
        # Create transaction record
        transaction = Transaction(
            id=str(uuid.uuid4()),
            order_id=order.id,
            alpaca_order_id=None,  # No Alpaca order for backtest
            alpaca_fill_id=None,
            fund_id=order.fund_id,
            trade_id=order.trade_id,
            backtest_id=get_backtest_id(),  # Link to current backtest
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=fill_price,
            total_value=order.quantity * fill_price,
            timestamp=fill_time,
            strategy_state={}
        )
        
        # Update order status
        order.status = 'filled'
        order.filled_at = fill_time
        order.filled_qty = order.quantity
        order.filled_avg_price = fill_price
        
        # Update fund balance (only if explicitly requested - for legacy/testing)
        # In backtest mode, balance is tracked separately in the coordinator
        if update_fund_balance:
            fund = await session.get(Fund, order.fund_id)
            if not fund:
                raise ValueError(f"Fund {order.fund_id} not found")
            
            if order.side == 'buy':
                # Deduct cost for buy orders
                cost = transaction.total_value
                fund.balance -= cost
                logger.debug(f"Fund balance after buy: ${fund.balance:.2f} (spent ${cost:.2f})")
            elif order.side == 'sell':
                # Add proceeds for sell orders
                proceeds = transaction.total_value
                fund.balance += proceeds
                logger.debug(f"Fund balance after sell: ${fund.balance:.2f} (gained ${proceeds:.2f})")
        
        # Add transaction to session
        session.add(transaction)
        
        return transaction
    
    async def check_pending_orders(
        self,
        fund_id: str,
        current_time: datetime,
        current_bars: Dict[str, Dict[str, Any]]
    ) -> int:
        """
        Check pending orders and fill those that should be executed.
        
        Args:
            fund_id: Fund ID to check orders for
            current_time: Current backtest time
            current_bars: Current minute bars for all symbols
            
        Returns:
            Number of orders filled
        """
        backtest_id = get_backtest_id()
        filled_count = 0
        
        async with get_async_session() as session:
            # Get pending orders for this fund and backtest
            stmt = select(Order).where(
                Order.fund_id == fund_id,
                Order.backtest_id == backtest_id,
                Order.status == 'pending'
            )
            result = await session.execute(stmt)
            pending_orders = result.scalars().all()
            
            for order in pending_orders:
                # Check if we have bar data for this symbol
                if order.symbol not in current_bars:
                    logger.debug(f"No bar data for {order.symbol}, skipping fill check")
                    continue
                
                bar = current_bars[order.symbol]
                
                # Simple fill logic: fill at current bar's open
                # (In reality, this would be more sophisticated with trigger prices, etc.)
                try:
                    await self.simulate_fill(order, bar, session)
                    filled_count += 1
                    logger.info(f"Filled order {order.id} for {order.symbol}")
                except Exception as e:
                    logger.error(f"Error filling order {order.id}: {e}", exc_info=True)
                    order.status = 'failed'
                    order.error_message = str(e)
            
            await session.commit()
        
        return filled_count

