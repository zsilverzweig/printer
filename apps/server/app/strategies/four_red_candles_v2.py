"""
Four Red Candles Strategy V2

Enhancements over the original strategy:
- Uses the close of the 3rd red candle as breakout trigger
- Invalidates setup if a green candle appears before breakout without reclaiming the 3rd open
- Adds 2% partial take-profit with stop reset to breakeven
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.lib.technical_analysis import is_red_candle
from app.services.core.time_context import get_current_time

logger = logging.getLogger(__name__)


def _get_bar_timestamp(bar: Dict[str, Any]) -> Optional[datetime]:
    """Extract timestamp from bar dict."""
    ts = bar.get("timestamp")
    if ts:
        return datetime.fromtimestamp(ts / 1000.0) if isinstance(ts, (int, float)) else ts
    ts_alt = bar.get("t")
    if ts_alt:
        return datetime.fromtimestamp(ts_alt / 1000.0) if isinstance(ts_alt, (int, float)) else ts_alt
    return None


def _get_bar_value(bar: Dict[str, Any], key: str, alt_key: str) -> float:
    """Get value from bar using alternate key fallback."""
    value = bar.get(key)
    if value is None:
        value = bar.get(alt_key, 0.0)
    return float(value)


class FourRedCandlesV2Strategy(ExecutionStrategy):
    """Updated breakout strategy with stricter validation and partial take-profit."""

    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)

        self.stop_loss_percent = config.get("stop_loss_percent", 3.0)
        self.take_profit_percent = config.get("take_profit_percent", 2.0)
        self.partial_exit_percent = config.get("partial_exit_percent", 50.0)

        self._setup_candidates: Dict[str, Dict[str, Any]] = {}

    @property
    def id(self) -> str:
        return "four_red_candles_v2"

    @property
    def name(self) -> str:
        return "Four Red Candles V2"

    @property
    def description(self) -> str:
        return (
            "Targets the close of the 3rd consecutive red 1-minute candle for breakout entries. "
            "Invalidates on any green candle that fails to reclaim the 3rd open before breakout. "
            "Scales out 50% at +2% profit and resets the stop to breakeven."
        )

    @property
    def strategy_type(self) -> str:
        return "math-based"

    @property
    def expected_timeframe(self) -> str:
        return "1-5 minutes"

    @property
    def requires_setup(self) -> bool:
        return True

    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        qualifying_tickers: List[str] = []

        for ticker in tickers:
            snapshot = market_data.get(ticker)

            if not snapshot or not snapshot.bars or len(snapshot.bars) < 3:
                self._setup_candidates.pop(ticker, None)
                continue

            recent_bars = snapshot.bars[-3:]
            if not all(is_red_candle(bar) for bar in recent_bars):
                self._setup_candidates.pop(ticker, None)
                continue

            third_bar = recent_bars[-1]
            breakout_close = _get_bar_value(third_bar, "close", "c")
            third_open = _get_bar_value(third_bar, "open", "o")
            third_high = _get_bar_value(third_bar, "high", "h")

            if breakout_close <= 0 or third_open <= 0:
                logger.warning(f"[{ticker}] Invalid breakout/entry values: close={breakout_close}, open={third_open}")
                self._setup_candidates.pop(ticker, None)
                continue

            detection_ts = _get_bar_timestamp(third_bar)

            self._setup_candidates[ticker] = {
                "breakout_price": breakout_close,
                "third_open": third_open,
                "third_high": third_high,
                "third_close": breakout_close,
                "detection_timestamp": detection_ts.isoformat() if detection_ts else None,
                "red_closes": [
                    _get_bar_value(bar, "close", "c") for bar in recent_bars
                ],
                "setup_detected_at": get_current_time().isoformat(),
            }
            qualifying_tickers.append(ticker)

            logger.info(
                f"[{ticker}] V2 setup detected: 3 red candles. "
                f"Breakout close=${breakout_close:.4f}, 3rd open=${third_open:.4f}"
            )

        return qualifying_tickers

    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        setup_info = self._setup_candidates.get(ticker)
        if not setup_info:
            return None

        bars = market_data.bars or []
        if not bars:
            return None

        breakout_price = setup_info.get("breakout_price")
        third_open = setup_info.get("third_open")
        detection_iso = setup_info.get("detection_timestamp")
        detection_ts = datetime.fromisoformat(detection_iso) if detection_iso else None

        # Validate that no disqualifying green candles occurred after detection
        if detection_ts:
            disqualified = False
            for bar in bars:
                bar_ts = _get_bar_timestamp(bar)
                if not bar_ts or bar_ts <= detection_ts:
                    continue

                bar_open = _get_bar_value(bar, "open", "o")
                bar_close = _get_bar_value(bar, "close", "c")
                bar_high = _get_bar_value(bar, "high", "h")

                is_green = bar_close >= bar_open
                if is_green and bar_high <= third_open:
                    disqualified = True
                    break

            if disqualified:
                logger.info(
                    f"[{ticker}] V2 setup invalidated by green candle failing to break 3rd open "
                    f"(third_open=${third_open:.4f})"
                )
                self._setup_candidates.pop(ticker, None)
                return None

        if breakout_price is None or breakout_price <= 0:
            self._setup_candidates.pop(ticker, None)
            return None

        stop_loss = breakout_price * (1 - self.stop_loss_percent / 100)
        current_price = market_data.price

        self._setup_candidates.pop(ticker, None)

        return EntryLevel(
            entry_price=breakout_price,
            stop_loss=stop_loss,
            confidence=0.85,
            order_type="market",
            metadata={
                "strategy": "four_red_candles_v2",
                "breakout_price": breakout_price,
                "third_open": third_open,
                "take_profit_percent": self.take_profit_percent,
                "stop_loss_percent": self.stop_loss_percent,
                "red_candle_closes": setup_info.get("red_closes", []),
                "setup_detected_at": setup_info.get("setup_detected_at"),
                "current_price_snapshot": current_price,
            }
        )

    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        if position.strategy_state is None:
            position.strategy_state = {}

        base_stop = position.entry_price * (1 - self.stop_loss_percent / 100)
        current_stop = float(position.strategy_state.get("current_stop", base_stop))
        current_stop = max(current_stop, base_stop)

        take_profit_price = position.entry_price * (1 + self.take_profit_percent / 100)
        has_scaled_out = bool(position.strategy_state.get("has_scaled_out"))
        current_price = market_data.price if market_data and market_data.price else position.current_price

        # First manage stop update (pre-scale out)
        position.strategy_state["current_stop"] = current_stop

        if (
            not has_scaled_out
            and current_price is not None
            and current_price >= take_profit_price
        ):
            position.strategy_state["has_scaled_out"] = True
            position.strategy_state["current_stop"] = position.entry_price

            return StopUpdate(
                current_stop=position.entry_price,
                scale_out_percent=self.partial_exit_percent,
                exit_reason="take_profit_triggered",
                metadata={
                    "has_scaled_out": True,
                    "current_stop": position.entry_price,
                    "take_profit_price": take_profit_price,
                }
            )

        return StopUpdate(
            current_stop=current_stop,
            metadata={
                "has_scaled_out": has_scaled_out,
                "current_stop": current_stop,
            }
        )


