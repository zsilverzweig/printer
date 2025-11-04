from __future__ import annotations

from typing import Optional, List

from fastapi.encoders import jsonable_encoder
from polygon import RESTClient


def list_aggs(client: RESTClient, ticker: str, multiplier: int, timespan: str, from_: str, to: str, limit: int = 50000) -> list:
    try:
        items = [a for a in client.list_aggs(ticker=ticker, multiplier=multiplier, timespan=timespan, from_=from_, to=to, limit=limit)]
        return jsonable_encoder(items)
    except Exception as e:
        import logging
        logger = logging.getLogger("app.market")
        logger.error(f"Error fetching aggregates for {ticker}: {e}", exc_info=True)
        raise


def get_last_trade(client: RESTClient, ticker: str) -> dict:
    data = client.get_last_trade(ticker=ticker)
    return jsonable_encoder(data)


def get_last_quote(client: RESTClient, ticker: str) -> dict:
    data = client.get_last_quote(ticker=ticker)
    return jsonable_encoder(data)


def list_trades(client: RESTClient, ticker: str, timestamp: Optional[str] = None, limit: int = 100) -> list:
    items = [t for t in client.list_trades(ticker=ticker, timestamp=timestamp, limit=limit)]
    return jsonable_encoder(items)


def list_quotes(client: RESTClient, ticker: str, timestamp: Optional[str] = None, limit: int = 100) -> list:
    items = [q for q in client.list_quotes(ticker=ticker, timestamp=timestamp, limit=limit)]
    return jsonable_encoder(items)





def list_benzinga_news(
    ticker: Optional[str] = None,
    published: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 10,
    sort: Optional[str] = None,
    channels: Optional[str] = None,
    tags: Optional[str] = None,
    author: Optional[str] = None,
    stocks: Optional[str] = None,
) -> list:
    """Fetch news from Polygon's Benzinga endpoint and return a JSON-serializable list.

    Docs: GET https://api.polygon.io/benzinga/v2/news
    https://massive.com/docs/rest/partners/benzinga/news
    
    Args:
        ticker: Filter by ticker symbol
        published: Date filter (YYYY-MM-DD) or timestamp
        order: Sort order (deprecated, use sort instead)
        limit: Max number of results (default 10, max 50000)
        sort: Sort columns (e.g., "published.desc")
        channels: Filter for arrays that contain the value (e.g., "news", "Price Target")
        tags: Filter for arrays that contain the value
        author: Filter by author name
        stocks: Filter for arrays that contain the value (alias for tickers)
    """
    import logging
    import urllib.parse
    import urllib.request
    import json
    from app import core

    logger = logging.getLogger("app.market")

    base_url = "https://api.polygon.io/benzinga/v2/news"

    # Build query params
    params = {}
    if ticker:
        params["tickers"] = ticker
    if published:
        params["published"] = published
    if limit is not None:
        params["limit"] = str(limit)
    if sort:
        params["sort"] = sort
    if channels:
        params["channels"] = channels
    else:
        # Default to "news" channel if not specified
        params["channels"] = "news"
    if tags:
        params["tags"] = tags
    if author:
        params["author"] = author
    if stocks:
        params["stocks"] = stocks

    # API key
    api_key = getattr(core, "API_KEY", None)
    if not api_key:
        logger.error("POLYGON_API_KEY not initialized in app.core")
        return []
    params["apiKey"] = api_key

    url = f"{base_url}?{urllib.parse.urlencode(params)}"

    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            text = resp.read().decode("utf-8")
            data = json.loads(text)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        logger.error("[BenzingaNews] HTTPError status=%s body=%s", getattr(e, "code", "unknown"), body[:500])
        raise
    except urllib.error.URLError as e:
        logger.error("[BenzingaNews] URLError: %s", getattr(e, "reason", e))
        raise
    except Exception as e:
        logger.error("[BenzingaNews] Unexpected error: %s", e, exc_info=True)
        raise

    # Process response data
    results = []
    if isinstance(data, dict) and isinstance(data.get("results"), list):
        results = data["results"]
    elif isinstance(data, list):
        results = data

    # Normalize fields for downstream UI expectations
    normalized: List[dict] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        
        obj = dict(item)
        # Ensure published_utc exists for UI components expecting it
        if "published_utc" not in obj and "published" in obj:
            obj["published_utc"] = obj.get("published")
        # Ensure publisher shape when missing
        if "publisher" not in obj:
            source_name = obj.get("source") or "Benzinga"
            obj["publisher"] = {"name": source_name}
        normalized.append(obj)
    
    logger.info(f"[BenzingaNews] Returning {len(normalized)} news items")
    return jsonable_encoder(normalized)

def get_ticker_details(client: RESTClient, ticker: str) -> dict:
    """Get detailed information about a ticker including company info, market cap, etc."""
    data = client.get_ticker_details(ticker=ticker)
    return jsonable_encoder(data)


def get_ticker_financials(client: RESTClient, ticker: str, limit: int = 5) -> dict:
    """Get financial data for a ticker including quarterly/annual reports."""
    try:
        # Get financials using vX endpoint
        financials = client.vx.list_stock_financials(
            ticker=ticker,
            limit=limit
        )
        items = [f for f in financials]
        return {
            "ticker": ticker,
            "results": jsonable_encoder(items),
            "count": len(items)
        }
    except Exception as e:
        import logging
        logger = logging.getLogger("app.market")
        logger.error(f"Error fetching financials for {ticker}: {e}", exc_info=True)
        # Return empty results instead of raising
        return {
            "ticker": ticker,
            "results": [],
            "count": 0,
            "error": str(e)
        }


