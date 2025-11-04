"""
Alpaca Backtest Wrapper.

Wraps the AlpacaService to intercept order submissions during backtests
and record them without sending to actual broker.
"""

import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from app.models.strategies import Order
from app.services.trading.alpaca_service import AlpacaService
from app.services.core.time_context import get_current_time, get_backtest_id
from app.services.core.database import get_async_session

logger = logging.getLogger(__name__)


class AlpacaBacktestWrapper:
    """
    Wraps AlpacaService for backtesting.
    
    Intercepts order submissions and creates Order records without
    actually sending them to Alpaca. Orders are marked as 'pending'
    and will be filled by the OrderSimulator using historical data.
    """
    
    def __init__(self, alpaca_service: AlpacaService, fund_id: str = None):
        """
        Initialize backtest wrapper.
        
        Args:
            alpaca_service: Underlying Alpaca service (not used in backtest, but kept for interface compatibility)
            fund_id: Fund ID for linking orders
        """
        self.alpaca_service = alpaca_service
        self.paper_trading = True  # Always true for backtests
        self.fund_id = fund_id  # Store fund_id for order creation
    
    async def submit_order(
        self,
        symbol: str,
        qty: float,
        side: str,
        order_type: str = "market",
        time_in_force: str = "day",
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        client_order_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Submit order during backtest (creates Order record without calling Alpaca).
        
        Args:
            symbol: Stock symbol
            qty: Quantity to trade
            side: 'buy' or 'sell'
            order_type: 'market', 'limit', 'stop', 'stop_limit'
            time_in_force: 'day', 'gtc', 'ioc', 'fok'
            limit_price: Limit price for limit orders
            stop_price: Stop price for stop orders
            client_order_id: Optional client order ID
            
        Returns:
            Dict with order details (mimics Alpaca response structure)
        """
        backtest_id = get_backtest_id()
        current_time = get_current_time()
        
        if not backtest_id:
            raise ValueError("Cannot submit backtest order: not in backtest mode")
        
        order_id = str(uuid.uuid4())
        # Generate mock Alpaca order ID for backtests (format: BT_UUID)
        mock_alpaca_order_id = f"BT_{order_id}"
        
        logger.info(
            f"[BACKTEST] Submitting {side} order: {qty} shares of {symbol} "
            f"(type={order_type}, backtest={backtest_id})"
        )
        
        # Create Order record in database
        order = Order(
            id=order_id,
            alpaca_order_id=mock_alpaca_order_id,  # Mock Alpaca order ID for backtests
            fund_id=self.fund_id,  # Use stored fund_id
            trade_id=None,  # Will be set by caller if part of trade
            backtest_id=backtest_id,
            symbol=symbol,
            side=side,
            quantity=qty,
            order_type=order_type,
            estimated_price=limit_price or stop_price,  # Use limit/stop as estimate
            status='pending',
            submitted_at=current_time
        )
        
        async with get_async_session() as session:
            session.add(order)
            await session.commit()
            await session.refresh(order)
        
        # Return response that mimics Alpaca structure
        return {
            'id': order.id,
            'client_order_id': client_order_id or order.id,
            'created_at': current_time.isoformat(),
            'updated_at': current_time.isoformat(),
            'submitted_at': current_time.isoformat(),
            'filled_at': None,
            'expired_at': None,
            'canceled_at': None,
            'failed_at': None,
            'replaced_at': None,
            'replaced_by': None,
            'replaces': None,
            'asset_id': None,
            'symbol': symbol,
            'asset_class': 'us_equity',
            'notional': None,
            'qty': str(qty),
            'filled_qty': '0',
            'filled_avg_price': None,
            'order_class': '',
            'order_type': order_type,
            'type': order_type,
            'side': side,
            'time_in_force': time_in_force,
            'limit_price': str(limit_price) if limit_price else None,
            'stop_price': str(stop_price) if stop_price else None,
            'status': 'pending_new',
            'extended_hours': False,
            'legs': None,
            'trail_percent': None,
            'trail_price': None,
            'hwm': None,
        }
    
    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """
        Get order details during backtest.
        
        Args:
            order_id: Order ID to retrieve
            
        Returns:
            Dict with order details
        """
        async with get_async_session() as session:
            order = await session.get(Order, order_id)
            
            if not order:
                raise ValueError(f"Order {order_id} not found")
            
            return {
                'id': order.id,
                'symbol': order.symbol,
                'side': order.side,
                'qty': str(order.quantity),
                'filled_qty': str(order.filled_qty or 0),
                'filled_avg_price': str(order.filled_avg_price) if order.filled_avg_price else None,
                'order_type': order.order_type,
                'status': self._map_status_to_alpaca(order.status),
                'submitted_at': order.submitted_at.isoformat() if order.submitted_at else None,
                'filled_at': order.filled_at.isoformat() if order.filled_at else None,
            }
    
    async def cancel_order(self, order_id: str) -> None:
        """
        Cancel order during backtest.
        
        Args:
            order_id: Order ID to cancel
        """
        async with get_async_session() as session:
            order = await session.get(Order, order_id)
            
            if not order:
                raise ValueError(f"Order {order_id} not found")
            
            if order.status in ('filled', 'canceled', 'failed'):
                logger.warning(f"Cannot cancel order {order_id} with status {order.status}")
                return
            
            order.status = 'canceled'
            await session.commit()
            
            logger.info(f"[BACKTEST] Cancelled order {order_id}")
    
    async def get_positions(self) -> list:
        """
        Get positions during backtest.
        
        For backtests, positions are calculated from transactions rather than
        queried from Alpaca. This method returns empty list as positions are
        managed differently in backtest mode.
        
        Returns:
            Empty list (positions managed by backtest coordinator)
        """
        return []
    
    async def get_account(self) -> Dict[str, Any]:
        """
        Get account info during backtest.
        
        Returns mock account data as backtests don't have real broker accounts.
        
        Returns:
            Dict with mock account information
        """
        return {
            'account_number': 'BACKTEST',
            'status': 'ACTIVE',
            'crypto_status': 'INACTIVE',
            'currency': 'USD',
            'buying_power': '1000000',
            'regt_buying_power': '1000000',
            'daytrading_buying_power': '1000000',
            'cash': '1000000',
            'portfolio_value': '1000000',
            'pattern_day_trader': False,
            'trading_blocked': False,
            'transfers_blocked': False,
            'account_blocked': False,
            'created_at': '2024-01-01T00:00:00Z',
            'trade_suspended_by_user': False,
            'multiplier': '4',
            'shorting_enabled': True,
            'equity': '1000000',
            'last_equity': '1000000',
            'long_market_value': '0',
            'short_market_value': '0',
            'initial_margin': '0',
            'maintenance_margin': '0',
            'last_maintenance_margin': '0',
            'sma': '0',
            'daytrade_count': 0,
        }
    
    def is_available(self) -> bool:
        """Check if service is available (always True for backtest)."""
        return True
    
    @staticmethod
    def _map_status_to_alpaca(status: str) -> str:
        """
        Map internal order status to Alpaca status format.
        
        Args:
            status: Internal order status
            
        Returns:
            Alpaca-compatible status string
        """
        status_map = {
            'pending': 'pending_new',
            'filled': 'filled',
            'partially_filled': 'partially_filled',
            'canceled': 'canceled',
            'failed': 'rejected',
        }
        return status_map.get(status, 'pending_new')

