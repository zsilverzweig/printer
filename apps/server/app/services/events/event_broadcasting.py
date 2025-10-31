"""
Event Broadcasting Utilities

Standardized event creation and broadcasting for trading activities.
Ensures consistent event structure across all strategies and services.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def _get_utc_timestamp() -> str:
    """Get current UTC timestamp in ISO format."""
    return datetime.now(timezone.utc).isoformat()


async def _broadcast(event: dict) -> None:
    """
    Internal broadcast function.
    
    Args:
        event: Event dictionary to broadcast
    """
    try:
        from app.routers.realtime import broadcast_trading_activity
        await broadcast_trading_activity(event)
    except Exception as e:
        logger.warning(f"Failed to broadcast event: {e}")


def create_trading_event(
    fund_id: str,
    fund_name: str,
    event_type: str,
    message: str,
    **kwargs
) -> Dict[str, Any]:
    """
    Create standardized trading event structure.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        event_type: Type of event (e.g., "order_submitted", "position_opened")
        message: Human-readable message
        **kwargs: Additional event-specific fields
        
    Returns:
        Event dictionary ready for broadcasting
    """
    event = {
        "fund_id": str(fund_id),
        "fund_name": fund_name,
        "event_type": event_type,
        "message": message,
        "timestamp": _get_utc_timestamp(),
    }
    
    # Add any additional fields
    event.update(kwargs)
    
    return event


async def broadcast_order_submitted(
    fund_id: str,
    fund_name: str,
    symbol: str,
    side: str,
    quantity: float,
    price: float,
    order_id: str,
    alpaca_order_id: str,
    order_type: str = "market",
    reason: Optional[str] = None,
    **kwargs
) -> None:
    """
    Broadcast order submission event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        side: "buy" or "sell"
        quantity: Order quantity
        price: Order price
        order_id: Internal order ID
        alpaca_order_id: Broker order ID
        order_type: Order type (default: "market")
        reason: Reason for trade (optional)
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="order_submitted",
        message=f"Order submitted: {side} {quantity} {symbol} @ ${price:.2f} ({order_type})",
        symbol=symbol,
        side=side,
        quantity=quantity,
        price=price,
        order_id=order_id,
        alpaca_order_id=alpaca_order_id,
        order_type=order_type,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_order_filled(
    fund_id: str,
    fund_name: str,
    symbol: str,
    side: str,
    quantity: float,
    filled_price: float,
    order_id: str,
    **kwargs
) -> None:
    """
    Broadcast order fill event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        side: "buy" or "sell"
        quantity: Filled quantity
        filled_price: Average fill price
        order_id: Order ID
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="order_filled",
        message=f"Order filled: {side} {quantity} {symbol} @ ${filled_price:.2f}",
        symbol=symbol,
        side=side,
        quantity=quantity,
        filled_price=filled_price,
        order_id=order_id,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_order_canceled(
    fund_id: str,
    fund_name: str,
    symbol: str,
    order_id: str,
    reason: str,
    **kwargs
) -> None:
    """
    Broadcast order cancellation event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        order_id: Order ID
        reason: Cancellation reason
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="order_canceled",
        message=f"Order canceled: {symbol}",
        symbol=symbol,
        order_id=order_id,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_position_opened(
    fund_id: str,
    fund_name: str,
    symbol: str,
    quantity: float,
    entry_price: float,
    reason: Optional[str] = None,
    **kwargs
) -> None:
    """
    Broadcast position opened event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        quantity: Position size
        entry_price: Entry price
        reason: Entry reason (optional)
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="position_opened",
        message=f"Position opened: {quantity} {symbol} @ ${entry_price:.2f}",
        symbol=symbol,
        quantity=quantity,
        entry_price=entry_price,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_position_closed(
    fund_id: str,
    fund_name: str,
    symbol: str,
    quantity: float,
    exit_price: float,
    pnl: float,
    pnl_percent: float,
    reason: Optional[str] = None,
    **kwargs
) -> None:
    """
    Broadcast position closed event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        quantity: Position size
        exit_price: Exit price
        pnl: Realized P&L in dollars
        pnl_percent: Realized P&L in percent
        reason: Exit reason (optional)
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="position_closed",
        message=f"Position closed: {quantity} {symbol} @ ${exit_price:.2f} (P&L: ${pnl:+.2f}, {pnl_percent:+.2f}%)",
        symbol=symbol,
        quantity=quantity,
        exit_price=exit_price,
        pnl=pnl,
        pnl_percent=pnl_percent,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_scale_out(
    fund_id: str,
    fund_name: str,
    symbol: str,
    quantity: float,
    price: float,
    percent: float,
    reason: Optional[str] = None,
    **kwargs
) -> None:
    """
    Broadcast scale out event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        quantity: Quantity scaled out
        price: Exit price
        percent: Percent of position scaled out
        reason: Scale out reason (optional)
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="scale_out",
        message=f"Scaled out: {percent}% of {symbol} ({quantity} shares @ ${price:.2f})",
        symbol=symbol,
        quantity=quantity,
        price=price,
        percent=percent,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_error(
    fund_id: str,
    fund_name: str,
    symbol: str,
    error_type: str,
    message: str,
    **kwargs
) -> None:
    """
    Broadcast error event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        symbol: Stock symbol
        error_type: Type of error
        message: Error message
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="error",
        message=message,
        symbol=symbol,
        error_type=error_type,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_warning(
    fund_id: str,
    fund_name: str,
    warning_type: str,
    message: str,
    **kwargs
) -> None:
    """
    Broadcast warning event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        warning_type: Type of warning
        message: Warning message
        **kwargs: Additional fields
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="warning",
        message=message,
        warning_type=warning_type,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_diagnostic(
    fund_id: str,
    fund_name: str,
    message: str,
    **kwargs
) -> None:
    """
    Broadcast diagnostic event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        message: Diagnostic message
        **kwargs: Additional diagnostic data
    """
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="diagnostic",
        message=message,
        **kwargs
    )
    await _broadcast(event)


async def broadcast_balance_update(
    fund_id: str,
    fund_name: str,
    old_balance: float,
    new_balance: float,
    reason: str,
    **kwargs
) -> None:
    """
    Broadcast balance update event.
    
    Args:
        fund_id: Fund ID
        fund_name: Fund name
        old_balance: Previous balance
        new_balance: New balance
        reason: Reason for update
        **kwargs: Additional fields
    """
    change = new_balance - old_balance
    event = create_trading_event(
        fund_id=fund_id,
        fund_name=fund_name,
        event_type="balance_update",
        message=f"Balance updated: ${old_balance:.2f} → ${new_balance:.2f} ({reason})",
        old_balance=old_balance,
        new_balance=new_balance,
        change=change,
        reason=reason,
        **kwargs
    )
    await _broadcast(event)


