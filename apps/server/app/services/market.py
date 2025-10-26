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


def list_news(client: RESTClient, ticker: Optional[str] = None, published_utc: Optional[str] = None, order: Optional[str] = None, limit: int = 10, sort: Optional[str] = None) -> list:
    import logging
    logger = logging.getLogger("app.market")
    
    logger.info(f"=== MARKET SERVICE NEWS REQUEST START ===")
    logger.info(f"Starting news request - ticker: {ticker}, limit: {limit}, published_utc: {published_utc}")
    logger.info(f"Client type: {type(client)}")
    logger.info(f"Client API key present: {hasattr(client, 'api_key')}")
    
    method = None
    method_name = None
    
    logger.info("Checking for news methods on client...")
    all_methods = [m for m in dir(client) if 'news' in m.lower()]
    logger.info(f"All methods with 'news' in name: {all_methods}")
    
    if hasattr(client, "list_ticker_news"):
        method = getattr(client, "list_ticker_news")
        method_name = "list_ticker_news"
        logger.info("✅ Using list_ticker_news method")
    elif hasattr(client, "list_news"):
        method = getattr(client, "list_news")
        method_name = "list_news"
        logger.info("✅ Using list_news method")
    elif hasattr(client, "list_reference_news"):
        method = getattr(client, "list_reference_news")
        method_name = "list_reference_news"
        logger.info("✅ Using list_reference_news method")
    
    if method is None:
        logger.error("❌ No news method found on client. Available methods: %s", all_methods)
        logger.error("Available client methods: %s", [m for m in dir(client) if not m.startswith('_')])
        return []
    
    params = {k: v for k, v in {
        "ticker": ticker,
        "published_utc": published_utc,
        "order": order,
        "limit": limit,
        "sort": sort,
    }.items() if v is not None}
    
    logger.info(f"Calling {method_name} with params: {params}")
    
    try:
        import time
        start_time = time.time()
        logger.info("Making API call to Polygon...")
        items = [n for n in method(**params)]
        end_time = time.time()
        
        logger.info(f"✅ News API call completed in {end_time - start_time:.2f} seconds")
        logger.info(f"Retrieved {len(items)} news items")
        
        if items:
            first_item = items[0]
            logger.info(f"First item type: {type(first_item)}")
            logger.info(f"First item attributes: {dir(first_item)}")
            if hasattr(first_item, 'title'):
                logger.info(f"First item title: {first_item.title[:100]}...")
            if hasattr(first_item, 'published_utc'):
                logger.info(f"First item published: {first_item.published_utc}")
            if hasattr(first_item, 'ticker'):
                logger.info(f"First item ticker: {first_item.ticker}")
        else:
            logger.warning("No news items returned from API")
        
        logger.info("Converting to JSON...")
        result = jsonable_encoder(items)
        logger.info(f"✅ Successfully encoded {len(result)} items to JSON")
        logger.info(f"=== MARKET SERVICE NEWS REQUEST COMPLETE ===")
        return result
        
    except Exception as e:
        logger.error(f"❌ Error in news API call: {e}", exc_info=True)
        logger.error(f"=== MARKET SERVICE NEWS REQUEST ERROR ===")
        return []


def list_benzinga_news(
    ticker: Optional[str] = None,
    published: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 10,
    sort: Optional[str] = None,
) -> list:
    """Fetch news from Polygon's Benzinga endpoint and return a JSON-serializable list.

    Docs: GET https://api.polygon.io/benzinga/v2/news

    Parameters supported here (subset):
      - ticker -> maps to 'tickers'
      - published (YYYY-MM-DD or range) -> maps to 'published'
      - limit
      - sort (e.g., 'published.desc')
    """
    import logging
    import urllib.parse
    import urllib.request
    import json
    from app import core

    logger = logging.getLogger("app.market")

    logger.info("[BenzingaNews] === STARTING BENZINGA NEWS REQUEST ===")
    logger.info("[BenzingaNews] Input params - ticker: %s, published: %s, limit: %s, sort: %s", ticker, published, limit, sort)

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
    # Add channels=news parameter to filter for news channel
    params["channels"] = "news"
    # order is not a documented param for this endpoint; ignore if provided

    # API key
    api_key = getattr(core, "API_KEY", None)
    if not api_key:
        logger.error("POLYGON_API_KEY not initialized in app.core")
        return []
    params["apiKey"] = api_key

    url = f"{base_url}?{urllib.parse.urlencode(params)}"
    
    # Log request with masked apiKey
    masked_url = url
    try:
        masked_url = url.replace(api_key, "***") if api_key else url
    except Exception:
        pass
    
    logger.info("[BenzingaNews] === MAKING API CALL ===")
    logger.info("[BenzingaNews] URL: %s", masked_url)
    logger.info("[BenzingaNews] Query params: tickers=%s, published=%s, limit=%s, sort=%s, channels=%s", 
                params.get("tickers"), params.get("published"), params.get("limit"), params.get("sort"), params.get("channels"))

    try:
        import time
        start = time.time()
        logger.info("[BenzingaNews] Opening URL connection...")
        with urllib.request.urlopen(url, timeout=15) as resp:
            status_code = getattr(resp, "status", None) or getattr(resp, "getcode", lambda: None)()
            content_type = resp.headers.get("Content-Type", "") if hasattr(resp, "headers") else ""
            text = resp.read().decode("utf-8")
            duration_ms = int((time.time() - start) * 1000)
            
            logger.info("[BenzingaNews] === RESPONSE RECEIVED ===")
            logger.info(
                "[BenzingaNews] Status: %s | Content-Type: %s | Bytes: %s | Duration: %sms",
                status_code,
                content_type,
                len(text),
                duration_ms,
            )
            logger.info("[BenzingaNews] Raw response preview: %s", (text[:500] + ("..." if len(text) > 500 else "")))
            
            data = json.loads(text)
            logger.info("[BenzingaNews] JSON parsed successfully, type: %s", type(data))
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        try:
            body = e.read().decode("utf-8")  # type: ignore[attr-defined]
        except Exception:
            body = ""
        logger.error(
            "[BenzingaNews] HTTPError status=%s body=%s",
            getattr(e, "code", "unknown"),
            body[:500],
        )
        # Re-raise so the router can surface a 5xx to the client
        raise
    except urllib.error.URLError as e:  # type: ignore[attr-defined]
        logger.error("[BenzingaNews] URLError: %s", getattr(e, "reason", e))
        raise
    except Exception as e:
        logger.error("[BenzingaNews] Unexpected error: %s", e, exc_info=True)
        raise

    # Response shape: { results: [...], status?: string, error/message?: string }
    logger.info("[BenzingaNews] === PROCESSING RESPONSE DATA ===")
    results = []
    api_status = None
    api_error = None
    if isinstance(data, dict):
        logger.info("[BenzingaNews] Response is a dict with keys: %s", list(data.keys()))
        if isinstance(data.get("results"), list):
            results = data["results"]
            logger.info("[BenzingaNews] Found 'results' array with %s items", len(results))
        else:
            logger.warning("[BenzingaNews] No 'results' key or not a list. Data keys: %s", list(data.keys()))
        api_status = data.get("status") if isinstance(data.get("status"), str) else None
        api_error = data.get("error") or data.get("message")
        if api_status:
            logger.info("[BenzingaNews] API status: %s", api_status)
        if api_error:
            logger.warning("[BenzingaNews] API error/message: %s", api_error)
    elif isinstance(data, list):
        results = data
        logger.info("[BenzingaNews] Response is a list with %s items", len(results))

    # Normalize a few fields for downstream UI expectations
    logger.info("[BenzingaNews] === NORMALIZING %s RESULTS ===", len(results))
    normalized: List[dict] = []
    for idx, item in enumerate(results):
        if not isinstance(item, dict):
            logger.warning("[BenzingaNews] Item %s is not a dict, skipping", idx)
            continue
        
        if idx == 0:
            logger.info("[BenzingaNews] First item keys: %s", list(item.keys()))
            logger.info("[BenzingaNews] First item sample data: title=%s, published=%s, source=%s", 
                       item.get("title", "N/A")[:80], 
                       item.get("published") or item.get("published_utc"), 
                       item.get("source") or item.get("publisher"))
        
        obj = dict(item)
        # Ensure published_utc exists for UI components expecting it
        if "published_utc" not in obj and "published" in obj:
            obj["published_utc"] = obj.get("published")
        # Ensure publisher shape when missing
        if "publisher" not in obj:
            source_name = obj.get("source") or "Benzinga"
            obj["publisher"] = {"name": source_name}
        normalized.append(obj)
    
    logger.info("[BenzingaNews] Normalized %s items", len(normalized))

    # Debug stats
    logger.info("[BenzingaNews] === FINAL RESULTS ===")
    try:
        sample_titles = [str(x.get("title", "")).strip()[:60] for x in normalized[:3] if isinstance(x, dict)]
        logger.info("[BenzingaNews] Total normalized items: %s", len(normalized))
        logger.info("[BenzingaNews] Sample titles: %s", sample_titles)
        if len(normalized) == 0:
            logger.warning("[BenzingaNews] EMPTY RESULTS - status=%s error=%s", api_status, api_error)
            logger.warning("[BenzingaNews] Original results count before normalization: %s", len(results))
    except Exception as e:
        logger.error("[BenzingaNews] Failed to log sample titles: %s", e)

    logger.info("[BenzingaNews] === BENZINGA NEWS REQUEST COMPLETE ===")
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


