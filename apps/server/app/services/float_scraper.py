"""
Float scraper service for fetching float metrics from knowthefloat.com.

Provides background task management for scraping float data (public float,
short % of float, outstanding shares) with progress tracking and error handling.

Only processes CS (Common Stock) type tickers as float metrics are only
relevant for common stocks, not ETFs, warrants, or other security types.
"""

import asyncio
import logging
import re
from typing import Dict, List, Optional
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.assets import TickerDetails, AssetLoadingStatus
from app.services.database import get_async_session

logger = logging.getLogger("app.float_scraper")

# Global task management
_current_task: Optional[asyncio.Task] = None
_cancel_flag = False


async def start_float_scraping_task(sample_mode: bool = False) -> Dict[str, any]:
    """
    Start the float scraping background task.
    
    Args:
        sample_mode: If True, only scrape one sample ticker (AAPL) for testing
    
    Returns:
        Dict with status_id and message
        
    Raises:
        ValueError: If a task is already running
    """
    global _current_task, _cancel_flag
    
    if _current_task and not _current_task.done():
        raise ValueError("Float scraping task is already running")
    
    # Reset cancel flag
    _cancel_flag = False
    
    # Create new status record
    async with get_async_session() as session:
        status = AssetLoadingStatus(
            task_type="float_scraping",
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow()
        )
        session.add(status)
        await session.commit()
        await session.refresh(status)
        status_id = status.id
    
    # Start background task
    _current_task = asyncio.create_task(_run_float_scraping_task(status_id, sample_mode=sample_mode))
    
    mode_str = "sample" if sample_mode else "full"
    logger.info(f"Started {mode_str} float scraping task with status_id={status_id}")
    return {
        "status_id": status_id,
        "message": f"Float scraping task started successfully ({'sample mode - 1 ticker' if sample_mode else 'full load'})"
    }


async def cancel_float_scraping_task() -> bool:
    """
    Cancel the currently running float scraping task.
    
    Returns:
        True if task was cancelled, False if no task was running
    """
    global _cancel_flag, _current_task
    
    if not _current_task or _current_task.done():
        return False
    
    _cancel_flag = True
    logger.info("Float scraping task cancellation requested")
    
    # Update status to cancelled
    async with get_async_session() as session:
        await session.execute(
            update(AssetLoadingStatus)
            .where(AssetLoadingStatus.status == "running")
            .where(AssetLoadingStatus.task_type == "float_scraping")
            .values(
                status="cancelled",
                completed_at=datetime.utcnow(),
                last_updated=datetime.utcnow()
            )
        )
        await session.commit()
    
    return True


async def get_float_scraping_status() -> Optional[Dict]:
    """
    Get the current float scraping status.
    
    Returns:
        Dictionary with status information or None if no status found
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(AssetLoadingStatus)
            .where(AssetLoadingStatus.task_type == "float_scraping")
            .order_by(AssetLoadingStatus.id.desc())
            .limit(1)
        )
        status = result.scalar_one_or_none()
        
        if not status:
            return None
        
        # Calculate estimated time remaining
        estimated_remaining = None
        if (status.status == "running" and 
            status.total_tickers and 
            status.processed_tickers > 0 and 
            status.started_at):
            
            elapsed = (datetime.utcnow() - status.started_at).total_seconds()
            rate = status.processed_tickers / elapsed
            remaining_tickers = status.total_tickers - status.processed_tickers
            estimated_seconds = remaining_tickers / rate if rate > 0 else None
            
            if estimated_seconds:
                hours = int(estimated_seconds // 3600)
                minutes = int((estimated_seconds % 3600) // 60)
                estimated_remaining = f"{hours}h {minutes}m"
        
        return {
            "status": status.status,
            "total_tickers": status.total_tickers,
            "processed_tickers": status.processed_tickers,
            "failed_tickers": status.failed_tickers,
            "current_phase": status.current_phase,
            "error_message": status.error_message,
            "started_at": status.started_at.isoformat() if status.started_at else None,
            "completed_at": status.completed_at.isoformat() if status.completed_at else None,
            "estimated_remaining": estimated_remaining,
            "progress_percentage": (
                (status.processed_tickers / status.total_tickers * 100) 
                if status.total_tickers and status.total_tickers > 0 else 0
            )
        }


async def _run_float_scraping_task(status_id: int, sample_mode: bool = False) -> None:
    """
    Main float scraping task orchestrator.
    
    Args:
        status_id: ID of the AssetLoadingStatus record to update
        sample_mode: If True, only scrape AAPL as a sample
    """
    try:
        mode_str = "sample" if sample_mode else "full"
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        logger.info(f"[{status_id}] 🚀 Starting {mode_str} float scraping task")
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        
        # Phase 1: Get list of CS (Common Stock) tickers
        logger.info(f"[{status_id}] 📋 PHASE 1: Fetching CS tickers from database")
        if sample_mode:
            logger.info(f"[{status_id}] Sample mode enabled - will only scrape AAPL")
            await _update_status(status_id, "running", "Sample mode: Loading AAPL only...")
            ticker_symbols = ["AAPL"]
        else:
            logger.info(f"[{status_id}] Full mode - fetching all CS type tickers")
            await _update_status(status_id, "running", "Fetching CS tickers from database...")
            ticker_symbols = await _get_cs_tickers(status_id)
        
        logger.info(f"[{status_id}] ✅ Phase 1 complete: Got {len(ticker_symbols)} CS tickers")
        
        if _cancel_flag:
            logger.info(f"[{status_id}] ❌ Cancelled after Phase 1")
            await _update_status(status_id, "cancelled", "Task cancelled by user")
            return
        
        if not ticker_symbols:
            logger.error(f"[{status_id}] ❌ No CS tickers found!")
            await _update_status(status_id, "failed", "No CS tickers found in database")
            return
        
        # Update total count
        logger.info(f"[{status_id}] Setting total_tickers to {len(ticker_symbols)}")
        await _update_status(status_id, "running", f"Scraping float data for {len(ticker_symbols)} CS tickers...", 
                           total_tickers=len(ticker_symbols))
        
        # Phase 2: Scrape float data for each ticker
        logger.info(f"[{status_id}] 📊 PHASE 2: Scraping float data from knowthefloat.com")
        await _scrape_all_tickers(status_id, ticker_symbols)
        logger.info(f"[{status_id}] ✅ Phase 2 complete")
        
        if _cancel_flag:
            logger.info(f"[{status_id}] ❌ Cancelled after Phase 2")
            await _update_status(status_id, "cancelled", "Task cancelled by user")
            return
        
        # Mark as completed
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        logger.info(f"[{status_id}] ✅ Float scraping completed successfully!")
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        await _update_status(status_id, "completed", "Float scraping completed successfully")
        
    except Exception as e:
        logger.error(f"[{status_id}] ❌❌❌ Float scraping task FAILED ❌❌❌")
        logger.error(f"[{status_id}] Error: {e}", exc_info=True)
        await _update_status(status_id, "failed", f"Task failed: {str(e)}")
    finally:
        global _current_task
        _current_task = None
        logger.info(f"[{status_id}] Task cleanup complete")


async def _get_cs_tickers(status_id: int) -> List[str]:
    """
    Fetch CS (Common Stock) type ticker symbols that don't have float data yet.
    
    Args:
        status_id: Status record ID for progress updates
        
    Returns:
        List of ticker symbols with type='CS' that need float data
    """
    try:
        logger.info(f"[{status_id}] Querying database for CS type tickers WITHOUT float data")
        await _update_status(status_id, "running", "Fetching CS tickers without float data...")
        
        async with get_async_session() as session:
            # Query for active CS type tickers that don't have float data yet
            result = await session.execute(
                select(TickerDetails.symbol)
                .where(TickerDetails.type == "CS")
                .where(TickerDetails.active == True)
                .where(TickerDetails.public_float == None)  # Only tickers without float data
                .order_by(TickerDetails.symbol)
            )
            ticker_symbols = [row[0] for row in result.fetchall()]
        
        logger.info(f"[{status_id}] ✅ Found {len(ticker_symbols)} CS tickers needing float data")
        logger.info(f"[{status_id}] Sample tickers: {ticker_symbols[:10]}")
        
        await _update_status(status_id, "running", f"Found {len(ticker_symbols)} CS tickers to scrape")
        
        return ticker_symbols
        
    except Exception as e:
        logger.error(f"[{status_id}] ❌ Error fetching CS tickers: {e}", exc_info=True)
        raise


async def _scrape_all_tickers(status_id: int, ticker_symbols: List[str]) -> None:
    """
    Scrape float data for all tickers from knowthefloat.com.
    
    Args:
        status_id: Status record ID for progress updates
        ticker_symbols: List of ticker symbols to scrape
    """
    logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
    logger.info(f"[{status_id}] 📊 Starting to scrape float data for {len(ticker_symbols)} tickers")
    logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
    
    processed = 0
    failed = 0
    batch_size = 10  # Process 10 at a time, then sleep 2s
    
    logger.info(f"[{status_id}] ⚙️  Processing in batches of {batch_size} (10 requests per 2s)")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(ticker_symbols), batch_size):
            if _cancel_flag:
                logger.info(f"[{status_id}] Cancel flag detected, stopping scraping")
                break
            
            batch_num = (i // batch_size) + 1
            total_batches = (len(ticker_symbols) + batch_size - 1) // batch_size
            batch = ticker_symbols[i:i + batch_size]
            
            logger.info(f"[{status_id}] 📦 Processing batch {batch_num}/{total_batches} with {len(batch)} tickers")
            logger.info(f"[{status_id}] 🎯 Batch tickers: {', '.join(batch)}")
            
            # Process batch concurrently
            tasks = []
            for ticker in batch:
                task = _scrape_single_ticker(client, ticker)
                tasks.append(task)
            
            # Wait for batch to complete
            logger.info(f"[{status_id}] ⏳ Awaiting {len(tasks)} concurrent requests for batch {batch_num}...")
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            batch_processed = 0
            batch_failed = 0
            
            for idx, result in enumerate(results):
                if isinstance(result, Exception):
                    batch_failed += 1
                    logger.warning(f"[{status_id}] ❌ {batch[idx]} failed: {result}")
                elif result is None:
                    batch_failed += 1
                    logger.warning(f"[{status_id}] ⚠️  {batch[idx]} returned no data (ticker not found on site)")
                else:
                    batch_processed += 1
                    logger.info(f"[{status_id}] ✅ {batch[idx]} scraped successfully")
            
            processed += batch_processed
            failed += batch_failed
            
            logger.info(f"[{status_id}] ✔️  Batch {batch_num}/{total_batches} complete: {batch_processed} succeeded, {batch_failed} failed")
            logger.info(f"[{status_id}] 📊 Overall progress: {processed}/{len(ticker_symbols)} processed ({(processed/len(ticker_symbols)*100):.1f}%), {failed} failed")
            
            # Update progress
            await _update_status(status_id, "running", 
                               f"Processed {processed}/{len(ticker_symbols)} tickers...",
                               processed_tickers=processed, failed_tickers=failed)
            
            # Rate limiting: sleep 2s between batches (10 requests per 2s)
            if i + batch_size < len(ticker_symbols):  # Don't sleep after last batch
                logger.info(f"[{status_id}] 💤 Sleeping 2s for rate limiting (10 req/2s)...")
                await asyncio.sleep(2.0)
    
    logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
    logger.info(f"[{status_id}] ✅ Completed scraping: {processed} processed, {failed} failed")
    logger.info(f"[{status_id}] ════════════════════════════════════════════════════")


async def _scrape_single_ticker(client: httpx.AsyncClient, ticker: str) -> Optional[Dict]:
    """
    Scrape float data for a single ticker from knowthefloat.com.
    
    Args:
        client: HTTP client instance
        ticker: Ticker symbol to scrape
        
    Returns:
        Dict with float data or None if scraping failed
    """
    try:
        url = f"https://knowthefloat.com/ticker/{ticker}"
        logger.debug(f"Scraping float data for {ticker} from {url}")
        
        response = await client.get(url)
        
        if response.status_code == 404:
            logger.warning(f"Ticker {ticker} not found on knowthefloat.com (404)")
            return None
        
        if response.status_code != 200:
            logger.warning(f"knowthefloat.com returned status {response.status_code} for {ticker}")
            return None
        
        response.raise_for_status()
        html = response.text
        
        # Parse HTML and extract float data
        float_data = _parse_knowthefloat_html(html, ticker)
        
        if not float_data:
            logger.warning(f"No float data parsed for ticker {ticker}")
            return None
        
        # Store in database
        await _store_float_data(ticker, float_data)
        
        logger.debug(f"Successfully scraped and stored float data for {ticker}")
        return float_data
        
    except Exception as e:
        logger.warning(f"Failed to scrape ticker {ticker}: {e}")
        return None


def _parse_knowthefloat_html(html: str, ticker: str) -> Optional[Dict]:
    """
    Parse HTML from knowthefloat.com and extract averaged float metrics.
    
    The site shows data from 4 sources in card divs:
    - Yahoo Finance
    - Finviz
    - Wall St Journal
    - Dilusion Tracker
    
    We extract float, short % of float, and outstanding shares from each
    source and calculate the average (excluding empty values).
    
    Args:
        html: HTML content from knowthefloat.com
        ticker: Ticker symbol (for logging)
        
    Returns:
        Dict with averaged float metrics or None if parsing failed
    """
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        float_values = []
        short_percent_values = []
        outstanding_shares_values = []
        
        # Find all card bodies (each represents a data source)
        cards = soup.find_all('div', class_='card-body')
        
        for i, card in enumerate(cards):
            # Find the three metric sections in each card
            float_section = card.find('div', class_='float-section')
            short_section = card.find('div', class_='short-percent-section')
            outstanding_section = card.find('div', class_='outstanding-shares-section')
            
            # Extract float value
            if float_section:
                p_tag = float_section.find('p')
                if p_tag and p_tag.text.strip():
                    float_text = p_tag.text.strip()
                    value = _parse_number_with_suffix(float_text)
                    if value is not None and value > 0:
                        float_values.append(value)
            
            # Extract short % value
            if short_section:
                p_tag = short_section.find('p')
                if p_tag and p_tag.text.strip():
                    short_text = p_tag.text.strip().replace('%', '')
                    try:
                        value = float(short_text)
                        if 0 <= value <= 100:
                            short_percent_values.append(value)
                    except ValueError:
                        pass
            
            # Extract outstanding shares value
            if outstanding_section:
                p_tag = outstanding_section.find('p')
                if p_tag and p_tag.text.strip():
                    outstanding_text = p_tag.text.strip()
                    value = _parse_number_with_suffix(outstanding_text)
                    if value is not None and value > 0:
                        outstanding_shares_values.append(value)
        
        # Calculate averages
        avg_float = int(sum(float_values) / len(float_values)) if float_values else None
        avg_short_percent = round(sum(short_percent_values) / len(short_percent_values), 2) if short_percent_values else None
        avg_outstanding = int(sum(outstanding_shares_values) / len(outstanding_shares_values)) if outstanding_shares_values else None
        
        if not any([avg_float, avg_short_percent, avg_outstanding]):
            logger.warning(f"No valid float data found for {ticker}")
            return None
        
        return {
            "public_float": avg_float,
            "short_percent_of_float": avg_short_percent,
            "outstanding_shares_scraped": avg_outstanding
        }
        
    except Exception as e:
        logger.warning(f"Failed to parse HTML for {ticker}: {e}")
        import traceback
        traceback.print_exc()
        return None


def _parse_number_with_suffix(text: str) -> Optional[int]:
    """
    Parse a number with suffix like "18.25M", "1.5B", or "15.54 B" into an integer.
    
    Handles both formats:
    - No space: "15.41B"
    - With space: "15.54 B"
    
    Args:
        text: Number string with optional M/B/K suffix
        
    Returns:
        Integer value or None if parsing failed
    """
    try:
        text = text.strip().upper()
        
        # Extract number and suffix (with optional space between them)
        match = re.match(r'([\d.]+)\s*([MBK]?)', text)
        if not match:
            return None
        
        number = float(match.group(1))
        suffix = match.group(2)
        
        # Apply multiplier
        if suffix == 'K':
            return int(number * 1_000)
        elif suffix == 'M':
            return int(number * 1_000_000)
        elif suffix == 'B':
            return int(number * 1_000_000_000)
        else:
            return int(number)
            
    except (ValueError, AttributeError):
        return None


async def _store_float_data(ticker: str, float_data: Dict) -> None:
    """
    Store float data in the database.
    
    Args:
        ticker: Ticker symbol
        float_data: Dict with public_float, short_percent_of_float, outstanding_shares_scraped
    """
    try:
        async with get_async_session() as session:
            # Get existing ticker details
            result = await session.execute(
                select(TickerDetails)
                .where(TickerDetails.symbol == ticker)
            )
            ticker_details = result.scalar_one_or_none()
            
            if not ticker_details:
                logger.warning(f"Ticker {ticker} not found in database, skipping float data storage")
                return
            
            # Update float fields
            if float_data.get("public_float") is not None:
                ticker_details.public_float = float_data["public_float"]
            if float_data.get("short_percent_of_float") is not None:
                ticker_details.short_percent_of_float = float_data["short_percent_of_float"]
            if float_data.get("outstanding_shares_scraped") is not None:
                ticker_details.outstanding_shares_scraped = float_data["outstanding_shares_scraped"]
            
            ticker_details.updated_at = datetime.utcnow()
            
            await session.commit()
            
    except Exception as e:
        logger.warning(f"Failed to store float data for {ticker}: {e}")
        raise


async def _update_status(
    status_id: int, 
    status: str, 
    phase: Optional[str] = None,
    total_tickers: Optional[int] = None,
    processed_tickers: Optional[int] = None,
    failed_tickers: Optional[int] = None,
    error_message: Optional[str] = None
) -> None:
    """
    Update the scraping status record.
    
    Args:
        status_id: ID of the status record
        status: New status value
        phase: Current phase (optional)
        total_tickers: Total number of tickers (optional)
        processed_tickers: Number of processed tickers (optional)
        failed_tickers: Number of failed tickers (optional)
        error_message: Error message (optional)
    """
    async with get_async_session() as session:
        update_data = {
            "status": status,
            "last_updated": datetime.utcnow()
        }
        
        if phase is not None:
            update_data["current_phase"] = phase
        if total_tickers is not None:
            update_data["total_tickers"] = total_tickers
        if processed_tickers is not None:
            update_data["processed_tickers"] = processed_tickers
        if failed_tickers is not None:
            update_data["failed_tickers"] = failed_tickers
        if error_message is not None:
            update_data["error_message"] = error_message
        if status in ["completed", "failed", "cancelled"]:
            update_data["completed_at"] = datetime.utcnow()
        
        await session.execute(
            update(AssetLoadingStatus)
            .where(AssetLoadingStatus.id == status_id)
            .values(**update_data)
        )
        await session.commit()

