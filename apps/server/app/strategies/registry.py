"""
Strategy registry for plugin discovery and instantiation.

Manages the collection of available execution strategies and provides
methods to list, retrieve, and instantiate them.
"""

from typing import Dict, Type, List, Any, Optional
import logging

from app.strategies.base import ExecutionStrategy

logger = logging.getLogger(__name__)


# Global registry of strategy classes
_STRATEGY_REGISTRY: Dict[str, Type[ExecutionStrategy]] = {}


def register_strategy(strategy_class: Type[ExecutionStrategy]) -> None:
    """
    Register a strategy class in the global registry.
    
    Args:
        strategy_class: Strategy class to register
    """
    # Create a temporary instance to get metadata
    temp_instance = strategy_class({})
    strategy_id = temp_instance.id
    
    if strategy_id in _STRATEGY_REGISTRY:
        logger.warning(f"Strategy '{strategy_id}' already registered, overwriting")
    
    _STRATEGY_REGISTRY[strategy_id] = strategy_class
    logger.info(f"Registered strategy: {strategy_id} ({temp_instance.name})")


def get_strategy(strategy_id: str, config: Dict[str, Any], fund_id: Optional[str] = None) -> ExecutionStrategy:
    """
    Get an instantiated strategy by ID.
    
    Args:
        strategy_id: Unique strategy identifier
        config: Configuration parameters for the strategy
        fund_id: Optional fund ID for cost tracking and attribution
        
    Returns:
        Instantiated ExecutionStrategy
        
    Raises:
        ValueError: If strategy_id is not found
    """
    if strategy_id not in _STRATEGY_REGISTRY:
        available = ", ".join(_STRATEGY_REGISTRY.keys())
        raise ValueError(
            f"Strategy '{strategy_id}' not found. "
            f"Available strategies: {available}"
        )
    
    strategy_class = _STRATEGY_REGISTRY[strategy_id]
    
    try:
        strategy = strategy_class(config, fund_id=fund_id)
        strategy.validate_config(config)
        return strategy
    except Exception as e:
        logger.error(f"Failed to instantiate strategy '{strategy_id}': {e}")
        raise


def list_strategies() -> List[str]:
    """
    Get list of all registered strategy IDs.
    
    Returns:
        List of strategy IDs
    """
    return list(_STRATEGY_REGISTRY.keys())


def get_strategy_metadata(strategy_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get metadata for one or all strategies.
    
    Args:
        strategy_id: Optional specific strategy ID, or None for all
        
    Returns:
        Dictionary with strategy metadata
    """
    if strategy_id:
        if strategy_id not in _STRATEGY_REGISTRY:
            raise ValueError(f"Strategy '{strategy_id}' not found")
        
        strategy_class = _STRATEGY_REGISTRY[strategy_id]
        temp_instance = strategy_class({})
        
        return {
            "id": temp_instance.id,
            "name": temp_instance.name,
            "description": temp_instance.description,
            "strategyType": temp_instance.strategy_type,
            "expectedTimeframe": temp_instance.expected_timeframe,
            "requiredIndicators": temp_instance.required_indicators,
            "configSchema": temp_instance.config_schema,
        }
    else:
        # Return metadata for all strategies
        all_metadata = {}
        for sid in _STRATEGY_REGISTRY:
            all_metadata[sid] = get_strategy_metadata(sid)
        return all_metadata


def _auto_register_strategies() -> None:
    """
    Automatically register all strategy implementations.
    Called on module import to populate the registry.
    """
    # Import strategy implementations here to trigger registration
    try:
        from app.strategies.bull_flag import BullFlagStrategy
        register_strategy(BullFlagStrategy)
    except ImportError as e:
        logger.warning(f"Failed to import BullFlagStrategy: {e}")
    
    try:
        from app.strategies.monkey_darts import MonkeyDartsStrategy
        register_strategy(MonkeyDartsStrategy)
    except ImportError as e:
        logger.warning(f"Failed to import MonkeyDartsStrategy: {e}")
    
    try:
        from app.strategies.failed_equal_highs import FailedEqualHighsBreakoutStrategy
        register_strategy(FailedEqualHighsBreakoutStrategy)
    except ImportError as e:
        logger.warning(f"Failed to import FailedEqualHighsBreakoutStrategy: {e}")
    
    try:
        from app.strategies.gpt_candlestick import GPTCandlestickStrategy
        register_strategy(GPTCandlestickStrategy)
    except ImportError as e:
        logger.warning(f"Failed to import GPTCandlestickStrategy: {e}")
    
    try:
        from app.strategies.wyckoff import WyckoffStrategy
        register_strategy(WyckoffStrategy)
    except ImportError as e:
        logger.warning(f"Failed to import WyckoffStrategy: {e}")

    # Future strategies can be added here
    # try:
    #     from app.strategies.chart_analysis import ChartAnalysisStrategy
    #     register_strategy(ChartAnalysisStrategy)
    # except ImportError as e:
    #     logger.warning(f"Failed to import ChartAnalysisStrategy: {e}")


# Auto-register strategies on module import
_auto_register_strategies()


