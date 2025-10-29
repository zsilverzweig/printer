"""
Engine Registry for tracking running strategy engines.

Provides a global registry to manage and access active strategy engines
for different funds. This allows API endpoints to start, stop, and query
the status of trading engines.
"""

import logging
from typing import Dict, List, Optional

# Forward reference to avoid circular import
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.services.strategy_engine import StrategyEngine

logger = logging.getLogger(__name__)

# Global registry of running engines by fund ID
_running_engines: Dict[str, 'StrategyEngine'] = {}


def register_engine(fund_id: str, engine: 'StrategyEngine') -> None:
    """
    Register a running engine.
    
    Args:
        fund_id: The fund ID to associate with the engine
        engine: The StrategyEngine instance
    """
    _running_engines[fund_id] = engine
    logger.info(f"Engine registered for fund {fund_id}")


def get_engine(fund_id: str) -> Optional['StrategyEngine']:
    """
    Get a running engine by fund ID.
    
    Args:
        fund_id: The fund ID to look up
        
    Returns:
        The StrategyEngine instance if running, None otherwise
    """
    return _running_engines.get(fund_id)


def unregister_engine(fund_id: str) -> None:
    """
    Remove engine from registry.
    
    Args:
        fund_id: The fund ID to remove
    """
    if fund_id in _running_engines:
        _running_engines.pop(fund_id)
        logger.info(f"Engine unregistered for fund {fund_id}")


def list_running_funds() -> List[str]:
    """
    Get list of fund IDs with active engines.
    
    Returns:
        List of fund IDs that have running engines
    """
    return list(_running_engines.keys())


def get_all_engines() -> Dict[str, 'StrategyEngine']:
    """
    Get all running engines.
    
    Returns:
        Dictionary mapping fund IDs to StrategyEngine instances
    """
    return _running_engines.copy()

