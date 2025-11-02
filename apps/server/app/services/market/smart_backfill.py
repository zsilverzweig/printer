"""
Smart backfill service for market data.

Processes gaps detected by the gap detector and backfills missing data
from Polygon API with high-throughput parallel processing (100 concurrent requests by default).
"""

import asyncio
import logging
from datetime import datetime, date, timedelta, timezone
from typing import Dict, List, Optional

from polygon import RESTClient

from app.services.market.gap_detector import DataGap, get_gap_detector
from app.services.market.historical_data_loader import _load_symbol_data
from app.models.assets import AssetLoadingStatus
from app.services.core.database import get_async_session

logger = logging.getLogger("app.smart_backfill")

# Matrix-style status encoding with authentic Matrix color palette
# Symbols encode: [result][bar_range][symbol_type][gap_type]
MATRIX_SYMBOLS = {
    'result': {'success': 'Ω', 'no_data': 'Ψ', 'improved': 'Φ'},
    'bar_range': {'none': '0', 'low': '₁', 'mid': '₂', 'high': '₃'},
    'symbol_type': {'stock': 'ς', 'etf': 'ε', 'multi': 'μ'},
    'gap_type': {'no_data': 'δ', 'missing_date': 'τ', 'incomplete': 'ι'}
}
# Matrix authentic green colors
MATRIX_BRIGHT = '\033[1;92m'  # Bright green (new falling chars)
MATRIX_GREEN = '\033[38;5;46m'  # Electric green (main color)
MATRIX_DIM = '\033[38;5;28m'    # Darker green (fading chars)
MATRIX_CYAN = '\033[1;36m'      # Bright cyan (highlights)
RESET = '\033[0m'

def _encode_matrix_status(
    bar_count: int,
    improved: bool,
    symbol: str,
    gap_type: str,
    is_etf: bool = False
) -> str:
    """
    Generate Matrix-style status code with color-coded status.
    
    Encoding (left to right):
    - Position 1: Result (Ω=success with data, Ψ=no data, Φ=improvement)
    - Position 2: Bar range (0=none, ₁=1-100, ₂=101-300, ₃=300+)
    - Position 3: Symbol type (ς=stock, ε=ETF, μ=multi)
    - Position 4: Gap type (δ=no_data, τ=missing_date, ι=incomplete)
    
    Colors:
    - Bright green: Success with high bar count (300+) or improvements
    - Electric green: Success with medium data
    - Dim green: No data / empty results
    """
    # Result indicator
    if improved:
        result = MATRIX_SYMBOLS['result']['improved']
    elif bar_count > 0:
        result = MATRIX_SYMBOLS['result']['success']
    else:
        result = MATRIX_SYMBOLS['result']['no_data']
    
    # Bar range
    if bar_count == 0:
        bars = MATRIX_SYMBOLS['bar_range']['none']
    elif bar_count <= 100:
        bars = MATRIX_SYMBOLS['bar_range']['low']
    elif bar_count <= 300:
        bars = MATRIX_SYMBOLS['bar_range']['mid']
    else:
        bars = MATRIX_SYMBOLS['bar_range']['high']
    
    # Symbol type
    if symbol == "*":
        sym_type = MATRIX_SYMBOLS['symbol_type']['multi']
    elif is_etf:
        sym_type = MATRIX_SYMBOLS['symbol_type']['etf']
    else:
        sym_type = MATRIX_SYMBOLS['symbol_type']['stock']
    
    # Gap type
    gap = MATRIX_SYMBOLS['gap_type'].get(gap_type, MATRIX_SYMBOLS['gap_type']['missing_date'])
    
    # Choose color based on result quality
    if improved or bar_count >= 300:
        color = MATRIX_BRIGHT  # Bright green for good results
    elif bar_count > 0:
        color = MATRIX_GREEN   # Electric green for some data
    else:
        color = MATRIX_DIM     # Dim green for no data
    
    return f"{color}[{result}{bars}{sym_type}{gap}]{RESET}"


class SmartBackfillService:
    """
    Service that intelligently backfills missing market data.
    
    Consumes gaps from the gap detector and uses the existing historical
    data loader to fetch missing bars from Polygon API.
    
    Features:
    - High-throughput parallel processing (100 concurrent requests)
    - Priority-based processing (high priority gaps first)
    - Progress tracking
    - Graceful degradation on errors
    """
    
    def __init__(
        self,
        api_key: str,
        concurrent_requests: int = 100,
        request_delay_seconds: float = 0.0,
        auto_start: bool = False
    ):
        """
        Initialize smart backfill service.
        
        Args:
            api_key: Polygon API key
            concurrent_requests: Number of concurrent API requests (default 100)
            request_delay_seconds: Delay between requests (default 0.0 = no delay)
            auto_start: Whether to start automatically on first gap detection
        """
        self.api_key = api_key
        self.concurrent_requests = concurrent_requests
        self.request_delay_seconds = request_delay_seconds
        self.auto_start = auto_start
        
        self.rest_client = RESTClient(api_key=api_key)
        
        # State
        self.is_running = False
        self.should_stop = False
        self.task: Optional[asyncio.Task] = None
        
        # Metrics
        self.gaps_processed = 0
        self.gaps_succeeded = 0
        self.gaps_failed = 0
        self.started_at: Optional[datetime] = None
    
    async def start(self) -> None:
        """Start the backfill service."""
        if self.is_running:
            logger.warning("Backfill service already running")
            return
        
        logger.info("Starting smart backfill service")
        
        # Print Matrix legend (only shown once at startup)
        logger.info(f"{MATRIX_CYAN}╔═══════════════════════════════════════════════════════════╗{RESET}")
        logger.info(f"{MATRIX_CYAN}║{RESET}  {MATRIX_BRIGHT}MATRIX STATUS ENCODING: [R][B][T][G]{RESET}                     {MATRIX_CYAN}║{RESET}")
        logger.info(f"{MATRIX_CYAN}║{RESET}  {MATRIX_GREEN}R: Result   → Ω=data Ψ=empty Φ=improved{RESET}                  {MATRIX_CYAN}║{RESET}")
        logger.info(f"{MATRIX_CYAN}║{RESET}  {MATRIX_GREEN}B: Bars     → 0=none ₁=low ₂=mid ₃=high{RESET}                  {MATRIX_CYAN}║{RESET}")
        logger.info(f"{MATRIX_CYAN}║{RESET}  {MATRIX_GREEN}T: Type     → ς=stock ε=etf μ=multi{RESET}                      {MATRIX_CYAN}║{RESET}")
        logger.info(f"{MATRIX_CYAN}║{RESET}  {MATRIX_GREEN}G: Gap      → δ=no_data τ=missing ι=incomplete{RESET}           {MATRIX_CYAN}║{RESET}")
        logger.info(f"{MATRIX_CYAN}╚═══════════════════════════════════════════════════════════╝{RESET}")
        
        self.is_running = True
        self.should_stop = False
        self.started_at = datetime.now(timezone.utc)
        
        # Start background task
        self.task = asyncio.create_task(self._backfill_loop())
        
        logger.info("Smart backfill service started")
    
    async def stop(self) -> None:
        """Stop the backfill service."""
        if not self.is_running:
            return
        
        logger.info("Stopping smart backfill service")
        self.should_stop = True
        
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        
        self.is_running = False
        logger.info("Smart backfill service stopped")
    
    async def backfill_gap(self, gap: DataGap) -> bool:
        """
        Backfill a single data gap.
        
        Args:
            gap: DataGap to backfill
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Matrix loading indicator (cyan for active scanning)
            loading_code = f"{MATRIX_CYAN}[⋯⋯⋯⋯]{RESET}"
            logger.info(f"{loading_code} Backfilling gap: {gap}")
            
            # Determine symbols to backfill
            if gap.symbol == "*":
                # Need to backfill all symbols for this date
                # Get stocks and ETFs from ticker_details table
                try:
                    async with get_async_session() as session:
                        from sqlalchemy import text
                        result = await session.execute(
                            text("""
                                SELECT symbol 
                                FROM ticker_details 
                                WHERE type IN ('CS', 'ETF') 
                                  AND active = true
                                ORDER BY symbol
                            """)
                        )
                        symbols = [row[0] for row in result]
                        logger.info(f"Found {len(symbols)} stocks and ETFs from ticker_details for backfill")
                except Exception as e:
                    logger.error(f"Failed to fetch symbols from ticker_details: {e}")
                    symbols = []
            else:
                # For specific symbol gaps, verify the symbol is a stock or ETF
                # Filter out warrants, rights, units, and other derivative instruments
                try:
                    async with get_async_session() as session:
                        from sqlalchemy import text
                        result = await session.execute(
                            text("""
                                SELECT symbol, type
                                FROM ticker_details 
                                WHERE symbol = :symbol
                                  AND type IN ('CS', 'ETF')
                                  AND active = true
                            """),
                            {"symbol": gap.symbol}
                        )
                        row = result.first()
                        if row:
                            symbols = [gap.symbol]
                        else:
                            # Symbol is not a stock/ETF or not active - skip it
                            skip_code = f"{MATRIX_DIM}[✗✗✗✗]{RESET}"
                            logger.info(f"{skip_code} Skipping {gap.symbol}: not an active stock/ETF (warrant/unit/derivative)")
                            return True  # Mark as successful so we don't retry
                except Exception as e:
                    logger.warning(f"Failed to verify symbol type for {gap.symbol}: {e}")
                    # On error, just process it anyway to avoid blocking
                    symbols = [gap.symbol]
            
            # Check bar counts before backfill (to detect if we're making progress)
            bar_counts_before = {}
            async with get_async_session() as session:
                from sqlalchemy import select
                from app.models.market_data import SymbolDateValidation
                
                for symbol in symbols:
                    stmt = select(SymbolDateValidation).where(
                        SymbolDateValidation.symbol == symbol,
                        SymbolDateValidation.date == gap.date
                    )
                    result = await session.execute(stmt)
                    validation = result.scalar_one_or_none()
                    bar_counts_before[symbol] = validation.bar_count if validation else 0
            
            # Backfill each symbol in parallel
            success_count = 0
            improved_count = 0
            
            # Create semaphore for rate limiting across all symbols
            semaphore = asyncio.Semaphore(self.concurrent_requests)
            
            async def backfill_symbol_task(symbol: str) -> tuple[bool, bool]:
                """Backfill a single symbol and return (success, improved)."""
                try:
                    # Calculate date range (single day)
                    start_date = datetime.combine(gap.date, datetime.min.time()).replace(tzinfo=timezone.utc)
                    end_date = start_date + timedelta(days=1)
                    
                    # Use existing historical data loader function
                    await _load_symbol_data(
                        client=self.rest_client,
                        symbol=symbol,
                        start_date=start_date,
                        end_date=end_date,
                        semaphore=semaphore
                    )
                    
                    # Check if bar count improved
                    async with get_async_session() as session:
                        stmt = select(SymbolDateValidation).where(
                            SymbolDateValidation.symbol == symbol,
                            SymbolDateValidation.date == gap.date
                        )
                        result = await session.execute(stmt)
                        validation = result.scalar_one_or_none()
                        bar_count_after = validation.bar_count if validation else 0
                        
                        improved = bar_count_after > bar_counts_before.get(symbol, 0)
                        return (True, improved)
                    
                except Exception as e:
                    logger.error(f"Error backfilling {symbol} for {gap.date}: {e}")
                    return (False, False)
            
            # Process all symbols concurrently
            results = await asyncio.gather(*[backfill_symbol_task(symbol) for symbol in symbols], return_exceptions=True)
            
            # Count successes and improvements
            for result in results:
                if isinstance(result, Exception):
                    continue
                success, improved = result
                if success:
                    success_count += 1
                if improved:
                    improved_count += 1
            
            self.gaps_succeeded += 1
            
            # Calculate total bars and generate Matrix status
            total_bars_after = 0
            for result in results:
                if not isinstance(result, Exception):
                    success, improved = result
                    if improved:
                        # Get bar count for this symbol
                        async with get_async_session() as session:
                            stmt = select(SymbolDateValidation).where(
                                SymbolDateValidation.symbol == gap.symbol,
                                SymbolDateValidation.date == gap.date
                            )
                            result_val = await session.execute(stmt)
                            validation = result_val.scalar_one_or_none()
                            if validation:
                                total_bars_after = validation.bar_count
            
            # Generate Matrix status code
            matrix_code = _encode_matrix_status(
                bar_count=total_bars_after,
                improved=improved_count > 0,
                symbol=gap.symbol,
                gap_type=gap.gap_type,
                is_etf=False  # Could enhance to detect ETF
            )
            
            # Log results with Matrix encoding
            if improved_count == 0:
                if gap.gap_type == 'no_data':
                    logger.info(f"{matrix_code} Backfilled new symbol {gap.symbol} for {gap.date}: Polygon returned 0 bars (illiquid/delisted)")
                else:
                    logger.info(f"{matrix_code} Validated {gap.symbol} for {gap.date}: Polygon returned 0 bars (no data available)")
            else:
                logger.info(f"{matrix_code} Backfilled {gap.symbol} for {gap.date}: {improved_count}/{len(symbols)} symbols improved (+{total_bars_after:,} bars total)")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to backfill gap {gap}: {e}", exc_info=True)
            self.gaps_failed += 1
            return False
        finally:
            self.gaps_processed += 1
    
    async def backfill_gap_batch(self, gap: DataGap, batch_start: date, batch_end: date) -> bool:
        """
        Backfill a batch of consecutive dates for a symbol (up to 30 days in one API call).
        
        Args:
            gap: DataGap representing the batch (symbol and gap_type)
            batch_start: Start date of the batch
            batch_end: End date of the batch (inclusive)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            loading_code = f"{MATRIX_CYAN}[⋯⋯⋯⋯]{RESET}"
            days_count = (batch_end - batch_start).days + 1
            logger.info(f"{loading_code} Backfilling batch: {gap.symbol} for {days_count} days ({batch_start} to {batch_end})")
            
            # Verify symbol is valid
            async with get_async_session() as session:
                from sqlalchemy import text
                result = await session.execute(
                    text("""
                        SELECT symbol, type
                        FROM ticker_details 
                        WHERE symbol = :symbol
                          AND type IN ('CS', 'ETF')
                          AND active = true
                    """),
                    {"symbol": gap.symbol}
                )
                row = result.first()
                if not row:
                    skip_code = f"{MATRIX_DIM}[✗✗✗✗]{RESET}"
                    logger.info(f"{skip_code} Skipping {gap.symbol}: not an active stock/ETF")
                    return True
            
            # Calculate date range for API call
            start_date = datetime.combine(batch_start, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_date = datetime.combine(batch_end, datetime.min.time()).replace(tzinfo=timezone.utc) + timedelta(days=1)
            
            # Get bar counts before backfill
            async with get_async_session() as session:
                from sqlalchemy import select
                from app.models.market_data import SymbolDateValidation
                
                result = await session.execute(
                    select(SymbolDateValidation).where(
                        SymbolDateValidation.symbol == gap.symbol,
                        SymbolDateValidation.date >= batch_start,
                        SymbolDateValidation.date <= batch_end
                    )
                )
                validations_before = {v.date: v.bar_count for v in result.scalars().all()}
            
            # Create semaphore for rate limiting
            semaphore = asyncio.Semaphore(self.concurrent_requests)
            
            # Fetch data for the entire batch range in one API call
            bars_inserted = await _load_symbol_data(
                client=self.rest_client,
                symbol=gap.symbol,
                start_date=start_date,
                end_date=end_date,
                semaphore=semaphore
            )
            
            # Check if any dates improved
            improved_count = 0
            total_bars_after = 0
            async with get_async_session() as session:
                result = await session.execute(
                    select(SymbolDateValidation).where(
                        SymbolDateValidation.symbol == gap.symbol,
                        SymbolDateValidation.date >= batch_start,
                        SymbolDateValidation.date <= batch_end
                    )
                )
                for validation in result.scalars().all():
                    bar_count_before = validations_before.get(validation.date, 0)
                    if validation.bar_count > bar_count_before:
                        improved_count += 1
                    total_bars_after += validation.bar_count
            
            # Generate Matrix status code
            matrix_code = _encode_matrix_status(
                bar_count=total_bars_after,
                improved=improved_count > 0,
                symbol=gap.symbol,
                gap_type=gap.gap_type,
                is_etf=False
            )
            
            if improved_count > 0:
                logger.info(f"{matrix_code} Backfilled batch {gap.symbol}: {improved_count}/{days_count} days improved (+{bars_inserted:,} bars)")
            else:
                logger.info(f"{matrix_code} Batch {gap.symbol}: Polygon returned 0 bars for {days_count} days")
            
            self.gaps_succeeded += 1
            return True
            
        except Exception as e:
            logger.error(f"Failed to backfill batch {gap.symbol} ({batch_start} to {batch_end}): {e}", exc_info=True)
            self.gaps_failed += 1
            return False
        finally:
            self.gaps_processed += 1
    
    async def _backfill_loop(self) -> None:
        """
        Main backfill loop.
        
        Continuously checks for gaps and backfills them.
        """
        logger.info("Backfill loop started")
        
        while not self.should_stop:
            try:
                # Get gap detector
                gap_detector = get_gap_detector()
                if not gap_detector:
                    logger.warning("Gap detector not initialized, waiting...")
                    await asyncio.sleep(60)
                    continue
                
                # Get gaps from queue
                gaps = gap_detector.get_queued_gaps(limit=100)  # Process 100 gaps per batch
                
                if not gaps:
                    # No gaps to process, wait and check again
                    await asyncio.sleep(60)
                    continue
                
                logger.info(f"Processing {len(gaps)} gaps from queue")
                
                # Group gaps by symbol and batch consecutive dates together (up to 30 days per API call)
                gaps_by_symbol: Dict[str, List[DataGap]] = {}
                for gap in gaps:
                    if gap.symbol == "*":
                        # Wildcard gaps handled separately
                        continue
                    if gap.symbol not in gaps_by_symbol:
                        gaps_by_symbol[gap.symbol] = []
                    gaps_by_symbol[gap.symbol].append(gap)
                
                # Process wildcard gaps first (affect all symbols)
                for gap in gaps:
                    if gap.symbol == "*":
                        if self.should_stop:
                            break
                        await self.backfill_gap(gap)
                
                # Process symbol-specific gaps in batches
                for symbol, symbol_gaps in gaps_by_symbol.items():
                    if self.should_stop:
                        break
                    
                    # Sort gaps by date
                    symbol_gaps.sort(key=lambda g: g.date)
                    
                    if not symbol_gaps:
                        continue
                    
                    # Calculate date range: always fetch at least 30 days back from today
                    today = datetime.now(timezone.utc).date()
                    earliest_gap = min(g.date for g in symbol_gaps)
                    latest_gap = max(g.date for g in symbol_gaps)
                    
                    # Ensure we fetch at least 30 days from today
                    # Start from 30 days ago OR earliest gap, whichever is earlier
                    target_start = min(earliest_gap, today - timedelta(days=30))
                    
                    # End at today (or latest gap if that's later, but shouldn't happen)
                    target_end = max(latest_gap, today)
                    
                    # API supports up to 30 days, so split into 30-day chunks if needed
                    batches = []
                    current_start = target_start
                    
                    while current_start <= target_end:
                        # Calculate end date (30 days from start, or target_end, whichever is earlier)
                        current_end = min(current_start + timedelta(days=30), target_end)
                        
                        # Create a synthetic gap for this batch
                        batch_gap = DataGap(
                            symbol=symbol,
                            date=current_start,
                            gap_type=symbol_gaps[0].gap_type,
                            priority=symbol_gaps[0].priority
                        )
                        
                        batches.append((batch_gap, current_start, current_end))
                        
                        # Move to next batch (start after current_end)
                        current_start = current_end + timedelta(days=1)
                    
                    # Process each batch
                    for batch_gap, batch_start, batch_end in batches:
                        if self.should_stop:
                            break
                        
                        # Backfill the entire batch range at once
                        await self.backfill_gap_batch(batch_gap, batch_start, batch_end)
                
                # After processing, trigger another gap detection
                if not self.should_stop:
                    logger.info("Triggering gap detection after backfill batch")
                    await gap_detector.detect_gaps()
                
                # Brief pause before next iteration
                await asyncio.sleep(5)  # Check every 5 seconds instead of 30
                
            except Exception as e:
                logger.error(f"Error in backfill loop: {e}", exc_info=True)
                await asyncio.sleep(60)
        
        logger.info("Backfill loop stopped")
    
    async def backfill_symbol(
        self,
        symbol: str,
        start_date: date,
        end_date: Optional[date] = None
    ) -> bool:
        """
        Manually trigger backfill for a specific symbol and date range.
        
        Args:
            symbol: Ticker symbol
            start_date: Start date
            end_date: End date (defaults to start_date + 1 day)
            
        Returns:
            True if successful
        """
        if end_date is None:
            end_date = start_date + timedelta(days=1)
        
        try:
            logger.info(f"Manual backfill: {symbol} from {start_date} to {end_date}")
            
            start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            end_dt = datetime.combine(end_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            
            # Need a semaphore for rate limiting
            semaphore = asyncio.Semaphore(self.concurrent_requests)
            await _load_symbol_data(
                client=self.rest_client,
                symbol=symbol,
                start_date=start_dt,
                end_date=end_dt,
                semaphore=semaphore
            )
            
            logger.info(f"Manual backfill complete: {symbol}")
            return True
            
        except Exception as e:
            logger.error(f"Manual backfill failed for {symbol}: {e}", exc_info=True)
            return False
    
    def get_metrics(self) -> Dict:
        """Get backfill metrics."""
        uptime = (datetime.now(timezone.utc) - self.started_at).total_seconds() if self.started_at else 0
        
        return {
            "is_running": self.is_running,
            "gaps_processed": self.gaps_processed,
            "gaps_succeeded": self.gaps_succeeded,
            "gaps_failed": self.gaps_failed,
            "success_rate": (self.gaps_succeeded / self.gaps_processed * 100) if self.gaps_processed > 0 else 0,
            "uptime_seconds": uptime
        }


# Global backfill service instance
_backfill_service: Optional[SmartBackfillService] = None


def get_backfill_service() -> Optional[SmartBackfillService]:
    """Get the global backfill service instance."""
    return _backfill_service


def initialize_backfill_service(
    api_key: str,
    concurrent_requests: int = 100,
    request_delay_seconds: float = 0.0,
    auto_start: bool = False
) -> SmartBackfillService:
    """
    Initialize the global backfill service.
    
    Args:
        api_key: Polygon API key
        concurrent_requests: Concurrent request limit
        request_delay_seconds: Delay between requests
        auto_start: Auto-start on first gap detection
        
    Returns:
        Configured SmartBackfillService instance
    """
    global _backfill_service
    
    if _backfill_service is None:
        _backfill_service = SmartBackfillService(
            api_key=api_key,
            concurrent_requests=concurrent_requests,
            request_delay_seconds=request_delay_seconds,
            auto_start=auto_start
        )
        logger.info("Smart backfill service initialized")
    
    return _backfill_service

