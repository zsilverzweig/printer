"""
Wyckoff Method Trading Strategy (Long-only Accumulation)

Implements a pragmatic Wyckoff accumulation detector and an AI-assisted
triggering workflow:
 - OHLCV utilities detect SC/AR, Phase B compression, Spring, SOS, LPS
 - Per-symbol state machine tracks range, phase, and readiness
 - AI proposes entry trigger price(s) and an initial stop (hard floor)
 - Real-time execution: market buy as price crosses the AI trigger level
 - Non-decreasing stop policy: stop may tighten up, never below initial

This mirrors GPT Candlestick patterns for AI prompting, thesis capture,
and cost-aware operations while remaining Wyckoff-specific for signals.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.strategies.base import (
    ExecutionStrategy,
    EntrySignal,
    ExitSignal,
    MarketData,
    PositionContext,
    ScaleSignal,
)
from app.services.wyckoff.detection import (
    SCAR,
    LPSSignal,
    SOSSignal,
    SpringSignal,
    compute_compression_score,
    detect_lps,
    detect_sc_ar,
    detect_sos,
    detect_spring,
    summarize_phase_b_metrics,
)
from app.services.market.market_formatting import format_candlesticks_table
from app.services.news.news_service import NewsService
from app.services.core.database import get_sync_session
from app.services.ai.gpt_helper import get_gpt_helper
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class WyckoffStrategy(ExecutionStrategy):
    """Wyckoff accumulation strategy with AI-triggered long entries."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Detection thresholds (can be tuned via config)
        self.lookback_minutes_5m = int(config.get("lookback_minutes_5m", 5 * 60))  # 5 hours on 5m
        self.lookback_minutes_15m = int(config.get("lookback_minutes_15m", 8 * 60))
        self.lookback_minutes_1h = int(config.get("lookback_minutes_1h", 48 * 60))
        
        self.sc_ma_window = int(config.get("sc_ma_window", 50))
        self.sc_k_range = float(config.get("sc_k_range", 2.0))
        self.sc_k_vol = float(config.get("sc_k_vol", 2.0))
        self.sc_min_downtrend_bars = int(config.get("sc_min_downtrend_bars", 5))
        self.ar_min_retrace = float(config.get("ar_min_retrace", 0.3))
        
        self.spring_max_reclaim_bars = int(config.get("spring_max_reclaim_bars", 3))
        self.spring_max_close_below_bars = int(config.get("spring_max_close_below_bars", 1))
        self.spring_max_penetration_ratio = float(config.get("spring_max_penetration_ratio", 0.02))
        
        self.sos_v_mult = float(config.get("sos_v_mult", 1.5))
        self.sos_r_mult = float(config.get("sos_r_mult", 1.5))
        self.lps_max_retrace_ratio = float(config.get("lps_max_retrace_ratio", 0.5))
        
        self.readiness_threshold = float(config.get("readiness_threshold", 0.7))
        self.ai_proximity_ratio = float(config.get("ai_proximity_ratio", 0.003))  # 0.3%
        self.min_ai_confidence = float(config.get("min_ai_confidence", 0.6))
        
        self.max_positions = int(config.get("max_positions", 3))
        self.position_risk_percent = float(config.get("position_risk_percent", 2.0))
        self.time_stop_minutes = int(config.get("time_stop_minutes", 120))
        
        # Scaling settings
        self.max_scale_ins = int(config.get("max_scale_ins", 2))
        self.scale_in_multiplier = float(config.get("scale_in_multiplier", 0.5))
        self.scale_out_percent = float(config.get("scale_out_percent", 50.0))
        self.scale_out_rr = float(config.get("scale_out_rr", 2.0))  # take partial at >= 2R
        self.min_scale_out_pnl_percent = float(config.get("min_scale_out_pnl_percent", 3.0))
        
        # Services
        self._news_service = NewsService()
        self._gpt_model = config.get("gpt_model", "gpt-4o-mini")
        
        # Tracking: AI monitor levels and stops
        # symbol -> { entry: float, stop: float, confidence: float, rationale: str }
        self._monitored_levels: Dict[str, Dict[str, Any]] = {}
        # Non-decreasing stops: symbol -> initial_stop (floor)
        self._initial_stop_floor: Dict[str, float] = {}
        # Last seen price to detect crossovers
        self._last_price: Dict[str, float] = {}
        
        # Cache for thesis text
        self._thesis_cache: Dict[str, Optional[str]] = {}
    
    @property
    def id(self) -> str:
        return "wyckoff"
    
    @property
    def name(self) -> str:
        return "Wyckoff Method"
    
    @property
    def description(self) -> str:
        return (
            "Long-only Wyckoff accumulation strategy using OHLCV to detect SC/AR, "
            "Phase B compression, Spring, SOS, and LPS. AI proposes trigger levels; "
            "market buy on touch; stop is non-decreasing from the initial AI stop."
        )
    
    @property
    def strategy_type(self) -> str:
        return "hybrid"  # Deterministic OHLCV + AI trigger selection
    
    @property
    def expected_timeframe(self) -> str:
        return "intraday-to-swing"
    
    @property
    def required_indicators(self) -> List[str]:
        return ["volume", "price_range", "relative_volume", "vwap", "macd"]
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "lookback_minutes_5m": {"type": "integer", "default": 300},
                "lookback_minutes_15m": {"type": "integer", "default": 480},
                "lookback_minutes_1h": {"type": "integer", "default": 2880},
                "sc_ma_window": {"type": "integer", "default": 50},
                "sc_k_range": {"type": "number", "default": 2.0},
                "sc_k_vol": {"type": "number", "default": 2.0},
                "sc_min_downtrend_bars": {"type": "integer", "default": 5},
                "ar_min_retrace": {"type": "number", "default": 0.3},
                "spring_max_reclaim_bars": {"type": "integer", "default": 3},
                "spring_max_close_below_bars": {"type": "integer", "default": 1},
                "spring_max_penetration_ratio": {"type": "number", "default": 0.02},
                "sos_v_mult": {"type": "number", "default": 1.5},
                "sos_r_mult": {"type": "number", "default": 1.5},
                "lps_max_retrace_ratio": {"type": "number", "default": 0.5},
                "readiness_threshold": {"type": "number", "default": 0.7},
                "ai_proximity_ratio": {"type": "number", "default": 0.003},
                "min_ai_confidence": {"type": "number", "default": 0.6},
                "max_positions": {"type": "integer", "default": 3, "minimum": 1, "maximum": 10},
                "position_risk_percent": {"type": "number", "default": 2.0, "minimum": 0.5, "maximum": 5.0},
                "time_stop_minutes": {"type": "integer", "default": 120, "minimum": 15, "maximum": 480},
                "gpt_model": {"type": "string", "default": "gpt-4o-mini"},
                "max_scale_ins": {"type": "integer", "default": 2, "minimum": 0, "maximum": 5},
                "scale_in_multiplier": {"type": "number", "default": 0.5, "minimum": 0.1, "maximum": 2.0},
                "scale_out_percent": {"type": "number", "default": 50.0, "minimum": 5.0, "maximum": 100.0},
                "scale_out_rr": {"type": "number", "default": 2.0, "minimum": 1.0, "maximum": 5.0},
                "min_scale_out_pnl_percent": {"type": "number", "default": 3.0, "minimum": 0.5, "maximum": 20.0},
            },
        }

    # --------------------------- AI I/O models ----------------------------

    class AIEntry(BaseModel):
        type: str = Field(description="spring or lps")
        entry: float
        stop: float

    class AIResponse(BaseModel):
        action: str
        entries: List["WyckoffStrategy.AIEntry"]
        confidence: float
        rationale: str
        monitor_levels: Optional[List[float]] = None
        reevaluate_in_seconds: Optional[int] = None
    
    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0,
        active_order_count: int = 0
    ) -> List[str]:
        """Monitor symbols from screener while respecting position caps."""
        if active_position_count + active_order_count >= self.max_positions:
            logger.info(
                f"[Wyckoff] At position/order limit ({active_position_count} pos, {active_order_count} orders, max {self.max_positions})"
            )
            return []

        symbols: List[str] = []
        for c in candidates:
            sym = c.get("ticker") or c.get("symbol")
            if sym:
                symbols.append(sym)

        logger.info(f"[Wyckoff] Monitoring {len(symbols)} symbols")
        return symbols
    
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """Determine entry using Wyckoff detections and AI-triggered levels.

        Flow:
        - Fetch recent 5m and 15m bars
        - Detect SC/AR → define range; compute compression; look for Spring/SOS/LPS
        - Compute readiness score
        - If readiness high or price near active AI monitor level, ask AI for entry/stop
        - If price crosses the monitored AI entry, return an EntrySignal (market)
        """
        price = float(market_data.price)
        last = self._last_price.get(symbol)
        self._last_price[symbol] = price

        # Check if we already have a monitored AI level and whether we crossed it
        monitored = self._monitored_levels.get(symbol)
        if monitored and last is not None:
            trigger = float(monitored["entry"])  # upward cross for long
            if last < trigger <= price:
                # Enforce non-decreasing stop using initial floor
                initial_stop = float(self._initial_stop_floor.get(symbol, monitored["stop"]))
                stop_to_use = max(initial_stop, float(monitored["stop"]))
                reason = monitored.get("rationale", "AI Wyckoff entry trigger touched")
                logger.info(f"[Wyckoff] Trigger crossed for {symbol}: {trigger:.2f} → market buy @ {price:.2f}")
                return EntrySignal(
                    should_enter=True,
                    entry_price=price,
                    stop_loss=stop_to_use,
                    confidence=float(monitored.get("confidence", 0.6)),
                    reason=reason,
                    order_type="market",
                    metadata={"trigger": trigger, "source": "ai", "non_decreasing_stop": True},
                )

        # Otherwise, analyze context to determine if we should (re)query AI
        bars_5m = await self._get_candlesticks(symbol, "5Min", self.lookback_minutes_5m)
        bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_minutes_15m)
        if not bars_5m or not bars_15m:
            return EntrySignal(should_enter=False, reason="Insufficient bars")

        # Detect SC/AR and range
        scar = detect_sc_ar(
            bars_5m,
            ma_window=self.sc_ma_window,
            k_range=self.sc_k_range,
            k_vol=self.sc_k_vol,
            min_downtrend_bars=self.sc_min_downtrend_bars,
            ar_min_retrace=self.ar_min_retrace,
        )

        if not scar:
            return EntrySignal(should_enter=False, reason="No SC/AR detected yet")

        support = scar.sc_low
        resistance = scar.ar_high
        phase_b_start = scar.sc_index
        phase_b_end = scar.ar_index if scar.ar_index > scar.sc_index else scar.sc_index + 1

        avg_vol_b, avg_rng_b = summarize_phase_b_metrics(bars_5m, phase_b_start, phase_b_end)
        compression = compute_compression_score(bars_5m, phase_b_start, len(bars_5m))
        spring = detect_spring(
            bars_5m,
            support_level=support,
            max_bars_to_reclaim=self.spring_max_reclaim_bars,
            max_close_below_bars=self.spring_max_close_below_bars,
            max_penetration_ratio=self.spring_max_penetration_ratio,
        )
        sos = detect_sos(
            bars_5m,
            range_high=resistance,
            avg_vol_phase_b=avg_vol_b,
            avg_range_phase_b=avg_rng_b,
            v_mult=self.sos_v_mult,
            r_mult=self.sos_r_mult,
        )
        lps = detect_lps(
            bars_5m,
            range_high_now_support=resistance,
            sos_index=sos.index if sos else phase_b_end,
            max_retrace_ratio=self.lps_max_retrace_ratio,
        )

        readiness = self._compute_readiness(scar, compression, spring, sos, lps)

        # Gate AI calls by readiness or proximity to an existing AI level
        proximity_ok = False
        if monitored:
            trigger = float(monitored["entry"])
            proximity_ok = abs(price - trigger) / max(1e-6, trigger) <= self.ai_proximity_ratio

        if readiness >= self.readiness_threshold or proximity_ok:
            await self._query_ai_for_triggers(symbol, price, bars_5m, bars_15m, support, resistance, readiness)

        return EntrySignal(should_enter=False, reason="Monitoring for AI trigger cross")
    
    async def should_exit(
        self, 
        position: PositionContext, 
        market_data: MarketData
    ) -> ExitSignal:
        """Exit is predetermined at the AI-set stop; stop is non-decreasing.

        Additional time-stop: if no progress within configured minutes, exit.
        """
        symbol = position.symbol
        current_price = float(market_data.price)
        state = position.strategy_state or {}
        initial_stop = float(state.get("initial_ai_stop", position.entry_price * 0.95))
        current_stop = float(state.get("current_stop", initial_stop))
        current_stop = max(current_stop, initial_stop)

        # Hard stop
        if current_price <= current_stop:
            return ExitSignal(should_exit=True, reason="stop_loss", exit_price=current_stop)

        # Time stop
        if position.time_in_position_minutes() >= self.time_stop_minutes:
            return ExitSignal(should_exit=True, reason="time_stop", exit_price=current_price)

        return ExitSignal(should_exit=False)
    
    async def position_sizing(
        self, 
        signal: EntrySignal, 
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """Use fund-level position sizing settings instead of strategy defaults.

        - Base size: risk_params.size_per_trade
        - Cap: risk_params.max_bet_percent of fund_balance when provided
        - Scale by signal.confidence
        """
        size_per_trade = float(risk_params.get("size_per_trade", 1000.0))
        max_bet_percent = risk_params.get("max_bet_percent")

        position_size = size_per_trade

        if max_bet_percent is not None and max_bet_percent > 0:
            cap = fund_balance * (float(max_bet_percent) / 100.0)
            position_size = min(position_size, cap)

        position_size *= float(signal.confidence or 1.0)

        logger.info(
            f"[Wyckoff] Position sizing (fund settings): ${position_size:.2f} "
            f"(confidence={signal.confidence:.2f})"
        )

        return position_size
    
    async def should_scale_in(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """Scale in after SOS on LPS pullback when trend remains healthy.

        Conditions:
        - Position profitable and not exceeded max_scale_ins
        - Recent SOS and a valid LPS detected above prior range high
        - Current price above entry and pivoting up
        """
        if not position.is_profitable():
            return None
        if position.scale_in_count >= self.max_scale_ins:
            return None

        symbol = position.symbol
        price = float(market_data.price)

        # Recompute recent 5m structure for SOS/LPS
        bars_5m = await self._get_candlesticks(symbol, "5Min", min(self.lookback_minutes_5m, 600))
        if not bars_5m:
            return None
        scar = detect_sc_ar(
            bars_5m,
            ma_window=self.sc_ma_window,
            k_range=self.sc_k_range,
            k_vol=self.sc_k_vol,
            min_downtrend_bars=self.sc_min_downtrend_bars,
            ar_min_retrace=self.ar_min_retrace,
        )
        if not scar:
            return None

        avg_vol_b, avg_rng_b = summarize_phase_b_metrics(bars_5m, scar.sc_index, max(scar.ar_index, scar.sc_index + 1))
        sos = detect_sos(
            bars_5m,
            range_high=scar.ar_high,
            avg_vol_phase_b=avg_vol_b,
            avg_range_phase_b=avg_rng_b,
            v_mult=self.sos_v_mult,
            r_mult=self.sos_r_mult,
        )
        if not sos:
            return None

        lps = detect_lps(
            bars_5m,
            range_high_now_support=scar.ar_high,
            sos_index=sos.index,
            max_retrace_ratio=self.lps_max_retrace_ratio,
        )
        if not lps:
            return None

        # Require price above entry and showing strength relative to LPS
        if price <= position.entry_price:
            return None
        lps_close = float(bars_5m[lps.index]["c"]) if lps.index < len(bars_5m) else lps.lps_low
        if price <= lps_close:
            return None

        reason = "Scale in on LPS after SOS (Wyckoff Phase D)"
        return ScaleSignal(action="scale_in", multiplier=self.scale_in_multiplier, reason=reason)
    
    async def should_scale_out(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """Take partial profits at structural R-multiples or sufficient PnL%.

        Primary rule: scale out percent at >= scale_out_rr R multiple.
        Fallback: scale out if unrealized_pnl_percent >= min_scale_out_pnl_percent.
        """
        symbol = position.symbol
        price = float(market_data.price)

        # Compute risk per share using initial AI stop floor if available
        initial_stop = position.strategy_state.get("initial_ai_stop")
        if initial_stop is None:
            # fallback to strategy-tracked floor
            initial_stop = self._initial_stop_floor.get(symbol)

        if initial_stop is not None and initial_stop > 0 and position.entry_price > 0:
            r_per_share = max(0.0, position.entry_price - float(initial_stop))
            if r_per_share > 0:
                gain = price - position.entry_price
                if gain / r_per_share >= self.scale_out_rr:
                    return ScaleSignal(
                        action="scale_out",
                        percent=self.scale_out_percent,
                        reason=f"Take {self.scale_out_percent:.0f}% at >= {self.scale_out_rr:.1f}R",
                    )

        # Fallback PnL% rule
        if position.unrealized_pnl_percent >= self.min_scale_out_pnl_percent and not position.has_taken_profits:
            return ScaleSignal(
                action="scale_out",
                percent=self.scale_out_percent,
                reason=f"Take {self.scale_out_percent:.0f}% at {position.unrealized_pnl_percent:.1f}% PnL",
            )

        return None
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """Validate Wyckoff strategy configuration."""
        if int(config.get("max_positions", 3)) < 1:
            raise ValueError("max_positions must be at least 1")
        pr = float(config.get("position_risk_percent", 2.0))
        if not 0.5 <= pr <= 5.0:
            raise ValueError("position_risk_percent must be between 0.5 and 5.0")
        return True

    # ---------------------------- Internals -------------------------------

    def _get_gpt_helper(self):
        if self.fund_id:
            try:
                db = get_sync_session()
                return get_gpt_helper(model=self._gpt_model, db=db, fund_id=self.fund_id)
            except Exception as e:
                logger.warning(f"[Wyckoff] Cost tracking init failed: {e}; proceeding without DB tracking")
        return get_gpt_helper(model=self._gpt_model)

    async def _get_candlesticks(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int,
    ) -> List[Dict[str, Any]]:
        try:
            from app.services.market.market_data_provider import MarketDataProvider
            from app.core import get_client
            provider = MarketDataProvider(polygon_client=get_client())
            return await provider.get_historical_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes,
            )
        except Exception as e:
            logger.error(f"[Wyckoff] Error fetching {timeframe} bars for {symbol}: {e}")
            return []

    def _format_bars(self, bars: List[Dict[str, Any]], timeframe: str) -> str:
        return format_candlesticks_table(bars, timeframe, max_bars=40)

    def _compute_readiness(
        self,
        scar: SCAR,
        compression: float,
        spring: Optional[SpringSignal],
        sos: Optional[SOSSignal],
        lps: Optional[LPSSignal],
    ) -> float:
        score = 0.0
        # Base: have SC/AR and some compression
        score += 0.3 if scar else 0.0
        score += min(0.3, 0.3 * max(0.0, compression))
        # Spring presence adds weight
        score += 0.2 if spring else 0.0
        # SOS or LPS adds confirmation
        if sos:
            score += 0.2
        if lps:
            score += 0.2
        return min(1.0, score)

    async def _query_ai_for_triggers(
        self,
        symbol: str,
        price: float,
        bars_5m: List[Dict[str, Any]],
        bars_15m: List[Dict[str, Any]],
        support: float,
        resistance: float,
        readiness: float,
    ) -> None:
        """Ask AI to propose entry and stop, cache monitor levels, enforce stop floor."""
        data_5m = self._format_bars(bars_5m, "5m")
        data_15m = self._format_bars(bars_15m, "15m")
        news_context = await self._news_service.get_cached_or_fetch(symbol)

        prompt = f"""
You are a Wyckoff expert. Evaluate a LONG-ONLY opportunity for {symbol}.

MARKET CONTEXT (5m):
{data_5m}

MARKET CONTEXT (15m):
{data_15m}

STRUCTURE:
- Support (SC low): {support:.2f}
- Resistance (AR high): {resistance:.2f}
- Readiness score (0-1): {readiness:.2f}

RECENT NEWS:
{news_context}

TASK:
- If and only if this looks like a QUALITY Wyckoff accumulation (Phase C/D), propose 1-2 high-probability LONG entry triggers with stops.
- Entries must be above current price to avoid premature fills; stops must be at logical invalidation (spring low or LPS low).
- The stop is a HARD FLOOR and can only move UP later (never down). Choose conservatively.

Respond ONLY with JSON:
{{
  "action": "monitor|skip",
  "entries": [{{"type": "spring|lps", "entry": 123.45, "stop": 119.80}}],
  "confidence": 0.0-1.0,
  "rationale": "Why these levels are quality Wyckoff setups",
  "monitor_levels": [optional numeric list],
  "reevaluate_in_seconds": 60
}}
"""

        try:
            gpt = self._get_gpt_helper()
            ai = await gpt.get_structured_response(
                prompt=prompt,
                response_model=WyckoffStrategy.AIResponse,
                system_prompt=(
                    "You are an expert Wyckoff trader. Only output valid JSON. "
                    "Favor conservative, high-quality triggers."
                ),
                temperature=0.2,
                operation="entry_analysis",
                symbol=symbol,
                metadata={"strategy": "wyckoff", "readiness": readiness},
            )

            if ai and ai.action == "monitor" and ai.entries:
                # Choose the highest-confidence entry; default to first
                chosen = ai.entries[0]
                if ai.confidence >= self.min_ai_confidence and chosen.entry > 0 and chosen.stop > 0:
                    self._monitored_levels[symbol] = {
                        "entry": float(chosen.entry),
                        "stop": float(chosen.stop),
                        "confidence": float(ai.confidence),
                        "rationale": ai.rationale,
                    }
                    # Set initial stop floor if not set
                    if symbol not in self._initial_stop_floor:
                        self._initial_stop_floor[symbol] = float(chosen.stop)
                    else:
                        # Enforce non-decreasing floor
                        self._initial_stop_floor[symbol] = max(
                            self._initial_stop_floor[symbol], float(chosen.stop)
                        )
                    logger.info(
                        f"[Wyckoff] Monitoring {symbol} @ {chosen.entry:.2f} / stop {chosen.stop:.2f} (conf {ai.confidence:.2f})"
                    )
                else:
                    logger.info(f"[Wyckoff] AI skipped or low confidence for {symbol}")
        except Exception as e:
            logger.error(f"[Wyckoff] AI trigger query failed for {symbol}: {e}", exc_info=True)


# Next steps
# - Periodic AI reassessment while holding to lift stops on SOS/LPS (non-decreasing)
# - Unit tests for detectors and behavior tests for triggers/scale rules
# - Optional: expose debug inspection of per-symbol Wyckoff state

