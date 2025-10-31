"""Price history tracking and change calculation for screener."""
from __future__ import annotations

from collections import deque
from typing import Deque, Dict, Tuple


class PriceHistoryTracker:
    """Tracks price history and calculates percentage changes over time."""
    
    # Keep up to 1 hour of history (720 entries at 5s intervals)
    MAX_HISTORY_ENTRIES = 720
    
    def __init__(self):
        """Initialize price history tracker."""
        # Store price snapshots: {ticker: deque[(timestamp, price), ...]}
        self.price_history: Dict[str, Deque[Tuple[float, float]]] = {}
    
    def update_price(self, ticker: str, timestamp: float, price: float) -> None:
        """Record a new price point for a ticker.
        
        Args:
            ticker: Stock ticker symbol
            timestamp: Unix timestamp in seconds
            price: Current price
        """
        if ticker not in self.price_history:
            self.price_history[ticker] = deque(maxlen=self.MAX_HISTORY_ENTRIES)
        
        self.price_history[ticker].append((timestamp, price))
    
    def get_price_change(self, ticker: str, seconds_ago: float) -> float | None:
        """Calculate percentage change from N seconds ago to current price.
        
        Args:
            ticker: Stock ticker symbol
            seconds_ago: How many seconds back to calculate from
        
        Returns:
            Percentage change, or None if insufficient data
        """
        history = self.price_history.get(ticker)
        if not history or len(history) < 2:
            return None
        
        current_time, current_price = history[-1]
        target_time = current_time - seconds_ago
        
        # Find the price closest to target_time
        closest_price = None
        closest_diff = float('inf')
        
        for timestamp, price in history:
            diff = abs(timestamp - target_time)
            if diff < closest_diff:
                closest_diff = diff
                closest_price = price
        
        if closest_price is None or closest_price == 0:
            return None
        
        # Calculate percentage change
        return ((current_price - closest_price) / closest_price) * 100
    
    def calculate_all_changes(self, ticker: str) -> Dict[str, float | None]:
        """Calculate all timeframe changes for a ticker.
        
        Returns dict with keys: change_1m, change_5m, change_1h
        """
        return {
            "change_1m": self.get_price_change(ticker, 60),  # 1 minute
            "change_5m": self.get_price_change(ticker, 300),  # 5 minutes
            "change_1h": self.get_price_change(ticker, 3600),  # 1 hour
        }
    
    def has_ticker(self, ticker: str) -> bool:
        """Check if we have any price history for a ticker."""
        return ticker in self.price_history and len(self.price_history[ticker]) > 0
    
    def clear_ticker(self, ticker: str) -> None:
        """Clear price history for a specific ticker."""
        if ticker in self.price_history:
            del self.price_history[ticker]
    
    def clear_all(self) -> None:
        """Clear all price history."""
        self.price_history.clear()

