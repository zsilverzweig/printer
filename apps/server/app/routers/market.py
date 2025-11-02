"""Market data API endpoints."""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.lib.dependencies import PolygonClient, PolygonClientNoPagination
from app.services.market import market as market_service
from app.services.ai import analytics as analytics_service
from app.services.market import historical_data_loader

router = APIRouter()


# Request/Response models for historical data endpoints
class HistoricalLoadRequest(BaseModel):
    days: int = 1
    symbols: Optional[List[str]] = None
    start_date: Optional[str] = None


class HistoricalLoadResponse(BaseModel):
    status_id: int
    message: str


class LoadStatusResponse(BaseModel):
    status_id: int
    status: str
    progress_pct: float
    tickers_processed: int
    tickers_succeeded: int
    tickers_failed: int
    started_at: Optional[str]
    completed_at: Optional[str]
    last_updated: Optional[str]
    error_message: Optional[str]


@router.get("/aggs/{ticker}")
async def get_aggregates(
    ticker: str,
    multiplier: int,
    timespan: str,
    from_: str = Query(alias="from"),
    to: str = Query(),
    limit: int = 50000,
    paginate: bool = True,
    client: PolygonClient = None,
):
    """Get aggregate bars for a ticker over a given time range."""
    return market_service.list_aggs(client, ticker, multiplier, timespan, from_, to, limit)


@router.get("/last-trade/{ticker}")
async def get_last_trade(
    ticker: str,
    client: PolygonClient = None,
):
    """Get the last trade for a ticker."""
    return market_service.get_last_trade(client, ticker)


@router.get("/last-quote/{ticker}")
async def get_last_quote(
    ticker: str,
    client: PolygonClient = None,
):
    """Get the last quote for a ticker."""
    return market_service.get_last_quote(client, ticker)


@router.get("/trades/{ticker}")
async def list_trades(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
    client: PolygonClient = None,
):
    """List trades for a ticker."""
    return market_service.list_trades(client, ticker, timestamp, limit)


@router.get("/quotes/{ticker}")
async def list_quotes(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
    client: PolygonClient = None,
):
    """List quotes for a ticker."""
    return market_service.list_quotes(client, ticker, timestamp, limit)


@router.get("/ticker-details/{ticker}")
async def get_ticker_details(
    ticker: str,
    client: PolygonClient = None,
):
    """
    Get detailed company information for a ticker.
    
    First tries to load from PostgreSQL database (instant).
    Falls back to Polygon API if not in database.
    """
    from app.services.core.database import get_async_session
    from app.models.assets import TickerDetails
    from sqlalchemy import select
    
    # Try database first
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(TickerDetails).where(TickerDetails.symbol == ticker.upper())
            )
            db_details = result.scalar_one_or_none()
            
            if db_details:
                # Return database data in Polygon-compatible format
                return {
                    "ticker": db_details.symbol,
                    "name": db_details.name,
                    "market": db_details.market,
                    "locale": db_details.locale,
                    "primary_exchange": db_details.primary_exchange,
                    "type": db_details.type,
                    "active": db_details.active,
                    "currency_name": db_details.currency_name,
                    "cik": db_details.cik,
                    "sic_code": db_details.sic_code,
                    "sic_description": db_details.sic_description,
                    "market_cap": db_details.market_cap,
                    "share_class_shares_outstanding": db_details.share_class_shares_outstanding,
                    "weighted_shares_outstanding": db_details.weighted_shares_outstanding,
                    "total_employees": db_details.total_employees,
                    "list_date": db_details.list_date.isoformat() if db_details.list_date else None,
                    "homepage_url": db_details.homepage_url,
                    "phone_number": db_details.phone_number,
                    "address": {
                        "address1": db_details.address_line1,
                        "city": db_details.address_city,
                        "state": db_details.address_state,
                        "postal_code": db_details.address_postal_code,
                    },
                    "description": db_details.description,
                    "branding": {
                        "logo_url": db_details.logo_url,
                        "icon_url": db_details.icon_url,
                    },
                    "source": "database"
                }
    except Exception as e:
        import logging
        logging.getLogger("app.market").warning(
            f"Failed to load ticker {ticker} from database: {e}"
        )
    
    # Fallback to Polygon API
    result = market_service.get_ticker_details(client, ticker)
    if isinstance(result, dict):
        result["source"] = "polygon_api"
    return result


@router.get("/financials/{ticker}")
async def get_ticker_financials(
    ticker: str,
    limit: int = 5,
    client: PolygonClient = None,
):
    """Get financial data for a ticker (quarterly/annual reports)."""
    return market_service.get_ticker_financials(client, ticker, limit)


@router.get("/stock-history")
async def stock_history(
    date: Optional[str] = None,
    days: int = 7,
    limit: int = 20,
    adjusted: bool = True,
    min_price: float = 2.0,
    max_price: float = 20.0,
    order_by: str = "avg_volume",
):
    """Get stock history with volume analysis and filtering."""
    return analytics_service.stock_history(
        date=date,
        days=days,
        limit=limit,
        adjusted=adjusted,
        min_price=min_price,
        max_price=max_price,
        order_by=order_by,
    )


# Historical data endpoints
@router.post("/historical/load", response_model=HistoricalLoadResponse)
async def start_historical_load(request: HistoricalLoadRequest):
    """
    Start loading historical market data from Polygon into TimescaleDB.
    
    Fetches 1-minute candlestick data for the specified symbols and date range.
    Returns a task ID that can be used to track progress.
    
    Args:
        request: Load configuration (days, symbols, start_date)
        
    Returns:
        HistoricalLoadResponse with status_id and message
        
    Raises:
        HTTPException: If a load task is already running
    """
    try:
        # Parse start_date if provided
        start_date = None
        if request.start_date:
            start_date = datetime.fromisoformat(request.start_date)
        
        result = await historical_data_loader.start_historical_load_task(
            days=request.days,
            symbols=request.symbols,
            start_date=start_date
        )
        
        return HistoricalLoadResponse(
            status_id=result["status_id"],
            message=result["message"]
        )
        
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start load: {str(e)}")


@router.post("/historical/cancel")
async def cancel_historical_load():
    """
    Cancel the currently running historical data load task.
    
    Returns:
        Dict with success status
    """
    cancelled = await historical_data_loader.cancel_historical_load_task()
    
    if not cancelled:
        raise HTTPException(status_code=404, detail="No running load task found")
    
    return {"message": "Load task cancelled successfully"}


@router.get("/historical/status/{status_id}", response_model=LoadStatusResponse)
async def get_historical_load_status(status_id: int):
    """
    Get the status of a historical data load task.
    
    Args:
        status_id: ID of the load task
        
    Returns:
        LoadStatusResponse with progress and statistics
        
    Raises:
        HTTPException: If status_id not found
    """
    status = await historical_data_loader.get_load_status(status_id)
    
    if not status:
        raise HTTPException(status_code=404, detail=f"Status ID {status_id} not found")
    
    return LoadStatusResponse(**status)


@router.get("/historical/stats")
async def get_database_stats():
    """
    Get statistics about the market data database.
    
    Returns:
        Dict with total bars, date range, storage size, etc.
    """
    return await historical_data_loader.get_database_stats()


@router.get("/bars/{symbol}")
async def get_historical_bars(
    symbol: str,
    from_time: str = Query(..., description="Start time (ISO format)"),
    to_time: str = Query(..., description="End time (ISO format)"),
    timeframe: str = Query("1m", description="Timeframe: 1m, 5m, 15m, 1h, 1d"),
    limit: int = Query(1000, description="Maximum number of bars to return")
):
    """
    Get historical bars from TimescaleDB.
    
    Supports multiple timeframes via continuous aggregates.
    
    Args:
        symbol: Ticker symbol
        from_time: Start time (ISO format)
        to_time: End time (ISO format)
        timeframe: 1m (minute), 5m, 15m, 1h, 1d (daily)
        limit: Maximum bars to return
        
    Returns:
        List of bars with OHLCV data
    """
    from app.services.core.database import get_async_session
    from sqlalchemy import text
    
    # Map timeframe to table/view
    timeframe_map = {
        "1m": "market_data_minute",
        "5m": "market_data_5m",
        "15m": "market_data_15m",
        "1h": "market_data_1h",
        "1d": "market_data_daily"
    }
    
    if timeframe not in timeframe_map:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe. Must be one of: {', '.join(timeframe_map.keys())}"
        )
    
    table = timeframe_map[timeframe]
    time_column = "time" if timeframe == "1m" else "bucket"
    
    try:
        from_dt = datetime.fromisoformat(from_time)
        to_dt = datetime.fromisoformat(to_time)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid datetime format. Use ISO format (e.g., 2024-01-01T00:00:00)"
        )
    
    async with get_async_session() as session:
        query = text(f"""
            SELECT 
                {time_column} as time,
                symbol,
                open,
                high,
                low,
                close,
                volume,
                vwap,
                trade_count
            FROM {table}
            WHERE symbol = :symbol
              AND {time_column} >= :from_time
              AND {time_column} <= :to_time
            ORDER BY {time_column} DESC
            LIMIT :limit
        """)
        
        result = await session.execute(
            query,
            {
                "symbol": symbol.upper(),
                "from_time": from_dt,
                "to_time": to_dt,
                "limit": limit
            }
        )
        
        bars = []
        for row in result:
            bars.append({
                "time": row[0].isoformat(),
                "symbol": row[1],
                "open": float(row[2]) if row[2] else None,
                "high": float(row[3]) if row[3] else None,
                "low": float(row[4]) if row[4] else None,
                "close": float(row[5]) if row[5] else None,
                "volume": int(row[6]) if row[6] else None,
                "vwap": float(row[7]) if row[7] else None,
                "trade_count": int(row[8]) if row[8] else None
            })
        
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe,
            "from": from_time,
            "to": to_time,
            "count": len(bars),
            "bars": bars
        }
