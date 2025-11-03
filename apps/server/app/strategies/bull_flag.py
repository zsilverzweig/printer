"""
Bull Flag Pattern Strategy

Day trading strategy that identifies bull flag patterns:
- 2-3 green candles (uptrend)
- 2-3 red candles pullback (flag)
- Breakout above flag high
"""

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)

logger = logging.getLogger(__name__)


class BullFlagStrategy(ExecutionStrategy):
    """Bull Flag pattern day trading strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.pullback_ratio = config.get("pullback_ratio", 0.25)  # Max 1/4 pullback
        self.min_green_candles = config.get("min_green_candles", 2)
        self.max_green_candles = config.get("max_green_candles", 3)
        self.breakeven_time_minutes = config.get("breakeven_time_minutes", 1.0)
    
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
            "2-3 green candles followed by shallow pullback, then breakout. "
            "Typical hold time: 1-3 minutes."
        )
    
    @property
    def requires_setup(self) -> bool:
        return True  # Uses setup to detect patterns
    
    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        """
        Detect which tickers have bull flag patterns.
        Returns filtered list of tickers with patterns.
        """
        filtered = []
        
        for ticker in tickers:
            data = market_data.get(ticker)
            if not data or not data.bars:
                continue
            
            # Simple pattern detection
            bars = data.bars[-10:] if len(data.bars) > 10 else data.bars
            
            if len(bars) < 5:
                continue
            
            # Check for uptrend followed by pullback
            # This is simplified - real implementation would be more sophisticated
            recent_5 = bars[-5:]
            has_uptrend = recent_5[0]['close'] < recent_5[2]['close']
            has_pullback = recent_5[2]['close'] > recent_5[4]['close']
            
            if has_uptrend and has_pullback:
                filtered.append(ticker)
                logger.debug(f"🚩 Bull flag pattern detected in {ticker}")
        
        logger.info(f"🚩 Bull flag setup: {len(filtered)} pattern(s) found from {len(tickers)} tickers")
        return filtered
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Set entry at breakout level above recent high."""
        if not market_data.bars or len(market_data.bars) < 5:
            return None
        
        # Find recent high (flag high)
        recent_bars = market_data.bars[-5:]
        flag_high = max(bar['high'] for bar in recent_bars)
        flag_low = min(bar['low'] for bar in recent_bars)
        
        # Entry slightly above flag high
        entry_price = flag_high * 1.001
        stop_loss = flag_low
        
        logger.info(
            f"🚩 Bull flag entry for {ticker}: entry=${entry_price:.2f}, "
            f"stop=${stop_loss:.2f} (flag: ${flag_low:.2f}-${flag_high:.2f})"
        )
        
        return EntryLevel(
            entry_price=entry_price,
            stop_loss=stop_loss,
            confidence=0.8,
            order_type="limit",
            metadata={
                "flag_high": flag_high,
                "flag_low": flag_low,
                "pattern": "bull_flag"
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Raise stop to breakeven after configured time.
        Engine handles 50% profit protection on top of this.
        """
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
        time_in_position = position.time_in_position_minutes()
        
        # Move to breakeven after breakeven_time_minutes
        if time_in_position > self.breakeven_time_minutes:
            # Raise stop to at least breakeven
            breakeven_stop = position.entry_price
            if breakeven_stop > current_stop:
                logger.debug(
                    f"🚩 Moving {position.symbol} stop to breakeven: "
                    f"${current_stop:.2f} → ${breakeven_stop:.2f}"
                )
                return StopUpdate(current_stop=breakeven_stop)
        
        return StopUpdate(current_stop=current_stop)

