"""
Wyckoff Method Trading Strategy (Long-only Accumulation)

Migrated to new level-based strategy model.

Implements a pragmatic Wyckoff accumulation detector and an AI-assisted
triggering workflow:
 - OHLCV utilities detect SC/AR, Phase B compression, Spring, SOS, LPS
 - Per-symbol state machine tracks range, phase, and readiness
 - AI proposes entry trigger price(s) and an initial stop (hard floor)
 - Engine handles level persistence and execution
 - Non-decreasing stop policy: stop may tighten up, never below initial
"""

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
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
from app.services.ai.gpt_helper import get_gpt_helper

logger = logging.getLogger(__name__)


class AIEntry(BaseModel):
    """AI-proposed entry level."""
    type: str = Field(description="spring or lps")
    entry: float
    stop: float


class AIResponse(BaseModel):
    """AI response for Wyckoff entry analysis."""
    action: str
    entries: List[AIEntry]
    confidence: float
    rationale: str
    monitor_levels: Optional[List[float]] = None
    reevaluate_in_seconds: Optional[int] = None


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
        self.evaluation_interval_minutes = float(config.get("evaluation_interval_minutes", 5.0))
        
        self.time_stop_minutes = int(config.get("time_stop_minutes", 120))
        
        # Services
        self._news_service = NewsService()
        self._gpt_model = config.get("gpt_model", "gpt-5-pro")
        
        # Tracking: AI monitor levels and stops (per-symbol state)
        # symbol -> { entry: float, stop: float, confidence: float, rationale: str }
        self._monitored_levels: Dict[str, Dict[str, Any]] = {}
        # Non-decreasing stops: symbol -> initial_stop (floor)
        self._initial_stop_floor: Dict[str, float] = {}
    
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
            "engine handles execution. Stop is non-decreasing from the initial AI stop."
        )
    
    @property
    def strategy_type(self) -> str:
        return "hybrid"  # Deterministic OHLCV + AI trigger selection
    
    @property
    def expected_timeframe(self) -> str:
        return "intraday-to-swing"
    
    @property
    def requires_setup(self) -> bool:
        return False  # Goes straight to entry analysis
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Analyze Wyckoff structure and query AI for entry level.
        
        Flow:
        - Fetch recent 5m and 15m bars
        - Detect SC/AR → define range; compute compression; look for Spring/SOS/LPS
        - Compute readiness score
        - If readiness high or price near active AI monitor level, ask AI for entry/stop
        - Return EntryLevel if AI proposes a valid setup
        """
        # Check if we should evaluate (every N minutes)
        if not self._interval_tracker.should_execute(f"entry_{ticker}", self.evaluation_interval_minutes):
            # If we have a monitored level and price is near it, return it
            monitored = self._monitored_levels.get(ticker)
            if monitored:
                entry_price = float(monitored["entry"])
                current_price = market_data.price
                # If price is very close to entry, return the level
                if abs(current_price - entry_price) / max(1e-6, entry_price) <= self.ai_proximity_ratio:
                    initial_stop = self._initial_stop_floor.get(ticker, float(monitored["stop"]))
                    return EntryLevel(
                        entry_price=entry_price,
                        stop_loss=float(monitored["stop"]),
                        confidence=float(monitored.get("confidence", 0.6)),
                        order_type="market",
                        metadata={
                            "trigger": entry_price,
                            "source": "ai",
                            "rationale": monitored.get("rationale", ""),
                            "non_decreasing_stop": True,
                            "initial_ai_stop": initial_stop,  # Store for position management
                        },
                    )
            return None
        
        self._interval_tracker.mark_executed(f"entry_{ticker}")
        
        current_price = market_data.price
        
        # Get candlestick data
        bars_5m = await self._get_candlesticks(ticker, "5Min", self.lookback_minutes_5m)
        bars_15m = await self._get_candlesticks(ticker, "15Min", self.lookback_minutes_15m)
        if not bars_5m or not bars_15m:
            return None
        
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
            return None
        
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
        monitored = self._monitored_levels.get(ticker)
        if monitored:
            trigger = float(monitored["entry"])
            proximity_ok = abs(current_price - trigger) / max(1e-6, trigger) <= self.ai_proximity_ratio
        
        if readiness >= self.readiness_threshold or proximity_ok:
            ai_response = await self._query_ai_for_triggers(
                ticker, current_price, bars_5m, bars_15m, support, resistance, readiness
            )
            
            if ai_response and ai_response.action == "monitor" and ai_response.entries:
                # Choose the highest-confidence entry; default to first
                chosen = ai_response.entries[0]
                if ai_response.confidence >= self.min_ai_confidence and chosen.entry > 0 and chosen.stop > 0:
                    # Store monitored level
                    self._monitored_levels[ticker] = {
                        "entry": float(chosen.entry),
                        "stop": float(chosen.stop),
                        "confidence": float(ai_response.confidence),
                        "rationale": ai_response.rationale,
                    }
                    # Set initial stop floor if not set
                    if ticker not in self._initial_stop_floor:
                        self._initial_stop_floor[ticker] = float(chosen.stop)
                    else:
                        # Enforce non-decreasing floor
                        self._initial_stop_floor[ticker] = max(
                            self._initial_stop_floor[ticker], float(chosen.stop)
                        )
                    
                    logger.info(
                        f"[Wyckoff] Monitoring {ticker} @ {chosen.entry:.2f} / stop {chosen.stop:.2f} "
                        f"(conf {ai_response.confidence:.2f})"
                    )
                    
                    # Return EntryLevel if price is near the entry
                    if abs(current_price - chosen.entry) / max(1e-6, chosen.entry) <= self.ai_proximity_ratio:
                        initial_stop = self._initial_stop_floor.get(ticker, float(chosen.stop))
                        return EntryLevel(
                            entry_price=float(chosen.entry),
                            stop_loss=float(chosen.stop),
                            confidence=float(ai_response.confidence),
                            order_type="market",
                            metadata={
                                "trigger": float(chosen.entry),
                                "source": "ai",
                                "type": chosen.type,
                                "rationale": ai_response.rationale,
                                "non_decreasing_stop": True,
                                "initial_ai_stop": initial_stop,  # Store for position management
                            },
                        )
        
        return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Update stop loss for open position.
        
        Exit is predetermined at the AI-set stop; stop is non-decreasing.
        Additional time-stop: if no progress within configured minutes, exit.
        """
        symbol = position.symbol
        current_price = market_data.price
        state = position.strategy_state or {}
        
        # Get initial stop from various sources (in order of preference)
        # 1. From position strategy_state (set by engine from entry metadata)
        initial_stop = state.get("initial_ai_stop")
        if initial_stop is None:
            # 2. From strategy-tracked floor (fallback)
            initial_stop = self._initial_stop_floor.get(symbol)
        if initial_stop is None:
            # 3. From entry stop_loss (fallback)
            initial_stop = position.entry_price * 0.95
        
        initial_stop = float(initial_stop)
        
        # Get current stop from state, default to initial
        current_stop = float(state.get("current_stop", initial_stop))
        
        # Enforce non-decreasing stop (never below initial)
        current_stop = max(current_stop, initial_stop)
        
        # Hard stop check (engine will handle actual exit)
        if current_price <= current_stop:
            return StopUpdate(
                current_stop=current_stop,
                force_exit=True,
                exit_reason="stop_loss"
            )
        
        # Time stop
        time_in_position = position.time_in_position_minutes()
        if time_in_position >= self.time_stop_minutes:
            return StopUpdate(
                current_stop=current_price,  # Exit at market
                force_exit=True,
                exit_reason="time_stop"
            )
        
        # Return current stop (engine will persist it in strategy_state)
        return StopUpdate(current_stop=current_stop)
    
    async def cleanup_symbol(self, symbol: str) -> None:
        """Clean up per-symbol state when symbol is no longer monitored."""
        self._monitored_levels.pop(symbol, None)
        self._initial_stop_floor.pop(symbol, None)
    
    # ---------------------------- Internals -------------------------------
    
    def _get_gpt_helper(self):
        return get_gpt_helper(model=self._gpt_model, fund_id=self.fund_id)
    
    async def _get_candlesticks(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int,
    ) -> List[Dict[str, Any]]:
        """Get candlestick data and convert to Wyckoff detection format."""
        try:
            from app.services.market.market_data_provider import MarketDataProvider
            from app.core import get_client
            
            provider = MarketDataProvider(polygon_client=get_client())
            bars = await provider.get_historical_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes,
            )
            
            # Convert bar format from long keys (open/high/low/close/volume) 
            # to short keys (o/h/l/c/v) expected by Wyckoff detection code
            converted_bars = []
            for bar in bars:
                converted_bars.append({
                    "t": bar.get("timestamp"),
                    "o": float(bar.get("open", 0)),
                    "h": float(bar.get("high", 0)),
                    "l": float(bar.get("low", 0)),
                    "c": float(bar.get("close", 0)),
                    "v": float(bar.get("volume", 0)),
                })
            
            return converted_bars
        except Exception as e:
            logger.error(f"[Wyckoff] Error fetching {timeframe} bars for {symbol}: {e}")
            return []
    
    def _compute_readiness(
        self,
        scar: SCAR,
        compression: float,
        spring: Optional[SpringSignal],
        sos: Optional[SOSSignal],
        lps: Optional[LPSSignal],
    ) -> float:
        """Compute readiness score [0, 1] based on Wyckoff elements."""
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
    ) -> Optional[AIResponse]:
        """Ask AI to propose entry and stop, cache monitor levels, enforce stop floor."""
        data_5m = format_candlesticks_table(bars_5m, "5m", max_bars=40)
        data_15m = format_candlesticks_table(bars_15m, "15m", max_bars=40)
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
                response_model=AIResponse,
                system_prompt=(
                    "You are an expert Wyckoff trader. Only output valid JSON. "
                    "Favor conservative, high-quality triggers."
                ),
                temperature=0.2,
                operation="entry_analysis",
                symbol=symbol,
                metadata={"strategy": "wyckoff", "readiness": readiness},
            )
            
            return ai
        except Exception as e:
            logger.error(f"[Wyckoff] AI trigger query failed for {symbol}: {e}", exc_info=True)
            return None

