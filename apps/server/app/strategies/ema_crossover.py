"""
EMA Crossover Strategy

Trend-following strategy that:
- Buys when fast EMA (default: 9) crosses above slow EMA (default: 21)
- Uses trailing stop based on ATR
- Exits if fast EMA crosses back below slow EMA
"""

import logging
from typing import Any, Dict, Optional

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
logger = logging.getLogger(__name__)

EMA_FIELD_MAP = {
    12: "ema_12",
    26: "ema_26",
    50: "ema_50",
    200: "ema_200",
}
ATR_FIELD_MAP = {
    14: "atr_14",
}


class EMACrossoverStrategy(ExecutionStrategy):
    """EMA crossover trend-following strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.fast_period = config.get("fast_period", 9)
        self.slow_period = config.get("slow_period", 21)
        self.stop_atr_multiplier = config.get("stop_atr_multiplier", 2.0)
        self.atr_period = config.get("atr_period", 14)
        self.min_crossover_distance = config.get("min_crossover_distance", 0.002)  # 0.2% minimum separation
    
    @property
    def id(self) -> str:
        return "ema_crossover"
    
    @property
    def name(self) -> str:
        return "EMA Crossover"
    
    @property
    def description(self) -> str:
        return (
            f"Trend-following strategy using EMA crossover. "
            f"Buys when {self.fast_period}-period EMA crosses above {self.slow_period}-period EMA. "
            f"Uses {self.stop_atr_multiplier}x ATR trailing stop."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "10-60 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Enter when fast EMA crosses above slow EMA."""
        if not market_data.bars or len(market_data.bars) < self.slow_period + 1:
            return None
        
        ema_field_fast = EMA_FIELD_MAP.get(self.fast_period)
        ema_field_slow = EMA_FIELD_MAP.get(self.slow_period)
        
        current_fast = prev_fast = current_slow = prev_slow = None
        
        if ema_field_fast and ema_field_slow:
            current_fast = market_data.bars[-1].get(ema_field_fast)
            current_slow = market_data.bars[-1].get(ema_field_slow)
            prev_fast = market_data.bars[-2].get(ema_field_fast)
            prev_slow = market_data.bars[-2].get(ema_field_slow)
        
        if (
            current_fast is None
            or current_slow is None
            or prev_fast is None
            or prev_slow is None
        ):
            from app.lib.technical_analysis import calculate_ema

            fast_emas = calculate_ema(market_data.bars, period=self.fast_period)
            slow_emas = calculate_ema(market_data.bars, period=self.slow_period)

            if len(fast_emas) < 2 or len(slow_emas) < 2:
                return None

            current_fast = fast_emas[-1]
            current_slow = slow_emas[-1]
            prev_fast = fast_emas[-2]
            prev_slow = slow_emas[-2]

            if (
                current_fast is None
                or current_slow is None
                or prev_fast is None
                or prev_slow is None
            ):
                return None
        
        # Check for bullish crossover (fast crosses above slow)
        # Previous: fast <= slow, Current: fast > slow
        if prev_fast <= prev_slow and current_fast > current_slow:
            # Ensure minimum distance to avoid whipsaws
            if (current_fast - current_slow) / current_slow < self.min_crossover_distance:
                return None
            
            # Calculate ATR for stop loss
            atr_field = ATR_FIELD_MAP.get(self.atr_period)
            atr = market_data.bars[-1].get(atr_field) if atr_field else None
            if atr is None or atr <= 0:
                from app.lib.technical_analysis import average_true_range

                atr = average_true_range(market_data.bars, period=self.atr_period)

            if atr is None or atr <= 0:
                stop_loss = market_data.price * 0.97  # Fallback to 3% stop
            else:
                stop_loss = market_data.price - (atr * self.stop_atr_multiplier)
            
            logger.info(
                f"📈 EMA Crossover: {ticker} bullish crossover "
                f"(fast={current_fast:.2f}, slow={current_slow:.2f}), "
                f"entry=${market_data.price:.2f}, stop=${stop_loss:.2f}"
            )
            
            return EntryLevel(
                entry_price=market_data.price,
                stop_loss=stop_loss,
                confidence=0.75,
                order_type="market",
                metadata={
                    "fast_ema": current_fast,
                    "slow_ema": current_slow,
                    "atr": atr,
                    "strategy": "ema_crossover"
                }
            )
        
        return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """Update trailing stop and exit on bearish crossover."""
        if not market_data.bars or len(market_data.bars) < self.slow_period + 1:
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
            return StopUpdate(current_stop=current_stop)
        
        ema_field_fast = EMA_FIELD_MAP.get(self.fast_period)
        ema_field_slow = EMA_FIELD_MAP.get(self.slow_period)
        
        current_fast = prev_fast = current_slow = prev_slow = None
        
        if ema_field_fast and ema_field_slow:
            current_fast = market_data.bars[-1].get(ema_field_fast)
            current_slow = market_data.bars[-1].get(ema_field_slow)
            prev_fast = market_data.bars[-2].get(ema_field_fast)
            prev_slow = market_data.bars[-2].get(ema_field_slow)
        
        if (
            current_fast is None
            or current_slow is None
            or prev_fast is None
            or prev_slow is None
        ):
            from app.lib.technical_analysis import calculate_ema

            fast_emas = calculate_ema(market_data.bars, period=self.fast_period)
            slow_emas = calculate_ema(market_data.bars, period=self.slow_period)

            if len(fast_emas) < 2 or len(slow_emas) < 2:
                current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
                return StopUpdate(current_stop=current_stop)

            current_fast = fast_emas[-1]
            current_slow = slow_emas[-1]
            prev_fast = fast_emas[-2]
            prev_slow = slow_emas[-2]

            if (
                current_fast is None
                or current_slow is None
                or prev_fast is None
                or prev_slow is None
            ):
                current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
                return StopUpdate(current_stop=current_stop)
        
        # Exit on bearish crossover (fast crosses below slow)
        if prev_fast >= prev_slow and current_fast < current_slow:
            logger.info(
                f"📉 EMA Crossover: {position.symbol} bearish crossover "
                f"(fast={current_fast:.2f}, slow={current_slow:.2f}), exiting"
            )
            return StopUpdate(
                current_stop=market_data.price * 1.01,  # Force exit
                force_exit=True,
                exit_reason="Bearish EMA crossover"
            )
        
        # Update trailing stop based on ATR
        atr_field = ATR_FIELD_MAP.get(self.atr_period)
        atr = market_data.bars[-1].get(atr_field) if atr_field else None
        if atr is None or atr <= 0:
            from app.lib.technical_analysis import average_true_range

            atr = average_true_range(market_data.bars, period=self.atr_period)

        if atr is None or atr <= 0:
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
        else:
            # Trailing stop: price - (ATR * multiplier)
            new_stop = market_data.price - (atr * self.stop_atr_multiplier)
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
            
            # Only raise stop (never lower it)
            if new_stop > current_stop:
                logger.debug(
                    f"📈 Updating {position.symbol} trailing stop: "
                    f"${current_stop:.2f} → ${new_stop:.2f}"
                )
                current_stop = new_stop
        
        return StopUpdate(current_stop=current_stop)
