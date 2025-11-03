"""
GPT Five Guy Strategy

An ultra-aggressive AI-powered trading strategy that:
- Analyzes daily/1hr/15min/5min/1min candlesticks using GPT-4o-mini
- Makes trading decisions every 5 minutes
- Uses GPT to determine patient entry price levels (can be well below current price)
- Updates stops every 30 seconds for rapid risk management
- AI-driven scaling decisions based on profit and momentum
- Long-only positions with target 1-20 minute hold times
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.strategies.base import (
    ExecutionStrategy,
    EntrySignal,
    ExitSignal,
    MarketData,
    PositionContext,
    ScaleSignal,
)
from app.services.ai.gpt_helper import get_gpt_helper
from app.services.core.validation import validate_entry_prices, validate_stop_update
from app.services.market.market_formatting import format_candlesticks_table
from app.lib.technical_analysis import (
    calculate_ema,
    calculate_vwap,
    calculate_rsi,
    calculate_macd,
)

logger = logging.getLogger(__name__)


class GPTTradeSignal(BaseModel):
    """Structured output from GPT for trade decisions."""
    entry_price: float = Field(ge=0, description="Price at which to enter the trade (0 means no setup)")
    stop_loss: float = Field(ge=0, description="Stop loss price (0 means no setup)")
    confidence: float = Field(ge=0, le=1, description="Confidence level about this entry level (0-1)")
    reasoning: str = Field(description="Explanation of the decision")
    patterns_identified: List[str] = Field(description="Patterns recognized (e.g., 'support bounce', 'bull flag')")
    
    def validate_prices(self, current_price: float) -> tuple[bool, Optional[str]]:
        """Validate that prices are reasonable."""
        import math
        
        if not math.isfinite(self.confidence):
            return False, f"confidence is not finite: {self.confidence}"
        
        return validate_entry_prices(
            entry_price=self.entry_price,
            stop_loss=self.stop_loss,
            current_price=current_price,
            side="long"
        )


class GPTStopUpdate(BaseModel):
    """Structured output from GPT for stop loss updates."""
    new_stop_loss: float = Field(gt=0, description="Updated stop loss price")
    reasoning: str = Field(description="Explanation for the stop loss update")
    momentum_assessment: str = Field(description="Momentum: 'strengthening', 'weakening', or 'neutral'")
    
    def validate_stop(
        self, 
        current_stop: float, 
        current_price: float, 
        entry_price: float
    ) -> tuple[bool, Optional[str]]:
        """Validate that the new stop loss is reasonable."""
        return validate_stop_update(
            new_stop=self.new_stop_loss,
            current_stop=current_stop,
            current_price=current_price,
            entry_price=entry_price,
            side="long"
        )


class GPTScaleDecision(BaseModel):
    """Structured output from GPT for scaling decisions."""
    action: str = Field(description="Action: 'scale_out', 'hold', or 'none'")
    percent: Optional[float] = Field(None, description="Percentage to scale out (25, 50, 75)")
    reasoning: str = Field(description="Explanation for the scaling decision")
    profit_target_achieved: bool = Field(description="Whether 2R profit target has been achieved")
    risk_reward_ratio: float = Field(description="Current R-multiple (e.g., 2.5 = 2.5R)")


class GPTFiveGuyStrategy(ExecutionStrategy):
    """GPT Five Guy: Ultra-aggressive AI-powered 5-minute scalping strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Configuration
        self.evaluation_interval_minutes = config.get("evaluation_interval_minutes", 5)
        self.lookback_days_daily = config.get("lookback_days_daily", 7)
        self.lookback_hours_1h = config.get("lookback_hours_1h", 24)
        self.lookback_hours_15m = config.get("lookback_hours_15m", 3)
        self.lookback_hours_5m = config.get("lookback_hours_5m", 1)
        self.lookback_minutes_1m = config.get("lookback_minutes_1m", 30)
        self.update_stop_interval_minutes = config.get("update_stop_interval_minutes", 0.5)  # 30 seconds
        self.min_confidence = config.get("min_confidence", 0.7)
        self.max_concurrent_positions = config.get("max_concurrent_positions", 5)
        
        # Track monitored entry levels: symbol -> GPTTradeSignal
        self._monitored_levels: Dict[str, GPTTradeSignal] = {}
        
        # Track last price seen for each symbol (to detect crossovers)
        self._last_price: Dict[str, float] = {}
        
        # Track last logged state to avoid duplicate logging
        self._last_logged_levels: Dict[str, str] = {}
    
    def _get_gpt_helper(self):
        """Get GPT helper with cost tracking if fund_id is available."""
        return get_gpt_helper(model="gpt-4o-mini", fund_id=self.fund_id)
    
    @property
    def id(self) -> str:
        return "gpt_five_guy"
    
    @property
    def name(self) -> str:
        return "GPT Five Guy"
    
    @property
    def description(self) -> str:
        return (
            "Ultra-aggressive AI-powered 5-minute scalping strategy. "
            "Analyzes daily/1hr/15min/5min/1min candlesticks every 5 minutes with technical indicators. "
            "Sets patient entry levels (can wait for pullbacks to support). "
            "Updates stops every 30 seconds. AI-driven scaling. Target hold: 1-20 minutes."
        )
    
    @property
    def strategy_type(self) -> str:
        return "ai-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "1-20 minutes"
    
    @property
    def required_indicators(self) -> List[str]:
        return []  # GPT analyzes raw candlestick data + calculated indicators
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "evaluation_interval_minutes": {
                    "type": "number",
                    "minimum": 1,
                    "maximum": 15,
                    "default": 5,
                    "description": "How often to evaluate entry signals (minutes)",
                },
                "lookback_days_daily": {
                    "type": "integer",
                    "minimum": 3,
                    "maximum": 30,
                    "default": 7,
                    "description": "Days of daily candlestick data for support/resistance context",
                },
                "lookback_hours_1h": {
                    "type": "integer",
                    "minimum": 6,
                    "maximum": 48,
                    "default": 24,
                    "description": "Hours of 1hr candlestick data to analyze",
                },
                "lookback_hours_15m": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 12,
                    "default": 3,
                    "description": "Hours of 15min candlestick data to analyze",
                },
                "lookback_hours_5m": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 6,
                    "default": 1,
                    "description": "Hours of 5min candlestick data to analyze",
                },
                "lookback_minutes_1m": {
                    "type": "integer",
                    "minimum": 15,
                    "maximum": 120,
                    "default": 30,
                    "description": "Minutes of 1min candlestick data to analyze",
                },
                "update_stop_interval_minutes": {
                    "type": "number",
                    "minimum": 0.5,
                    "maximum": 5,
                    "default": 0.5,
                    "description": "How often to update stop loss (0.5 = 30 seconds)",
                },
                "min_confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "default": 0.7,
                    "description": "Minimum AI confidence about entry level (0.7 = good level)",
                },
                "max_concurrent_positions": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 10,
                    "default": 5,
                    "description": "Maximum number of concurrent open positions",
                },
            },
        }
    
    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0,
        active_order_count: int = 0
    ) -> List[str]:
        """
        Monitor candidates if we're below max position limit.
        """
        # Don't monitor new entries if at max positions
        if active_position_count >= self.max_concurrent_positions:
            logger.info(
                f"🍔 GPT Five Guy at max positions ({active_position_count}/{self.max_concurrent_positions}). "
                f"Not monitoring new entries."
            )
            return []
        
        symbols = [c.get("ticker") for c in candidates if c.get("ticker")]
        
        logger.info(
            f"🍔 GPT Five Guy monitoring {len(symbols)} candidates "
            f"(positions: {active_position_count}/{self.max_concurrent_positions}, pending orders: {active_order_count})"
        )
        
        return symbols
    
    def cleanup_symbol(self, symbol: str) -> None:
        """Clean up all monitoring resources for a symbol."""
        super().cleanup_symbol(symbol)
        self._monitored_levels.pop(symbol, None)
        self._last_price.pop(symbol, None)
    
    def _should_update_stop(self, symbol: str) -> bool:
        """Check if we should update stop loss for this position (every 30 seconds)."""
        return self._interval_tracker.should_execute(
            f"stop_update_{symbol}",
            self.update_stop_interval_minutes
        )
    
    def _log_monitored_levels(self) -> None:
        """Log all currently monitored entry levels."""
        if not self._monitored_levels:
            if self._last_logged_levels:
                self._last_logged_levels.clear()
            return
        
        level_info = []
        current_state = {}
        for symbol, signal in self._monitored_levels.items():
            current_price = self._last_price.get(symbol, 0.0)
            distance_pct = ((signal.entry_price - current_price) / current_price * 100) if current_price > 0 else 0
            info = (
                f"{symbol}: entry=${signal.entry_price:.2f} (current=${current_price:.2f}, "
                f"{'↑' if distance_pct > 0 else '↓'}{abs(distance_pct):.1f}%), "
                f"stop=${signal.stop_loss:.2f}, conf={signal.confidence:.2f}"
            )
            level_info.append(info)
            current_state[symbol] = info
        
        # Only log if state has changed
        if current_state != self._last_logged_levels:
            logger.info(f"🍔 Monitored Entry Levels ({len(self._monitored_levels)}):")
            for info in level_info:
                logger.info(f"   {info}")
            self._last_logged_levels = current_state
    
    def _format_candlesticks_with_indicators(
        self,
        bars: List[Dict[str, Any]],
        timeframe: str,
        max_bars: int = 12
    ) -> str:
        """
        Format candlestick data with technical indicators for GPT prompt.
        
        Args:
            bars: List of OHLCV bars
            timeframe: Timeframe description (e.g., "1hr", "15min")
            max_bars: Maximum number of bars to include
            
        Returns:
            Formatted string for GPT with indicators
        """
        if not bars:
            return f"No {timeframe} data available"
        
        # Limit to max_bars most recent
        display_bars = bars[-max_bars:] if len(bars) > max_bars else bars
        
        # Calculate indicators
        ema_12 = calculate_ema(bars, 12)
        ema_26 = calculate_ema(bars, 26)
        vwap = calculate_vwap(bars, reset_daily=True)
        rsi = calculate_rsi(bars, 14)
        macd_data = calculate_macd(bars, 12, 26, 9)
        
        # Determine which bars to display (same as display_bars indices)
        start_idx = len(bars) - len(display_bars)
        
        formatted = [f"\n{timeframe} Candlesticks with Indicators (most recent last):"]
        formatted.append(
            f"{'Time':<20} {'O':<8} {'H':<8} {'L':<8} {'C':<8} "
            f"{'Vol':<10} {'EMA12':<8} {'EMA26':<8} {'VWAP':<8} {'RSI':<6}"
        )
        formatted.append("-" * 110)
        
        for i, bar in enumerate(display_bars):
            bar_idx = start_idx + i
            
            # Format timestamp
            ts = bar.get('timestamp', 'N/A')
            if isinstance(ts, datetime):
                ts = ts.strftime('%m/%d %H:%M')
            else:
                ts = str(ts)[:16]
            
            # Format OHLCV values
            o = bar.get('open', 0)
            h = bar.get('high', 0)
            l = bar.get('low', 0)
            c = bar.get('close', 0)
            v = bar.get('volume', 0)
            
            # Format indicators
            ema12_str = f"{ema_12[bar_idx]:.2f}" if bar_idx < len(ema_12) and ema_12[bar_idx] is not None else "N/A"
            ema26_str = f"{ema_26[bar_idx]:.2f}" if bar_idx < len(ema_26) and ema_26[bar_idx] is not None else "N/A"
            vwap_str = f"{vwap[bar_idx]:.2f}" if bar_idx < len(vwap) and vwap[bar_idx] is not None else "N/A"
            rsi_str = f"{rsi[bar_idx]:.1f}" if bar_idx < len(rsi) and rsi[bar_idx] is not None else "N/A"
            
            formatted.append(
                f"{ts:<20} "
                f"{o:<8.2f} "
                f"{h:<8.2f} "
                f"{l:<8.2f} "
                f"{c:<8.2f} "
                f"{v:<10,.0f} "
                f"{ema12_str:<8} "
                f"{ema26_str:<8} "
                f"{vwap_str:<8} "
                f"{rsi_str:<6}"
            )
        
        # Add MACD summary for most recent bar
        if macd_data["macd"] and len(macd_data["macd"]) > 0:
            latest_macd = macd_data["macd"][-1]
            latest_signal = macd_data["signal"][-1]
            latest_hist = macd_data["histogram"][-1]
            if latest_macd is not None and latest_signal is not None and latest_hist is not None:
                formatted.append(
                    f"\nMACD: {latest_macd:.3f} | Signal: {latest_signal:.3f} | "
                    f"Histogram: {latest_hist:.3f} ({'bullish' if latest_hist > 0 else 'bearish'})"
                )
        
        return "\n".join(formatted)
    
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """
        Determine entry signal using GPT analysis of multiple timeframes.
        
        Two-phase approach:
        1. On 5-minute intervals: Get GPT analysis and store entry level
        2. On every tick: Check if price crosses stored entry level
        """
        current_price = market_data.price
        
        # Update last price for this symbol
        last_price = self._last_price.get(symbol)
        self._last_price[symbol] = current_price
        
        # Phase 1: Evaluate and store new entry levels on 5-minute intervals
        if self.should_evaluate_on_interval(symbol, self.evaluation_interval_minutes):
            try:
                # Mark evaluation time
                self.mark_evaluated(symbol)
                
                # Fetch all timeframes
                bars_daily = await self._get_candlesticks(symbol, "1Day", self.lookback_days_daily * 24 * 60)
                bars_1h = await self._get_candlesticks(symbol, "1Hour", self.lookback_hours_1h * 60)
                bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_hours_15m * 60)
                bars_5m = await self._get_candlesticks(symbol, "5Min", self.lookback_hours_5m * 60)
                bars_1m = await self._get_candlesticks(symbol, "1Min", self.lookback_minutes_1m)
                
                if not bars_1h or not bars_15m or not bars_5m or not bars_1m:
                    logger.warning(f"Insufficient candlestick data for {symbol}")
                    self.cleanup_symbol(symbol)
                    return EntrySignal(should_enter=False, reason="insufficient_data")
                
                # Format data for GPT
                data_daily = self._format_candlesticks_with_indicators(bars_daily, "Daily", max_bars=7) if bars_daily else "No daily data"
                data_1h = self._format_candlesticks_with_indicators(bars_1h, "1hr", max_bars=12)
                data_15m = self._format_candlesticks_with_indicators(bars_15m, "15min", max_bars=12)
                data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", max_bars=12)
                data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", max_bars=15)
                
                # Build prompt for GPT
                prompt = f"""You are a sophisticated day trader analyzing {symbol} for RAPID INTRADAY entries.
Target hold time: 1-20 MINUTES (not hours, not days).

Current Price: ${current_price:.2f}

{data_daily}

{data_1h}

{data_15m}

{data_5m}

{data_1m}

Your task: Set an entry price you're CONFIDENT will be a good buy if price reaches it.

Analyze using ANY patterns you recognize:
- Key support/resistance from daily and intraday levels
- Classic patterns (flags, triangles, head & shoulders, etc.)
- EMA crossovers and trend direction
- VWAP as dynamic support/resistance
- RSI for overbought/oversold conditions
- MACD for momentum confirmation
- Volume patterns and anomalies
- Candlestick formations
- Market structure breaks

CRITICAL APPROACH:
- Entry must be AT OR BELOW current price ${current_price:.2f}
- Be PATIENT: It's OK to set entry at strong support far below current price
  (e.g., at yesterday's low, at VWAP, at EMA support, at key level you trust)
- Don't chase! Set the price YOU want to buy at, where risk/reward is excellent
- This is RAPID trading once entered - we exit in 1-20 minutes
- Confidence is about: "Am I confident THIS entry level is good?" not "Should I skip this?"
- Aim for 2R minimum risk/reward from your entry level

Entry Level Examples:
- Current: $100, Entry: $99.50 (minor pullback to VWAP)
- Current: $100, Entry: $98.00 (pullback to yesterday's low / strong support)
- Current: $100, Entry: $95.00 (retrace to key daily support zone or EMA26)

Confidence scale (about your chosen entry level):
- 0.8-1.0: Very confident this level will hold and provide good R/R
- 0.7-0.8: Good level with decent confirmation
- Below 0.7: Not confident enough in this entry level

Respond ONLY with a JSON object in this exact format:
{{
  "entry_price": 123.45,
  "stop_loss": 120.00,
  "confidence": 0.75,
  "reasoning": "Setting entry at EMA26 support ($123.45) which aligns with yesterday's low. Stop below recent swing low. 2.5R to resistance.",
  "patterns_identified": ["ema support", "daily support", "volume confirmation"]
}}

If there is NO good entry level, set entry_price and stop_loss to 0 and confidence to 0.
"""
                
                # Get GPT response
                logger.info(f"🍔 Calling GPT for {symbol} entry analysis...")
                gpt_helper = self._get_gpt_helper()
                response = await gpt_helper.get_structured_response(
                    prompt=prompt,
                    response_model=GPTTradeSignal,
                    system_prompt="You are a sophisticated intraday trader who sets patient entry levels with excellent risk/reward. You wait for price to come to your level. Respond only with valid JSON.",
                    temperature=0.2,
                    operation="entry_analysis",
                    symbol=symbol,
                    metadata={"strategy": "gpt_five_guy", "confidence_threshold": self.min_confidence},
                )
                
                logger.info(
                    f"🍔 GPT analysis for {symbol}: entry=${response.entry_price:.2f}, "
                    f"stop=${response.stop_loss:.2f}, confidence={response.confidence:.2f}"
                )
                logger.debug(f"🍔 Patterns: {', '.join(response.patterns_identified)}")
                logger.debug(f"🍔 Reasoning: {response.reasoning}")
                
                # Validate response
                if response.entry_price <= 0 or response.stop_loss <= 0:
                    self.cleanup_symbol(symbol)
                    logger.warning(f"❌ GPT returned no setup for {symbol}")
                    return EntrySignal(
                        should_enter=False,
                        reason="no_setup",
                        metadata={"gpt_reasoning": response.reasoning}
                    )
                
                # Validate prices are reasonable
                is_valid, error_msg = response.validate_prices(current_price)
                if not is_valid:
                    self.cleanup_symbol(symbol)
                    logger.error(f"❌ GPT returned invalid prices for {symbol}: {error_msg}")
                    return EntrySignal(
                        should_enter=False,
                        reason="invalid_gpt_response",
                        metadata={"error": error_msg, "gpt_reasoning": response.reasoning}
                    )
                
                # Check confidence threshold
                if response.confidence < self.min_confidence:
                    self.cleanup_symbol(symbol)
                    logger.info(
                        f"⚠️ GPT confidence too low for {symbol}: {response.confidence:.2f} < {self.min_confidence:.2f}"
                    )
                    return EntrySignal(
                        should_enter=False,
                        reason="low_confidence",
                        metadata={"confidence": response.confidence, "gpt_reasoning": response.reasoning}
                    )
                
                # Store the entry level for monitoring
                self._monitored_levels[symbol] = response
                logger.info(
                    f"🍔 Monitoring entry level for {symbol}: ${response.entry_price:.2f} "
                    f"(current: ${current_price:.2f}, patterns: {', '.join(response.patterns_identified)})"
                )
            
            except Exception as e:
                logger.error(f"Error in GPT entry analysis for {symbol}: {e}", exc_info=True)
                self.cleanup_symbol(symbol)
                return EntrySignal(should_enter=False, reason="analysis_error")
        
        # Log all monitored levels
        self._log_monitored_levels()
        
        # Phase 2: Check if price crosses any monitored entry level
        if symbol in self._monitored_levels:
            signal = self._monitored_levels[symbol]
            entry_price = signal.entry_price
            
            # Check for price crossing entry level (price moved from above to at/below, or is already at/below)
            crossed = False
            if last_price is None:
                # First tick - check if already at or below entry
                crossed = current_price <= entry_price
            else:
                # Check if crossed from above to at/below
                crossed = last_price > entry_price >= current_price
            
            if crossed:
                logger.info(
                    f"🎯 Entry level TRIGGERED for {symbol}: price ${current_price:.2f} "
                    f"crossed ${entry_price:.2f}. Placing MARKET order IMMEDIATELY."
                )
                
                # Clean up monitoring
                self.cleanup_symbol(symbol)
                
                # Return entry signal with MARKET order
                return EntrySignal(
                    should_enter=True,
                    entry_price=current_price,  # Use current price for market order
                    stop_loss=signal.stop_loss,
                    confidence=signal.confidence,
                    reason="level_triggered",
                    order_type="market",
                    metadata={
                        "gpt_reasoning": signal.reasoning,
                        "patterns_identified": signal.patterns_identified,
                        "target_entry_price": entry_price,
                        "triggered_at_price": current_price,
                        "analysis_time": datetime.now().isoformat(),
                    }
                )
        
        # No entry signal
        return EntrySignal(should_enter=False, reason="monitoring")
    
    async def should_exit(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> ExitSignal:
        """
        Determine exit signal based on stop loss.
        
        Updates stop loss using GPT every 30 seconds, then checks
        if current price has hit the stop.
        """
        current_price = market_data.price
        
        # Get current stop loss from position state
        stop_loss = position.strategy_state.get("stop_loss")
        
        if stop_loss is None:
            logger.warning(f"No stop_loss in position state for {position.symbol}, using entry-based stop")
            stop_loss = position.entry_price * 0.95  # 5% below entry as fallback
        
        # Check if we should update the stop loss (every 30 seconds)
        if self._should_update_stop(position.symbol):
            try:
                new_stop = await self._update_stop_loss(position, market_data)
                if new_stop and new_stop > stop_loss:
                    logger.info(
                        f"🍔 Raising stop loss for {position.symbol}: "
                        f"${stop_loss:.2f} → ${new_stop:.2f}"
                    )
                    stop_loss = new_stop
                
                # Mark stop update time
                self._interval_tracker.mark_executed(f"stop_update_{position.symbol}")
            
            except Exception as e:
                logger.error(f"Error updating stop loss for {position.symbol}: {e}")
        
        # Check if stop loss is hit
        if current_price <= stop_loss:
            logger.info(
                f"🛑 Stop loss hit for {position.symbol}: "
                f"price=${current_price:.2f} <= stop=${stop_loss:.2f}"
            )
            return ExitSignal(
                should_exit=True,
                exit_price=current_price,
                reason="stop_loss",
            )
        
        # No exit signal
        return ExitSignal(should_exit=False)
    
    async def should_scale_out(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Determine if we should scale out using AI analysis.
        
        Calls GPT to evaluate profit, momentum, and decide on scaling.
        """
        current_price = market_data.price
        
        # Check if we've already scaled out significantly
        if position.has_scaled_out:
            # Already took profits, be conservative with remaining position
            return None
        
        # Only evaluate scaling if we have some profit
        if position.unrealized_pnl <= 0:
            return None
        
        # Calculate R-multiple
        entry_price = position.entry_price
        stop_loss = position.strategy_state.get("stop_loss", entry_price * 0.95)
        risk_per_share = entry_price - stop_loss
        profit_per_share = current_price - entry_price
        
        if risk_per_share <= 0:
            return None
        
        r_multiple = profit_per_share / risk_per_share
        
        # Only consider scaling if we're at least at 1.5R
        if r_multiple < 1.5:
            return None
        
        try:
            # Get recent price action for GPT
            bars_5m = await self._get_candlesticks(position.symbol, "5Min", 60)  # Last hour of 5min
            bars_1m = await self._get_candlesticks(position.symbol, "1Min", 15)  # Last 15min of 1min
            
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", max_bars=12) if bars_5m else "No 5min data"
            data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", max_bars=15) if bars_1m else "No 1min data"
            
            time_in_trade = position.time_in_position_minutes()
            
            prompt = f"""Evaluating SCALE OUT decision for {position.symbol}.

Entry: ${entry_price:.2f}
Current: ${current_price:.2f}
Stop: ${stop_loss:.2f}
Risk per share: ${risk_per_share:.2f}
Profit per share: ${profit_per_share:.2f}
R-multiple: {r_multiple:.2f}R (target: minimum 2R)

Time in trade: {time_in_trade:.1f} minutes (target exit: 1-20 min)
P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)

{data_5m}

{data_1m}

Decision criteria:
- Have we hit at least 2R profit? (scale some if momentum slowing)
- Is momentum stalling? (take profits before reversal)
- Is momentum accelerating? (let it run, hold full position)
- Are we approaching 15-20 min hold? (consider taking profits)

Options:
- "scale_out" with percent 25/50/75: Take partial profits if target hit but may reverse
- "hold": Let full position run if momentum strong
- "none": No action needed yet

Don't cut winners prematurely, but this is RAPID trading - lock profits before reversal.

Respond ONLY with a JSON object in this exact format:
{{
  "action": "scale_out",
  "percent": 50,
  "reasoning": "Hit 2.5R, momentum weakening on 1min, take 50% profits",
  "profit_target_achieved": true,
  "risk_reward_ratio": 2.5
}}
"""
            
            logger.info(f"🍔 Calling GPT for {position.symbol} scaling decision...")
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTScaleDecision,
                system_prompt="You are an expert trader managing profitable positions. Lock profits strategically. Respond only with valid JSON.",
                temperature=0.2,
                operation="scale_decision",
                symbol=position.symbol,
                metadata={"strategy": "gpt_five_guy", "r_multiple": r_multiple},
            )
            
            logger.info(
                f"🍔 GPT scale decision for {position.symbol}: {response.action} "
                f"({response.percent}% if scaling) - {response.reasoning}"
            )
            
            if response.action == "scale_out" and response.percent and response.percent > 0:
                return ScaleSignal(
                    action="scale_out",
                    percent=response.percent,
                    reason="ai_scale_decision",
                    adjust_stop_to_breakeven=response.profit_target_achieved,  # Move to BE if target hit
                )
            
            return None
        
        except Exception as e:
            logger.error(f"Error in scaling decision for {position.symbol}: {e}", exc_info=True)
            return None
    
    async def _update_stop_loss(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[float]:
        """
        Use GPT to update stop loss for an open position (every 30 seconds).
        """
        try:
            symbol = position.symbol
            
            # Get recent price action
            bars_5m = await self._get_candlesticks(symbol, "5Min", 60)  # Last hour
            bars_1m = await self._get_candlesticks(symbol, "1Min", 15)  # Last 15 minutes
            
            if not bars_5m or not bars_1m:
                logger.warning(f"No candlestick data available for stop update: {symbol}")
                return None
            
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", max_bars=12)
            data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", max_bars=15)
            
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.95)
            time_in_trade = position.time_in_position_minutes()
            
            # Build prompt
            prompt = f"""Managing RAPID TRADE in {symbol}. Target: 1-20 minute hold.

Position Details:
- Entry Price: ${position.entry_price:.2f}
- Current Price: ${market_data.price:.2f}
- Current Stop Loss: ${current_stop:.2f}
- Time in Position: {time_in_trade:.1f} minutes
- Unrealized P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)
- Has Scaled Out: {position.has_scaled_out}

Recent Price Action:
{data_5m}

{data_1m}

Quick assessment:
- Is momentum strengthening or weakening?
- Should we tighten stop to lock profits?
- Are we near key support/resistance (EMA, VWAP)?
- Any reversal signals forming?

This is RAPID trading - be aggressive with stop management.
NEVER lower stop. Tighten quickly as profit builds.

Respond ONLY with a JSON object in this exact format:
{{
  "new_stop_loss": 123.45,
  "reasoning": "Price made new high, raising stop to EMA12 to lock profits",
  "momentum_assessment": "strengthening"
}}
"""
            
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTStopUpdate,
                system_prompt="You are an expert trader managing stop losses. Never lower stops. Tighten aggressively to protect profits. Respond only with valid JSON.",
                temperature=0.1,
                operation="stop_loss_update",
                symbol=symbol,
                metadata={"strategy": "gpt_five_guy", "current_stop": current_stop},
            )
            
            logger.debug(
                f"🍔 GPT stop update for {symbol}: ${current_stop:.2f} → ${response.new_stop_loss:.2f} "
                f"(momentum: {response.momentum_assessment})"
            )
            
            # Validate the new stop loss
            is_valid, error_msg = response.validate_stop(
                current_stop=current_stop,
                current_price=market_data.price,
                entry_price=position.entry_price
            )
            
            if not is_valid:
                logger.error(f"❌ GPT returned invalid stop loss for {symbol}: {error_msg}")
                return None
            
            return response.new_stop_loss
        
        except Exception as e:
            logger.error(f"Error in GPT stop loss update for {symbol}: {e}", exc_info=True)
            return None
    
    async def _get_candlesticks(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int
    ) -> List[Dict[str, Any]]:
        """Get candlestick data using the market data provider."""
        try:
            from app.services.market.market_data_provider import MarketDataProvider
            from app.core import get_client
            
            provider = MarketDataProvider(polygon_client=get_client())
            
            bars = await provider.get_historical_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes
            )
            
            return bars
        
        except Exception as e:
            logger.error(f"Error fetching candlesticks for {symbol}: {e}")
            return []
    
    async def position_sizing(
        self,
        signal: EntrySignal,
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """Calculate position size based on fund configuration."""
        size_per_trade = risk_params.get("size_per_trade", 1000.0)
        max_bet_percent = risk_params.get("max_bet_percent")
        
        position_size = size_per_trade
        
        # Respect max bet percentage if set
        if max_bet_percent is not None and max_bet_percent > 0:
            max_position = fund_balance * (max_bet_percent / 100.0)
            position_size = min(position_size, max_position)
        
        # Adjust by confidence
        position_size *= signal.confidence
        
        logger.info(
            f"🍔 GPT Five Guy position sizing: ${position_size:.2f} "
            f"(confidence={signal.confidence:.2f})"
        )
        
        return position_size
    
    async def initialize_existing_position(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> None:
        """
        Initialize monitoring for an existing position.
        
        When the fund starts with positions already open, we need to:
        1. Analyze the current state
        2. Set up a stop loss
        3. Add to monitoring for exits
        """
        try:
            symbol = position.symbol
            current_price = market_data.price
            
            logger.info(
                f"🍔 Initializing existing position: {symbol} "
                f"(entry: ${position.entry_price:.2f}, current: ${current_price:.2f}, "
                f"qty: {position.quantity:.2f}, P&L: ${position.unrealized_pnl:.2f})"
            )
            
            # Check if position already has a stop_loss in strategy_state
            existing_stop = position.strategy_state.get("stop_loss")
            if existing_stop:
                logger.info(
                    f"🍔 {symbol} already has stop loss: ${existing_stop:.2f} "
                    f"(from previous session)"
                )
                return
            
            # Use GPT to analyze and set initial stop loss
            bars_5m = await self._get_candlesticks(symbol, "5Min", 60)  # Last hour
            bars_1m = await self._get_candlesticks(symbol, "1Min", 15)  # Last 15 minutes
            
            if not bars_5m or not bars_1m:
                logger.warning(
                    f"⚠️ No candlestick data for {symbol}, using default stop loss"
                )
                # Default: 5% below entry
                default_stop = position.entry_price * 0.95
                position.strategy_state["stop_loss"] = default_stop
                logger.info(f"🍔 Default stop set for {symbol}: ${default_stop:.2f}")
                return
            
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", max_bars=12)
            data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", max_bars=15)
            
            time_in_trade = position.time_in_position_minutes()
            
            # Build prompt for GPT to set stop loss
            prompt = f"""Analyzing EXISTING position in {symbol} (opened in previous session).

Position Details:
- Entry Price: ${position.entry_price:.2f}
- Current Price: ${current_price:.2f}
- Time in Position: {time_in_trade:.1f} minutes
- Unrealized P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)
- Quantity: {position.quantity:.2f} shares

Recent Price Action:
{data_5m}

{data_1m}

This position was opened in a previous session and we need to set up risk management.

Your task: Set an appropriate stop loss based on:
- Current price action and momentum
- Key support levels (EMA, VWAP, recent lows)
- Protect profits if position is up
- Give room if position just started

NEVER lower stop below reasonable levels. This is RAPID trading strategy.

Respond ONLY with a JSON object in this exact format:
{{
  "new_stop_loss": 123.45,
  "reasoning": "Setting stop below EMA12 support at $123.45 to protect current gains",
  "momentum_assessment": "strengthening"
}}
"""
            
            logger.info(f"🍔 Calling GPT to set initial stop for {symbol}...")
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTStopUpdate,
                system_prompt="You are an expert trader setting up risk management for existing positions. Set appropriate stops. Respond only with valid JSON.",
                temperature=0.2,
                operation="position_initialization",
                symbol=symbol,
                metadata={"strategy": "gpt_five_guy", "entry_price": position.entry_price},
            )
            
            # Validate the stop loss is reasonable
            # For existing positions, we're more lenient than normal stop updates
            if response.new_stop_loss <= 0:
                logger.error(f"❌ GPT returned invalid stop loss: ${response.new_stop_loss:.2f}")
                default_stop = position.entry_price * 0.95
                position.strategy_state["stop_loss"] = default_stop
                logger.info(f"🍔 Using default stop for {symbol}: ${default_stop:.2f}")
                return
            
            # Don't allow stops way above current price (makes no sense)
            if response.new_stop_loss > current_price * 1.05:
                logger.warning(
                    f"⚠️ GPT stop too high: ${response.new_stop_loss:.2f} "
                    f"(current: ${current_price:.2f}), capping at current price"
                )
                response.new_stop_loss = current_price * 0.99
            
            # Set the stop loss in position state
            position.strategy_state["stop_loss"] = response.new_stop_loss
            
            logger.info(
                f"✅ Initialized {symbol}: stop=${response.new_stop_loss:.2f}, "
                f"momentum={response.momentum_assessment}"
            )
            logger.debug(f"🍔 Reasoning: {response.reasoning}")
            
        except Exception as e:
            logger.error(
                f"Error initializing existing position for {symbol}: {e}",
                exc_info=True
            )
            # Set conservative default stop
            default_stop = position.entry_price * 0.95
            position.strategy_state["stop_loss"] = default_stop
            logger.info(
                f"🍔 Error during init, using default stop for {symbol}: ${default_stop:.2f}"
            )

