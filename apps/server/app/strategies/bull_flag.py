"""
Bull Flag pattern trading strategy.

Entry criteria:
- 2-3 consecutive green candles (gains, stock trending up)
- 2-3 red candle pullback (no more than 1/4 the gains)
- Next candle breaks the high → BUY
- MACD must be positive

Exit criteria:
- Stop loss: Price drops to flag low
- Time-based: 1-3 minutes if not profitable
- Take profit: Based on risk/reward ratio

Scaling:
- Scale out 25% when profitable
- Scale in 2x if pattern repeats after taking profits (breakeven stop)
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
import logging

from app.strategies.base import (
    ExecutionStrategy,
    EntrySignal,
    ExitSignal,
    ScaleSignal,
    MarketData,
    PositionContext,
)

logger = logging.getLogger(__name__)


class BullFlagStrategy(ExecutionStrategy):
    """Bull Flag pattern day trading strategy."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        # Configuration parameters with defaults
        self.pullback_ratio = config.get("pullback_ratio", 0.25)  # Max 1/4 pullback
        self.min_green_candles = config.get("min_green_candles", 2)
        self.max_green_candles = config.get("max_green_candles", 3)
        self.min_red_candles = config.get("min_red_candles", 2)
        self.max_red_candles = config.get("max_red_candles", 3)
        self.macd_threshold = config.get("macd_threshold", 0.0)
        self.profit_take_percent = config.get("profit_take_percent", 25.0)
        self.scale_in_multiplier = config.get("scale_in_multiplier", 2.0)
        self.min_timeout_minutes = config.get("min_timeout_minutes", 1.0)
        self.max_timeout_minutes = config.get("max_timeout_minutes", 3.0)
    
    @property
    def id(self) -> str:
        return "bull_flag"
    
    @property
    def name(self) -> str:
        return "Bull Flag Pattern"
    
    @property
    def description(self) -> str:
        return (
            "Day trading strategy that identifies bull flag patterns: "
            "2-3 green candles followed by a shallow pullback, then breakout. "
            "Requires positive MACD. Typical hold time: 1-3 minutes."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "1-3 minutes"
    
    @property
    def required_indicators(self) -> List[str]:
        return ["MACD"]
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "pullback_ratio": {
                    "type": "number",
                    "minimum": 0.1,
                    "maximum": 0.5,
                    "default": 0.25,
                    "description": "Maximum pullback as ratio of gains (0.25 = 1/4)",
                },
                "min_green_candles": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 5,
                    "default": 2,
                    "description": "Minimum consecutive green candles",
                },
                "max_green_candles": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 10,
                    "default": 3,
                    "description": "Maximum consecutive green candles",
                },
                "profit_take_percent": {
                    "type": "number",
                    "minimum": 10,
                    "maximum": 50,
                    "default": 25,
                    "description": "Percentage of position to take off as profit",
                },
                "scale_in_multiplier": {
                    "type": "number",
                    "minimum": 1.0,
                    "maximum": 5.0,
                    "default": 2.0,
                    "description": "Size multiplier for scaling into repeat patterns",
                },
                "max_timeout_minutes": {
                    "type": "number",
                    "minimum": 1,
                    "maximum": 10,
                    "default": 3,
                    "description": "Maximum time to hold position if not profitable",
                },
            },
        }
    
    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0
    ) -> List[str]:
        """
        Monitor all candidates with positive momentum.
        
        Bull Flag strategy checks pattern on each symbol, so we monitor
        all candidates that meet basic criteria. We filter for:
        - Positive momentum (uptrend)
        - Adequate relative volume
        
        Note: Price/volume filters should already be in ScreeningCriteria.
        """
        monitored = []
        
        for candidate in candidates:
            symbol = candidate.get("ticker")
            if not symbol:
                continue
            
            # Check for positive change (uptrend) - strategy-specific requirement
            change_pct = candidate.get("change_close", 0)
            if change_pct <= 0:
                continue
            
            # Check for adequate volume - strategy-specific requirement
            rv = candidate.get("rv14", 0)
            if rv < 1.5:  # At least 1.5x average volume for patterns
                continue
            
            monitored.append(symbol)
        
        logger.info(
            f"Bull flag monitoring: {len(monitored)} of {len(candidates)} candidates "
            f"(active positions: {active_position_count})"
        )
        return monitored
    
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """
        Check for bull flag entry conditions.
        
        Pattern:
        1. Find 2-3 consecutive green candles (uptrend)
        2. Find 2-3 red candle pullback (max 1/4 of gains)
        3. Current price breaks above flag high
        4. MACD is positive
        """
        try:
            # Need historical bars for pattern detection
            if not market_data.bars or len(market_data.bars) < 10:
                return EntrySignal(should_enter=False, reason="insufficient_bars")
            
            bars = market_data.bars
            
            # Step 1: Find consecutive green candles
            green_candles = self._find_consecutive_green(bars)
            if not green_candles or len(green_candles) < self.min_green_candles:
                return EntrySignal(should_enter=False, reason="no_green_candles")
            
            if len(green_candles) > self.max_green_candles:
                return EntrySignal(should_enter=False, reason="too_many_green_candles")
            
            # Calculate gains from green candles
            green_start = min(c["open"] for c in green_candles)
            green_high = max(c["high"] for c in green_candles)
            green_gains = green_high - green_start
            
            # Step 2: Find pullback after green candles
            pullback = self._find_pullback_after_green(bars, green_candles)
            if not pullback:
                return EntrySignal(should_enter=False, reason="no_pullback")
            
            # Validate pullback is not too deep
            pullback_low = min(c["low"] for c in pullback)
            pullback_depth = green_high - pullback_low
            
            if pullback_depth > (green_gains * self.pullback_ratio):
                return EntrySignal(
                    should_enter=False, 
                    reason="pullback_too_deep",
                    metadata={"pullback_ratio": pullback_depth / green_gains}
                )
            
            # Step 3: Check if current price breaks flag high
            current_price = market_data.price
            if current_price <= green_high:
                return EntrySignal(should_enter=False, reason="no_breakout")
            
            # Step 4: Check MACD
            if not market_data.indicators or "MACD" not in market_data.indicators:
                logger.warning(f"MACD indicator not available for {symbol}")
                return EntrySignal(should_enter=False, reason="macd_unavailable")
            
            macd_value = market_data.indicators["MACD"]
            if macd_value <= self.macd_threshold:
                return EntrySignal(should_enter=False, reason="macd_negative")
            
            # All conditions met - generate entry signal
            flag_low = pullback_low
            flag_high = green_high
            
            return EntrySignal(
                should_enter=True,
                entry_price=current_price,
                stop_loss=flag_low,
                confidence=0.8,
                reason="bull_flag_breakout",
                metadata={
                    "flag_high": flag_high,
                    "flag_low": flag_low,
                    "green_gains": green_gains,
                    "pullback_depth": pullback_depth,
                    "macd": macd_value,
                }
            )
            
        except Exception as e:
            logger.error(f"Error in bull flag entry logic for {symbol}: {e}")
            return EntrySignal(should_enter=False, reason="error")
    
    async def should_exit(
        self, 
        position: PositionContext, 
        market_data: MarketData
    ) -> ExitSignal:
        """
        Check for bull flag exit conditions.
        
        Exit if:
        - Price drops to flag low (stop loss)
        - Time-based: held 1-3 minutes without profit
        - Take profit target hit (if configured)
        """
        current_price = market_data.price
        
        # Get flag low from position state
        flag_low = position.strategy_state.get("flag_low")
        if not flag_low:
            logger.warning(f"No flag_low in position state for {position.symbol}")
            # Use a default based on entry price
            flag_low = position.entry_price * 0.98
        
        # Stop loss: price drops to flag low
        if current_price <= flag_low:
            return ExitSignal(
                should_exit=True,
                exit_price=current_price,
                reason="stop_loss",
            )
        
        # Time-based exit
        time_in_position = position.time_in_position_minutes()
        
        # If not profitable and exceeded timeout, exit
        if time_in_position > self.max_timeout_minutes and not position.is_profitable():
            return ExitSignal(
                should_exit=True,
                exit_price=current_price,
                reason="timeout_unprofitable",
            )
        
        # No exit signal
        return ExitSignal(should_exit=False)
    
    async def should_scale_out(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Scale out 25% of position when profitable.
        """
        # Only scale out once
        if position.has_scaled_out:
            return None
        
        # Check if profitable enough to take profits
        profit_threshold = 2.0  # At least 2% profit
        if position.unrealized_pnl_percent >= profit_threshold:
            return ScaleSignal(
                action="scale_out",
                percent=self.profit_take_percent,
                reason="take_profits",
            )
        
        return None
    
    async def should_scale_in(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Scale in 2x if bull flag pattern repeats after taking profits.
        Sets stop to breakeven (zero risk).
        """
        # Only scale in if we've already taken profits
        if not position.has_taken_profits:
            return None
        
        # Don't scale in multiple times
        if position.scale_in_count > 0:
            return None
        
        # Check if pattern is forming again
        entry_signal = await self.should_enter(position.symbol, market_data)
        
        if entry_signal.should_enter:
            return ScaleSignal(
                action="scale_in",
                multiplier=self.scale_in_multiplier,
                reason="repeat_pattern",
                adjust_stop_to_breakeven=True,
            )
        
        return None
    
    async def position_sizing(
        self,
        signal: EntrySignal,
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """
        Calculate position size based on risk parameters.
        
        Uses the fund's size_per_trade as base, adjusted by risk/reward.
        """
        size_per_trade = risk_params.get("size_per_trade", 1000.0)
        max_bet_percent = risk_params.get("max_bet_percent")
        
        # Start with configured size per trade
        position_size = size_per_trade
        
        # Don't exceed max bet percentage of fund (if set)
        if max_bet_percent is not None:
            max_position = fund_balance * (max_bet_percent / 100.0)
            position_size = min(position_size, max_position)
        
        # Adjust by confidence
        position_size *= signal.confidence
        
        return position_size
    
    def _find_consecutive_green(self, bars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Find 2-3 consecutive green candles in recent bars."""
        # Look at recent bars (last 5-7)
        recent = bars[-7:]
        
        # Find the most recent sequence of green candles
        green_sequence = []
        
        for i in range(len(recent) - 1, -1, -1):
            bar = recent[i]
            if bar["close"] > bar["open"]:  # Green candle
                green_sequence.insert(0, bar)
            else:
                if len(green_sequence) >= self.min_green_candles:
                    break  # Found a sequence
                green_sequence = []  # Reset
        
        return green_sequence if len(green_sequence) >= self.min_green_candles else []
    
    def _find_pullback_after_green(
        self, 
        bars: List[Dict[str, Any]], 
        green_candles: List[Dict[str, Any]]
    ) -> Optional[List[Dict[str, Any]]]:
        """Find red candle pullback after green candles."""
        if not green_candles:
            return None
        
        # Find index of last green candle
        last_green_time = green_candles[-1].get("timestamp")
        
        # Find bars after the green candles
        pullback_start_idx = None
        for i, bar in enumerate(bars):
            if bar.get("timestamp") == last_green_time:
                pullback_start_idx = i + 1
                break
        
        if pullback_start_idx is None or pullback_start_idx >= len(bars):
            return None
        
        # Collect red candles after green
        pullback = []
        for i in range(pullback_start_idx, len(bars)):
            bar = bars[i]
            if bar["close"] < bar["open"]:  # Red candle
                pullback.append(bar)
                if len(pullback) >= self.max_red_candles:
                    break
            else:
                break  # Stop at first non-red candle
        
        if len(pullback) >= self.min_red_candles:
            return pullback
        
        return None


