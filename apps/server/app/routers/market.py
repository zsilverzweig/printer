"""Market data API endpoints."""

from typing import Optional
from fastapi import APIRouter, Query, Depends
from polygon import RESTClient

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
    client: RESTClient = Depends(PolygonClient),
):
    """Get aggregate bars for a ticker over a given time range."""
    return market_service.list_aggs(client, ticker, multiplier, timespan, from_, to, limit)


@router.get("/last-trade/{ticker}")
async def get_last_trade(
    ticker: str,
    client: RESTClient = Depends(PolygonClient),
):
    """Get the last trade for a ticker."""
    return market_service.get_last_trade(client, ticker)


@router.get("/last-quote/{ticker}")
async def get_last_quote(
    ticker: str,
    client: RESTClient = Depends(PolygonClient),
):
    """Get the last quote for a ticker."""
    return market_service.get_last_quote(client, ticker)


@router.get("/trades/{ticker}")
async def list_trades(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
    client: RESTClient = Depends(PolygonClient),
):
    """List trades for a ticker."""
    return market_service.list_trades(client, ticker, timestamp, limit)


@router.get("/quotes/{ticker}")
async def list_quotes(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
    client: RESTClient = Depends(PolygonClient),
):
    """List quotes for a ticker."""
    return market_service.list_quotes(client, ticker, timestamp, limit)


@router.get("/ticker-details/{ticker}")
async def get_ticker_details(
    ticker: str,
    client: RESTClient = Depends(PolygonClient),
):
    """Get detailed company information for a ticker."""
    return market_service.get_ticker_details(client, ticker)


@router.get("/financials/{ticker}")
async def get_ticker_financials(
    ticker: str,
    limit: int = 5,
    client: RESTClient = Depends(PolygonClient),
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
