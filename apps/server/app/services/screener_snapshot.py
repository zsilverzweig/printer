"""Snapshot fetching utilities for the screener service."""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
import urllib.error
from typing import Any, Dict, List


logger = logging.getLogger("app.screener.snapshot")


def fetch_snapshot_all(api_key: str) -> List[dict]:
    """Fetch full market snapshot using Polygon v2 endpoint.

    Returns a list of dicts under the "tickers" field. Includes basic
    error handling and logs meaningful messages for 401 and network issues.
    """
    if not api_key:
        logger.error("POLYGON_API_KEY not set; cannot fetch snapshots.")
        return []
    
    base = "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers"
    query = urllib.parse.urlencode({"apiKey": api_key, "limit": 50000})
    url = base + "?" + query
    
    try:
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tickers = data.get("tickers") or []
            if not isinstance(tickers, list):
                logger.error("Unexpected snapshot payload shape; missing 'tickers' list")
                return []
            return tickers
    except urllib.error.HTTPError as e:
        if e.code == 401:
            logger.error("Polygon API 401 Unauthorized when fetching snapshots. Check POLYGON_API_KEY.")
        else:
            logger.error("HTTP error from Polygon snapshots: code=%s reason=%s", e.code, getattr(e, "reason", ""))
        raise
    except urllib.error.URLError as e:
        logger.error("Network error contacting Polygon snapshots: %s", getattr(e, "reason", e))
        raise
    except Exception as e:
        logger.error("Unexpected error fetching snapshots: %s", e, exc_info=True)
        raise


def extract_price_from_snapshot(snapshot: Any) -> tuple[str | None, float | None]:
    """Extract ticker and current price from a snapshot.
    
    Returns (ticker, price) tuple, where either can be None if not found.
    Handles both dict and object snapshot formats.
    """
    ticker = None
    price = None
    
    # Extract ticker and price from snapshot
    if isinstance(snapshot, dict):
        ticker = snapshot.get("ticker") or snapshot.get("T")
        last_trade = snapshot.get("lastTrade") or snapshot.get("last_trade") or {}
        price = (
            (last_trade.get("price") if isinstance(last_trade, dict) else None) or
            (last_trade.get("p") if isinstance(last_trade, dict) else None)
        )
    else:
        ticker = getattr(snapshot, "ticker", None) or getattr(snapshot, "T", None)
        last_trade = getattr(snapshot, "last_trade", None)
        price = getattr(last_trade, "price", None) if last_trade else None
    
    return ticker, price


def extract_snapshot_data(snapshot: Any) -> Dict[str, Any]:
    """Extract all relevant data from a snapshot for screener processing.
    
    Returns dict with ticker, price, volume, exchange, etc.
    """
    result = {
        "ticker": None,
        "price": None,
        "volume": None,
        "exchange": None,
    }
    
    if isinstance(snapshot, dict):
        result["ticker"] = snapshot.get("ticker") or snapshot.get("T")
        
        last_trade = snapshot.get("lastTrade") or snapshot.get("last_trade") or {}
        result["price"] = (
            (last_trade.get("price") if isinstance(last_trade, dict) else None) or
            (last_trade.get("p") if isinstance(last_trade, dict) else None)
        )
        
        day = snapshot.get("day") or {}
        result["volume"] = (
            (day.get("volume") if isinstance(day, dict) else None) or
            (day.get("v") if isinstance(day, dict) else None)
        )
        
        result["exchange"] = (
            snapshot.get("primary_exchange") or
            snapshot.get("exchange") or
            snapshot.get("primaryExchange")
        )
    else:
        result["ticker"] = getattr(snapshot, "ticker", None) or getattr(snapshot, "T", None)
        
        last_trade = getattr(snapshot, "last_trade", None)
        result["price"] = getattr(last_trade, "price", None) if last_trade else None
        
        day = getattr(snapshot, "day", None)
        result["volume"] = getattr(day, "volume", None) if day else None
        
        result["exchange"] = (
            getattr(snapshot, "primary_exchange", None) or
            getattr(snapshot, "exchange", None)
        )
    
    return result

