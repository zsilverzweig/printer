"""Events API endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, desc

from app.services.core.database import get_async_session
from app.models.events import AITradeEvent, AlpacaTradeEvent, StrategyEngineEvent
import json

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


def serialize_strategy_engine_event(event: StrategyEngineEvent) -> dict:
    """Serialize strategy engine event to dictionary."""
    event_data = None
    if event.event_data:
        try:
            event_data = json.loads(event.event_data)
        except:
            event_data = event.event_data
    
    return {
        "id": event.id,
        "type": "strategy_engine",
        "timestamp": event.timestamp.isoformat(),
        "fund_id": event.fund_id,
        "event_category": event.event_category,
        "symbol": event.symbol,
        "severity": event.severity,
        "message": event.message,
        "event_data": event_data,
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


@router.get("/strategy-engine")
async def get_strategy_engine_events(
    fund_id: str,
    symbol: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 50
):
    """
    Get strategy engine events for a fund with optional filters.
    
    Args:
        fund_id: Fund UUID to filter events
        symbol: Optional stock symbol filter
        category: Optional event category filter (position_sync, fill_tracking, etc.)
        severity: Optional severity filter (info, warning, error)
        limit: Maximum number of events to return (default 50)
    
    Returns:
        List of strategy engine events with details
    """
    try:
        async with get_async_session() as session:
            # Build query
            stmt = select(StrategyEngineEvent).where(
                StrategyEngineEvent.fund_id == fund_id
            )
            
            # Apply optional filters
            if symbol:
                stmt = stmt.where(StrategyEngineEvent.symbol == symbol)
            if category:
                stmt = stmt.where(StrategyEngineEvent.event_category == category)
            if severity:
                stmt = stmt.where(StrategyEngineEvent.severity == severity)
            
            # Order by timestamp descending and limit
            stmt = stmt.order_by(desc(StrategyEngineEvent.timestamp)).limit(limit)
            
            result = await session.execute(stmt)
            events = result.scalars().all()
            
            events_list = [serialize_strategy_engine_event(event) for event in events]
            
            return {
                "events": events_list,
                "count": len(events_list),
                "filters": {
                    "fund_id": fund_id,
                    "symbol": symbol,
                    "category": category,
                    "severity": severity,
                }
            }
    
    except Exception as e:
        logger.error(f"Failed to fetch strategy engine events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch strategy engine events: {str(e)}")

