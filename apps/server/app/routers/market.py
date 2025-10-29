"""Market data API endpoints."""

from typing import Optional
from fastapi import APIRouter, Query

from app.lib.dependencies import PolygonClient, PolygonClientNoPagination
from app.services import market as market_service
from app.services import analytics as analytics_service

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
    from app.services.database import get_async_session
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
