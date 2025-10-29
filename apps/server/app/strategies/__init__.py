"""
Trading execution strategies plugin system.

Provides a plugin architecture for implementing custom trading strategies
with entry/exit logic, position sizing, and scaling rules.
"""

from app.strategies.base import (
    ExecutionStrategy,
    EntrySignal,
    ExitSignal,
    ScaleSignal,
    MarketData,
)
from app.strategies.registry import get_strategy, list_strategies, get_strategy_metadata

__all__ = [
    "ExecutionStrategy",
    "EntrySignal",
    "ExitSignal",
    "ScaleSignal",
    "MarketData",
    "get_strategy",
    "list_strategies",
    "get_strategy_metadata",
]


