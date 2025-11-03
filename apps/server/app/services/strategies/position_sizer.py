"""
Position sizing service.

Calculates position size based on Fund configuration and entry confidence.
"""

from typing import Tuple
import logging

logger = logging.getLogger(__name__)


class PositionSizer:
    """Calculate position size based on Fund configuration."""
    
    def calculate_position_size(
        self,
        fund_balance: float,
        size_per_trade: float,
        confidence: float,
        current_price: float,
        min_bet_percent: float = None,
        max_bet_percent: float = None,
    ) -> Tuple[float, int]:
        """
        Calculate position size.
        
        Args:
            fund_balance: Current fund balance
            size_per_trade: Base size per trade from fund config
            confidence: Entry confidence (0-1) from strategy
            current_price: Current price per share
            min_bet_percent: Optional minimum bet as % of balance
            max_bet_percent: Optional maximum bet as % of balance
            
        Returns:
            (dollar_amount, share_quantity)
            
        Logic:
            1. Start with size_per_trade
            2. Multiply by confidence
            3. Apply max_bet_percent cap if set
            4. Apply min_bet_percent floor if set
            5. Convert to whole shares
        """
        # Start with base size
        sized = size_per_trade
        
        # Adjust by confidence
        sized *= confidence
        
        # Apply fund limits
        if max_bet_percent is not None and max_bet_percent > 0:
            max_size = fund_balance * (max_bet_percent / 100.0)
            sized = min(sized, max_size)
        
        if min_bet_percent is not None and min_bet_percent > 0:
            min_size = fund_balance * (min_bet_percent / 100.0)
            sized = max(sized, min_size)
        
        # Convert to whole shares
        shares = int(sized / current_price)
        actual_dollar = shares * current_price
        
        logger.debug(
            f"Position sizing: base=${size_per_trade:.2f} * conf={confidence:.2f} = ${sized:.2f}, "
            f"shares={shares}, actual=${actual_dollar:.2f}"
        )
        
        return actual_dollar, shares


# Global instance
_position_sizer = PositionSizer()


def get_position_sizer() -> PositionSizer:
    """Get global PositionSizer instance."""
    return _position_sizer

