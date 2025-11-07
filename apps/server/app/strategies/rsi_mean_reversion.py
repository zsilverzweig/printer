"""
RSI Mean Reversion Strategy

Simple mean reversion strategy that:
- Buys when RSI drops below oversold threshold (default: 30)
- Exits when RSI recovers above neutral level (default: 50)
- Uses ATR-based stop loss for risk management
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

RSI_FIELD_MAP = {
    14: "rsi_14",
}
ATR_FIELD_MAP = {
    14: "atr_14",
}


class RSIMeanReversionStrategy(ExecutionStrategy):
    """RSI mean reversion trading strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.rsi_period = config.get("rsi_period", 14)
        self.oversold_level = config.get("oversold_level", 30.0)  # Buy when RSI < 30
        self.exit_level = config.get("exit_level", 50.0)  # Exit when RSI > 50
        self.stop_atr_multiplier = config.get("stop_atr_multiplier", 2.0)  # Stop = entry - 2*ATR
        self.atr_period = config.get("atr_period", 14)
    
    @property
    def id(self) -> str:
        return "rsi_mean_reversion"
    
    @property
    def name(self) -> str:
        return "RSI Mean Reversion"
    
    @property
    def description(self) -> str:
        return (
            f"Mean reversion strategy using RSI. "
            f"Buys when RSI drops below {self.oversold_level} (oversold). "
            f"Exits when RSI recovers above {self.exit_level}. "
            f"Uses {self.stop_atr_multiplier}x ATR stop loss."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "5-30 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Enter when RSI is oversold."""
        if not market_data.bars or len(market_data.bars) < self.rsi_period + 1:
            return None
        
        rsi_field = RSI_FIELD_MAP.get(self.rsi_period)
        current_rsi = market_data.bars[-1].get(rsi_field) if rsi_field else None
        
        if current_rsi is None:
            from app.lib.technical_analysis import calculate_rsi

            rsi_values = calculate_rsi(market_data.bars, period=self.rsi_period)
            if not rsi_values:
                return None
            current_rsi = rsi_values[-1]
            if current_rsi is None:
                return None
        
        # Check if oversold
        if current_rsi >= self.oversold_level:
            return None  # Not oversold yet
        
        # Calculate ATR for stop loss
        atr_field = ATR_FIELD_MAP.get(self.atr_period)
        atr = market_data.bars[-1].get(atr_field) if atr_field else None
        if atr is None or atr <= 0:
            from app.lib.technical_analysis import average_true_range

            atr = average_true_range(market_data.bars, period=self.atr_period)

        if atr is None or atr <= 0:
            # Fallback to 2% stop if ATR unavailable
            stop_loss = market_data.price * 0.98
        else:
            stop_loss = market_data.price - (atr * self.stop_atr_multiplier)
        
        logger.info(
            f"📉 RSI Mean Reversion: {ticker} oversold (RSI={current_rsi:.1f}), "
            f"entry=${market_data.price:.2f}, stop=${stop_loss:.2f}"
        )
        
        return EntryLevel(
            entry_price=market_data.price,
            stop_loss=stop_loss,
            confidence=min(1.0, (self.oversold_level - current_rsi) / 10.0),  # More oversold = higher confidence
            order_type="market",
            metadata={
                "rsi": current_rsi,
                "atr": atr,
                "strategy": "rsi_mean_reversion"
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """Exit when RSI recovers above exit level."""
        if not market_data.bars or len(market_data.bars) < self.rsi_period + 1:
            # Keep current stop if no data
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
            return StopUpdate(current_stop=current_stop)
        
        rsi_field = RSI_FIELD_MAP.get(self.rsi_period)
        current_rsi = market_data.bars[-1].get(rsi_field) if rsi_field else None
        
        if current_rsi is None:
            from app.lib.technical_analysis import calculate_rsi

            rsi_values = calculate_rsi(market_data.bars, period=self.rsi_period)
            if not rsi_values:
                current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
                return StopUpdate(current_stop=current_stop)
            current_rsi = rsi_values[-1]
            if current_rsi is None:
                current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
                return StopUpdate(current_stop=current_stop)
        
        # Exit if RSI recovered above exit level
        if current_rsi > self.exit_level:
            logger.info(
                f"📈 RSI Mean Reversion: {position.symbol} RSI recovered to {current_rsi:.1f}, "
                f"exiting position"
            )
            return StopUpdate(
                current_stop=market_data.price * 1.01,  # Force exit (stop above current price)
                force_exit=True,
                exit_reason=f"RSI recovered to {current_rsi:.1f}"
            )
        
        # Otherwise, maintain stop or raise to breakeven if profitable
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
        
        # Raise to breakeven if we're up 1%
        if market_data.price > position.entry_price * 1.01:
            breakeven_stop = position.entry_price
            if breakeven_stop > current_stop:
                logger.debug(
                    f"📉 Moving {position.symbol} stop to breakeven: "
                    f"${current_stop:.2f} → ${breakeven_stop:.2f}"
                )
                return StopUpdate(current_stop=breakeven_stop)
        
        return StopUpdate(current_stop=current_stop)
