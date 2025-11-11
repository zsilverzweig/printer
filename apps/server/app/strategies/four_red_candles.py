"""
Three Red Candles Strategy

Setup:
- Look for 3 consecutive red 1-minute candles
- Cache the breakout level at the HIGH of the 3rd (last) red candle

Entry:
- Wait for price to cross above the cached breakout level
- Execute market order on breakout

Exit:
- Sell at the next red 1-minute candle close
"""

import logging
from typing import Any, Dict, List, Optional

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.lib.technical_analysis import is_red_candle
from app.services.core.time_context import get_current_time

logger = logging.getLogger(__name__)


class FourRedCandlesStrategy(ExecutionStrategy):
    """Strategy that looks for at least 3 consecutive red 1-minute candles and enters on breakout."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Configuration
        self.stop_loss_percent = config.get("stop_loss_percent", 3.0)  # 3% default stop loss

        # Cache setup analysis results (keyed by ticker)
        self._setup_candidates: Dict[str, Dict[str, Any]] = {}
    
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
            "Sets breakout entry at the high of the 3rd red candle and buys on the break. "
            "Engine subscribes and executes a market order when price crosses above that level. "
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
        return True

    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        """
        Setup phase:
        - Identify tickers with 3 consecutive red 1-minute candles
        - Cache breakout metadata for entry phase
        """
        qualifying_tickers: List[str] = []

        for ticker in tickers:
            snapshot = market_data.get(ticker)

            if not snapshot or not snapshot.bars or len(snapshot.bars) < 3:
                logger.debug(
                    f"🔴 [{ticker}] Setup skipped - insufficient bars "
                    f"({len(snapshot.bars) if snapshot and snapshot.bars else 0})"
                )
                self._setup_candidates.pop(ticker, None)
                continue

            recent_bars = snapshot.bars[-3:]
            if not all(is_red_candle(bar) for bar in recent_bars):
                logger.debug(f"🔴 [{ticker}] Setup failed - last 3 candles not all red")
                self._setup_candidates.pop(ticker, None)
                continue

            last_red_bar = recent_bars[-1]
            last_red_high = last_red_bar.get("high", last_red_bar.get("h", 0.0))
            last_red_open = last_red_bar.get("open", last_red_bar.get("o", 0.0))

            if last_red_high <= 0:
                logger.warning(f"🔴 [{ticker}] Setup failed - invalid breakout high {last_red_high}")
                self._setup_candidates.pop(ticker, None)
                continue

            red_closes = [bar.get("close", bar.get("c", 0.0)) for bar in recent_bars]
            self._setup_candidates[ticker] = {
                "breakout_price": last_red_high,
                "last_red_open": last_red_open,
                "red_closes": red_closes,
                "setup_detected_at": get_current_time().isoformat(),
            }

            qualifying_tickers.append(ticker)
            logger.info(
                f"🔴 [{ticker}] Setup passed - 3 red candles detected. "
                f"Breakout @ ${last_red_high:.2f}"
            )

        return qualifying_tickers
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Entry phase:
        - Expect ticker to have passed setup (cached breakout level)
        - Return entry level when breakout metadata is available
        """
        logger.info(f"🔴 [{ticker}] Entry analysis for breakout above last red candle high...")

        setup_info = self._setup_candidates.get(ticker)
        if not setup_info:
            logger.debug(f"🔴 [{ticker}] Entry skipped - no setup metadata cached")
            return None

        entry_price = setup_info.get("breakout_price")
        last_red_open = setup_info.get("last_red_open")
        red_closes = setup_info.get("red_closes", [])

        if entry_price is None or entry_price <= 0:
            logger.warning(f"🔴 [{ticker}] Entry skipped - invalid breakout price {entry_price}")
            self._setup_candidates.pop(ticker, None)
            return None

        stop_loss = entry_price * (1 - self.stop_loss_percent / 100)
        current_price = market_data.price

        last_red_open_display = (
            f"${last_red_open:.2f}" if isinstance(last_red_open, (int, float)) else str(last_red_open)
        )

        logger.info(
            f"🔴 [{ticker}] ✅ Breakout level ready. "
            f"Red closes: {[f'${c:.2f}' for c in red_closes]}, "
            f"Breakout (3rd high)=${entry_price:.2f}, "
            f"3rd open={last_red_open_display}, "
            f"Current=${current_price:.2f}, Stop=${stop_loss:.2f}"
        )

        # Remove from cache once entry level is emitted
        self._setup_candidates.pop(ticker, None)

        return EntryLevel(
            entry_price=entry_price,
            stop_loss=stop_loss,
            confidence=0.8,
            order_type="market",
            metadata={
                "strategy": "four_red_candles",
                "red_candle_closes": red_closes,
                "entry_setup": "3_consecutive_red_1min_candles",
                "last_red_open": last_red_open,
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Manage position - exit when price drops below configured stop loss.
        """
        stop_price = position.entry_price * (1 - self.stop_loss_percent / 100)

        current_price = market_data.price if market_data and market_data.price else position.current_price
        position.current_price = current_price
        position.unrealized_pnl = (current_price - position.entry_price) * position.quantity
        position.unrealized_pnl_percent = ((current_price - position.entry_price) / position.entry_price) * 100

        if current_price <= stop_price:
            logger.info(
                f"🔴 [{position.symbol}] STOP LOSS HIT - EXITING! "
                f"Price=${current_price:.2f}, Stop=${stop_price:.2f}, "
                f"P&L=${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:.2f}%)"
            )

            return StopUpdate(
                current_stop=stop_price,
                force_exit=True,
                exit_reason="stop_loss_breach"
            )

        return StopUpdate(current_stop=stop_price)

