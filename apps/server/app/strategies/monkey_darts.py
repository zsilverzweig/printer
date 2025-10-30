"""
Monkey Throwing Darts Strategy

A simple random trading strategy for testing the execution engine:
- Randomly select a stock from screener results
- Buy with limit order at current price
- Hold for exactly 1 minute
- Sell
- Repeat

This strategy is intentionally simple to test the plumbing without
complex entry/exit logic.
"""

import random
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


class MonkeyDartsStrategy(ExecutionStrategy):
    """Random stock selection strategy for testing."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        # Configuration parameters with defaults
        self.hold_time_seconds = config.get("hold_time_seconds", 60)  # 1 minute default
        self.random_seed = config.get("random_seed")  # Optional for reproducibility
        
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
            "Random stock selection strategy for testing. "
            "Randomly picks a stock, buys it with a limit order at current price, "
            "holds for 1 minute, then sells. "
            "This is a simple test strategy to verify the execution engine works."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"  # Well, "random-based" but we'll call it math
    
    @property
    def expected_timeframe(self) -> str:
        return "1 minute"
    
    @property
    def required_indicators(self) -> List[str]:
        return []  # No indicators needed
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "hold_time_seconds": {
                    "type": "integer",
                    "minimum": 30,
                    "maximum": 300,
                    "default": 60,
                    "description": "How long to hold each position (seconds)",
                },
                "random_seed": {
                    "type": "integer",
                    "description": "Optional random seed for reproducibility",
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
        Random selection: pick ONE candidate if we have no active positions OR pending orders.
        
        Monkey Darts only trades one position at a time, so:
        - If we have an active position OR pending order, return empty list (wait for it to close)
        - Otherwise, randomly pick one candidate from the list
        
        Note: All volume/price filtering should already be done by ScreeningCriteria.
        We accept any candidates that made it through the screener.
        """
        logger.info(
            f"🐵 Monkey selection called: "
            f"candidates={len(candidates)}, active_positions={active_position_count}, "
            f"pending_orders={active_order_count}"
        )
        
        # Only pick if we don't have an active position OR pending order
        if active_position_count > 0:
            logger.info(f"🐵 Monkey waiting (have {active_position_count} active position)")
            return []
        
        if active_order_count > 0:
            logger.info(f"🐵 Monkey waiting (have {active_order_count} pending order)")
            return []
        
        # Need candidates to pick from
        if not candidates:
            logger.info("🐵 Monkey has no candidates to choose from")
            return []
        
        # Randomly pick one candidate
        selected = random.choice(candidates)
        symbol = selected.get("ticker")
        
        if not symbol:
            logger.warning("🐵 Monkey selected candidate with no ticker")
            return []
        
        logger.info(f"🐵 Monkey threw dart at: {symbol} (from {len(candidates)} candidates)")
        return [symbol]
    
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """
        Always enter! That's the monkey way.
        
        We're called with a symbol, so if we're being asked, we should enter.
        Uses limit orders at the current price.
        """
        logger.info(f"🐵 Monkey selecting: {symbol} @ {market_data.price} (limit order)")
        
        return EntrySignal(
            should_enter=True,
            entry_price=market_data.price,
            stop_loss=None,  # No stop loss, we rely on time exit
            take_profit=None,  # No take profit, we rely on time exit
            confidence=1.0,  # 100% confident in random selection!
            reason="random_dart_throw",
            order_type="limit",  # Use limit orders
            limit_price=market_data.price,  # Set limit at current price
            metadata={
                "entry_time": datetime.now().isoformat(),
                "hold_time_seconds": self.hold_time_seconds,
            }
        )
    
    async def should_exit(
        self, 
        position: PositionContext, 
        market_data: MarketData
    ) -> ExitSignal:
        """
        Exit after hold time expires.
        """
        # Calculate time in position
        time_in_position = position.time_in_position_minutes() * 60  # Convert to seconds
        
        # Exit after hold time
        if time_in_position >= self.hold_time_seconds:
            pnl = position.unrealized_pnl
            pnl_pct = position.unrealized_pnl_percent
            
            logger.info(
                f"🐵 Monkey exit time! {position.symbol} held for {time_in_position:.0f}s, "
                f"P&L: ${pnl:.2f} ({pnl_pct:+.2f}%)"
            )
            
            return ExitSignal(
                should_exit=True,
                exit_price=market_data.price,
                reason="time_limit_reached",
            )
        
        # Not time yet
        return ExitSignal(should_exit=False)
    
    async def should_scale_in(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """Monkeys don't scale in - one dart at a time!"""
        return None
    
    async def should_scale_out(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """Monkeys don't scale out - all or nothing!"""
        return None
    
    async def position_sizing(
        self, 
        signal: EntrySignal,
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """
        Use the configured size per trade.
        
        Monkeys use consistent bet sizes.
        """
        size_per_trade = risk_params.get("size_per_trade", 1000.0)
        max_bet_percent = risk_params.get("max_bet_percent")
        min_bet_percent = risk_params.get("min_bet_percent")
        
        logger.info(
            f"🐵 Monkey position sizing inputs: "
            f"fund_balance=${fund_balance:.2f}, "
            f"size_per_trade=${size_per_trade:.2f}, "
            f"max_bet_percent={max_bet_percent}, "
            f"min_bet_percent={min_bet_percent}"
        )
        
        # Use configured size
        position_size = size_per_trade
        logger.info(f"🐵 Initial position size (from size_per_trade): ${position_size:.2f}")
        
        # If max_bet_percent is set and > 0, respect it
        # Treat 0.0 as "no limit" just like None
        if max_bet_percent is not None and max_bet_percent > 0:
            max_position = fund_balance * (max_bet_percent / 100.0)
            logger.info(
                f"🐵 max_bet_percent is set: {max_bet_percent}% of ${fund_balance:.2f} = ${max_position:.2f}"
            )
            
            old_size = position_size
            position_size = min(position_size, max_position)
            
            if position_size != old_size:
                logger.info(
                    f"🐵 Position size LIMITED by max_bet_percent: "
                    f"${old_size:.2f} → ${position_size:.2f}"
                )
            else:
                logger.info(f"🐵 Position size unchanged (within max_bet_percent limit)")
        else:
            if max_bet_percent == 0.0:
                logger.info("🐵 max_bet_percent is 0.0 - treating as no limit")
            else:
                logger.info("🐵 No max_bet_percent limit set")
        
        # If min_bet_percent is set and > 0, enforce minimum position size
        # If position is below minimum, return 0 to reject the trade
        if min_bet_percent is not None and min_bet_percent > 0:
            min_position = fund_balance * (min_bet_percent / 100.0)
            logger.info(
                f"🐵 min_bet_percent is set: {min_bet_percent}% of ${fund_balance:.2f} = ${min_position:.2f}"
            )
            
            if position_size < min_position:
                logger.info(
                    f"🐵 Position size ${position_size:.2f} is below minimum ${min_position:.2f} - "
                    f"rejecting trade (returning 0)"
                )
                return 0.0
            else:
                logger.info(f"🐵 Position size meets minimum requirement")
        else:
            if min_bet_percent == 0.0:
                logger.info("🐵 min_bet_percent is 0.0 - treating as no limit")
            else:
                logger.info("🐵 No min_bet_percent limit set")
        
        logger.info(f"🐵 Final monkey bet size: ${position_size:.2f}")
        
        return position_size
    

