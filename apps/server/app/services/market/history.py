from __future__ import annotations

from collections import defaultdict, deque
import datetime
import json
from typing import Any, Deque, Dict, Tuple
import urllib.parse
import urllib.request
import urllib.error
import logging
logger = logging.getLogger("app.history")


def fetch_grouped(date_str: str, api_key: str, adjusted: bool = True) -> dict:
    base = f"https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date_str}"
    url = base + "?" + urllib.parse.urlencode({"adjusted": str(adjusted).lower(), "apiKey": api_key})
    # logger.info("GET %s", url)
    try:
        with urllib.request.urlopen(url) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            logger.error("Polygon API 401 Unauthorized. Ensure POLYGON_API_KEY is set and valid.")
        else:
            logger.error("HTTP error from Polygon: code=%s reason=%s", e.code, getattr(e, "reason", ""))
        raise
    except urllib.error.URLError as e:
        logger.error("Network error contacting Polygon: %s", getattr(e, "reason", e))
        raise
    except Exception as e:
        logger.error("Unexpected error fetching grouped data: %s", e, exc_info=True)
        raise


def load_history(api_key: str, target_days: int = 60, min_required: int = 14, adjusted: bool = True) -> Tuple[Dict[str, Deque[float]], Dict[str, Dict[str, float]], str]:
    # logger.info(
    #     "Loading history target_days=%s min_required=%s adjusted=%s",
    #     target_days,
    #     min_required,
    #     adjusted,
    # )
    volumes: Dict[str, Deque[float]] = defaultdict(lambda: deque(maxlen=target_days))
    last_day_ohlc: Dict[str, Dict[str, float]] = {}
    collected = 0
    back = 1
    last_trading_date = None
    first_day_processed = False
    # Ensure at least min_required trading sessions
    while collected < target_days or collected < min_required:
        day = (datetime.date.today() - datetime.timedelta(days=back)).strftime("%Y-%m-%d")
        back += 1
        data = fetch_grouped(day, api_key, adjusted=adjusted)
        rows = data.get("results") or []
        if not rows:
            # logger.info("No grouped data for %s (holiday/weekend?)", day)
            continue
        last_trading_date = last_trading_date or day
        for r in rows:
            t = r.get("T")
            v = r.get("v")
            if t is None or v is None:
                continue
            volumes[t].append(float(v))
            # Store OHLC from the most recent trading day only
            if not first_day_processed:
                try:
                    last_day_ohlc[t] = {
                        "o": float(r.get("o", 0)),
                        "h": float(r.get("h", 0)),
                        "l": float(r.get("l", 0)),
                        "c": float(r.get("c", 0)),
                        "v": float(v),
                    }
                except (ValueError, TypeError):
                    pass
        first_day_processed = True
        collected += 1
        # logger.info("Collected grouped day %s (count=%s) total_days=%s", day, len(rows), collected)
        if collected >= target_days and collected >= min_required:
            break
    logger.info("History loaded: tickers=%s days=%s last_trading_date=%s ohlc_tickers=%s", len(volumes), collected, last_trading_date, len(last_day_ohlc))
    return volumes, last_day_ohlc, last_trading_date or ""


