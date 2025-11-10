"""Lightweight data state for the screener."""
from __future__ import annotations

import logging
from app.services.screener.screener_price_history import PriceHistoryTracker


class ScreenerDataLoader:
    """
    Minimal data holder for screener computations.

    Historically this class managed cached OHLC data and background refresh loops.
    The simplified screener runs on-demand, so we only keep a price tracker stub for
    backwards compatibility (strategies still reference percentage change helpers).
    """

    def __init__(self) -> None:
        self.logger = logging.getLogger("app.screener.data")
        self.price_tracker = PriceHistoryTracker()
