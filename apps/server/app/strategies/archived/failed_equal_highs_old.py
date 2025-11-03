"""Failed Equal Highs Liquidity Sweep Strategy.

This execution strategy looks for failed breakouts above equal highs (double tops)
and enters a short position a few seconds before the 5-minute candle closes once
the breakout has already rejected.

Checklist implemented:

1. Identify equal highs (two swing highs within ±0.06%).
2. Restrict trading to 09:35–11:30 ET and 13:30–15:30 ET windows.
3. Require RVOL > 1.3 using 5-minute volume vs 20-day 5-minute average.
4. Enter as soon as (a) current 5m high sweeps above equal-high level and
   (b) the 4:50s proxy close (current price) is back below that level.
5. Place stop just above sweep high with configurable buffer.
6. Manage profits with 1R scale-out and runner toward equal lows or session open.
7. Time stop: exit if no +0.5R progress within 3 additional 5m bars.

Optional "displacement" filter is exposed via configuration but not required.
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple

from zoneinfo import ZoneInfo

from app.strategies.base import (
    EntrySignal,
    ExecutionStrategy,
    ExitSignal,
    MarketData,
    PositionContext,
    ScaleSignal,
)
from app.lib.technical_analysis import (
    SwingPoint,
    find_swing_points,
    find_equal_levels,
    median_true_range,
    calculate_relative_volume,
)
from app.services.core.timing import is_within_trading_window


logger = logging.getLogger(__name__)


# Strategy implementation -----------------------------------------------------------------------


class FailedEqualHighsBreakoutStrategy(ExecutionStrategy):
    """Failed equal highs liquidity sweep short strategy."""

    EASTERN_TZ = ZoneInfo("America/New_York")

    SESSION_WINDOWS: Sequence[Tuple[time, time]] = (
        (time(9, 35), time(11, 30)),
        (time(13, 30), time(15, 30)),
    )

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)

        self.rvol_threshold: float = config.get("rvol_threshold", 1.3)
        self.equal_high_tolerance: float = config.get("equal_high_tolerance", 0.0006)
        self.stop_buffer: float = config.get("stop_buffer", 0.0003)
        self.scale_percent: float = config.get("scale_percent", 60.0)
        self.runner_rr_default: float = config.get("runner_rr_default", 1.7)
        self.time_stop_bars: int = config.get("time_stop_bars", 3)
        self.progress_threshold_r: float = config.get("progress_threshold_r", 0.5)
        self.require_strong_candle: bool = config.get("require_strong_candle", False)
        self.displacement_range_multiplier: float = config.get("displacement_range_multiplier", 1.2)
        self.displacement_body_ratio: float = config.get("displacement_body_ratio", 0.7)
        self.seconds_to_close_window: int = config.get("seconds_to_close_window", 20)
        self.max_risk_dollars: float = config.get("max_risk_dollars", 250.0)

        # Cache pending entry state between entry signal emission and position creation
        self._pending_states: Dict[str, Dict[str, Any]] = {}

    # -------------------------------------------------------------------------------------
    # Strategy metadata

    @property
    def id(self) -> str:
        return "failed_equal_highs_breakout"

    @property
    def name(self) -> str:
        return "Failed Equal Highs Liquidity Sweep"

    @property
    def description(self) -> str:
        return (
            "Shorts failed 5-minute breakouts above equal highs by front-running the "
            "close once rejection is confirmed via a 4:50s read."
        )

    @property
    def strategy_type(self) -> str:
        return "math-based"

    @property
    def expected_timeframe(self) -> str:
        return "5 minute"

    @property
    def required_indicators(self) -> List[str]:
        # No external indicators required; strategy works off raw OHLCV data
        return []

    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "rvol_threshold": {
                    "type": "number",
                    "default": 1.3,
                    "minimum": 1.0,
                    "description": "Minimum 5m relative volume required to take a trade.",
                },
                "equal_high_tolerance": {
                    "type": "number",
                    "default": 0.0006,
                    "minimum": 0.0001,
                    "maximum": 0.0015,
                    "description": "Relative tolerance for equal highs/lows detection (± %).",
                },
                "stop_buffer": {
                    "type": "number",
                    "default": 0.0003,
                    "minimum": 0.0,
                    "maximum": 0.001,
                    "description": "Additional buffer above sweep high for initial stop.",
                },
                "scale_percent": {
                    "type": "number",
                    "default": 60.0,
                    "minimum": 10.0,
                    "maximum": 90.0,
                    "description": "Percent of position to scale at 1R.",
                },
                "runner_rr_default": {
                    "type": "number",
                    "default": 1.7,
                    "minimum": 1.0,
                    "maximum": 4.0,
                    "description": "Fallback R-multiple for runner target when no equal lows exist.",
                },
                "time_stop_bars": {
                    "type": "integer",
                    "default": 3,
                    "minimum": 1,
                    "maximum": 6,
                    "description": "Bars to wait for +0.5R progress before timing out.",
                },
                "progress_threshold_r": {
                    "type": "number",
                    "default": 0.5,
                    "minimum": 0.25,
                    "maximum": 1.0,
                    "description": "Required progress in R units before cancelling time stop.",
                },
                "require_strong_candle": {
                    "type": "boolean",
                    "default": False,
                    "description": "Require displacement candle filter (Range>1.2*medTR14 and body>=70%).",
                },
                "max_risk_dollars": {
                    "type": "number",
                    "default": 250.0,
                    "minimum": 50.0,
                    "description": "Maximum dollars of stop risk allowed per trade.",
                },
            },
        }

    # -------------------------------------------------------------------------------------
    # Entry logic

    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0,
        active_order_count: int = 0,
    ) -> List[str]:
        """Monitor all candidates while respecting active exposure."""

        if active_position_count > 0 or active_order_count > 0:
            logger.debug(
                "FailedEqualHighs: standing down (positions=%s, orders=%s)",
                active_position_count,
                active_order_count,
            )
            return []

        symbols = [c.get("ticker") for c in candidates if c.get("ticker")]
        logger.debug(
            "FailedEqualHighs: monitoring %d of %d candidates",
            len(symbols),
            len(candidates),
        )
        return symbols

    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        try:
            if not market_data.bars or len(market_data.bars) < 30:
                return EntrySignal(should_enter=False, reason="insufficient_bars")

            bars = self._sort_bars(market_data.bars)
            five_min_bars = self._ensure_five_minute_bars(bars)

            if len(five_min_bars) < 25:
                return EntrySignal(should_enter=False, reason="insufficient_5m_bars")

            current_bar = five_min_bars[-1]
            proxy_close = market_data.price or current_bar.get("close")
            if proxy_close is None:
                return EntrySignal(should_enter=False, reason="missing_price")

            if not self._within_entry_window(current_bar, market_data.timestamp):
                return EntrySignal(should_enter=False, reason="not_at_450s")

            if not self._in_trading_window(market_data.timestamp):
                return EntrySignal(should_enter=False, reason="outside_session")

            swing_highs = self._find_swing_points(five_min_bars[:-1], kind="high")
            equal_high_pair = self._find_equal_pair(swing_highs)
            if not equal_high_pair:
                return EntrySignal(should_enter=False, reason="no_equal_highs")

            equal_high_level = max(equal_high_pair[0].price, equal_high_pair[1].price)

            if current_bar.get("high") is None or current_bar.get("low") is None:
                return EntrySignal(should_enter=False, reason="invalid_bar")

            if current_bar["high"] <= equal_high_level:
                return EntrySignal(should_enter=False, reason="no_liquidity_sweep")

            if proxy_close >= equal_high_level:
                return EntrySignal(should_enter=False, reason="body_not_back_inside")

            rvol, rvol_details = self._compute_rvol(current_bar, market_data)
            if rvol is None:
                return EntrySignal(should_enter=False, reason="missing_rvol_data")

            if rvol < self.rvol_threshold:
                return EntrySignal(
                    should_enter=False,
                    reason="rvol_below_threshold",
                    metadata={"rvol": rvol, **rvol_details},
                )

            med_tr14 = self._median_true_range(five_min_bars[:-1], period=14)
            is_strong_candle = False

            if med_tr14 is not None:
                bar_range = current_bar["high"] - current_bar["low"]
                bar_body = abs(proxy_close - current_bar.get("open", proxy_close))

                if med_tr14 > 0:
                    if (
                        bar_range > self.displacement_range_multiplier * med_tr14
                        and bar_range > 0
                        and (bar_body / bar_range) >= self.displacement_body_ratio
                    ):
                        is_strong_candle = True

            if self.require_strong_candle and not is_strong_candle:
                return EntrySignal(
                    should_enter=False,
                    reason="not_displacement",
                    metadata={"medTR14": med_tr14},
                )

            stop_price = current_bar["high"] * (1 + self.stop_buffer)
            risk_per_share = stop_price - proxy_close

            if risk_per_share <= 0:
                return EntrySignal(should_enter=False, reason="invalid_stop")

            tp1_price = proxy_close - risk_per_share

            equal_lows_pair = self._find_equal_pair(
                self._find_swing_points(five_min_bars[:-1], kind="low")
            )

            runner_target = self._derive_runner_target(
                proxy_close,
                equal_lows_pair,
                five_min_bars,
                risk_per_share,
            )

            metadata = {
                "equal_high_level": equal_high_level,
                "sweep_high": current_bar["high"],
                "stop_price": stop_price,
                "tp1_price": tp1_price,
                "tp2_price": runner_target,
                "risk_per_share": risk_per_share,
                "rvol": rvol,
                "is_strong_candle": is_strong_candle,
                "med_tr14": med_tr14,
                "equal_high_pair": [
                    {
                        "timestamp": equal_high_pair[0].timestamp.isoformat(),
                        "price": equal_high_pair[0].price,
                    },
                    {
                        "timestamp": equal_high_pair[1].timestamp.isoformat(),
                        "price": equal_high_pair[1].price,
                    },
                ],
            }

            self._pending_states[symbol] = {
                **metadata,
                "entry_time": market_data.timestamp,
                "initialized": False,
                "half_r_progress": False,
                "best_price": proxy_close,
            }

            logger.info(
                "FailedEqualHighs: short signal on %s @ %.2f (stop %.2f, tp1 %.2f, tp2 %.2f)",
                symbol,
                proxy_close,
                stop_price,
                tp1_price,
                runner_target,
            )

            return EntrySignal(
                should_enter=True,
                entry_price=proxy_close,
                stop_loss=stop_price,
                take_profit=runner_target,
                confidence=0.65 if is_strong_candle else 0.55,
                reason="failed_equal_highs_short",
                metadata={**metadata, "side": "sell"},
            )

        except Exception as exc:
            logger.error("FailedEqualHighs: error evaluating entry for %s: %s", symbol, exc, exc_info=True)
            return EntrySignal(should_enter=False, reason="error")

    # -------------------------------------------------------------------------------------
    # Exit & scaling logic

    async def should_exit(
        self,
        position: PositionContext,
        market_data: MarketData,
    ) -> ExitSignal:
        try:
            state = self._hydrate_position_state(position)

            if not state:
                return ExitSignal(should_exit=False)

            stop_price = state.get("stop_price") or position.entry_price * (1 + self.stop_buffer)
            tp2_price = state.get("tp2_price")
            risk_per_share = state.get("risk_per_share") or max(stop_price - position.entry_price, 0)

            price = market_data.price
            if price is None:
                return ExitSignal(should_exit=False)

            if price >= stop_price:
                return ExitSignal(
                    should_exit=True,
                    exit_price=price,
                    reason="stop_loss",
                )

            if tp2_price and price <= tp2_price:
                return ExitSignal(
                    should_exit=True,
                    exit_price=price,
                    reason="runner_target_hit",
                )

            # Track best price (favorable move since entry)
            best_price = state.get("best_price", price)
            if price < best_price:
                state["best_price"] = price

            move = position.entry_price - price
            if risk_per_share > 0 and move >= self.progress_threshold_r * risk_per_share:
                state["half_r_progress"] = True

            if not state.get("half_r_progress"):
                bars_elapsed = self._bars_since_entry(position.entry_time, market_data.timestamp)
                if bars_elapsed >= self.time_stop_bars:
                    logger.info(
                        "FailedEqualHighs: time stop on %s after %d bars without %.2fR progress",
                        position.symbol,
                        bars_elapsed,
                        self.progress_threshold_r,
                    )
                    return ExitSignal(
                        should_exit=True,
                        exit_price=price,
                        reason="time_stop",
                    )

            if not self._in_trading_window(market_data.timestamp):
                return ExitSignal(
                    should_exit=True,
                    exit_price=price,
                    reason="session_end_flatten",
                )

            return ExitSignal(should_exit=False)

        except Exception as exc:
            logger.error("FailedEqualHighs: error evaluating exit for %s: %s", position.symbol, exc, exc_info=True)
            return ExitSignal(should_exit=False)

    async def should_scale_out(
        self,
        position: PositionContext,
        market_data: MarketData,
    ) -> Optional[ScaleSignal]:
        state = self._hydrate_position_state(position)

        if not state or position.has_scaled_out:
            return None

        tp1_price = state.get("tp1_price")
        if tp1_price is None:
            return None

        price = market_data.price
        if price is None:
            return None

        if price <= tp1_price:
            position.strategy_state["has_scaled_out"] = True
            position.strategy_state["has_taken_profits"] = True
            logger.info(
                "FailedEqualHighs: scaling out of %s at TP1 %.2f",
                position.symbol,
                tp1_price,
            )
            return ScaleSignal(
                action="scale_out",
                percent=self.scale_percent,
                reason="tp1_hit",
            )

        return None

    async def should_scale_in(
        self,
        position: PositionContext,
        market_data: MarketData,
    ) -> Optional[ScaleSignal]:
        # No scale-ins for this strategy; we want single-shot shorts
        return None

    # -------------------------------------------------------------------------------------
    # Position sizing

    async def position_sizing(
        self,
        signal: EntrySignal,
        fund_balance: float,
        risk_params: Dict[str, Any],
    ) -> float:
        size_per_trade = risk_params.get("size_per_trade", 1000.0)
        max_bet_percent = risk_params.get("max_bet_percent")

        entry_price = signal.entry_price or 0.0
        risk_per_share = (signal.metadata or {}).get("risk_per_share")

        if entry_price <= 0 or not risk_per_share or risk_per_share <= 0:
            return size_per_trade

        max_risk = min(self.max_risk_dollars, size_per_trade)
        shares_by_risk = max_risk / risk_per_share
        dollars_by_risk = shares_by_risk * entry_price

        position_size = min(size_per_trade, dollars_by_risk)

        if max_bet_percent and max_bet_percent > 0:
            max_position = fund_balance * (max_bet_percent / 100.0)
            position_size = min(position_size, max_position)

        return position_size

    # -------------------------------------------------------------------------------------
    # Helper utilities

    def _hydrate_position_state(self, position: PositionContext) -> Dict[str, Any]:
        state = position.strategy_state

        if not state or not state.get("initialized"):
            pending = self._pending_states.pop(position.symbol, None)
            if pending:
                state.update(pending)
                state["initialized"] = True
            else:
                if "stop_price" not in state:
                    state["stop_price"] = position.entry_price * (1 + self.stop_buffer)
                if "tp1_price" not in state:
                    state["tp1_price"] = position.entry_price - (
                        (state.get("risk_per_share") or (state["stop_price"] - position.entry_price))
                    )
                if "tp2_price" not in state:
                    state["tp2_price"] = position.entry_price - (
                        (state.get("risk_per_share") or (state["stop_price"] - position.entry_price))
                        * self.runner_rr_default
                    )
                state.setdefault("half_r_progress", False)
                state.setdefault("best_price", position.entry_price)
                state["initialized"] = True

        return state

    def _within_entry_window(self, current_bar: Dict[str, Any], now: datetime) -> bool:
        bar_start = current_bar.get("timestamp")
        if not bar_start:
            return False

        interval = timedelta(minutes=5)
        bar_end = bar_start + interval

        current_ts = now or datetime.utcnow()
        if current_ts.tzinfo is None:
            current_ts = current_ts.replace(tzinfo=ZoneInfo("UTC"))

        seconds_to_close = (bar_end - current_ts).total_seconds()
        return 0 <= seconds_to_close <= self.seconds_to_close_window

    def _in_trading_window(self, ts: datetime) -> bool:
        """
        Wrapper for timing utility.
        
        Uses shared is_within_trading_window function.
        """
        if ts is None:
            return False
        
        return is_within_trading_window(
            timestamp=ts,
            windows=self.SESSION_WINDOWS,
            timezone="America/New_York"
        )

    def _ensure_five_minute_bars(self, bars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Assumes incoming bars are already 5-minute bars; log if interval deviates significantly
        if len(bars) < 3:
            return bars

        intervals = []
        for i in range(1, len(bars)):
            prev = bars[i - 1]["timestamp"]
            curr = bars[i]["timestamp"]
            if isinstance(prev, datetime) and isinstance(curr, datetime):
                intervals.append((curr - prev).total_seconds())

        if intervals:
            med_interval = median([abs(i) for i in intervals])
            if med_interval < 200 or med_interval > 400:
                logger.debug(
                    "FailedEqualHighs: unexpected bar interval %.1fs (expected ~300s)",
                    med_interval,
                )

        return bars

    def _sort_bars(self, bars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return sorted(
            [b for b in bars if b.get("timestamp")],
            key=lambda b: b["timestamp"],
        )

    def _find_swing_points(self, bars: List[Dict[str, Any]], kind: str) -> List[SwingPoint]:
        """
        Wrapper for technical analysis utility.
        
        Uses shared find_swing_points function.
        """
        return find_swing_points(bars, kind=kind, lookback=2)

    def _find_equal_pair(
        self,
        swings: Sequence[SwingPoint],
    ) -> Optional[Tuple[SwingPoint, SwingPoint]]:
        """
        Wrapper for technical analysis utility.
        
        Uses shared find_equal_levels function.
        """
        return find_equal_levels(list(swings), tolerance=self.equal_high_tolerance)

    def _compute_rvol(
        self,
        current_bar: Dict[str, Any],
        market_data: MarketData,
    ) -> Tuple[Optional[float], Dict[str, Any]]:
        details: Dict[str, Any] = {}

        if market_data.indicators:
            for key in ("rvol_5m", "relative_volume_5m", "rvol"):
                if key in market_data.indicators and market_data.indicators[key] is not None:
                    details["source"] = f"indicators.{key}"
                    return float(market_data.indicators[key]), details

        volume = current_bar.get("volume")
        if volume is None or volume <= 0:
            details["reason"] = "current_volume_missing"
            return None, details

        avg_keys = (
            "avg_volume_20d_5m",
            "avg_volume_20d",
            "average_volume_20d_5m",
            "avg_5m_volume_20d",
        )
        avg_volume = None
        for key in avg_keys:
            if current_bar.get(key):
                avg_volume = current_bar[key]
                details["source"] = f"bar.{key}"
                break

        if avg_volume is None:
            details["reason"] = "avg_volume_missing"
            return None, details

        # Use utility function for calculation
        ratio = calculate_relative_volume(float(volume), float(avg_volume))
        
        if ratio == 0.0:
            details["reason"] = "avg_volume_invalid"
            return None, details

        details["current_volume"] = volume
        details["avg_volume"] = avg_volume
        return ratio, details

    def _median_true_range(self, bars: List[Dict[str, Any]], period: int = 14) -> Optional[float]:
        """
        Wrapper for technical analysis utility.
        
        Uses shared median_true_range function.
        """
        return median_true_range(bars, period=period)

    def _derive_runner_target(
        self,
        entry_price: float,
        equal_lows_pair: Optional[Tuple[SwingPoint, SwingPoint]],
        bars: List[Dict[str, Any]],
        risk_per_share: float,
    ) -> float:
        candidates: List[float] = []

        if equal_lows_pair:
            candidates.append(min(equal_lows_pair[0].price, equal_lows_pair[1].price))

        session_open = self._session_open_price(bars, bars[-1]["timestamp"])
        if session_open is not None:
            candidates.append(session_open)

        valid_candidates = [c for c in candidates if c < entry_price]

        if valid_candidates:
            return min(valid_candidates, key=lambda price: entry_price - price)

        return entry_price - (risk_per_share * self.runner_rr_default)

    def _session_open_price(self, bars: List[Dict[str, Any]], reference_ts: datetime) -> Optional[float]:
        if reference_ts is None:
            return None

        ref_date = self._to_eastern(reference_ts).date()

        for bar in bars:
            ts = bar.get("timestamp")
            if not ts:
                continue

            ts_et = self._to_eastern(ts)
            if ts_et.date() != ref_date:
                continue

            if ts_et.time() >= time(9, 30):
                return bar.get("open")

        return None

    def _bars_since_entry(self, entry_time: datetime, now: datetime) -> int:
        if not entry_time or not now:
            return 0

        et_entry = self._to_eastern(entry_time)
        et_now = self._to_eastern(now)

        elapsed = (et_now - et_entry).total_seconds()
        if elapsed < 0:
            return 0

        return int(elapsed // 300)

    def _to_eastern(self, ts: datetime) -> datetime:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=ZoneInfo("UTC"))
        return ts.astimezone(self.EASTERN_TZ)


__all__ = ["FailedEqualHighsBreakoutStrategy"]

