"""
Monkey Throwing Darts Strategy

Simple random trading strategy for testing the execution engine.
Randomly selects stocks and buys them with basic stop loss.
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
    """Random stock selection strategy for testing."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.entry_probability = config.get("entry_probability", 0.1)  # 10% chance
        self.stop_loss_percent = config.get("stop_loss_percent", 2.0)  # 2% stop
        self.random_seed = config.get("random_seed")
        
        if self.random_seed:
            random.seed(self.random_seed)
    
    @property
    def id(self) -> str:
        return "monkey_darts"
    
    @property
    def name(self) -> str:
        return "Monkey Throwing Darts"
    
    @property
    def description(self) -> str:
        return (
            f"Random stock selection strategy. "
            f"{self.entry_probability*100:.0f}% chance to buy at current price. "
            f"{self.stop_loss_percent:.0f}% stop loss. "
            "Lets engine's 50% profit protection handle exits."
        )
    
    @property
    def requires_setup(self) -> bool:
        return False
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Randomly decide to buy at current price."""
        if random.random() < self.entry_probability:
            entry_price = market_data.price
            stop_loss = entry_price * (1 - self.stop_loss_percent / 100)
            
            logger.info(f"🎲 Monkey Darts: randomly selected {ticker} @ ${entry_price:.2f}")
            
            return EntryLevel(
                entry_price=entry_price,
                stop_loss=stop_loss,
                confidence=1.0,
                order_type="market",
                metadata={"method": "random"}
            )
        
        return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """Don't touch stop - let engine's 50% profit protection do the work."""
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
        return StopUpdate(current_stop=current_stop)

