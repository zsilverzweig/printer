"""
Test Builders - Factory functions for creating test objects.

Provides convenient builder functions for creating test instances of:
- Funds with configurable parameters
- Orders in various states
- Transactions
- Position contexts
- Market data

These builders make it easy to set up test scenarios without repetitive boilerplate.
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from app.models.strategies import Fund, Order, Transaction
from app.strategies.base import PositionContext, MarketDataSnapshot


def build_fund(
    fund_id: Optional[str] = None,
    name: str = "Test Fund",
    description: Optional[str] = None,
    mode: str = "sim",
    balance: float = 10000.0,
    status: str = "active",
    strategy_id: str = "monkey_darts",
    strategy_config: Optional[Dict[str, Any]] = None,
    # UI customization
    icon: Optional[str] = None,
    icon_color: Optional[str] = None,
    # Position sizing
    size_per_trade: float = 1000.0,
    min_bet_percent: Optional[float] = None,
    max_bet_percent: Optional[float] = None,
    max_total_exposure: Optional[float] = None,
    # Risk parameters
    max_loss_percent: Optional[float] = None,
    max_loss_dollars: Optional[float] = None,
    max_giveback_percent: Optional[float] = None,
    max_order_age_seconds: Optional[int] = 60,
    # Trading time windows
    trading_start_time: Optional[str] = None,
    trading_end_time: Optional[str] = None,
    timezone: Optional[str] = None,
    # Other
    screening_criteria_id: Optional[str] = None,
    archived: bool = False,
) -> Fund:
    """
    Build a Fund instance with configurable parameters.

    Args:
        fund_id: Fund ID (generates UUID if not provided)
        name: Fund name
        mode: Trading mode ('sim' or 'real')
        balance: Fund balance in dollars
        status: Fund status ('active' or 'paused')
        strategy_id: Strategy identifier
        strategy_config: Strategy configuration dict
        size_per_trade: Default position size in dollars
        min_bet_percent: Minimum bet as percent of balance
        max_bet_percent: Maximum bet as percent of balance
        max_total_exposure: Maximum total portfolio exposure in dollars
        max_loss_percent: Daily loss limit as percent
        max_loss_dollars: Daily loss limit in dollars
        max_giveback_percent: Giveback limit as percent
        max_order_age_seconds: Order timeout in seconds
        trading_start_time: Start of trading window (e.g., "09:30")
        trading_end_time: End of trading window (e.g., "16:00")
        timezone: Timezone for trading windows (e.g., "America/New_York")
        screening_criteria_id: Optional screening criteria ID
        archived: Whether fund is archived

    Returns:
        Fund instance

    Example:
        >>> fund = build_fund(balance=5000.0, max_bet_percent=10.0)
        >>> assert fund.balance == 5000.0
        >>> assert fund.max_bet_percent == 10.0
    """
    return Fund(
        id=fund_id or str(uuid.uuid4()),
        name=name,
        description=description,
        mode=mode,
        balance=balance,
        status=status,
        strategy_id=strategy_id,
        strategy_config=strategy_config or {},
        icon=icon,
        icon_color=icon_color,
        size_per_trade=size_per_trade,
        min_bet_percent=min_bet_percent,
        max_bet_percent=max_bet_percent,
        max_total_exposure=max_total_exposure,
        max_loss_percent=max_loss_percent,
        max_loss_dollars=max_loss_dollars,
        max_giveback_percent=max_giveback_percent,
        max_order_age_seconds=max_order_age_seconds,
        trading_start_time=trading_start_time,
        trading_end_time=trading_end_time,
        timezone=timezone,
        screening_criteria_id=screening_criteria_id,
        archived=archived,
    )


def build_order(
    order_id: Optional[str] = None,
    alpaca_order_id: Optional[str] = None,
    fund_id: Optional[str] = None,
    symbol: str = "AAPL",
    side: str = "buy",
    quantity: float = 10.0,
    order_type: str = "market",
    status: str = "pending",
    submitted_at: Optional[datetime] = None,
    filled_at: Optional[datetime] = None,
    filled_qty: Optional[float] = None,
    filled_avg_price: Optional[float] = None,
    error_message: Optional[str] = None,
) -> Order:
    """
    Build an Order instance with configurable parameters.

    Args:
        order_id: Order ID (generates UUID if not provided)
        alpaca_order_id: Alpaca order ID (generates UUID if not provided)
        fund_id: Fund ID (generates UUID if not provided)
        symbol: Stock symbol
        side: Order side ('buy' or 'sell')
        quantity: Number of shares
        order_type: Order type ('market', 'limit', 'stop')
        status: Order status ('pending', 'filled', 'cancelled', 'failed')
        submitted_at: Submission timestamp (defaults to now)
        filled_at: Fill timestamp (None for pending orders)
        filled_qty: Filled quantity (None for pending orders)
        filled_avg_price: Average fill price (None for pending orders)
        error_message: Error message if failed

    Returns:
        Order instance

    Example:
        >>> order = build_order(symbol="TSLA", quantity=5, status="filled")
        >>> assert order.symbol == "TSLA"
        >>> assert order.status == "filled"
    """
    return Order(
        id=order_id or str(uuid.uuid4()),
        alpaca_order_id=alpaca_order_id or str(uuid.uuid4()),
        fund_id=fund_id or str(uuid.uuid4()),
        symbol=symbol,
        side=side,
        quantity=quantity,
        order_type=order_type,
        status=status,
        submitted_at=submitted_at or datetime.utcnow(),
        filled_at=filled_at,
        filled_qty=filled_qty,
        filled_avg_price=filled_avg_price,
        error_message=error_message,
    )


def build_transaction(
    transaction_id: Optional[str] = None,
    order_id: Optional[str] = None,
    alpaca_order_id: Optional[str] = None,
    fund_id: Optional[str] = None,
    symbol: str = "AAPL",
    side: str = "buy",
    quantity: float = 10.0,
    price: float = 150.0,
    timestamp: Optional[datetime] = None,
    high_water_mark: Optional[float] = None,
    strategy_state: Optional[Dict[str, Any]] = None,
) -> Transaction:
    """
    Build a Transaction instance with configurable parameters.

    Args:
        transaction_id: Transaction ID (generates UUID if not provided)
        order_id: Order ID (generates UUID if not provided)
        alpaca_order_id: Alpaca order ID (generates UUID if not provided)
        fund_id: Fund ID (generates UUID if not provided)
        symbol: Stock symbol
        side: Transaction side ('buy' or 'sell')
        quantity: Number of shares
        price: Price per share
        timestamp: Transaction timestamp (defaults to now)
        high_water_mark: High water mark for position
        strategy_state: Strategy-specific state dict

    Returns:
        Transaction instance

    Example:
        >>> txn = build_transaction(symbol="GOOGL", quantity=3, price=2800.0)
        >>> assert txn.total_value == 8400.0
    """
    total_value = quantity * price

    return Transaction(
        id=transaction_id or str(uuid.uuid4()),
        order_id=order_id or str(uuid.uuid4()),
        alpaca_order_id=alpaca_order_id or str(uuid.uuid4()),
        fund_id=fund_id or str(uuid.uuid4()),
        symbol=symbol,
        side=side,
        quantity=quantity,
        price=price,
        total_value=total_value,
        timestamp=timestamp or datetime.utcnow(),
        high_water_mark=high_water_mark or price,
        strategy_state=strategy_state or {},
    )


def build_position_context(
    position_id: Optional[str] = None,
    symbol: str = "AAPL",
    entry_price: float = 150.0,
    entry_time: Optional[datetime] = None,
    quantity: float = 10.0,
    current_price: float = 155.0,
    high_water_mark: Optional[float] = None,
    strategy_state: Optional[Dict[str, Any]] = None,
    has_scaled_out: bool = False,
    has_taken_profits: bool = False,
    scale_in_count: int = 0,
) -> PositionContext:
    """
    Build a PositionContext instance with configurable parameters.

    Args:
        position_id: Position ID (generates UUID if not provided)
        symbol: Stock symbol
        entry_price: Entry price per share
        entry_time: Entry timestamp (defaults to 10 minutes ago)
        quantity: Number of shares
        current_price: Current price per share
        high_water_mark: Highest price seen (defaults to max of entry/current)
        strategy_state: Strategy-specific state dict
        has_scaled_out: Whether position has been scaled out
        has_taken_profits: Whether profits have been taken
        scale_in_count: Number of scale-in operations

    Returns:
        PositionContext instance

    Example:
        >>> pos = build_position_context(symbol="NVDA", entry_price=500.0, current_price=520.0)
        >>> assert pos.unrealized_pnl == 200.0  # (520 - 500) * 10
    """
    if entry_time is None:
        entry_time = datetime.utcnow() - timedelta(minutes=10)

    if high_water_mark is None:
        high_water_mark = max(entry_price, current_price)

    # Calculate P&L
    unrealized_pnl = (current_price - entry_price) * quantity
    unrealized_pnl_percent = (
        ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0.0
    )

    return PositionContext(
        position_id=position_id or str(uuid.uuid4()),
        symbol=symbol,
        entry_price=entry_price,
        entry_time=entry_time,
        quantity=quantity,
        current_price=current_price,
        unrealized_pnl=unrealized_pnl,
        unrealized_pnl_percent=unrealized_pnl_percent,
        high_water_mark=high_water_mark,
        strategy_state=strategy_state or {},
        has_scaled_out=has_scaled_out,
        has_taken_profits=has_taken_profits,
        scale_in_count=scale_in_count,
    )


def build_market_data(
    symbol: str = "AAPL",
    price: float = 150.0,
    timestamp: Optional[datetime] = None,
    volume: Optional[int] = 1000000,
    bid: Optional[float] = None,
    ask: Optional[float] = None,
    high: Optional[float] = None,
    low: Optional[float] = None,
    open_price: Optional[float] = None,
    bars: Optional[list] = None,
    indicators: Optional[Dict[str, Any]] = None,
    news: Optional[Dict[str, Any]] = None,
    float_data: Optional[Dict[str, Any]] = None,
) -> MarketDataSnapshot:
    """
    Build a MarketData instance with configurable parameters.

    Args:
        symbol: Stock symbol
        price: Current price
        timestamp: Data timestamp (defaults to now)
        volume: Trading volume
        bid: Bid price (defaults to price - 0.01)
        ask: Ask price (defaults to price + 0.01)
        high: High of day (defaults to price * 1.02)
        low: Low of day (defaults to price * 0.98)
        open_price: Open price (defaults to price * 0.99)
        bars: Historical bars list
        indicators: Technical indicators dict
        news: News sentiment dict
        float_data: Float/shares data dict

    Returns:
        MarketData instance

    Example:
        >>> data = build_market_data(symbol="TSLA", price=250.0)
        >>> assert data.symbol == "TSLA"
        >>> assert data.price == 250.0
    """
    if timestamp is None:
        timestamp = datetime.utcnow()

    if bid is None:
        bid = price - 0.01

    if ask is None:
        ask = price + 0.01

    if high is None:
        high = price * 1.02

    if low is None:
        low = price * 0.98

    if open_price is None:
        open_price = price * 0.99

    return MarketDataSnapshot(
        symbol=symbol,
        price=price,
        timestamp=timestamp,
        volume=volume,
        bid=bid,
        ask=ask,
        high=high,
        low=low,
        open=open_price,
        bars=bars,
        indicators=indicators,
    )


def build_stale_order(fund_id: str, age_seconds: int = 120, **kwargs) -> Order:
    """
    Build an order that's older than a certain age (for testing stale order cancellation).

    Args:
        fund_id: Fund ID
        age_seconds: How old the order should be in seconds
        **kwargs: Additional order parameters

    Returns:
        Order instance with old submitted_at timestamp

    Example:
        >>> order = build_stale_order(fund_id="test-fund", age_seconds=300)
        >>> assert (datetime.utcnow() - order.submitted_at).total_seconds() >= 300
    """
    submitted_at = datetime.utcnow() - timedelta(seconds=age_seconds)
    return build_order(fund_id=fund_id, submitted_at=submitted_at, **kwargs)
