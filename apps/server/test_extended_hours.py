"""
Test script to fetch and insert extended hours data from Polygon.
This will help us understand why after-hours data (7-8 PM ET) is not being stored.
"""
import asyncio
import os
from datetime import datetime, timezone
from polygon import RESTClient
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

# Import our models and database
import sys
sys.path.insert(0, '/app')

from app.models.market_data import MarketData
from app.services.core.database import get_async_session


async def test_fetch_and_insert():
    """Fetch MSFT data for Nov 3, 2025 and try to insert it."""
    
    # Use the initialized client from core module
    from app import core
    await core.startup_init()
    
    client = core.rest_client
    if not client:
        print("❌ Polygon client not initialized")
        return
    symbol = "MSFT"
    date_str = "2025-11-03"
    
    print(f"\n🔍 Fetching {symbol} minute bars for {date_str} from Polygon...")
    
    # Fetch data from Polygon
    aggs = list(client.list_aggs(
        ticker=symbol,
        multiplier=1,
        timespan='minute',
        from_=date_str,
        to=date_str,
        limit=50000
    ))
    
    print(f"✅ Polygon returned {len(aggs)} bars")
    
    if not aggs:
        print("❌ No data returned from Polygon")
        return
    
    # Show time range
    first_ts = datetime.fromtimestamp(aggs[0].timestamp / 1000, tz=timezone.utc)
    last_ts = datetime.fromtimestamp(aggs[-1].timestamp / 1000, tz=timezone.utc)
    print(f"📅 Time range: {first_ts.isoformat()} to {last_ts.isoformat()}")
    
    # Check what we have in DB before insertion
    async with get_async_session() as session:
        result = await session.execute(
            text("""
                SELECT COUNT(*) 
                FROM market_data 
                WHERE symbol = :symbol 
                  AND timescale = '1min'
                  AND time >= :start_time 
                  AND time < :end_time
            """),
            {
                "symbol": symbol,
                "start_time": first_ts.date(),
                "end_time": datetime.combine(first_ts.date(), datetime.max.time(), tzinfo=timezone.utc)
            }
        )
        existing_count = result.scalar()
        print(f"📊 Database currently has {existing_count} bars for {symbol} on {date_str}")
    
    # Convert to MarketData objects
    print(f"\n💾 Converting {len(aggs)} bars to MarketData objects...")
    bars = []
    for agg in aggs:
        timestamp = datetime.fromtimestamp(agg.timestamp / 1000, tz=timezone.utc)
        
        bar = MarketData(
            time=timestamp,
            symbol=symbol,
            timescale='1min',
            open=float(agg.open),
            high=float(agg.high),
            low=float(agg.low),
            close=float(agg.close),
            volume=int(agg.volume),
            vwap=float(agg.vwap) if hasattr(agg, 'vwap') and agg.vwap else None,
            trade_count=int(agg.transactions) if hasattr(agg, 'transactions') and agg.transactions else None,
            session_type='regular'  # We'll set all to 'regular' for now
        )
        bars.append(bar)
    
    print(f"✅ Created {len(bars)} MarketData objects")
    
    # Try to insert
    print(f"\n💾 Inserting bars into database...")
    try:
        async with get_async_session() as session:
            # Use PostgreSQL INSERT ... ON CONFLICT DO NOTHING
            values = [
                {
                    "time": bar.time,
                    "symbol": bar.symbol,
                    "timescale": bar.timescale,
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                    "vwap": bar.vwap,
                    "trade_count": bar.trade_count,
                    "session_type": bar.session_type
                }
                for bar in bars
            ]
            
            stmt = insert(MarketData).values(values)
            stmt = stmt.on_conflict_do_nothing(index_elements=["time", "symbol", "timescale"])
            
            result = await session.execute(stmt)
            await session.commit()
            
            print(f"✅ Insert completed successfully")
            
            # Check what we have now
            result = await session.execute(
                text("""
                    SELECT COUNT(*),
                           MIN(time AT TIME ZONE 'America/New_York') as first_bar_et,
                           MAX(time AT TIME ZONE 'America/New_York') as last_bar_et
                    FROM market_data 
                    WHERE symbol = :symbol 
                      AND timescale = '1min'
                      AND time::date = :date
                """),
                {"symbol": symbol, "date": date_str}
            )
            row = result.first()
            print(f"\n📊 After insertion:")
            print(f"   Total bars: {row[0]}")
            print(f"   First bar (ET): {row[1]}")
            print(f"   Last bar (ET): {row[2]}")
            
            # Check for 7-8 PM ET bars specifically
            result = await session.execute(
                text("""
                    SELECT COUNT(*) as count
                    FROM market_data 
                    WHERE symbol = :symbol 
                      AND timescale = '1min'
                      AND time::date = :date
                      AND EXTRACT(HOUR FROM time AT TIME ZONE 'America/New_York') >= 19
                """),
                {"symbol": symbol, "date": date_str}
            )
            after_7pm = result.scalar()
            print(f"   Bars after 7 PM ET: {after_7pm}")
            
    except Exception as e:
        print(f"❌ Error inserting data: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_fetch_and_insert())

