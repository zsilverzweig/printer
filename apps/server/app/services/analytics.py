from __future__ import annotations

from typing import Optional, List, Dict, Any
import json
import urllib.request
import urllib.parse
import datetime

from fastapi.encoders import jsonable_encoder

import app.core as core


def _fetch_grouped(date_str: str, adjusted: bool = True) -> Dict[str, Any]:
    base = f"https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/{date_str}"
    params = {"adjusted": str(adjusted).lower()}
    if core.API_KEY:
        params["apiKey"] = core.API_KEY
    url = base + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read().decode("utf-8"))


def stock_history(
    date: Optional[str] = None,
    days: int = 7,
    limit: int = 20,
    adjusted: bool = True,
    min_price: float = 2.0,
    max_price: float = 20.0,
    order_by: str = "avg_volume",
) -> list:
    def format_date(d: datetime.date) -> str:
        return d.strftime("%Y-%m-%d")

    if date is None:
        end_dt = datetime.date.today() - datetime.timedelta(days=1)
    else:
        end_dt = datetime.datetime.strptime(date, "%Y-%m-%d").date()

    collected_dates: List[str] = []
    back = 0
    max_lookback = days * 4
    latest_rows_by_ticker: Dict[str, Dict[str, Any]] = {}
    latest_set = False
    allowed_tickers: Dict[str, bool] = {}
    while len(collected_dates) < days and back <= max_lookback:
        d = end_dt - datetime.timedelta(days=back)
        back += 1
        ds = format_date(d)
        data = _fetch_grouped(ds, adjusted=adjusted)
        rows = data.get("results") or []
        if rows:
            collected_dates.append(ds)
            if not latest_set:
                for row in rows:
                    tkr = row.get("T") or row.get("t") or row.get("ticker")
                    if tkr:
                        close_price = row.get("c")
                        try:
                            cp = float(close_price) if close_price is not None else None
                        except Exception:
                            cp = None
                        if cp is not None and (min_price <= cp <= max_price):
                            latest_rows_by_ticker[tkr] = row
                            allowed_tickers[tkr] = True
                latest_set = True

    if not collected_dates:
        return jsonable_encoder([])

    latest_date = collected_dates[0]
    prev_dates = collected_dates[1:]

    volumes_sum: Dict[str, float] = {}
    for ds in prev_dates:
        data = _fetch_grouped(ds, adjusted=adjusted)
        for row in data.get("results", []):
            ticker = row.get("T") or row.get("t") or row.get("ticker")
            vol = row.get("v")
            if ticker is None or vol is None or ticker not in allowed_tickers:
                continue
            volumes_sum[ticker] = volumes_sum.get(ticker, 0.0) + float(vol)

    denom = float(len(prev_dates))
    avg_vol_by_ticker: Dict[str, float] = {
        t: (volumes_sum.get(t, 0.0) / denom) if denom else 0.0 for t in allowed_tickers
    }

    rv_by_ticker: Dict[str, float] = {}
    for tkr, row in latest_rows_by_ticker.items():
        today_vol = row.get("v")
        avg_vol = avg_vol_by_ticker.get(tkr, 0.0)
        rv_by_ticker[tkr] = (float(today_vol) / avg_vol) if avg_vol else 0.0

    if order_by.lower() == "rv":
        ranked_tickers = sorted(rv_by_ticker.keys(), key=lambda t: rv_by_ticker[t], reverse=True)
    else:
        ranked_tickers = sorted(avg_vol_by_ticker.keys(), key=lambda t: avg_vol_by_ticker[t], reverse=True)

    result_rows: List[Dict[str, Any]] = []
    for tkr in ranked_tickers:
        row = latest_rows_by_ticker.get(tkr)
        if row is None:
            continue
        rv = rv_by_ticker.get(tkr, 0.0)
        enriched = dict(row)
        enriched["rv"] = rv
        result_rows.append(enriched)
        if len(result_rows) >= limit:
            break

    return jsonable_encoder(result_rows)


