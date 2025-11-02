"""Volume calculation utilities for the screener service."""
from __future__ import annotations

import logging
from collections import deque
from datetime import datetime, date, timedelta, timezone
from typing import Deque, Dict, Optional

from sqlalchemy import text

from app.services.core.database import get_async_session

logger = logging.getLogger("app.screener.volume")


class VolumeCalculator:
    """Handles volume-related calculations and statistics (legacy in-memory)."""
    
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


class TimescaleVolumeCalculator:
    """
    Calculates volume metrics from TimescaleDB continuous aggregates.
    
    This replaces the in-memory volume calculator with direct database queries
    to the market_data_daily materialized view.
    """
    
    def __init__(self, lookback_days: int = 30):
        """
        Initialize TimescaleDB volume calculator.
        
        Args:
            lookback_days: How many days of history to use (default 30)
        """
        self.lookback_days = lookback_days
        self.logger = logging.getLogger("app.screener.volume")
    
    async def calculate_rv14(self, symbol: str) -> float:
        """
        Calculate relative volume (rv14) for a symbol.
        
        Compares yesterday's volume to the average of the prior 14 days.
        
        Args:
            symbol: Ticker symbol
            
        Returns:
            Relative volume multiple (yesterday / avg prior 14 days)
            Returns 0.0 if insufficient data.
            
        Raises:
            ValueError: If data is incomplete or validation fails
        """
        try:
            async with get_async_session() as session:
                # Query last 16 days of data from continuous aggregate
                # (1 day for yesterday + 14 days for average + 1 buffer)
                cutoff_date = date.today() - timedelta(days=16)
                
                result = await session.execute(
                    text("""
                        SELECT 
                            bucket::date as date,
                            volume
                        FROM market_data_daily
                        WHERE symbol = :symbol
                          AND bucket >= :cutoff_date
                        ORDER BY bucket DESC
                        LIMIT 16
                    """),
                    {"symbol": symbol.upper(), "cutoff_date": cutoff_date}
                )
                
                rows = list(result)
                
                if len(rows) < 15:
                    # Insufficient data - just return 0, don't log (used for sorting only)
                    return 0.0
                
                # Check validation status for yesterday
                yesterday = date.today() - timedelta(days=1)
                validation_result = await session.execute(
                    text("""
                        SELECT is_complete
                        FROM symbol_date_validation
                        WHERE symbol = :symbol
                          AND date = :date
                    """),
                    {"symbol": symbol.upper(), "date": yesterday}
                )
                validation_row = validation_result.fetchone()
                
                if not validation_row or not validation_row[0]:
                    # Data incomplete - just return 0, don't raise (used for sorting only)
                    return 0.0
                
                # Extract volumes
                volumes = [float(row[1]) for row in rows]
                
                # Yesterday's volume is first (most recent)
                yesterday_volume = volumes[0]
                
                # Average of prior 14 days (exclude yesterday)
                prior_14_days = volumes[1:15]
                
                if len(prior_14_days) < 14:
                    return 0.0
                
                avg_prior = sum(prior_14_days) / len(prior_14_days)
                
                if avg_prior == 0:
                    return 0.0
                
                rv14 = yesterday_volume / avg_prior
                
                self.logger.debug(
                    f"{symbol} rv14: {rv14:.2f} "
                    f"(yesterday: {yesterday_volume:,.0f}, avg_prior: {avg_prior:,.0f})"
                )
                
                return rv14
                
        except ValueError:
            # Re-raise validation errors
            raise
        except Exception as e:
            self.logger.error(f"Error calculating rv14 for {symbol}: {e}", exc_info=True)
            return 0.0
    
    async def get_yesterday_ohlcv(self, symbol: str) -> Optional[Dict]:
        """
        Get yesterday's OHLCV data for a symbol.
        
        Args:
            symbol: Ticker symbol
            
        Returns:
            Dict with keys: date, open, high, low, close, volume
            None if data not available
            
        Raises:
            ValueError: If data is incomplete or validation fails
        """
        try:
            yesterday = date.today() - timedelta(days=1)
            
            async with get_async_session() as session:
                # Check validation first
                validation_result = await session.execute(
                    text("""
                        SELECT is_complete
                        FROM symbol_date_validation
                        WHERE symbol = :symbol
                          AND date = :date
                    """),
                    {"symbol": symbol.upper(), "date": yesterday}
                )
                validation_row = validation_result.fetchone()
                
                if not validation_row or not validation_row[0]:
                    # Data incomplete - just return 0, don't raise (used for sorting only)
                    return 0.0
                
                # Query yesterday's OHLCV
                result = await session.execute(
                    text("""
                        SELECT 
                            bucket::date as date,
                            open,
                            high,
                            low,
                            close,
                            volume
                        FROM market_data_daily
                        WHERE symbol = :symbol
                          AND bucket::date = :date
                    """),
                    {"symbol": symbol.upper(), "date": yesterday}
                )
                
                row = result.fetchone()
                
                if not row:
                    raise ValueError(f"No data found for {symbol} on {yesterday}")
                
                return {
                    "date": row[0],
                    "open": float(row[1]),
                    "high": float(row[2]),
                    "low": float(row[3]),
                    "close": float(row[4]),
                    "volume": float(row[5])
                }
                
        except ValueError:
            raise
        except Exception as e:
            self.logger.error(f"Error getting yesterday's OHLCV for {symbol}: {e}", exc_info=True)
            return None
    
    async def get_symbols_with_complete_data(self, min_days: int = 14) -> list[str]:
        """
        Get list of symbols with sufficient complete data for screening.
        
        Args:
            min_days: Minimum number of complete days required
            
        Returns:
            List of ticker symbols
        """
        try:
            cutoff_date = date.today() - timedelta(days=min_days + 1)
            
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        SELECT symbol
                        FROM symbol_date_validation
                        WHERE date >= :cutoff_date
                          AND is_complete = TRUE
                        GROUP BY symbol
                        HAVING COUNT(*) >= :min_days
                        ORDER BY symbol
                    """),
                    {"cutoff_date": cutoff_date, "min_days": min_days}
                )
                
                return [row[0] for row in result]
                
        except Exception as e:
            self.logger.error(f"Error getting symbols with complete data: {e}", exc_info=True)
            return []


