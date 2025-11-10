"""
Buy The Screen Strategy

Automatically buys every ticker that passes the screener and applies
simple risk management rules:

- Enter immediately at market
- Initial stop loss: 3% below entry (configurable)
- Take 50% profits at +6% (configurable) via scale-out
- Exit remaining position at +10% (configurable)
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


class BuyTheScreenStrategy(ExecutionStrategy):
    """Rule-based strategy that buys every screener candidate."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        self.stop_loss_percent: float = float(config.get("stop_loss_percent", 3.0))
        self.first_target_gain_percent: float = float(config.get("first_target_gain_percent", 6.0))
        self.final_target_gain_percent: float = float(config.get("final_target_gain_percent", 10.0))
        self.first_scale_out_percent: float = float(config.get("first_scale_out_percent", 50.0))
        self.entry_confidence: float = float(config.get("entry_confidence", 1.0))
    
    @property
    def id(self) -> str:
        return "buy_the_screen"
    
    @property
    def name(self) -> str:
        return "Buy The Screen"
    
    @property
    def description(self) -> str:
        return (
            "Automatically buys every screener candidate with a 3% initial stop, "
            "takes half off at +6%, and exits the rest at +10%."
        )
    
    @property
    def strategy_type(self) -> str:
        return "rule-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "intraday"
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        for key in ("stop_loss_percent", "first_target_gain_percent", "final_target_gain_percent", "first_scale_out_percent"):
            value = float(config.get(key, getattr(self, key, 0.0)))
            if value <= 0:
                raise ValueError(f"{key} must be positive, received {value}")
        return True
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """Enter immediately for every screener candidate."""
        price = market_data.price
        if price is None or price <= 0:
            logger.warning(f"[BTS] Skipping {ticker}: invalid price {price}")
            return None
        
        stop_loss = price * (1 - self.stop_loss_percent / 100.0)
        
        logger.info(
            f"[BTS] Entry level set for {ticker}: price=${price:.2f}, "
            f"stop=${stop_loss:.2f} ({self.stop_loss_percent:.1f}% risk)"
        )
        
        initial_state = {
            "buy_the_screen": {
                "stop_loss_percent": self.stop_loss_percent,
                "first_target_percent": self.first_target_gain_percent,
                "final_target_percent": self.final_target_gain_percent,
                "first_scale_out_percent": self.first_scale_out_percent,
                "partial_6_complete": False,
                "final_target_complete": False,
                "last_scale_out_price": None,
            }
        }
        
        return EntryLevel(
            entry_price=price,
            stop_loss=stop_loss,
            confidence=self.entry_confidence,
            order_type="market",
            metadata={
                "initial_management_state": initial_state
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """Manage stop, partial exits, and final exit targets."""
        current_price = market_data.price
        if current_price is None or current_price <= 0:
            # Fallback to initial stop if price unavailable
            fallback_stop = position.entry_price * (1 - self.stop_loss_percent / 100.0)
            return StopUpdate(
                current_stop=fallback_stop,
                metadata={
                    "buy_the_screen": {
                        "stop_loss_percent": self.stop_loss_percent,
                        "first_target_percent": self.first_target_gain_percent,
                        "final_target_percent": self.final_target_gain_percent,
                        "first_scale_out_percent": self.first_scale_out_percent,
                        "partial_6_complete": False,
                        "final_target_complete": False,
                        "last_scale_out_price": None,
                    },
                    "current_stop": fallback_stop,
                }
            )
        
        # Load persisted state
        state: Dict[str, Any] = dict(position.strategy_state.get("buy_the_screen", {}))
        partial_complete = bool(state.get("partial_6_complete", False))
        final_complete = bool(state.get("final_target_complete", False))
        stop_loss_percent = float(state.get("stop_loss_percent", self.stop_loss_percent))
        first_target_percent = float(state.get("first_target_percent", self.first_target_gain_percent))
        final_target_percent = float(state.get("final_target_percent", self.final_target_gain_percent))
        first_scale_out_percent = float(state.get("first_scale_out_percent", self.first_scale_out_percent))
        last_scale_out_price = state.get("last_scale_out_price")
        
        base_stop = position.entry_price * (1 - stop_loss_percent / 100.0)
        existing_stop = float(position.strategy_state.get("current_stop", base_stop))
        
        gain_percent = ((current_price - position.entry_price) / position.entry_price) * 100.0
        
        metadata_state = {
            "buy_the_screen": {
                "stop_loss_percent": stop_loss_percent,
                "first_target_percent": first_target_percent,
                "final_target_percent": final_target_percent,
                "first_scale_out_percent": first_scale_out_percent,
                "partial_6_complete": partial_complete,
                "final_target_complete": final_complete,
                "last_scale_out_price": last_scale_out_price,
            }
        }
        
        logger.debug(
            f"[BTS] Managing {position.symbol}: price=${current_price:.2f}, "
            f"PnL={gain_percent:.2f}%, partial_done={partial_complete}, final_done={final_complete}"
        )
        
        # Final exit at target gain
        if gain_percent >= final_target_percent and not final_complete:
            metadata_state["buy_the_screen"]["final_target_complete"] = True
            metadata_state["buy_the_screen"]["last_scale_out_price"] = current_price
            metadata_state["current_stop"] = max(existing_stop, position.entry_price)
            
            logger.info(
                f"[BTS] Final target hit for {position.symbol}: "
                f"+{gain_percent:.2f}% → exit remaining position"
            )
            
            return StopUpdate(
                current_stop=max(existing_stop, position.entry_price),
                force_exit=True,
                exit_reason=f"Final target {final_target_percent:.1f}% hit",
                metadata=metadata_state,
            )
        
        # Partial exit at first target
        if gain_percent >= first_target_percent and not partial_complete:
            metadata_state["buy_the_screen"]["partial_6_complete"] = True
            metadata_state["buy_the_screen"]["last_scale_out_price"] = current_price
            updated_stop = max(existing_stop, position.entry_price)
            metadata_state["current_stop"] = updated_stop
            
            logger.info(
                f"[BTS] Scaling out {first_scale_out_percent:.0f}% of {position.symbol}: "
                f"+{gain_percent:.2f}% reached first target"
            )
            
            return StopUpdate(
                current_stop=updated_stop,
                scale_out_percent=first_scale_out_percent,
                exit_reason=f"Scale out {first_scale_out_percent:.0f}% at +{first_target_percent:.1f}%",
                metadata=metadata_state,
            )
        
        # Default stop management
        target_stop = max(base_stop, existing_stop)
        if partial_complete:
            target_stop = max(target_stop, position.entry_price)
        metadata_state["current_stop"] = target_stop
        
        return StopUpdate(
            current_stop=target_stop,
            metadata=metadata_state,
        )

