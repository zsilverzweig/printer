"""
Base strategy interface for level-based trading.

Strategies follow a 3-phase lifecycle:
1. Setup (optional): Pre-analyze tickers, narrow list
2. Entry: Analyze tickers and set entry levels
3. Management: Update stops for open positions

All strategies work with tickers. Engine handles level persistence and profit protection.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class EntryLevel:
    """
    Entry level to monitor.
    
    Set by strategy.analyze_entry(). Persisted to DB.
    Engine triggers order when price crosses entry_price.
    """
    entry_price: float
    stop_loss: float
    confidence: float = 1.0
    order_type: str = "market"  # 'market' or 'limit'
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StopUpdate:
    """
    Stop loss update from strategy.
    
    Strategy raises stop to lock in profits.
    Engine enforces 50% profit protection on top of this.
    """
    current_stop: float
    force_exit: bool = False
    exit_reason: Optional[str] = None


@dataclass
class MarketDataSnapshot:
    """
    Market data for a ticker with rich context.
    
    Provides price, volume, bars, and optional technical analysis.
    """
    symbol: str
    price: float
    timestamp: datetime
    
    # Basic OHLCV
    volume: Optional[int] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    open: Optional[float] = None
    
    # Historical bars
    bars: Optional[List[Dict[str, Any]]] = None
    
    # Technical indicators (EMA, RSI, MACD, etc)
    indicators: Optional[Dict[str, Any]] = None
    
    # Screener metrics (volume_ratio, price_change, etc)
    metrics: Optional[Dict[str, Any]] = None


@dataclass
class PositionContext:
    """
    Context for an open position.
    
    Provided to strategy.manage_position() for stop updates.
    """
    symbol: str
    entry_price: float
    entry_time: datetime
    quantity: float
    current_price: float
    unrealized_pnl: float
    unrealized_pnl_percent: float
    strategy_state: Dict[str, Any]
    
    def time_in_position_minutes(self) -> float:
        """Get time in position in minutes."""
        return (datetime.utcnow() - self.entry_time).total_seconds() / 60.0


class ExecutionStrategy(ABC):
    """
    Base strategy interface - simplified 3-phase lifecycle.
    
    Phase 1: Setup (optional) - Pre-analyze tickers, narrow candidates
    Phase 2: Entry (required) - Analyze tickers and set entry levels  
    Phase 3: Management (required) - Update stops for positions
    
    Each phase processes tickers. Engine manages level persistence and execution.
    """
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        """
        Initialize strategy.
        
        Args:
            config: Strategy-specific configuration
            fund_id: Fund ID for cost tracking
        """
        self.config = config
        self.fund_id = fund_id
        
        # Common utilities
        from app.services.core.timing import IntervalTracker
        self._interval_tracker = IntervalTracker()
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate strategy configuration.
        
        Override in subclass to add strategy-specific validation.
        
        Args:
            config: Configuration dictionary to validate
            
        Returns:
            True if valid
            
        Raises:
            ValueError: If configuration is invalid
        """
        return True  # Default: accept any config
    
    @property
    @abstractmethod
    def id(self) -> str:
        """Unique strategy identifier (e.g., 'gpt_five_guy')."""
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable strategy name (e.g., 'GPT Five Guy')."""
        pass
    
    @property
    @abstractmethod
    def description(self) -> str:
        """Strategy description for UI."""
        pass
    
    @property
    @abstractmethod
    def strategy_type(self) -> str:
        """Strategy type: 'math-based', 'ai-based', or 'hybrid'."""
        pass
    
    @property
    @abstractmethod
    def expected_timeframe(self) -> str:
        """Expected holding period (e.g., '1-3 minutes', '5-30 minutes')."""
        pass
    
    @property
    def requires_setup(self) -> bool:
        """
        Whether this strategy uses the setup phase.
        
        Setup is optional - use it for pre-analysis, pattern detection,
        or narrowing candidates before main entry analysis.
        
        Returns:
            True if strategy implements analyze_setup(), False otherwise
        """
        return False
    
    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        """
        OPTIONAL: Setup phase - pre-analyze and filter tickers.
        
        Use this to:
        - Narrow down candidates (e.g., detect patterns)
        - Prepare data for entry analysis
        - Make AI calls to rank/filter
        
        Args:
            tickers: List of ticker symbols from screener
            market_data: Market data snapshots for each ticker
            
        Returns:
            Filtered list of tickers to pass to analyze_entry()
            
        Note:
            Only called if requires_setup returns True.
            Default implementation passes all tickers through.
        """
        return tickers
    
    @abstractmethod
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        REQUIRED: Analyze ticker and return entry level to monitor.
        
        This is the core decision point. Analyze the ticker and decide:
        - entry_price: Where to buy
        - stop_loss: Where to exit if wrong
        - confidence: 0-1 score for position sizing
        
        Strategy controls its own timing using _interval_tracker.
        Engine will persist the level and trigger when price crosses.
        
        Args:
            ticker: Symbol to analyze
            market_data: Rich market data snapshot with bars, indicators, metrics
            
        Returns:
            EntryLevel if setup found, None to skip ticker
            
        Example:
            ```
            # Check if we should analyze (e.g., every 5 minutes)
            if not self._interval_tracker.should_execute(f"entry_{ticker}", 5.0):
                return None
            
            self._interval_tracker.mark_executed(f"entry_{ticker}")
            
            # Do analysis (AI call, pattern detection, etc)
            # ...
            
            return EntryLevel(
                entry_price=120.50,
                stop_loss=118.00,
                confidence=0.85,
                order_type="market"
            )
            ```
        """
        pass
    
    @abstractmethod
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        REQUIRED: Update stop loss for open position.
        
        Raise the stop to lock in profits as position develops.
        Engine will enforce 50% profit protection on top of your stop.
        
        Strategy controls its own timing using _interval_tracker.
        
        Args:
            position: Current position context
            market_data: Current market data
            
        Returns:
            StopUpdate with current_stop level
            
        Example:
            ```
            # Check if we should update (e.g., every 30 seconds)
            if not self._interval_tracker.should_execute(f"manage_{position.symbol}", 0.5):
                return StopUpdate(
                    current_stop=position.strategy_state.get("stop_loss")
                )
            
            self._interval_tracker.mark_executed(f"manage_{position.symbol}")
            
            # Update stop (raise it as profit grows)
            # ...
            
            return StopUpdate(
                current_stop=new_stop  # Raised to lock in gains
            )
            ```
        """
        pass
    
    async def cleanup_symbol(self, symbol: str) -> None:
        """
        Clean up resources when symbol is no longer monitored.
        
        Called when:
        - Position is closed
        - Symbol is removed from monitoring
        - Strategy engine stops
        
        Override to clean up strategy-specific state.
        """
        pass
    
    async def shutdown(self) -> None:
        """
        Clean shutdown of strategy.
        
        Called when:
        - Strategy engine stops
        - Fund is paused
        - Strategy is changed
        
        Override to clean up resources, cancel tasks, etc.
        """
        pass
