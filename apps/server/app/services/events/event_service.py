"""
Event logging service for tracking application events.

Provides methods to log AI trading analysis and Alpaca trade execution events
to the PostgreSQL database.
"""

import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from app.services.core.time_context import get_current_time
from sqlalchemy import select

from app.models.events import AITradeEvent, AlpacaTradeEvent, StrategyEngineEvent
from app.services.core.database import get_async_session
import json

logger = logging.getLogger("app.event_service")


def _normalize_datetime(dt: datetime) -> datetime:
    """
    Normalize a datetime to timezone-naive UTC for database storage.
    
    PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns require naive datetimes.
    This function converts timezone-aware datetimes to naive UTC datetimes.
    
    Args:
        dt: Datetime (naive or timezone-aware)
        
    Returns:
        Timezone-naive UTC datetime
    """
    if dt.tzinfo is not None:
        # Convert timezone-aware datetime to UTC, then remove timezone info
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class EventService:
    """Service for logging events to the database."""
    
    async def log_ai_trade_event(
        self,
        ticker: str,
        action: str,
        confidence: float,
        reasoning: Optional[str] = None,
        chart_data_present: bool = False,
        news_data_present: bool = False,
        financial_data_present: bool = False,
        timestamp: Optional[datetime] = None,
    ) -> Optional[int]:
        """
        Log an AI trading analysis decision event.
        
        Args:
            ticker: Stock symbol analyzed
            action: AI recommendation (e.g., 'buy', 'hold', 'no_trade')
            confidence: Confidence score (0.0 to 1.0)
            reasoning: AI's textual explanation
            chart_data_present: Whether chart image was included
            news_data_present: Whether news summary was included
            financial_data_present: Whether financial data was included
            timestamp: Event timestamp (defaults to now)
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            if timestamp is None:
                timestamp = get_current_time()
            else:
                # Ensure timestamp is timezone-aware
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            event = AITradeEvent(
                timestamp=timestamp,
                ticker=ticker,
                action=action,
                confidence=confidence,
                reasoning=reasoning,
                chart_data_present=chart_data_present,
                news_data_present=news_data_present,
                financial_data_present=financial_data_present,
            )
            
            async with get_async_session() as session:
                session.add(event)
                await session.commit()
                await session.refresh(event)
                
                logger.info(
                    f"✅ Logged AI trade event: id={event.id}, "
                    f"ticker={ticker}, action={action}, confidence={confidence:.2f}"
                )
                
                return event.id
                
        except Exception as e:
            logger.error(
                f"❌ Failed to log AI trade event for {ticker}: {e}",
                exc_info=True
            )
            return None
    
    async def log_alpaca_trade_event(
        self,
        ticker: str,
        side: str,
        notional: float,
        order_id: Optional[str] = None,
        client_order_id: Optional[str] = None,
        filled_qty: Optional[float] = None,
        filled_avg_price: Optional[float] = None,
        status: Optional[str] = None,
        submitted_at: Optional[datetime] = None,
        filled_at: Optional[datetime] = None,
        error_message: Optional[str] = None,
        timestamp: Optional[datetime] = None,
    ) -> Optional[int]:
        """
        Log an Alpaca trade execution event.
        
        Args:
            ticker: Stock symbol traded
            side: 'buy' or 'sell'
            notional: Dollar amount of the order
            order_id: Alpaca order ID
            client_order_id: Alpaca client order ID
            filled_qty: Number of shares filled
            filled_avg_price: Average fill price per share
            status: Order status (e.g., 'new', 'filled', 'cancelled')
            submitted_at: When order was submitted to Alpaca
            filled_at: When order was filled
            error_message: Error message if order failed
            timestamp: Event timestamp (defaults to now)
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            if timestamp is None:
                timestamp = get_current_time()
            else:
                # Ensure timestamp is timezone-aware
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            # Ensure optional datetime fields are timezone-aware
            if submitted_at is not None:
                if submitted_at.tzinfo is None:
                    submitted_at = submitted_at.replace(tzinfo=timezone.utc)
            if filled_at is not None:
                if filled_at.tzinfo is None:
                    filled_at = filled_at.replace(tzinfo=timezone.utc)
            
            event = AlpacaTradeEvent(
                timestamp=timestamp,
                ticker=ticker,
                side=side,
                notional=notional,
                order_id=order_id,
                client_order_id=client_order_id,
                filled_qty=filled_qty,
                filled_avg_price=filled_avg_price,
                status=status,
                submitted_at=submitted_at,
                filled_at=filled_at,
                error_message=error_message,
            )
            
            async with get_async_session() as session:
                session.add(event)
                await session.commit()
                await session.refresh(event)
                
                logger.info(
                    f"✅ Logged Alpaca trade event: id={event.id}, "
                    f"ticker={ticker}, side={side}, notional=${notional:.2f}, "
                    f"status={status or 'N/A'}"
                )
                
                return event.id
                
        except Exception as e:
            logger.error(
                f"❌ Failed to log Alpaca trade event for {ticker}: {e}",
                exc_info=True
            )
            return None
    
    async def log_strategy_engine_event(
        self,
        fund_id: str,
        event_category: str,
        message: str,
        symbol: Optional[str] = None,
        event_data: Optional[Dict[str, Any]] = None,
        severity: str = "info",
        timestamp: Optional[datetime] = None,
    ) -> Optional[int]:
        """
        Log a strategy engine event with detailed context.
        
        Event Categories:
        - position_sync: Position tracking and Alpaca sync events
        - order_decision: Entry/exit signal decisions
        - fill_tracking: Order fill and partial fill tracking
        - validation: Risk checks and validations
        - error: Error conditions
        
        Args:
            fund_id: Fund UUID
            event_category: Event category (see list above)
            message: Human-readable description
            symbol: Stock symbol (optional)
            event_data: Additional structured data (will be JSON serialized)
            severity: 'info', 'warning', or 'error'
            timestamp: Event timestamp (defaults to now)
            
        Returns:
            Event ID if successful, None if failed
        """
        try:
            if timestamp is None:
                timestamp = get_current_time()
            else:
                # Ensure timestamp is timezone-aware
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)
            
            # Serialize event_data to JSON if provided
            event_data_json = json.dumps(event_data) if event_data else None
            
            event = StrategyEngineEvent(
                timestamp=timestamp,
                fund_id=fund_id,
                event_category=event_category,
                symbol=symbol,
                event_data=event_data_json,
                severity=severity,
                message=message,
            )
            
            async with get_async_session() as session:
                session.add(event)
                await session.commit()
                await session.refresh(event)
                
                logger.debug(
                    f"✅ Logged strategy engine event: id={event.id}, "
                    f"fund_id={fund_id[:8]}..., category={event_category}, "
                    f"symbol={symbol or 'N/A'}, severity={severity}"
                )
                
                return event.id
                
        except Exception as e:
            logger.error(
                f"❌ Failed to log strategy engine event for fund {fund_id}: {e}",
                exc_info=True
            )
            return None


# Global instance
event_service = EventService()

