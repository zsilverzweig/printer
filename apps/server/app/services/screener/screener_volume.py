"""Volume calculation utilities for the screener service."""
from __future__ import annotations

from collections import deque
from typing import Deque, Dict


class VolumeCalculator:
    """Handles volume-related calculations and statistics."""
    
    def __init__(self, volumes: Dict[str, Deque[float]]):
        """Initialize volume calculator with historical volume data.
        
        Args:
            volumes: Dict mapping ticker to deque of historical daily volumes
        """
        self.volumes = volumes
    
    def calculate_relative_volume(self, ticker: str, days: int) -> float:
        """Calculate relative volume for a ticker over N days.
        
        Compares yesterday's volume to the average of the prior N days
        (excluding yesterday itself).
        
        Args:
            ticker: Stock ticker symbol
            days: Number of prior days to average (excluding yesterday)
        
        Returns:
            Relative volume multiple (yesterday's vol / avg prior N days)
            Returns 0.0 if insufficient data is available.
        
        Example:
            If yesterday's volume was 1M and the average of the prior 14 days
            was 500K, this returns 2.0 (2x relative volume).
        """
        vals = list(self.volumes.get(ticker, []))
        if len(vals) < 2:
            return 0.0
        
        # Get yesterday's volume (last entry)
        yesterday_vol = vals[-1]
        
        # Exclude yesterday and get average of prior N days
        prior_vals = vals[-(days + 1):-1]
        if not prior_vals:
            return 0.0
        
        avg = sum(prior_vals) / len(prior_vals)
        return (yesterday_vol / avg) if avg else 0.0
    
    def calculate_average_volume(self, ticker: str, days: int) -> float:
        """Calculate average volume over the last N days.
        
        Args:
            ticker: Stock ticker symbol
            days: Number of days to average
        
        Returns:
            Average volume over the period, or 0.0 if insufficient data
        """
        vals = list(self.volumes.get(ticker, []))
        if not vals:
            return 0.0
        
        # Get last N days
        recent_vals = vals[-days:] if len(vals) >= days else vals
        if not recent_vals:
            return 0.0
        
        return sum(recent_vals) / len(recent_vals)
    
    def calculate_volume_percentile(self, ticker: str, target_volume: float) -> float:
        """Calculate what percentile a target volume represents in historical data.
        
        Args:
            ticker: Stock ticker symbol
            target_volume: Volume to compare against historical data
        
        Returns:
            Percentile (0-100) where the target volume falls in history.
            Returns 0.0 if insufficient data.
        """
        vals = list(self.volumes.get(ticker, []))
        if not vals:
            return 0.0
        
        # Count how many historical values are less than target
        count_below = sum(1 for v in vals if v < target_volume)
        
        return (count_below / len(vals)) * 100
    
    def get_volume_statistics(self, ticker: str) -> Dict[str, float]:
        """Get comprehensive volume statistics for a ticker.
        
        Args:
            ticker: Stock ticker symbol
        
        Returns:
            Dict with keys: min, max, avg, median, latest
        """
        vals = list(self.volumes.get(ticker, []))
        if not vals:
            return {
                "min": 0.0,
                "max": 0.0,
                "avg": 0.0,
                "median": 0.0,
                "latest": 0.0,
            }
        
        sorted_vals = sorted(vals)
        n = len(sorted_vals)
        median = (
            sorted_vals[n // 2]
            if n % 2 == 1
            else (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2
        )
        
        return {
            "min": min(vals),
            "max": max(vals),
            "avg": sum(vals) / len(vals),
            "median": median,
            "latest": vals[-1],
        }


def calculate_average_excluding_last(
    volumes: Dict[str, Deque[float]], ticker: str, n: int
) -> float:
    """Calculate average of n days BEFORE yesterday (excluding yesterday itself).
    
    This is a standalone utility function for backward compatibility.
    
    Args:
        volumes: Dict mapping ticker to deque of historical daily volumes
        ticker: Stock ticker symbol
        n: Number of days to average (before yesterday)
    
    Returns:
        Average volume, or 0.0 if insufficient data
    """
    vals = list(volumes.get(ticker, []))
    if len(vals) < 2:
        return 0.0
    
    # Exclude the last day (yesterday at index -1) and get n days before that
    vals = vals[-(n + 1):-1]
    return (sum(vals) / len(vals)) if vals else 0.0

