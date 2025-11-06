"""
Monkey Throwing Darts Strategy

Simple random trading strategy for testing the execution engine.
Randomly selects stocks from screener and buys them with basic stop loss.

Designed to exercise the full ticker lifecycle:
- screened: Ticker passes screener filters
- setup: Randomly selected from screened tickers
- entered: Entry level created
- filled: Order filled
- exited: Position closed
"""

import random
import logging
from typing import Any, Dict, List, Optional

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)

logger = logging.getLogger(__name__)


class MonkeyDartsStrategy(ExecutionStrategy):
    """Random stock selection strategy for testing lifecycle stages."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Setup phase: probability a ticker passes setup (from screened -> setup)
        self.setup_probability = config.get("setup_probability", 0.2)  # 20% pass setup
        
        # Entry phase: probability to create entry level (from setup -> entered)
        # This allows us to see tickers in "setup" state that haven't gotten entries yet
        self.entry_probability = config.get("entry_probability", 0.5)  # 50% of setup-passers get entries
        
        self.stop_loss_percent = config.get("stop_loss_percent", 10.0)  # 10% stop (10% of position size)
        self.random_seed = config.get("random_seed")
        
        if self.random_seed:
            random.seed(self.random_seed)
            logger.info(f"🎲 Monkey Darts: Using random seed {self.random_seed} for deterministic selection")
    
    @property
    def id(self) -> str:
        return "monkey_darts"
    
    @property
    def name(self) -> str:
        return "Monkey Throwing Darts"
    
    @property
    def description(self) -> str:
        return (
            f"Random stock selection strategy for lifecycle testing. "
            f"{self.setup_probability*100:.0f}% of screened tickers pass setup phase. "
            f"{self.entry_probability*100:.0f}% of setup-passers get entry levels. "
            f"{self.stop_loss_percent:.0f}% stop loss (10% of position size). "
            "Lets engine's 50% profit protection handle exits."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "random"
    
    @property
    def requires_setup(self) -> bool:
        return True  # Enable setup phase to exercise full lifecycle
    
    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        """
        Setup phase: Randomly filter tickers from screener.
        
        This exercises the lifecycle transition: screened -> setup
        """
        if not tickers:
            logger.debug("🎲 [SETUP] No tickers from screener")
            return []
        
        # Randomly select tickers that pass setup
        passed = []
        for ticker in tickers:
            if random.random() < self.setup_probability:
                passed.append(ticker)
                snapshot = market_data.get(ticker)
                price = snapshot.price if snapshot else "N/A"
                logger.info(
                    f"🎲 [SETUP] ✓ {ticker} @ ${price} - Randomly selected for entry analysis "
                    f"(lifecycle: screened -> setup)"
                )
            else:
                logger.debug(
                    f"🎲 [SETUP] ✗ {ticker} - Randomly filtered out "
                    f"(lifecycle: screened -> removed)"
                )
        
        logger.info(
            f"🎲 [SETUP] Phase complete: {len(passed)}/{len(tickers)} tickers passed "
            f"({len(passed)/len(tickers)*100:.1f}%)"
        )
        
        return passed
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Entry phase: Randomly decide whether to create entry level for ticker that passed setup.
        
        This exercises the lifecycle transition: setup -> entered
        Some tickers will remain in "setup" state without getting entries, which is useful for debugging.
        """
        # Randomly decide if this setup-passer gets an entry level
        if random.random() < self.entry_probability:
            entry_price = market_data.price
            stop_loss = entry_price * (1 - self.stop_loss_percent / 100)
            
            logger.info(
                f"🎲 [ENTRY] ✓ {ticker} @ ${entry_price:.2f} (stop: ${stop_loss:.2f}) - "
                f"Entry level created (lifecycle: setup -> entered)"
            )
            
            return EntryLevel(
                entry_price=entry_price,
                stop_loss=stop_loss,
                confidence=1.0,
                order_type="market",
                metadata={
                    "method": "random",
                    "setup_probability": self.setup_probability,
                    "entry_probability": self.entry_probability,
                    "random_seed": self.random_seed
                }
            )
        else:
            logger.debug(
                f"🎲 [ENTRY] ✗ {ticker} @ ${market_data.price:.2f} - "
                f"Randomly skipped (lifecycle: setup -> stays in setup, no entry yet)"
            )
            return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Position management: Don't touch stop - let engine's 50% profit protection do the work.
        
        When position is closed, lifecycle transitions: filled -> exited
        """
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
        return StopUpdate(current_stop=current_stop)

