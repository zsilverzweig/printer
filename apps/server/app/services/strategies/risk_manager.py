"""
Risk Manager Service

Handles risk validation, profit protection, and trading constraints.
"""

import logging
from typing import Dict, Tuple
from datetime import datetime, time as dt_time
import pytz

from app.strategies.base import PositionContext

logger = logging.getLogger(__name__)


class RiskManager:
    """Manages risk limits, trading hours, and profit protection."""
    
    def __init__(
        self,
        fund_id: str,
        fund_mode: str,
        trading_start_time: str = None,
        trading_end_time: str = None,
        timezone: str = None,
        max_loss_dollars: float = None,
        max_loss_percent: float = None,
        max_total_exposure: float = None,
        profit_protection_threshold: float = 0.5,
    ):
        """
        Initialize risk manager.
        
        Args:
            fund_id: Fund ID
            fund_mode: 'sim' or 'real'
            trading_start_time: e.g., "09:30"
            trading_end_time: e.g., "16:00"
            timezone: e.g., "America/New_York"
            max_loss_dollars: Maximum daily loss in dollars
            max_loss_percent: Maximum daily loss as %
            max_total_exposure: Maximum total exposure
            profit_protection_threshold: Profit protection % (0.5 = 50%)
        """
        self.fund_id = fund_id
        self.fund_mode = fund_mode
        self.trading_start_time = trading_start_time
        self.trading_end_time = trading_end_time
        self.timezone = timezone or "America/New_York"
        self.max_loss_dollars = max_loss_dollars
        self.max_loss_percent = max_loss_percent
        self.max_total_exposure = max_total_exposure
        self.profit_protection_threshold = profit_protection_threshold
    
    def is_trading_time(self) -> bool:
        """
        Check if current time is within trading hours.
        
        Returns:
            True if within trading hours or no restrictions set
        """
        if not self.trading_start_time:
            return True  # No restrictions
        
        try:
            tz = pytz.timezone(self.timezone)
            now = datetime.now(tz)
            current_time = now.time()
            
            # Parse times like "09:30"
            start = dt_time(*map(int, self.trading_start_time.split(":")))
            end = dt_time(*map(int, self.trading_end_time.split(":")))
            
            return start <= current_time <= end
        except Exception as e:
            logger.error(f"Error checking trading time: {e}")
            return True  # Default to allowing trades if check fails
    
    async def check_risk_limits(
        self,
        active_positions: Dict[str, PositionContext],
        fund_balance: float
    ) -> Tuple[bool, str]:
        """
        Check if we can trade based on risk parameters.
        
        Args:
            active_positions: Current active positions
            fund_balance: Current fund balance
            
        Returns:
            (can_trade, reason) - If can_trade is False, reason contains error message
        """
        # Calculate daily P&L from positions
        daily_pnl = sum(p.unrealized_pnl for p in active_positions.values())
        
        # Check daily loss limit (dollars) - only if set
        if (
            self.max_loss_dollars is not None
            and daily_pnl < 0
            and abs(daily_pnl) >= self.max_loss_dollars
        ):
            return False, f"Daily loss limit hit: ${abs(daily_pnl):.2f} >= ${self.max_loss_dollars:.2f}"
        
        # Check daily loss limit (percent) - only if set
        if (
            self.max_loss_percent is not None
            and daily_pnl < 0
            and fund_balance > 0
        ):
            loss_percent = (abs(daily_pnl) / fund_balance) * 100
            if loss_percent >= self.max_loss_percent:
                return False, f"Daily loss % limit hit: {loss_percent:.1f}% >= {self.max_loss_percent:.1f}%"
        
        # Check total exposure - only if set
        if self.max_total_exposure is not None:
            total_exposure = sum(
                p.quantity * p.current_price 
                for p in active_positions.values()
            )
            if total_exposure >= self.max_total_exposure:
                return False, f"Total exposure limit reached: ${total_exposure:.2f} >= ${self.max_total_exposure:.2f}"
        
        return True, ""
    
    def calculate_profit_protection_stop(
        self,
        entry_price: float,
        current_price: float
    ) -> float:
        """
        Calculate stop that locks in percentage of current profit.
        
        If position is in profit:
            protection_stop = entry + (current - entry) * threshold
        
        Example: Entry $100, Current $110, Threshold 0.5 (50%)
            Profit: $10
            Protection stop: $100 + $10 * 0.5 = $105
            
        Args:
            entry_price: Original entry price
            current_price: Current market price
            
        Returns:
            Stop loss price that protects percentage of profit
        """
        if current_price <= entry_price:
            # No profit yet, return entry price
            return entry_price
        
        profit = current_price - entry_price
        return entry_price + (profit * self.profit_protection_threshold)
    
    def verify_trading_mode(self, alpaca_is_paper: bool) -> None:
        """
        Verify that fund mode matches Alpaca service mode.
        
        This is a safety check to ensure we never accidentally execute
        real trades with a sim fund or vice versa.
        
        Args:
            alpaca_is_paper: Whether Alpaca service is in paper trading mode
            
        Raises:
            RuntimeError: If modes don't match
        """
        fund_is_paper = (self.fund_mode == "sim")
        if fund_is_paper != alpaca_is_paper:
            error_msg = (
                f"CRITICAL: Trading mode mismatch detected! "
                f"Fund mode is '{self.fund_mode}' but Alpaca service is in "
                f"{'paper' if alpaca_is_paper else 'real'} trading mode. "
                f"Trade execution blocked for safety."
            )
            logger.error(error_msg)
            raise RuntimeError(error_msg)

