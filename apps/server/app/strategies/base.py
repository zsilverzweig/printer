"""
Base classes and data structures for execution strategies.

Defines the abstract ExecutionStrategy interface that all trading strategies
must implement, along with supporting data structures for signals and market data.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class MarketData:
    """Current market data snapshot for a symbol."""
    symbol: str
    price: float
    timestamp: datetime
    volume: Optional[int] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    
    # Additional context
    bars: Optional[List[Dict[str, Any]]] = None  # Recent price bars
    indicators: Optional[Dict[str, Any]] = None  # Technical indicators
    news: Optional[Dict[str, Any]] = None        # News sentiment
    float_data: Optional[Dict[str, Any]] = None  # Float/shares data


@dataclass
class EntrySignal:
    """Signal indicating whether to enter a position."""
    should_enter: bool
    entry_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    confidence: float = 1.0
    reason: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None  # Strategy-specific data


@dataclass
class ExitSignal:
    """Signal indicating whether to exit a position."""
    should_exit: bool
    exit_price: Optional[float] = None
    reason: Optional[str] = None  # e.g., "stop_loss", "take_profit", "timeout"
    partial_exit: bool = False     # If True, exit only a portion
    exit_percent: float = 100.0    # Percentage to exit (default 100%)


@dataclass
class ScaleSignal:
    """Signal for scaling into or out of a position."""
    action: str  # "scale_in" or "scale_out"
    percent: Optional[float] = None      # Percentage of position
    multiplier: Optional[float] = None   # Size multiplier for scale in
    reason: Optional[str] = None
    adjust_stop_to_breakeven: bool = False


@dataclass
class PositionContext:
    """Context information for an open position."""
    position_id: str
    symbol: str
    entry_price: float
    entry_time: datetime
    quantity: float
    current_price: float
    
    # Performance tracking
    unrealized_pnl: float
    unrealized_pnl_percent: float
    high_water_mark: float
    
    # Strategy-specific state
    strategy_state: Dict[str, Any]
    
    # Scaling history
    has_scaled_out: bool = False
    has_taken_profits: bool = False
    scale_in_count: int = 0
    
    def is_profitable(self) -> bool:
        """Check if position is currently profitable."""
        return self.unrealized_pnl > 0
    
    def time_in_position_minutes(self) -> float:
        """Get time in position in minutes."""
        return (datetime.now() - self.entry_time).total_seconds() / 60.0


class ExecutionStrategy(ABC):
    """
    Abstract base class for all trading execution strategies.
    
    Subclasses must implement the core methods for screening, entry/exit logic,
    and position sizing. Optional methods can be overridden for scaling behavior.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize strategy with configuration.
        
        Args:
            config: Strategy-specific configuration parameters
        """
        self.config = config
    
    @property
    @abstractmethod
    def id(self) -> str:
        """Unique identifier for this strategy (e.g., 'bull_flag')."""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this strategy."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Detailed description of the strategy."""
        pass
    
    @property
    @abstractmethod
    def strategy_type(self) -> str:
        """Strategy type: 'math-based', 'ai-based', or 'hybrid'."""
        pass
    
    @property
    def expected_timeframe(self) -> str:
        """Expected holding timeframe (e.g., '1-3 minutes', 'intraday')."""
        return "intraday"
    
    @property
    def required_indicators(self) -> List[str]:
        """List of required technical indicators."""
        return []
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        """
        JSON schema defining the configuration parameters for this strategy.
        Used for UI generation and validation.
        """
        return {}
    
    @abstractmethod
    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0
    ) -> List[str]:
        """
        Select which symbols to actively monitor for entry.
        
        This is the strategy's opportunity to decide which symbols from the
        screened candidates should be monitored for potential entry. The engine
        will then check entry conditions for each returned symbol.
        
        Args:
            candidates: List of stocks from screener (already filtered by ScreeningCriteria)
            active_position_count: Number of currently active positions
            
        Returns:
            List of symbols to monitor for entry
            
        Examples:
            - Bull Flag: Returns all candidates (will check pattern on each)
            - Monkey Darts: Returns one random pick (or empty if have position)
            - Chart Analysis: Returns top N by volume/momentum
            
        Note:
            All basic filtering (volume, price range, etc.) should already be
            done by ScreeningCriteria. This method is for strategy-specific
            selection logic only.
        """
        pass
    
    @abstractmethod
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """
        Determine if we should enter a position.
        
        Args:
            symbol: Stock symbol
            market_data: Current market data and context
            
        Returns:
            EntrySignal with entry decision and parameters
        """
        pass
    
    @abstractmethod
    async def should_exit(
        self, 
        position: PositionContext, 
        market_data: MarketData
    ) -> ExitSignal:
        """
        Determine if we should exit a position.
        
        Args:
            position: Current position context
            market_data: Current market data
            
        Returns:
            ExitSignal with exit decision and reason
        """
        pass
    
    @abstractmethod
    async def position_sizing(
        self, 
        signal: EntrySignal, 
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """
        Calculate position size for entry.
        
        Args:
            signal: Entry signal with price and stop loss
            fund_balance: Current fund balance
            risk_params: Risk parameters from strategy config
            
        Returns:
            Dollar amount to allocate to this position
        """
        pass
    
    async def should_scale_in(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Determine if we should scale into the position (add to it).
        
        Args:
            position: Current position context
            market_data: Current market data
            
        Returns:
            ScaleSignal if should scale in, None otherwise
        """
        return None
    
    async def should_scale_out(
        self, 
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Determine if we should scale out of the position (take partial profits).
        
        Args:
            position: Current position context
            market_data: Current market data
            
        Returns:
            ScaleSignal if should scale out, None otherwise
        """
        return None
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate strategy configuration.
        
        Args:
            config: Configuration to validate
            
        Returns:
            True if valid, raises ValueError otherwise
        """
        # Override in subclasses for custom validation
        return True


