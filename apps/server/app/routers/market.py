"""Market data API endpoints."""

from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.lib.dependencies import PolygonClient, PolygonClientNoPagination
from app.services.market import market as market_service
from app.services.ai import analytics as analytics_service
from app.services.core.startup_orchestrator import get_orchestrator
from app.services.market.background_metrics_loader import ProcessingStats
from app.services.market.metrics_calculator import METRIC_FIELDS


_METRIC_COLUMNS_SQL = ",\n                ".join(METRIC_FIELDS)

router = APIRouter()


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


@router.get("/historical/debug/symbols")
async def debug_symbols_list(
    limit: int = Query(50, description="Number of symbols to return")
):
    """
    Debug endpoint: Get a list of symbols with their bar counts.
    
    Useful for verifying what data actually exists in the database.
    """
    from app.lib.dependencies import get_async_session
    from sqlalchemy import text
    
    async with get_async_session() as session:
        result = await session.execute(
            text("""
                SELECT 
                    symbol,
                    COUNT(*) as bar_count,
                    MIN(time) as first_bar,
                    MAX(time) as last_bar,
                    COUNT(DISTINCT DATE(time)) as unique_days
                FROM market_data
                WHERE timescale = '1min'
                GROUP BY symbol
                ORDER BY bar_count DESC
                LIMIT :limit
            """),
            {"limit": limit}
        )
        
        symbols = []
        for row in result:
            symbols.append({
                "symbol": row[0],
                "bar_count": row[1],
                "first_bar": row[2].isoformat() if row[2] else None,
                "last_bar": row[3].isoformat() if row[3] else None,
                "unique_days": row[4]
            })
        
        return {
            "symbols": symbols,
            "count": len(symbols)
        }


@router.get("/completeness/{symbol}")
async def get_symbol_completeness(
    symbol: str,
    days: int = Query(30, description="Number of days to check")
):
    """
    Check data completeness for a specific symbol.
    
    Returns validation status for the symbol over the specified date range.
    """
    from app.services.core.database import get_async_session
    from sqlalchemy import text
    from datetime import date, timedelta
    
    cutoff_date = date.today() - timedelta(days=days)
    
    async with get_async_session() as session:
        result = await session.execute(
            text("""
                SELECT 
                    date,
                    bar_count,
                    validated_at
                FROM symbol_date_validation
                WHERE symbol = :symbol
                  AND date >= :cutoff_date
                ORDER BY date DESC
            """),
            {"symbol": symbol.upper(), "cutoff_date": cutoff_date}
        )
        
        records = []
        for row in result:
            records.append({
                "date": row[0].isoformat(),
                "bar_count": row[2],
                "validated_at": row[3].isoformat() if row[3] else None
            })

        attempted_days = len(records)

        return {
            "symbol": symbol.upper(),
            "days_checked": days,
            "total_records": attempted_days,
            "records": records
        }


@router.get("/validation/progress")
async def get_validation_progress():
    """
    Get validation-based progress for market data loading.
    
    Returns metrics based on symbol_date_validation table.
    """
    from sqlalchemy import text
    from app.services.core.database import get_async_session
    
    async with get_async_session() as session:
        # Get total target symbols (stocks + ETFs)
        target_result = await session.execute(
            text("""
                SELECT COUNT(*) as total
                FROM ticker_details 
                WHERE type IN ('CS', 'ETF') AND active = true
            """)
        )
        total_target_symbols = target_result.scalar() or 0
        
        # Get symbols with at least one validation
        symbols_result = await session.execute(
            text("""
                SELECT COUNT(DISTINCT symbol) as count
                FROM symbol_date_validation
            """)
        )
        symbols_with_data = symbols_result.scalar() or 0
        
        # Get total validation records
        total_validations_result = await session.execute(
            text("SELECT COUNT(*) FROM symbol_date_validation")
        )
        total_validations = total_validations_result.scalar() or 0
        
        # Get date range
        date_range_result = await session.execute(
            text("""
                SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT date) as unique_days
                FROM symbol_date_validation
            """)
        )
        date_range = date_range_result.first()
        
        # Get symbols with enough data for rv14 (at least 14 trading days)
        ready_for_screening_result = await session.execute(
            text("""
                SELECT COUNT(*) as count
                FROM (
                    SELECT symbol, COUNT(DISTINCT date) as days
                    FROM symbol_date_validation
                    GROUP BY symbol
                    HAVING COUNT(DISTINCT date) >= 14
                ) as symbol_coverage
            """)
        )
        ready_for_screening = ready_for_screening_result.scalar() or 0
        
        # Get recent validation activity
        recent_result = await session.execute(
            text("""
                SELECT COUNT(*) as count
                FROM symbol_date_validation
                WHERE validated_at >= NOW() - INTERVAL '1 hour'
            """)
        )
        recent_validations = recent_result.scalar() or 0
        
        return {
            "target_symbols": total_target_symbols,
            "symbols_with_data": symbols_with_data,
            "symbols_ready_for_screening": ready_for_screening,
            "total_validations": total_validations,
            "coverage_percentage": round((symbols_with_data / total_target_symbols * 100) if total_target_symbols > 0 else 0, 1),
            "screening_ready_percentage": round((ready_for_screening / total_target_symbols * 100) if total_target_symbols > 0 else 0, 1),
            "date_range": {
                "min_date": date_range[0].isoformat() if date_range and date_range[0] else None,
                "max_date": date_range[1].isoformat() if date_range and date_range[1] else None,
                "unique_days": date_range[2] if date_range else 0
            },
            "recent_activity": {
                "last_hour_validations": recent_validations
            }
        }


@router.get("/ingestion/status")
async def get_ingestion_status():
    """Get real-time ingestion service status and metrics."""
    from app.services.market.realtime_ingestion import get_ingestion_service
    
    ingestion_service = get_ingestion_service()
    if not ingestion_service:
        return {
            "initialized": False,
            "is_running": False
        }
    
    metrics = ingestion_service.get_metrics()
    return {
        "initialized": True,
        **metrics
    }


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
    
    # Map timeframe to timescale value
    timeframe_map = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "1h": "1hour",
        "1d": "1day"
    }
    
    if timeframe not in timeframe_map:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timeframe. Must be one of: {', '.join(timeframe_map.keys())}"
        )
    
    timescale = timeframe_map[timeframe]
    
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
                time,
                symbol,
                open,
                high,
                low,
                close,
                volume,
                vwap,
                trade_count,
                {_METRIC_COLUMNS_SQL}
            FROM market_data
            WHERE symbol = :symbol
              AND timescale = :timescale
              AND time >= :from_time
              AND time <= :to_time
            ORDER BY time DESC
            LIMIT :limit
        """)
        
        result = await session.execute(
            query,
            {
                "symbol": symbol.upper(),
                "timescale": timescale,
                "from_time": from_dt,
                "to_time": to_dt,
                "limit": limit
            }
        )
        
        bars = []
        for row in result:
            mapping = row._mapping
            metrics = {}
            for field in METRIC_FIELDS:
                value = mapping[field]
                metrics[field] = float(value) if value is not None else None

            time_value = mapping["time"]
            if isinstance(time_value, str):
                time_str = time_value
            elif time_value is not None:
                time_str = time_value.isoformat()
            else:
                time_str = None

            bars.append({
                "time": time_str,
                "symbol": mapping["symbol"],
                "open": float(mapping["open"]) if mapping["open"] is not None else None,
                "high": float(mapping["high"]) if mapping["high"] is not None else None,
                "low": float(mapping["low"]) if mapping["low"] is not None else None,
                "close": float(mapping["close"]) if mapping["close"] is not None else None,
                "volume": int(mapping["volume"]) if mapping["volume"] is not None else None,
                "vwap": float(mapping["vwap"]) if mapping["vwap"] is not None else None,
                "trade_count": int(mapping["trade_count"]) if mapping["trade_count"] is not None else None,
                "metrics": metrics,
            })
        
        return {
            "symbol": symbol.upper(),
            "timeframe": timeframe,
            "from": from_time,
            "to": to_time,
            "count": len(bars),
            "bars": bars
        }


# Background Metrics Loader API
class BackgroundLoaderStatus(BaseModel):
    """Status response for background metrics loader."""
    available: bool
    batch_size: int


@router.get("/background-metrics-loader/status", response_model=BackgroundLoaderStatus)
async def get_background_loader_status():
    """Get the current status of the background metrics loader."""
    orchestrator = get_orchestrator()
    if not orchestrator or not orchestrator.background_metrics_loader:
        raise HTTPException(status_code=503, detail="Background metrics loader not available")

    loader = orchestrator.background_metrics_loader

    return BackgroundLoaderStatus(
        available=True,
        batch_size=loader.batch_size
    )


@router.post("/background-metrics-loader/trigger")
async def trigger_background_loader_cycle():
    """Manually trigger one cycle of the background metrics loader."""
    orchestrator = get_orchestrator()
    if not orchestrator or not orchestrator.background_metrics_loader:
        raise HTTPException(status_code=503, detail="Background metrics loader not available")

    loader = orchestrator.background_metrics_loader

    try:
        stats = await loader._process_cycle()
        # Store stats for status endpoint
        loader._last_cycle_stats = stats

        return {
            "success": True,
            "stats": {
                "symbols_scanned": stats.symbols_scanned,
                "bars_processed": stats.bars_processed,
                "metrics_calculated": stats.metrics_calculated,
                "database_updates": stats.database_updates,
                "errors": stats.errors,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger cycle: {str(e)}")


