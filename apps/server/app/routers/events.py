"""Events API endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc

from app.services.database import get_async_session
from app.models.events import AITradeEvent, AlpacaTradeEvent

logger = logging.getLogger("app.routers.events")

router = APIRouter()


def serialize_ai_trade_event(event: AITradeEvent) -> dict:
    """Serialize AI trade event to dictionary."""
    return {
        "id": event.id,
        "type": "ai_trade",
        "timestamp": event.timestamp.isoformat(),
        "ticker": event.ticker,
        "action": event.action,
        "confidence": event.confidence,
        "reasoning": event.reasoning,
        "chart_data_present": event.chart_data_present,
        "news_data_present": event.news_data_present,
        "financial_data_present": event.financial_data_present,
    }


def serialize_alpaca_trade_event(event: AlpacaTradeEvent) -> dict:
    """Serialize Alpaca trade event to dictionary."""
    return {
        "id": event.id,
        "type": "alpaca_trade",
        "timestamp": event.timestamp.isoformat(),
        "ticker": event.ticker,
        "order_id": event.order_id,
        "side": event.side,
        "notional": event.notional,
        "filled_qty": event.filled_qty,
        "filled_avg_price": event.filled_avg_price,
        "status": event.status,
        "submitted_at": event.submitted_at.isoformat() if event.submitted_at else None,
        "filled_at": event.filled_at.isoformat() if event.filled_at else None,
        "error_message": event.error_message,
    }


@router.get("")
async def get_events(limit: int = 50, event_type: Optional[str] = None):
    """
    Get recent events from the database.
    
    Args:
        limit: Maximum number of events to return (default 50)
        event_type: Filter by event type ('ai_trade' or 'alpaca_trade')
    
    Returns:
        List of events with details
    """
    try:
        async with get_async_session() as session:
            events_list = []
            
            if event_type == "ai_trade":
                # Get AI trade events
                stmt = select(AITradeEvent).order_by(desc(AITradeEvent.id)).limit(limit)
                result = await session.execute(stmt)
                ai_events = result.scalars().all()
                
                for event in ai_events:
                    events_list.append(serialize_ai_trade_event(event))
            
            elif event_type == "alpaca_trade":
                # Get Alpaca trade events
                stmt = select(AlpacaTradeEvent).order_by(desc(AlpacaTradeEvent.id)).limit(limit)
                result = await session.execute(stmt)
                alpaca_events = result.scalars().all()
                
                for event in alpaca_events:
                    events_list.append(serialize_alpaca_trade_event(event))
            
            else:
                # Get all events
                # First get AI trade events
                stmt_ai = select(AITradeEvent).order_by(desc(AITradeEvent.id)).limit(limit)
                result_ai = await session.execute(stmt_ai)
                ai_events = result_ai.scalars().all()
                
                for event in ai_events:
                    events_list.append(serialize_ai_trade_event(event))
                
                # Then get Alpaca trade events
                stmt_alpaca = select(AlpacaTradeEvent).order_by(desc(AlpacaTradeEvent.id)).limit(limit)
                result_alpaca = await session.execute(stmt_alpaca)
                alpaca_events = result_alpaca.scalars().all()
                
                for event in alpaca_events:
                    events_list.append(serialize_alpaca_trade_event(event))
                
                # Sort all events by timestamp descending
                events_list.sort(key=lambda x: x["timestamp"], reverse=True)
                # Limit to requested amount
                events_list = events_list[:limit]
            
            return {"events": events_list, "count": len(events_list)}
    
    except Exception as e:
        logger.error(f"Failed to fetch events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")
