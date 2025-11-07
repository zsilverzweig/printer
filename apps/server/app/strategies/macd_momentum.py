"""
MACD Momentum Strategy

Momentum strategy that:
- Buys when MACD line crosses above signal line (bullish crossover)
- Requires positive histogram for confirmation
- Uses ATR-based stop loss
- Exits on bearish crossover or negative momentum
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


class MACDMomentumStrategy(ExecutionStrategy):
    """MACD momentum trading strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.fast_period = config.get("fast_period", 12)
        self.slow_period = config.get("slow_period", 26)
        self.signal_period = config.get("signal_period", 9)
        self.stop_atr_multiplier = config.get("stop_atr_multiplier", 2.0)
        self.atr_period = config.get("atr_period", 14)
        self.require_positive_momentum = config.get("require_positive_momentum", True)  # Require MACD > 0
    
    @property
    def id(self) -> str:
        return "macd_momentum"
    
    @property
    def name(self) -> str:
        return "MACD Momentum"
    
    @property
    def description(self) -> str:
        return (
            f"Momentum strategy using MACD. "
            f"Buys when MACD ({self.fast_period},{self.slow_period}) crosses above signal ({self.signal_period}). "
            f"{'Requires positive MACD.' if self.require_positive_momentum else 'Any momentum allowed.'} "
            f"Uses {self.stop_atr_multiplier}x ATR stop loss."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "15-90 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Enter on bullish MACD crossover with positive momentum."""
        if not market_data.bars or len(market_data.bars) < self.slow_period + self.signal_period:
            return None
        
        current_bar = market_data.bars[-1]
        prev_bar = market_data.bars[-2]
        
        current_macd = current_bar.get("macd_line")
        current_signal = current_bar.get("macd_signal")
        current_histogram = current_bar.get("macd_histogram")
        prev_macd = prev_bar.get("macd_line")
        prev_signal = prev_bar.get("macd_signal")
        
        if current_macd is None or current_signal is None or current_histogram is None:
            return None
        if prev_macd is None or prev_signal is None:
            return None
        
        # Check for bullish crossover (MACD crosses above signal)
        # Previous: MACD <= signal, Current: MACD > signal
        if prev_macd <= prev_signal and current_macd > current_signal:
            # Optional: require positive MACD for stronger momentum
            if self.require_positive_momentum and current_macd <= 0:
                return None
            
            # Require positive histogram for confirmation
            if current_histogram <= 0:
                return None
            
            # Calculate ATR for stop loss
            atr = current_bar.get("atr_14")
            if atr is None or atr <= 0:
                stop_loss = market_data.price * 0.97  # Fallback to 3% stop
            else:
                stop_loss = market_data.price - (atr * self.stop_atr_multiplier)
            
            logger.info(
                f"📈 MACD Momentum: {ticker} bullish crossover "
                f"(MACD={current_macd:.3f}, signal={current_signal:.3f}, hist={current_histogram:.3f}), "
                f"entry=${market_data.price:.2f}, stop=${stop_loss:.2f}"
            )
            
            return EntryLevel(
                entry_price=market_data.price,
                stop_loss=stop_loss,
                confidence=0.8,
                order_type="market",
                metadata={
                    "macd": current_macd,
                    "signal": current_signal,
                    "histogram": current_histogram,
                    "atr": atr,
                    "strategy": "macd_momentum"
                }
            )
        
        return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """Exit on bearish crossover or negative momentum."""
        if not market_data.bars or len(market_data.bars) < self.slow_period + self.signal_period:
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
            return StopUpdate(current_stop=current_stop)
        
        current_bar = market_data.bars[-1]
        prev_bar = market_data.bars[-2]
        
        current_macd = current_bar.get("macd_line")
        current_signal = current_bar.get("macd_signal")
        current_histogram = current_bar.get("macd_histogram")
        prev_macd = prev_bar.get("macd_line")
        prev_signal = prev_bar.get("macd_signal")
        
        if current_macd is None or current_signal is None or current_histogram is None:
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
            return StopUpdate(current_stop=current_stop)
        if prev_macd is None or prev_signal is None:
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.97)
            return StopUpdate(current_stop=current_stop)
        
        # Exit on bearish crossover (MACD crosses below signal)
        if prev_macd >= prev_signal and current_macd < current_signal:
            logger.info(
                f"📉 MACD Momentum: {position.symbol} bearish crossover "
                f"(MACD={current_macd:.3f}, signal={current_signal:.3f}), exiting"
            )
            return StopUpdate(
                current_stop=market_data.price * 1.01,  # Force exit
                force_exit=True,
                exit_reason="Bearish MACD crossover"
            )
        
        # Exit if momentum turns negative (histogram goes negative)
        if current_histogram < 0:
            logger.info(
                f"📉 MACD Momentum: {position.symbol} momentum turned negative "
                f"(histogram={current_histogram:.3f}), exiting"
            )
            return StopUpdate(
                current_stop=market_data.price * 1.01,  # Force exit
                force_exit=True,
                exit_reason=f"Negative momentum (histogram={current_histogram:.3f})"
            )
        
        # Update trailing stop based on ATR
        atr = current_bar.get("atr_14")
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
