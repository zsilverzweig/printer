"""
Alpaca Trading Service for paper trading integration.
Provides methods to interact with Alpaca's paper trading API.
"""

import logging
import os
from typing import Dict, Any, Optional
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

logger = logging.getLogger("app.alpaca_service")


class AlpacaService:
    """Service for interacting with Alpaca paper trading API."""
    
    def __init__(self):
        """Initialize Alpaca trading client with paper trading credentials."""
        api_key = os.getenv("ALPACA_API_KEY")
        secret_key = os.getenv("ALPACA_SECRET_KEY")
        
        if not api_key or not secret_key:
            logger.warning("Alpaca API credentials not found in environment variables")
            self.client = None
            return
        
        # Force paper trading
        self.client = TradingClient(
            api_key=api_key,
            secret_key=secret_key,
            paper=True  # Ensure paper trading only
        )
        
        logger.info("Alpaca trading client initialized (PAPER TRADING MODE)")
    
    def is_available(self) -> bool:
        """Check if Alpaca service is properly configured."""
        return self.client is not None
    
    async def get_account(self) -> Dict[str, Any]:
        """
        Get account information.
        
        Returns:
            Dictionary with account details including buying power, equity, etc.
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            account = self.client.get_account()
            
            account_data = {
                "id": str(account.id),
                "account_number": account.account_number,
                "status": account.status.value,
                "currency": account.currency,
                "buying_power": float(account.buying_power),
                "cash": float(account.cash),
                "portfolio_value": float(account.portfolio_value),
                "equity": float(account.equity),
                "last_equity": float(account.last_equity),
                "trading_blocked": account.trading_blocked,
                "transfers_blocked": account.transfers_blocked,
                "account_blocked": account.account_blocked,
            }
            
            logger.info(f"Retrieved account info: buying_power=${account_data['buying_power']:.2f}")
            return account_data
            
        except Exception as e:
            logger.error(f"Failed to get account info: {e}")
            raise
    
    async def check_buying_power(self, required_amount: float = 1000.0) -> bool:
        """
        Check if account has sufficient buying power.
        
        Args:
            required_amount: Amount needed (default $1000)
            
        Returns:
            True if sufficient buying power, False otherwise
        """
        try:
            account = await self.get_account()
            buying_power = account["buying_power"]
            
            has_power = buying_power >= required_amount
            logger.info(
                f"Buying power check: ${buying_power:.2f} {'>=':'<'} ${required_amount:.2f} = {has_power}"
            )
            
            return has_power
            
        except Exception as e:
            logger.error(f"Failed to check buying power: {e}")
            return False
    
    async def place_market_order(
        self, 
        symbol: str, 
        notional: float = 1000.0,
        side: str = "buy"
    ) -> Dict[str, Any]:
        """
        Place a market order with notional amount (dollar-based).
        
        Args:
            symbol: Stock ticker symbol
            notional: Dollar amount to trade (default $1000)
            side: "buy" or "sell"
            
        Returns:
            Dictionary with order details
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            # Validate side
            order_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL
            
            logger.info(
                f"Placing market order: {side.upper()} ${notional:.2f} notional of {symbol}"
            )
            
            # Create market order request with notional amount
            order_request = MarketOrderRequest(
                symbol=symbol,
                notional=notional,
                side=order_side,
                time_in_force=TimeInForce.DAY
            )
            
            # Submit order
            order = self.client.submit_order(order_request)
            
            order_data = {
                "id": str(order.id),
                "client_order_id": order.client_order_id,
                "symbol": order.symbol,
                "notional": notional,
                "side": order.side.value,
                "type": order.type.value,
                "status": order.status.value,
                "time_in_force": order.time_in_force.value,
                "submitted_at": order.submitted_at.isoformat() if order.submitted_at else None,
                "filled_at": order.filled_at.isoformat() if order.filled_at else None,
                "filled_qty": float(order.filled_qty) if order.filled_qty else 0,
                "filled_avg_price": float(order.filled_avg_price) if order.filled_avg_price else None,
            }
            
            logger.info(
                f"Order submitted: {order_data['id']} - {order_data['status']}"
            )
            
            return order_data
            
        except Exception as e:
            logger.error(f"Failed to place market order for {symbol}: {e}")
            raise
    
    async def get_positions(self) -> list[Dict[str, Any]]:
        """
        Get all current positions.
        
        Returns:
            List of positions with details
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            positions = self.client.get_all_positions()
            
            positions_data = []
            for pos in positions:
                positions_data.append({
                    "symbol": pos.symbol,
                    "qty": float(pos.qty),
                    "avg_entry_price": float(pos.avg_entry_price),
                    "current_price": float(pos.current_price),
                    "market_value": float(pos.market_value),
                    "cost_basis": float(pos.cost_basis),
                    "unrealized_pl": float(pos.unrealized_pl),
                    "unrealized_plpc": float(pos.unrealized_plpc),
                    "side": pos.side.value,
                })
            
            logger.info(f"Retrieved {len(positions_data)} positions")
            return positions_data
            
        except Exception as e:
            logger.error(f"Failed to get positions: {e}")
            raise
    
    async def get_position(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get position for a specific symbol.
        
        Args:
            symbol: Stock ticker symbol
            
        Returns:
            Position details or None if no position exists
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            position = self.client.get_open_position(symbol)
            
            if not position:
                return None
            
            return {
                "symbol": position.symbol,
                "qty": float(position.qty),
                "avg_entry_price": float(position.avg_entry_price),
                "current_price": float(position.current_price),
                "market_value": float(position.market_value),
                "cost_basis": float(position.cost_basis),
                "unrealized_pl": float(position.unrealized_pl),
                "unrealized_plpc": float(position.unrealized_plpc),
                "side": position.side.value,
            }
            
        except Exception as e:
            # Position not found is not an error
            if "position does not exist" in str(e).lower():
                return None
            logger.error(f"Failed to get position for {symbol}: {e}")
            raise


# Global instance
alpaca_service = AlpacaService()

