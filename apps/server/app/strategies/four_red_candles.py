"""
Three Red Candles Strategy

Entry Setup:
- Look for 3 consecutive red 1-minute candles
- Set entry price to the open of the 3rd (last) red candle
- Engine subscribes to ticker and executes buy order when price crosses above entry

Exit:
- Sell at the next red 1-minute candle close
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.lib.technical_analysis import is_red_candle

logger = logging.getLogger(__name__)


class FourRedCandlesStrategy(ExecutionStrategy):
    """Strategy that looks for 3 consecutive red 1-minute candles and enters on breakout."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Configuration
        self.stop_loss_percent = config.get("stop_loss_percent", 2.0)  # 2% stop loss
        self.min_lookback_1min = config.get("min_lookback_1min", 10)  # Look back 10 1-min bars for exit
    
    @property
    def id(self) -> str:
        return "four_red_candles"  # Keep same ID for backward compatibility
    
    @property
    def name(self) -> str:
        return "Three Red Candles"
    
    @property
    def description(self) -> str:
        return (
            "Looks for 3 consecutive red 1-minute candles. "
            "Sets entry at the open of the 3rd red candle. "
            "Engine subscribes and executes buy when price crosses above entry. "
            "Exits at the next red 1-minute candle close."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "1-5 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False  # No setup phase needed - directly analyze entry
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Analyze ticker for 3 consecutive red 1-minute candles.
        
        Entry logic:
        1. Get 1-minute bars
        2. Look for 3 consecutive red 1-minute candles in the last 3 bars
        3. Set entry price to OPEN of the 3rd (last) red candle
        4. Return EntryLevel - engine will subscribe and execute when price crosses above entry
        """
        logger.info(f"🔴 [{ticker}] Analyzing for 3 red candles setup...")
        
        if not market_data.bars or len(market_data.bars) < 3:
            logger.debug(f"🔴 [{ticker}] Insufficient bars ({len(market_data.bars) if market_data.bars else 0})")
            return None
        
        # Get the last 3 1-minute bars
        recent_bars = market_data.bars[-3:]
        
        # Check if all 3 are red candles
        all_red = all(is_red_candle(bar) for bar in recent_bars)
        
        if not all_red:
            logger.debug(f"🔴 [{ticker}] Last 3 1-minute candles are not all red")
            return None
        
        # Found 3 consecutive red candles!
        # Entry price is the OPEN of the 3rd (last) red candle
        last_red_bar = recent_bars[-1]
        entry_price = last_red_bar.get('open', last_red_bar.get('o', 0))
        
        if entry_price <= 0:
            logger.warning(f"🔴 [{ticker}] Invalid entry price: {entry_price}")
            return None
        
        # Calculate stop loss (2% below entry)
        stop_loss = entry_price * (1 - self.stop_loss_percent / 100)
        
        # Get the closes of the 3 red candles for logging
        red_closes = [bar.get('close', bar.get('c', 0)) for bar in recent_bars]
        last_red_open = last_red_bar.get('open', last_red_bar.get('o', 0))
        current_price = market_data.price
        
        logger.info(
            f"🔴 [{ticker}] ✅ 3 RED CANDLES DETECTED! "
            f"Red closes: {[f'${c:.2f}' for c in red_closes]}, "
            f"Entry (3rd open)=${entry_price:.2f}, Current=${current_price:.2f}, Stop=${stop_loss:.2f}"
        )
        
        return EntryLevel(
            entry_price=entry_price,
            stop_loss=stop_loss,
            confidence=0.8,
            order_type="market",  # Market order - execute immediately since price is above entry
            metadata={
                "strategy": "four_red_candles",
                "red_candle_closes": red_closes,
                "entry_setup": "3_consecutive_red_1min_candles",
                "entry_at_3rd_open": last_red_open
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Manage position - exit on next red 1-minute candle close.
        
        Exit logic:
        - Monitor 1-minute candles
        - When a red 1-minute candle closes, trigger exit
        """
        # Get 1-minute bars to check for red candle
        if not market_data.bars or len(market_data.bars) < 2:
            # Not enough data yet, keep current stop
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
            return StopUpdate(current_stop=current_stop)
        
        # Get the most recent completed 1-minute candle
        # The last bar should be the most recent completed candle
        recent_bars = market_data.bars[-self.min_lookback_1min:] if len(market_data.bars) >= self.min_lookback_1min else market_data.bars
        latest_bar = recent_bars[-1]
        
        # Check if latest candle is red
        if is_red_candle(latest_bar):
            # Red candle detected - exit position
            logger.info(
                f"🔴 [{position.symbol}] RED 1-MINUTE CANDLE DETECTED - EXITING! "
                f"Close=${latest_bar.get('close', latest_bar.get('c', 0)):.2f}, "
                f"P&L=${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:.2f}%)"
            )
            
            # Force exit
            return StopUpdate(
                current_stop=position.current_price,  # Set stop at current price to trigger exit
                force_exit=True,
                exit_reason="red_1min_candle_close"
            )
        
        # No red candle yet, maintain current stop
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * (1 - self.stop_loss_percent / 100))
        
        return StopUpdate(current_stop=current_stop)

