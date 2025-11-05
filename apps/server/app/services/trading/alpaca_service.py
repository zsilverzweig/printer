"""
Alpaca Trading Service for paper trading integration.
Provides methods to interact with Alpaca's paper trading API.
"""

import logging
import os
from typing import Dict, Any, Optional
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest

logger = logging.getLogger("app.alpaca_service")


class AlpacaService:
    """Service for interacting with Alpaca trading API (paper or real)."""
    
    def __init__(self, paper_trading: bool = True):
        """
        Initialize Alpaca trading client.
        
        Args:
            paper_trading: If True, use paper trading credentials. If False, use real trading.
        """
        self.paper_trading = paper_trading
        
        if paper_trading:
            api_key = os.getenv("ALPACA_API_KEY")
            secret_key = os.getenv("ALPACA_SECRET_KEY")
            mode_label = "PAPER TRADING"
        else:
            # Real trading uses separate credentials for safety
            api_key = os.getenv("ALPACA_REAL_API_KEY")
            secret_key = os.getenv("ALPACA_REAL_SECRET_KEY")
            mode_label = "REAL TRADING"
        
        if not api_key or not secret_key:
            logger.warning(f"Alpaca {mode_label} credentials not found in environment variables")
            self.client = None
            self.data_client = None
            return
        
        # Initialize trading client with explicit paper flag
        self.client = TradingClient(
            api_key=api_key,
            secret_key=secret_key,
            paper=paper_trading
        )
        
        # Initialize data client for market data (quotes, bars, etc.)
        self.data_client = StockHistoricalDataClient(
            api_key=api_key,
            secret_key=secret_key
        )
        
        logger.debug(f"Alpaca trading client initialized ({mode_label} MODE)")
        
        # Double-check account is in expected mode
        try:
            account = self.client.get_account()
            is_paper = getattr(account, 'account_number', '').startswith('P')
            if paper_trading and not is_paper:
                raise RuntimeError("Expected paper trading account but got real account!")
            if not paper_trading and is_paper:
                raise RuntimeError("Expected real trading account but got paper account!")
            logger.debug(f"Account mode verified: {mode_label}")
        except Exception as e:
            logger.error(f"Failed to verify account mode: {e}")
            raise
    
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
        notional: float = None,
        qty: float = None,
        side: str = "buy",
        time_in_force: str = "gtc"
    ) -> Dict[str, Any]:
        """
        Place a market order with either notional amount (dollar-based) or quantity.
        
        Args:
            symbol: Stock ticker symbol
            notional: Dollar amount to trade (optional)
            qty: Number of shares to trade (optional)
            side: "buy" or "sell"
            time_in_force: "day", "gtc", "ioc", "fok" (default: "gtc")
            
        Returns:
            Dictionary with order details
        """
        logger.info("=" * 80)
        logger.info(f"📝 ORDER REQUEST RECEIVED")
        logger.info(f"   Symbol: {symbol}")
        logger.info(f"   Notional: ${notional:.2f}" if notional else f"   Quantity: {qty}")
        logger.info(f"   Side: {side.upper()}")
        logger.info(f"   Time in Force: {time_in_force.upper()}")
        logger.info("=" * 80)
        
        if not self.client:
            logger.error("❌ Alpaca client not initialized")
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        if not notional and not qty:
            logger.error("❌ Neither notional nor qty provided")
            raise ValueError("Either notional or qty must be provided")
        
        try:
            # Validate side
            order_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL
            logger.info(f"✓ Order side validated: {order_side.value}")
            
            # Convert time_in_force string to enum
            tif_map = {
                "day": TimeInForce.DAY,
                "gtc": TimeInForce.GTC,
                "ioc": TimeInForce.IOC,
                "fok": TimeInForce.FOK,
            }
            time_in_force_enum = tif_map.get(time_in_force.lower(), TimeInForce.GTC)
            logger.info(f"✓ Time in force: {time_in_force_enum.value}")
            
            # Try notional first if provided
            if notional and not qty:
                logger.info(f"💵 Attempting NOTIONAL order: ${notional:.2f} of {symbol}")
                
                try:
                    # Create market order request with notional amount
                    order_request = MarketOrderRequest(
                        symbol=symbol,
                        notional=notional,
                        side=order_side,
                        time_in_force=time_in_force_enum
                    )
                    logger.info(f"📤 Submitting notional order to Alpaca API...")
                    
                    # Submit order
                    order = self.client.submit_order(order_request)
                    logger.info(f"✅ Notional order accepted by Alpaca")
                    
                except Exception as notional_error:
                    # If the asset is not fractionable, fall back to quantity-based order
                    if "not fractionable" in str(notional_error).lower():
                        logger.warning(f"⚠️  {symbol} is NOT fractionable")
                        logger.info(f"🔄 Falling back to quantity-based order")
                        
                        # Get current quote to calculate quantity
                        logger.info(f"📊 Fetching quote for {symbol}...")
                        quote = await self.get_quote(symbol)
                        current_price = (quote["ask_price"] + quote["bid_price"]) / 2
                        logger.info(f"   Current price: ${current_price:.2f}")
                        
                        qty = int(notional / current_price)
                        logger.info(f"   Calculated quantity: {qty} shares")
                        
                        if qty < 1:
                            logger.error(f"❌ Insufficient funds: ${notional:.2f} < ${current_price:.2f}")
                            raise ValueError(
                                f"Insufficient notional amount (${notional:.2f}) to buy at least 1 share at ${current_price:.2f}"
                            )
                        
                        logger.info(f"💰 Placing QTY order: {qty} shares of {symbol}")
                        
                        order_request = MarketOrderRequest(
                            symbol=symbol,
                            qty=qty,
                            side=order_side,
                            time_in_force=time_in_force_enum
                        )
                        logger.info(f"📤 Submitting qty order to Alpaca API...")
                        
                        order = self.client.submit_order(order_request)
                        logger.info(f"✅ Quantity order accepted by Alpaca")
                    else:
                        logger.error(f"❌ Notional order failed: {notional_error}")
                        raise
            else:
                # Use quantity-based order
                logger.info(f"💰 Placing QTY order: {qty} shares of {symbol}")
                
                order_request = MarketOrderRequest(
                    symbol=symbol,
                    qty=qty,
                    side=order_side,
                    time_in_force=time_in_force_enum
                )
                logger.info(f"📤 Submitting qty order to Alpaca API...")
                
                order = self.client.submit_order(order_request)
                logger.info(f"✅ Quantity order accepted by Alpaca")
            
            order_data = {
                "id": str(order.id),
                "client_order_id": order.client_order_id,
                "symbol": order.symbol,
                "qty": float(order.qty) if order.qty else None,
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
            
            logger.info("=" * 80)
            logger.info(f"✅ ORDER RESPONSE FROM ALPACA")
            logger.info(f"   Order ID: {order_data['id']}")
            logger.info(f"   Client Order ID: {order_data['client_order_id']}")
            logger.info(f"   Status: {order_data['status'].upper()}")
            logger.info(f"   Symbol: {order_data['symbol']}")
            logger.info(f"   Side: {order_data['side'].upper()}")
            logger.info(f"   Type: {order_data['type'].upper()}")
            logger.info(f"   Time in Force: {order_data['time_in_force'].upper()}")
            logger.info(f"   Quantity: {order_data['qty'] if order_data['qty'] else 'N/A'}")
            logger.info(f"   Notional: ${order_data['notional']:.2f}" if order_data['notional'] else "   Notional: N/A")
            logger.info(f"   Filled Qty: {order_data['filled_qty']}")
            logger.info(f"   Filled Avg Price: ${order_data['filled_avg_price']:.2f}" if order_data['filled_avg_price'] else "   Filled Avg Price: N/A")
            logger.info(f"   Submitted At: {order_data['submitted_at']}")
            logger.info(f"   Filled At: {order_data['filled_at'] if order_data['filled_at'] else 'Not filled yet'}")
            logger.info("=" * 80)
            
            return order_data
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"❌ ORDER FAILED")
            logger.error(f"   Symbol: {symbol}")
            logger.error(f"   Error Type: {type(e).__name__}")
            logger.error(f"   Error Message: {str(e)}")
            logger.error("=" * 80)
            raise
    
    async def place_limit_order(
        self, 
        symbol: str,
        limit_price: float,
        notional: float = None,
        qty: float = None,
        side: str = "buy",
        time_in_force: str = "day"
    ) -> Dict[str, Any]:
        """
        Place a limit order with either notional amount (dollar-based) or quantity.
        
        Args:
            symbol: Stock ticker symbol
            limit_price: Limit price for the order
            notional: Dollar amount to trade (optional)
            qty: Number of shares to trade (optional)
            side: "buy" or "sell"
            time_in_force: "day", "gtc", "ioc", "fok" (default: "day")
            
        Returns:
            Dictionary with order details
        """
        logger.info("=" * 80)
        logger.info(f"📝 LIMIT ORDER REQUEST RECEIVED")
        logger.info(f"   Symbol: {symbol}")
        logger.info(f"   Limit Price: ${limit_price:.2f}")
        logger.info(f"   Notional: ${notional:.2f}" if notional else f"   Quantity: {qty}")
        logger.info(f"   Side: {side.upper()}")
        logger.info(f"   Time in Force: {time_in_force.upper()}")
        logger.info("=" * 80)
        
        if not self.client:
            logger.error("❌ Alpaca client not initialized")
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        if not notional and not qty:
            logger.error("❌ Neither notional nor qty provided")
            raise ValueError("Either notional or qty must be provided")
        
        try:
            # Validate side
            order_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL
            logger.info(f"✓ Order side validated: {order_side.value}")
            
            # Convert time_in_force string to enum
            tif_map = {
                "day": TimeInForce.DAY,
                "gtc": TimeInForce.GTC,
                "ioc": TimeInForce.IOC,
                "fok": TimeInForce.FOK,
            }
            time_in_force_enum = tif_map.get(time_in_force.lower(), TimeInForce.DAY)
            logger.info(f"✓ Time in force: {time_in_force_enum.value}")
            
            # If notional is provided, calculate quantity based on limit price
            if notional and not qty:
                qty = int(notional / limit_price)
                logger.info(f"💵 Calculated quantity from notional: {qty} shares @ ${limit_price:.2f}")
                
                if qty < 1:
                    logger.error(f"❌ Insufficient funds: ${notional:.2f} < ${limit_price:.2f}")
                    raise ValueError(
                        f"Insufficient notional amount (${notional:.2f}) to buy at least 1 share at ${limit_price:.2f}"
                    )
            
            # Use quantity-based limit order
            logger.info(f"💰 Placing LIMIT order: {qty} shares of {symbol} @ ${limit_price:.2f}")
            
            order_request = LimitOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=time_in_force_enum,
                limit_price=limit_price
            )
            logger.info(f"📤 Submitting limit order to Alpaca API...")
            
            order = self.client.submit_order(order_request)
            logger.info(f"✅ Limit order accepted by Alpaca")
            
            order_data = {
                "id": str(order.id),
                "client_order_id": order.client_order_id,
                "symbol": order.symbol,
                "qty": float(order.qty) if order.qty else None,
                "limit_price": float(order.limit_price) if order.limit_price else None,
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
            
            logger.info("=" * 80)
            logger.info(f"✅ LIMIT ORDER RESPONSE FROM ALPACA")
            logger.info(f"   Order ID: {order_data['id']}")
            logger.info(f"   Client Order ID: {order_data['client_order_id']}")
            logger.info(f"   Status: {order_data['status'].upper()}")
            logger.info(f"   Symbol: {order_data['symbol']}")
            logger.info(f"   Side: {order_data['side'].upper()}")
            logger.info(f"   Type: {order_data['type'].upper()}")
            logger.info(f"   Limit Price: ${order_data['limit_price']:.2f}" if order_data['limit_price'] else "   Limit Price: N/A")
            logger.info(f"   Time in Force: {order_data['time_in_force'].upper()}")
            logger.info(f"   Quantity: {order_data['qty'] if order_data['qty'] else 'N/A'}")
            logger.info(f"   Notional: ${order_data['notional']:.2f}" if order_data['notional'] else "   Notional: N/A")
            logger.info(f"   Filled Qty: {order_data['filled_qty']}")
            logger.info(f"   Filled Avg Price: ${order_data['filled_avg_price']:.2f}" if order_data['filled_avg_price'] else "   Filled Avg Price: N/A")
            logger.info(f"   Submitted At: {order_data['submitted_at']}")
            logger.info(f"   Filled At: {order_data['filled_at'] if order_data['filled_at'] else 'Not filled yet'}")
            logger.info("=" * 80)
            
            return order_data
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"❌ LIMIT ORDER FAILED")
            logger.error(f"   Symbol: {symbol}")
            logger.error(f"   Limit Price: ${limit_price:.2f}")
            logger.error(f"   Error Type: {type(e).__name__}")
            logger.error(f"   Error Message: {str(e)}")
            logger.error("=" * 80)
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
            
            logger.debug(f"Retrieved {len(positions_data)} positions")
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
    
    async def get_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Get latest quote for a symbol.
        
        Args:
            symbol: Stock ticker symbol
            
        Returns:
            Dictionary with latest quote data
        """
        if not self.data_client:
            raise ValueError("Alpaca data client not initialized. Check API credentials.")
        
        try:
            request = StockLatestQuoteRequest(symbol_or_symbols=symbol)
            quotes = self.data_client.get_stock_latest_quote(request)
            
            if symbol not in quotes:
                raise ValueError(f"No quote data found for {symbol}")
            
            quote = quotes[symbol]
            
            quote_data = {
                "symbol": symbol,
                "ask_price": float(quote.ask_price),
                "bid_price": float(quote.bid_price),
                "ask_size": int(quote.ask_size),
                "bid_size": int(quote.bid_size),
                "timestamp": quote.timestamp.isoformat() if quote.timestamp else None,
            }
            
            logger.info(f"Retrieved quote for {symbol}: bid=${quote_data['bid_price']:.2f}, ask=${quote_data['ask_price']:.2f}")
            return quote_data
            
        except Exception as e:
            logger.error(f"Failed to get quote for {symbol}: {e}")
            raise
    
    async def get_orders(self, symbol: Optional[str] = None, status: str = "open", limit: int = 50) -> list[Dict[str, Any]]:
        """
        Get orders, optionally filtered by symbol and status.
        
        Args:
            symbol: Optional symbol to filter orders
            status: Order status - "open", "closed", or "all" (default: "open")
            limit: Maximum number of orders to return (default: 50)
            
        Returns:
            List of order dictionaries
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            
            # Map status string to enum
            status_map = {
                "open": QueryOrderStatus.OPEN,
                "closed": QueryOrderStatus.CLOSED,
                "all": QueryOrderStatus.ALL,
            }
            status_enum = status_map.get(status.lower(), QueryOrderStatus.OPEN)
            
            # Build request
            request = GetOrdersRequest(
                status=status_enum,
                symbols=[symbol] if symbol else None,
                limit=limit
            )
            
            orders = self.client.get_orders(filter=request)
            logger.debug(f"Retrieved {len(orders)} {status} orders{f' for {symbol}' if symbol else ''}")
            
            # Convert to dictionaries
            orders_data = []
            for order in orders:
                orders_data.append({
                    "id": str(order.id),
                    "symbol": order.symbol,
                    "side": order.side.value,
                    "qty": float(order.qty) if order.qty else None,
                    "filled_qty": float(order.filled_qty) if order.filled_qty else 0,
                    "filled_avg_price": float(order.filled_avg_price) if order.filled_avg_price else None,
                    "status": order.status.value,
                    "type": order.type.value,
                    "submitted_at": order.submitted_at.isoformat() if order.submitted_at else None,
                    "filled_at": order.filled_at.isoformat() if order.filled_at else None,
                })
            
            return orders_data
            
        except Exception as e:
            logger.error(f"Failed to get {status} orders{f' for {symbol}' if symbol else ''}: {e}")
            raise
    
    async def get_open_orders(self, symbol: Optional[str] = None) -> list:
        """
        Get all open orders, optionally filtered by symbol.
        
        Args:
            symbol: Optional symbol to filter orders
            
        Returns:
            List of open order objects from Alpaca
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            from alpaca.trading.requests import GetOrdersRequest
            from alpaca.trading.enums import QueryOrderStatus
            
            # Build request for open orders
            request = GetOrdersRequest(
                status=QueryOrderStatus.OPEN,
                symbols=[symbol] if symbol else None
            )
            
            orders = self.client.get_orders(filter=request)
            logger.debug(f"Retrieved {len(orders)} open orders{f' for {symbol}' if symbol else ''}")
            
            return orders
            
        except Exception as e:
            logger.error(f"Failed to get open orders{f' for {symbol}' if symbol else ''}: {e}")
            raise
    
    async def cancel_order(self, order_id: str) -> bool:
        """
        Cancel an open order.
        
        Args:
            order_id: Order ID to cancel
            
        Returns:
            True if successfully canceled
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            self.client.cancel_order_by_id(order_id)
            logger.info(f"✅ Successfully canceled order {order_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to cancel order {order_id}: {e}")
            raise
    
    async def get_account_activities(
        self,
        activity_types: str = "FILL",
        after: Optional[str] = None,
        limit: int = 100
    ) -> list[Dict[str, Any]]:
        """
        Get account activities (fills, transactions) from Alpaca.
        
        This is the SOURCE OF TRUTH for what actually happened.
        Use this to reconcile positions and catch missed fills.
        
        Args:
            activity_types: Type of activities to fetch (default: "FILL")
            after: ISO 8601 timestamp to fetch activities after
            limit: Maximum number of activities to return
        
        Returns:
            List of activity dictionaries with details of each fill
        """
        if not self.client:
            raise ValueError("Alpaca client not initialized. Check API credentials.")
        
        try:
            # Build query parameters
            params = {
                "activity_types": activity_types,
                "page_size": limit,
            }
            if after:
                params["after"] = after
            
            # Make direct REST API call since alpaca-py doesn't have get_activities
            # Using the underlying REST client
            # Note: client already adds /v2 prefix, so just use /account/activities
            response = self.client.get(f"/account/activities", params)
            
            # Response is already a list of dicts
            activities = response if isinstance(response, list) else []
            
            # Normalize the activity data
            activity_list = []
            for activity in activities:
                activity_dict = {
                    "id": activity.get("id"),
                    "activity_type": activity.get("activity_type"),
                    "transaction_time": activity.get("transaction_time"),
                    "type": activity.get("type"),
                    "price": float(activity.get("price")) if activity.get("price") else None,
                    "qty": float(activity.get("qty")) if activity.get("qty") else None,
                    "side": activity.get("side"),
                    "symbol": activity.get("symbol"),
                    "leaves_qty": float(activity.get("leaves_qty")) if activity.get("leaves_qty") else None,
                    "order_id": activity.get("order_id"),
                    "cum_qty": float(activity.get("cum_qty")) if activity.get("cum_qty") else None,
                    "order_status": activity.get("order_status"),
                }
                activity_list.append(activity_dict)
            
            logger.info(f"Retrieved {len(activity_list)} activities from Alpaca")
            return activity_list
            
        except Exception as e:
            logger.error(f"Failed to fetch account activities: {e}", exc_info=True)
            raise


# Global instance
alpaca_service = AlpacaService()

