"""
Gap detection service for market data.

Identifies missing data (gaps) in the TimescaleDB database and queues
them for backfill. Runs periodically via the health monitor.
"""

import asyncio
import logging
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Set, Tuple

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market_data import SymbolDateValidation
from app.services.core.database import get_async_session

logger = logging.getLogger("app.gap_detector")


def _is_weekend(d: date) -> bool:
    """Check if a date is a weekend (Saturday or Sunday)."""
    return d.weekday() >= 5  # Saturday = 5, Sunday = 6


def _next_trading_day(d: date) -> date:
    """Get the next trading day (skip weekends)."""
    next_day = d + timedelta(days=1)
    while _is_weekend(next_day):
        next_day += timedelta(days=1)
    return next_day


def _prev_trading_day(d: date) -> date:
    """Get the previous trading day (skip weekends)."""
    prev_day = d - timedelta(days=1)
    while _is_weekend(prev_day):
        prev_day -= timedelta(days=1)
    return prev_day


class DataGap:
    """Represents a gap in market data."""
    
    def __init__(
        self,
        symbol: str,
        date: date,
        gap_type: str,  # 'missing_date', 'incomplete_day', 'no_validation'
        bar_count: int = 0,
        priority: int = 1  # 1=high, 2=medium, 3=low
    ):
        self.symbol = symbol
        self.date = date
        self.gap_type = gap_type
        self.bar_count = bar_count
        self.priority = priority
        self.detected_at = datetime.now(timezone.utc)
    
    def to_dict(self) -> Dict:
        """Export as dictionary."""
        return {
            "symbol": self.symbol,
            "date": self.date.isoformat(),
            "gap_type": self.gap_type,
            "bar_count": self.bar_count,
            "priority": self.priority,
            "detected_at": self.detected_at.isoformat()
        }
    
    def __repr__(self) -> str:
        return f"<DataGap({self.symbol}, {self.date}, {self.gap_type})>"


class GapDetectorService:
    """
    Service that detects gaps in market data.
    
    Scans the symbol_date_validation table and identifies:
    1. Symbols with missing validation records for recent dates
    2. Symbols with incomplete data (is_complete = FALSE)
    3. Date ranges with no data at all
    """
    
    def __init__(self, lookback_days: int = 30):
        """
        Initialize gap detector.
        
        Args:
            lookback_days: How many days back to check for gaps (default 30)
        """
        self.lookback_days = lookback_days
        self.logger = logging.getLogger("app.gap_detector")
        
        # Gap queue (priority queue would be better, but simple list for now)
        self.gap_queue: List[DataGap] = []
    
    async def detect_gaps(self) -> List[DataGap]:
        """
        Scan database and detect all gaps in market data.
        
        Returns:
            List of detected gaps, sorted by priority
        """
        self.logger.debug(f"Starting gap detection (lookback: {self.lookback_days} days)")
        
        gaps: List[DataGap] = []
        
        try:
            async with get_async_session() as session:
                # Check 0: Find symbols with NO data at all (highest priority!)
                missing_symbols_gaps = await self._find_missing_symbols(session)
                gaps.extend(missing_symbols_gaps)
                
                # Check 1: Find incomplete validations
                # SKIP incomplete validations - if we've loaded data and it's incomplete,
                # that's all Polygon has for that symbol/date. No point retrying.
                # incomplete_gaps = await self._find_incomplete_validations(session)
                # gaps.extend(incomplete_gaps)
                
                # Check 2: Find symbols with missing validation records
                missing_gaps = await self._find_missing_validations(session)
                gaps.extend(missing_gaps)
                
                # Check 3: Find date ranges with no data
                empty_gaps = await self._find_empty_dates(session)
                gaps.extend(empty_gaps)
            
            # Sort by priority (high priority first), then by date (most recent first)
            gaps.sort(key=lambda g: (g.priority, g.date), reverse=True)
            
            # Update queue
            self.gap_queue = gaps
            
            # Only log if gaps found
            if gaps:
                self.logger.info(
                    f"Gap detection: {len(gaps)} gaps found "
                    f"({len([g for g in gaps if g.priority == 1])} high priority)"
                )
            else:
                self.logger.debug("Gap detection: no gaps found")
            
            return gaps
            
        except Exception as e:
            self.logger.error(f"Gap detection failed: {e}", exc_info=True)
            return []
    
    async def _find_incomplete_validations(self, session: AsyncSession) -> List[DataGap]:
        """Find symbols with incomplete data (is_complete = FALSE)."""
        cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
        
        try:
            result = await session.execute(
                text("""
                    SELECT sdv.symbol, sdv.date, sdv.bar_count
                    FROM symbol_date_validation sdv
                    INNER JOIN ticker_details td ON sdv.symbol = td.symbol
                    WHERE sdv.date >= :cutoff_date
                      AND sdv.is_complete = FALSE
                      AND td.type IN ('CS', 'ETF')
                      AND td.active = true
                    ORDER BY sdv.date DESC, sdv.symbol
                """),
                {"cutoff_date": cutoff_date}
            )
            
            gaps = []
            for row in result:
                symbol = row[0]
                gap_date = row[1]
                bar_count = row[2] or 0

                gaps.append(DataGap(
                    symbol=symbol,
                    date=gap_date,
                    gap_type='incomplete_day',
                    bar_count=bar_count,
                    priority=1  # Treat any incomplete load as high priority
                ))
            
            self.logger.debug(f"Found {len(gaps)} incomplete validations")
            return gaps
            
        except Exception as e:
            self.logger.error(f"Error finding incomplete validations: {e}")
            return []
    
    async def _find_missing_symbols(self, session: AsyncSession) -> List[DataGap]:
        """
        Find symbols in ticker_details that have NO validation records at all.
        
        These are symbols we've never attempted to load data for.
        Creates gaps for most recent date only to trigger backfill for the whole lookback period.
        """
        cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
        today = datetime.now(timezone.utc).date()
        
        try:
            # Get symbols from ticker_details that have no validation records
            result = await session.execute(
                text("""
                    SELECT td.symbol
                    FROM ticker_details td
                    WHERE td.type IN ('CS', 'ETF')
                      AND td.active = true
                      AND td.symbol NOT IN (
                          SELECT DISTINCT symbol 
                          FROM symbol_date_validation
                      )
                    ORDER BY td.symbol
                    LIMIT 1000
                """)
            )
            
            missing_symbols = [row[0] for row in result]
            
            if not missing_symbols:
                return []
            
            self.logger.info(f"Found {len(missing_symbols)} symbols with NO data at all")
            
            # Create a gap for each missing symbol for yesterday (to trigger backfill)
            # The backfill will load the entire lookback period
            yesterday = today - timedelta(days=1)
            # Skip weekends - use last trading day instead
            if _is_weekend(yesterday):
                yesterday = _prev_trading_day(yesterday)
            gaps = [
                DataGap(
                    symbol=symbol,
                    date=yesterday,
                    gap_type='no_data',
                    priority=1  # Highest priority - never loaded
                )
                for symbol in missing_symbols
            ]
            
            return gaps
            
        except Exception as e:
            self.logger.error(f"Error finding missing symbols: {e}")
            return []
    
    async def _find_missing_validations(self, session: AsyncSession) -> List[DataGap]:
        """
        Find symbols that have some data but are missing validation records
        for recent dates.
        """
        cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
        
        try:
            # Get symbols with any validation records (stocks and ETFs only)
            result = await session.execute(
                text("""
                    SELECT DISTINCT sdv.symbol
                    FROM symbol_date_validation sdv
                    INNER JOIN ticker_details td ON sdv.symbol = td.symbol
                    WHERE sdv.date >= :cutoff_date
                      AND td.type IN ('CS', 'ETF')
                      AND td.active = true
                """),
                {"cutoff_date": cutoff_date}
            )
            
            symbols = [row[0] for row in result]
            
            if not symbols:
                return []
            
            # For each symbol, find missing dates
            gaps = []
            for symbol in symbols:
                # Get dates with validation records
                result = await session.execute(
                    text("""
                        SELECT date
                        FROM symbol_date_validation
                        WHERE symbol = :symbol
                          AND date >= :cutoff_date
                        ORDER BY date
                    """),
                    {"symbol": symbol, "cutoff_date": cutoff_date}
                )
                
                validated_dates = {row[0] for row in result}
                
                # Check for gaps in date range (ONLY dates NOT in validated_dates)
                if validated_dates:
                    min_date = min(validated_dates)
                    max_date = max(validated_dates)
                    
                    # Generate expected date range from cutoff_date to today
                    # This ensures we fill gaps BEFORE the existing data, not just within it
                    today = datetime.now(timezone.utc).date()
                    range_start = max(cutoff_date, min_date)  # Start from cutoff or min_date, whichever is later
                    range_end = max_date
                    
                    # Check for gaps within the existing range
                    current_date = range_start
                    while current_date <= range_end:
                        if not _is_weekend(current_date) and current_date not in validated_dates:  # Skip weekends
                            gaps.append(DataGap(
                                symbol=symbol,
                                date=current_date,
                                gap_type='missing_date',
                                priority=2  # Medium priority
                            ))
                        current_date += timedelta(days=1)
                    
                    # CRITICAL FIX: Also check for gaps BEFORE the existing data
                    # If we have data starting after cutoff_date, we need to backfill earlier dates
                    if min_date > cutoff_date:
                        current_date = cutoff_date
                        while current_date < min_date:
                            if not _is_weekend(current_date) and current_date not in validated_dates:  # Skip weekends
                                gaps.append(DataGap(
                                    symbol=symbol,
                                    date=current_date,
                                    gap_type='missing_date',
                                    priority=2  # Medium priority
                                ))
                            current_date += timedelta(days=1)
                    
                    # Also check for gaps AFTER the existing data (up to today)
                    if max_date < today:
                        current_date = max_date + timedelta(days=1)
                        while current_date <= today:
                            if not _is_weekend(current_date) and current_date not in validated_dates:  # Skip weekends
                                gaps.append(DataGap(
                                    symbol=symbol,
                                    date=current_date,
                                    gap_type='missing_date',
                                    priority=2  # Medium priority
                                ))
                            current_date += timedelta(days=1)
            
            self.logger.debug(f"Found {len(gaps)} missing validation dates")
            return gaps
            
        except Exception as e:
            self.logger.error(f"Error finding missing validations: {e}")
            return []
    
    async def _find_empty_dates(self, session: AsyncSession) -> List[DataGap]:
        """
        Find dates in the lookback period with no validation records at all.
        
        This indicates completely missing data for entire market days.
        """
        cutoff_date = datetime.now(timezone.utc).date() - timedelta(days=self.lookback_days)
        
        try:
            # Get all dates with any validation records
            result = await session.execute(
                text("""
                    SELECT DISTINCT date
                    FROM symbol_date_validation
                    WHERE date >= :cutoff_date
                    ORDER BY date
                """),
                {"cutoff_date": cutoff_date}
            )
            
            validated_dates = {row[0] for row in result}
            
            # Generate expected date range (skip weekends)
            gaps = []
            current_date = cutoff_date
            today = datetime.now(timezone.utc).date()
            
            while current_date < today:
                if not _is_weekend(current_date) and current_date not in validated_dates:  # Skip weekends
                    # Any day with no validation records - high priority
                    gaps.append(DataGap(
                        symbol="*",  # Affects all symbols
                        date=current_date,
                        gap_type='no_validation',
                        priority=1  # High priority - entire day missing
                    ))
                current_date += timedelta(days=1)
            
            self.logger.debug(f"Found {len(gaps)} dates with no validation records")
            return gaps
            
        except Exception as e:
            self.logger.error(f"Error finding empty dates: {e}")
            return []
    
    def get_queued_gaps(self, limit: int = 100) -> List[DataGap]:
        """
        Get gaps from the queue for backfill.
        
        Args:
            limit: Maximum number of gaps to return
            
        Returns:
            List of gaps, highest priority first
        """
        return self.gap_queue[:limit]
    
    def get_gap_summary(self) -> Dict:
        """
        Get summary statistics about detected gaps.
        
        Returns:
            Dict with gap counts by type and priority
        """
        if not self.gap_queue:
            return {
                "total_gaps": 0,
                "by_type": {},
                "by_priority": {},
                "unique_symbols": 0
            }
        
        by_type = {}
        by_priority = {}
        symbols = set()
        
        for gap in self.gap_queue:
            # Count by type
            by_type[gap.gap_type] = by_type.get(gap.gap_type, 0) + 1
            
            # Count by priority
            by_priority[gap.priority] = by_priority.get(gap.priority, 0) + 1
            
            # Track symbols
            if gap.symbol != "*":
                symbols.add(gap.symbol)
        
        return {
            "total_gaps": len(self.gap_queue),
            "by_type": by_type,
            "by_priority": by_priority,
            "unique_symbols": len(symbols)
        }


# Global gap detector instance
_gap_detector: GapDetectorService | None = None


def get_gap_detector() -> GapDetectorService | None:
    """Get the global gap detector instance."""
    return _gap_detector


def initialize_gap_detector(lookback_days: int = 30) -> GapDetectorService:
    """
    Initialize the global gap detector service.
    
    Args:
        lookback_days: How many days back to check for gaps
        
    Returns:
        Configured GapDetectorService instance
    """
    global _gap_detector
    
    if _gap_detector is None:
        _gap_detector = GapDetectorService(lookback_days=lookback_days)
        logger.debug(f"Gap detector initialized (lookback: {lookback_days} days)")
    
    return _gap_detector

