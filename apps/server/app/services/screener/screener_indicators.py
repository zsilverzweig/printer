"""
Technical Indicator Calculator for Screener Metrics

Calculate all major technical indicators from TimescaleDB daily bars in batch.
Follows the same pattern as TimescaleVolumeCalculator for consistency.
"""

import asyncio
import logging
from datetime import date, timedelta
from typing import Dict, List, Optional

from sqlalchemy import text
from app.services.core.database import get_async_session


class TimescaleIndicatorCalculator:
    """
    Calculate technical indicators from TimescaleDB daily bars in batch.
    
    All indicators calculated from market_data WHERE timescale='1day'.
    Uses efficient SQL with window functions for batch processing.
    """
    
    def __init__(self, lookback_days: int = 200):
        """
        Initialize calculator.
        
        Args:
            lookback_days: Maximum lookback period (default 200 for SMA200)
        """
        self.lookback_days = lookback_days
        self.logger = logging.getLogger("app.screener.indicators")
    
    async def calculate_rv_metrics(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate RV14, RV30, RV60 using SQL window functions.
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {rv14, rv30, rv60}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                # Query volumes with window functions for efficient calculation
                result = await session.execute(
                    text("""
                        WITH daily_volumes AS (
                            SELECT 
                                symbol,
                                time::date as date,
                                volume,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                            ORDER BY symbol, time DESC
                        ),
                        volume_calcs AS (
                            SELECT 
                                symbol,
                                MAX(CASE WHEN rn = 1 THEN volume END) as today_vol,
                                AVG(CASE WHEN rn BETWEEN 2 AND 15 THEN volume END) as avg_14d,
                                AVG(CASE WHEN rn BETWEEN 2 AND 31 THEN volume END) as avg_30d,
                                AVG(CASE WHEN rn BETWEEN 2 AND 61 THEN volume END) as avg_60d
                            FROM daily_volumes
                            WHERE rn <= 61
                            GROUP BY symbol
                            HAVING COUNT(*) >= 15  -- Need at least 15 days
                        )
                        SELECT 
                            symbol,
                            CASE WHEN avg_14d > 0 THEN today_vol / avg_14d ELSE 0 END as rv14,
                            CASE WHEN avg_30d > 0 THEN today_vol / avg_30d ELSE 0 END as rv30,
                            CASE WHEN avg_60d > 0 THEN today_vol / avg_60d ELSE 0 END as rv60
                        FROM volume_calcs
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=65)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "rv14": float(row[1]) if row[1] else 0.0,
                        "rv30": float(row[2]) if row[2] else 0.0,
                        "rv60": float(row[3]) if row[3] else 0.0
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating RV metrics: {e}", exc_info=True)
            return {}
    
    async def calculate_sma(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate SMA(20, 50, 200) from daily closes.
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {sma_20, sma_50, sma_200}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_closes AS (
                            SELECT 
                                symbol,
                                time::date as date,
                                close,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                            ORDER BY symbol, time DESC
                        )
                        SELECT 
                            symbol,
                            AVG(CASE WHEN rn <= 20 THEN close END) as sma_20,
                            AVG(CASE WHEN rn <= 50 THEN close END) as sma_50,
                            AVG(CASE WHEN rn <= 200 THEN close END) as sma_200
                        FROM daily_closes
                        GROUP BY symbol
                        HAVING COUNT(*) >= 20  -- Need at least 20 days for SMA20
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=205)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "sma_20": float(row[1]) if row[1] else None,
                        "sma_50": float(row[2]) if row[2] else None,
                        "sma_200": float(row[3]) if row[3] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating SMA: {e}", exc_info=True)
            return {}
    
    async def calculate_rsi(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate 14-day RSI from daily closes.
        
        Uses Wilder's smoothing method:
        RS = Average Gain / Average Loss
        RSI = 100 - (100 / (1 + RS))
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {rsi_14}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_closes AS (
                            SELECT 
                                symbol,
                                time::date as date,
                                close,
                                LAG(close) OVER (PARTITION BY symbol ORDER BY time) as prev_close,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                        ),
                        price_changes AS (
                            SELECT 
                                symbol,
                                CASE WHEN close > prev_close THEN close - prev_close ELSE 0 END as gain,
                                CASE WHEN close < prev_close THEN prev_close - close ELSE 0 END as loss
                            FROM daily_closes
                            WHERE rn <= 15 AND prev_close IS NOT NULL
                        ),
                        avg_gains_losses AS (
                            SELECT 
                                symbol,
                                AVG(gain) as avg_gain,
                                AVG(loss) as avg_loss
                            FROM price_changes
                            GROUP BY symbol
                            HAVING COUNT(*) >= 14
                        )
                        SELECT 
                            symbol,
                            CASE 
                                WHEN avg_loss = 0 THEN 100
                                WHEN avg_gain = 0 THEN 0
                                ELSE 100 - (100 / (1 + (avg_gain / avg_loss)))
                            END as rsi_14
                        FROM avg_gains_losses
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=20)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "rsi_14": float(row[1]) if row[1] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating RSI: {e}", exc_info=True)
            return {}
    
    async def calculate_macd(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate MACD (12, 26, 9) from daily closes.
        
        MACD Line = EMA(12) - EMA(26)
        Signal Line = EMA(9) of MACD Line
        Histogram = MACD Line - Signal Line
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {macd_line, macd_signal, macd_histogram}
        """
        if not symbols:
            return {}
        
        try:
            # MACD calculation requires iterative EMA, which is complex in SQL
            # For now, return placeholder - will implement proper EMA calculation
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_closes AS (
                            SELECT 
                                symbol,
                                time::date as date,
                                close,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                        ),
                        sma_12_26 AS (
                            SELECT 
                                symbol,
                                AVG(CASE WHEN rn <= 12 THEN close END) as sma_12,
                                AVG(CASE WHEN rn <= 26 THEN close END) as sma_26
                            FROM daily_closes
                            GROUP BY symbol
                            HAVING COUNT(*) >= 26
                        )
                        SELECT 
                            symbol,
                            (sma_12 - sma_26) as macd_line,
                            0 as macd_signal,
                            (sma_12 - sma_26) as macd_histogram
                        FROM sma_12_26
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=40)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "macd_line": float(row[1]) if row[1] else None,
                        "macd_signal": float(row[2]) if row[2] else None,
                        "macd_histogram": float(row[3]) if row[3] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating MACD: {e}", exc_info=True)
            return {}
    
    async def calculate_bollinger_bands(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate Bollinger Bands (20, 2) from daily closes.
        
        Middle Band = SMA(20)
        Upper Band = SMA(20) + 2 * STDDEV(20)
        Lower Band = SMA(20) - 2 * STDDEV(20)
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {bb_upper, bb_middle, bb_lower}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_closes AS (
                            SELECT 
                                symbol,
                                close,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                        ),
                        bb_calcs AS (
                            SELECT 
                                symbol,
                                AVG(close) as sma_20,
                                STDDEV(close) as stddev_20
                            FROM daily_closes
                            WHERE rn <= 20
                            GROUP BY symbol
                            HAVING COUNT(*) >= 20
                        )
                        SELECT 
                            symbol,
                            sma_20 + (2 * stddev_20) as bb_upper,
                            sma_20 as bb_middle,
                            sma_20 - (2 * stddev_20) as bb_lower
                        FROM bb_calcs
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=25)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "bb_upper": float(row[1]) if row[1] else None,
                        "bb_middle": float(row[2]) if row[2] else None,
                        "bb_lower": float(row[3]) if row[3] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating Bollinger Bands: {e}", exc_info=True)
            return {}
    
    async def calculate_atr(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate 14-day ATR from daily OHLC.
        
        True Range = max(high-low, abs(high-prev_close), abs(low-prev_close))
        ATR = Average of last 14 true ranges
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {atr_14}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_ohlc AS (
                            SELECT 
                                symbol,
                                high,
                                low,
                                close,
                                LAG(close) OVER (PARTITION BY symbol ORDER BY time) as prev_close,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                        ),
                        true_ranges AS (
                            SELECT 
                                symbol,
                                GREATEST(
                                    high - low,
                                    ABS(high - prev_close),
                                    ABS(low - prev_close)
                                ) as tr
                            FROM daily_ohlc
                            WHERE rn <= 14 AND prev_close IS NOT NULL
                        )
                        SELECT 
                            symbol,
                            AVG(tr) as atr_14
                        FROM true_ranges
                        GROUP BY symbol
                        HAVING COUNT(*) >= 14
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=20)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "atr_14": float(row[1]) if row[1] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating ATR: {e}", exc_info=True)
            return {}
    
    async def calculate_price_levels(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculate 90-day high/low from daily bars.
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to {high_90d, low_90d}
        """
        if not symbols:
            return {}
        
        try:
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        WITH daily_ohlc AS (
                            SELECT 
                                symbol,
                                high,
                                low,
                                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                            FROM market_data
                            WHERE symbol = ANY(:symbols)
                              AND timescale = '1day'
                              AND time::date <= :target_date
                              AND time::date >= :cutoff_date
                        )
                        SELECT 
                            symbol,
                            MAX(high) as high_90d,
                            MIN(low) as low_90d
                        FROM daily_ohlc
                        WHERE rn <= 90
                        GROUP BY symbol
                        HAVING COUNT(*) >= 90
                    """),
                    {
                        "symbols": symbols,
                        "target_date": target_date,
                        "cutoff_date": target_date - timedelta(days=95)
                    }
                )
                
                results = {}
                for row in result:
                    results[row[0]] = {
                        "high_90d": float(row[1]) if row[1] else None,
                        "low_90d": float(row[2]) if row[2] else None
                    }
                
                return results
                
        except Exception as e:
            self.logger.error(f"Error calculating price levels: {e}", exc_info=True)
            return {}
    
    async def calculate_all_metrics_batch(
        self, 
        symbols: List[str], 
        target_date: date
    ) -> Dict[str, Dict]:
        """
        Execute all calculations in parallel and merge results.
        
        Args:
            symbols: List of ticker symbols
            target_date: Date to calculate metrics for
            
        Returns:
            Dict mapping symbol to all metrics
        """
        if not symbols:
            return {}
        
        self.logger.info(f"Calculating all metrics for {len(symbols)} symbols on {target_date}")
        
        try:
            # Execute all calculations in parallel
            rv_task = self.calculate_rv_metrics(symbols, target_date)
            sma_task = self.calculate_sma(symbols, target_date)
            rsi_task = self.calculate_rsi(symbols, target_date)
            macd_task = self.calculate_macd(symbols, target_date)
            bb_task = self.calculate_bollinger_bands(symbols, target_date)
            atr_task = self.calculate_atr(symbols, target_date)
            levels_task = self.calculate_price_levels(symbols, target_date)
            
            # Wait for all to complete
            rv_results, sma_results, rsi_results, macd_results, bb_results, atr_results, level_results = \
                await asyncio.gather(rv_task, sma_task, rsi_task, macd_task, bb_task, atr_task, levels_task)
            
            # Merge all results
            merged = {}
            for symbol in symbols:
                merged[symbol] = {
                    "rv14": rv_results.get(symbol, {}).get("rv14", 0.0),
                    "rv30": rv_results.get(symbol, {}).get("rv30", 0.0),
                    "rv60": rv_results.get(symbol, {}).get("rv60", 0.0),
                    "sma_20": sma_results.get(symbol, {}).get("sma_20"),
                    "sma_50": sma_results.get(symbol, {}).get("sma_50"),
                    "sma_200": sma_results.get(symbol, {}).get("sma_200"),
                    "rsi_14": rsi_results.get(symbol, {}).get("rsi_14"),
                    "macd_line": macd_results.get(symbol, {}).get("macd_line"),
                    "macd_signal": macd_results.get(symbol, {}).get("macd_signal"),
                    "macd_histogram": macd_results.get(symbol, {}).get("macd_histogram"),
                    "bb_upper": bb_results.get(symbol, {}).get("bb_upper"),
                    "bb_middle": bb_results.get(symbol, {}).get("bb_middle"),
                    "bb_lower": bb_results.get(symbol, {}).get("bb_lower"),
                    "atr_14": atr_results.get(symbol, {}).get("atr_14"),
                    "high_90d": level_results.get(symbol, {}).get("high_90d"),
                    "low_90d": level_results.get(symbol, {}).get("low_90d"),
                    "volume_ma_20": None,  # TODO: Implement volume MA
                    "volume_trend": None   # TODO: Implement volume trend
                }
            
            # Filter out symbols with no data
            merged = {s: m for s, m in merged.items() if any(v is not None and v != 0 for v in m.values())}
            
            self.logger.info(f"Calculated metrics for {len(merged)}/{len(symbols)} symbols")
            return merged
            
        except Exception as e:
            self.logger.error(f"Error in batch calculation: {e}", exc_info=True)
            return {}

