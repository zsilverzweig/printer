"""
Query strategy engine events for debugging position tracking issues.

Usage:
    python query_engine_events.py [fund_id] [--symbol SYMBOL] [--category CATEGORY]
"""
import asyncio
import sys
from sqlalchemy import select
from datetime import datetime
from app.services.core.database import get_async_session
from app.models.events import StrategyEngineEvent
import json


async def query_events(fund_id: str = None, symbol: str = None, category: str = None, limit: int = 50):
    """Query strategy engine events with optional filters."""
    async with get_async_session() as session:
        # Build query
        stmt = select(StrategyEngineEvent).order_by(StrategyEngineEvent.timestamp.desc())
        
        # Apply filters
        if fund_id:
            stmt = stmt.where(StrategyEngineEvent.fund_id == fund_id)
        if symbol:
            stmt = stmt.where(StrategyEngineEvent.symbol == symbol)
        if category:
            stmt = stmt.where(StrategyEngineEvent.event_category == category)
        
        stmt = stmt.limit(limit)
        
        result = await session.execute(stmt)
        events = result.scalars().all()
        
        if not events:
            print("No events found matching criteria.")
            return
        
        print(f"\n{'='*100}")
        print(f"Strategy Engine Events ({len(events)} results)")
        print(f"{'='*100}\n")
        
        for event in events:
            severity_icon = {
                'info': 'ℹ️ ',
                'warning': '⚠️ ',
                'error': '🚨'
            }.get(event.severity, '')
            
            print(f"{severity_icon} [{event.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {event.event_category.upper()}")
            print(f"   Fund: {event.fund_id[:8]}... | Symbol: {event.symbol or 'N/A'}")
            print(f"   {event.message}")
            
            if event.event_data:
                try:
                    data = json.loads(event.event_data)
                    print(f"   Data:")
                    for key, value in data.items():
                        print(f"      - {key}: {value}")
                except:
                    print(f"   Raw Data: {event.event_data[:100]}...")
            
            print()
        
        print(f"{'='*100}\n")


if __name__ == "__main__":
    fund_id = sys.argv[1] if len(sys.argv) > 1 else None
    
    # Parse optional arguments
    symbol = None
    category = None
    
    for i, arg in enumerate(sys.argv):
        if arg == "--symbol" and i + 1 < len(sys.argv):
            symbol = sys.argv[i + 1]
        elif arg == "--category" and i + 1 < len(sys.argv):
            category = sys.argv[i + 1]
    
    asyncio.run(query_events(fund_id, symbol, category))

