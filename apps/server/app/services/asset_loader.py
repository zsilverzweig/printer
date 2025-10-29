"""
Asset loading service for populating ticker details from Polygon API.

Provides background task management for loading comprehensive ticker data
into the PostgreSQL database with progress tracking and error handling.

Uses the same Polygon snapshot endpoint that the TCC (Trading Command Center) uses,
ensuring consistency and reliability with existing production code.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Set
from datetime import datetime

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app import core
from app.models.assets import TickerDetails, AssetLoadingStatus
from app.services.database import get_async_session

logger = logging.getLogger("app.asset_loader")

# Global task management
_current_task: Optional[asyncio.Task] = None
_cancel_flag = False


async def start_asset_loading_task(sample_mode: bool = False) -> Dict[str, any]:
    """
    Start the asset loading background task.
    
    Args:
        sample_mode: If True, only load one sample ticker (AAPL) for testing
    
    Returns:
        Dict with status_id and message
        
    Raises:
        ValueError: If a task is already running
    """
    global _current_task, _cancel_flag
    
    if _current_task and not _current_task.done():
        raise ValueError("Asset loading task is already running")
    
    # Reset cancel flag
    _cancel_flag = False
    
    # Create new status record
    async with get_async_session() as session:
        status = AssetLoadingStatus(
            status="running",
            started_at=datetime.utcnow(),
            last_updated=datetime.utcnow()
        )
        session.add(status)
        await session.commit()
        await session.refresh(status)
        status_id = status.id
    
    # Start background task
    _current_task = asyncio.create_task(_run_asset_loading_task(status_id, sample_mode=sample_mode))
    
    mode_str = "sample" if sample_mode else "full"
    logger.info(f"Started {mode_str} asset loading task with status_id={status_id}")
    return {
        "status_id": status_id,
        "message": f"Asset loading task started successfully ({'sample mode - 1 ticker' if sample_mode else 'full load'})"
    }


async def cancel_asset_loading_task() -> bool:
    """
    Cancel the currently running asset loading task.
    
    Returns:
        True if task was cancelled, False if no task was running
    """
    global _cancel_flag, _current_task
    
    if not _current_task or _current_task.done():
        return False
    
    _cancel_flag = True
    logger.info("Asset loading task cancellation requested")
    
    # Update status to cancelled
    async with get_async_session() as session:
        await session.execute(
            update(AssetLoadingStatus)
            .where(AssetLoadingStatus.status == "running")
            .values(
                status="cancelled",
                completed_at=datetime.utcnow(),
                last_updated=datetime.utcnow()
            )
        )
        await session.commit()
    
    return True


async def get_loading_status() -> Optional[Dict]:
    """
    Get the current loading status.
    
    Returns:
        Dictionary with status information or None if no status found
    """
    async with get_async_session() as session:
        result = await session.execute(
            select(AssetLoadingStatus)
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


async def _run_asset_loading_task(status_id: int, sample_mode: bool = False) -> None:
    """
    Main asset loading task orchestrator.
    
    Args:
        status_id: ID of the AssetLoadingStatus record to update
        sample_mode: If True, only load AAPL as a sample
    """
    try:
        mode_str = "sample" if sample_mode else "full"
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        logger.info(f"[{status_id}] 🚀 Starting {mode_str} asset loading task")
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        
        # Phase 1: List all tickers (or just AAPL in sample mode)
        logger.info(f"[{status_id}] 📋 PHASE 1: Listing tickers")
        if sample_mode:
            logger.info(f"[{status_id}] Sample mode enabled - will only load AAPL")
            await _update_status(status_id, "listing_tickers", "Sample mode: Loading AAPL only...")
            ticker_symbols = ["AAPL"]
        else:
            logger.info(f"[{status_id}] Full mode - fetching all tickers from Polygon snapshot (same as TCC)")
            # Use the same snapshot endpoint that TCC uses - we know this works!
            await _update_status(status_id, "listing_tickers", "Fetching ticker list from Polygon snapshot...")
            ticker_symbols = await _list_all_tickers_from_snapshot(status_id)
        
        logger.info(f"[{status_id}] ✅ Phase 1 complete: Got {len(ticker_symbols)} tickers")
        
        if _cancel_flag:
            logger.info(f"[{status_id}] ❌ Cancelled after Phase 1")
            await _update_status(status_id, "cancelled", "Task cancelled by user")
            return
        
        if not ticker_symbols:
            logger.error(f"[{status_id}] ❌ No tickers found!")
            await _update_status(status_id, "failed", "No tickers found from API")
            return
        
        # Update total count
        logger.info(f"[{status_id}] Setting total_tickers to {len(ticker_symbols)}")
        await _update_status(status_id, "loading_polygon", f"Loading details for {len(ticker_symbols)} tickers...", 
                           total_tickers=len(ticker_symbols))
        
        # Phase 2: Load details for each ticker
        logger.info(f"[{status_id}] 📊 PHASE 2: Loading Polygon ticker details")
        await _load_polygon_ticker_details(status_id, ticker_symbols)
        logger.info(f"[{status_id}] ✅ Phase 2 complete")
        
        if _cancel_flag:
            logger.info(f"[{status_id}] ❌ Cancelled after Phase 2")
            await _update_status(status_id, "cancelled", "Task cancelled by user")
            return
        
        # Mark as completed
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        logger.info(f"[{status_id}] ✅ Asset loading completed successfully!")
        logger.info(f"[{status_id}] ════════════════════════════════════════════════════")
        await _update_status(status_id, "completed", "Asset loading completed successfully")
        
    except Exception as e:
        logger.error(f"[{status_id}] ❌❌❌ Asset loading task FAILED ❌❌❌")
        logger.error(f"[{status_id}] Error: {e}", exc_info=True)
        await _update_status(status_id, "failed", f"Task failed: {str(e)}")
    finally:
        global _current_task
        _current_task = None
        logger.info(f"[{status_id}] Task cleanup complete")


async def _list_all_tickers_from_snapshot(status_id: int) -> List[str]:
    """
    Fetch all ticker symbols from Polygon snapshot (same as TCC uses).
    
    This reuses the existing screener_snapshot service that already works.
    
    Args:
        status_id: Status record ID for progress updates
        
    Returns:
        List of ticker symbols
    """
    try:
        logger.info(f"[{status_id}] Starting to fetch ticker list from Polygon snapshot")
        await _update_status(status_id, "listing_tickers", "Fetching ticker list from Polygon snapshot...")
        
        # Use the same snapshot fetch that the TCC uses
        from app.services.screener_snapshot import fetch_snapshot_all
        
        logger.info(f"[{status_id}] Calling fetch_snapshot_all() - same as TCC uses")
        tickers = fetch_snapshot_all(core.API_KEY)
        logger.info(f"[{status_id}] Received {len(tickers)} tickers from snapshot")
        
        # Extract ticker symbols from snapshot data
        ticker_symbols = []
        for ticker_data in tickers:
            ticker = ticker_data.get("ticker")
            if ticker:
                ticker_symbols.append(ticker)
        
        logger.info(f"[{status_id}] Extracted {len(ticker_symbols)} ticker symbols")
        logger.info(f"[{status_id}] Sample tickers: {ticker_symbols[:10]}")
        
        logger.info(f"[{status_id}] Successfully found {len(ticker_symbols)} tickers from Polygon snapshot")
        await _update_status(status_id, "listing_tickers", f"Found {len(ticker_symbols)} tickers from snapshot")
        
        return ticker_symbols
        
    except Exception as e:
        logger.error(f"[{status_id}] Error fetching ticker list from snapshot: {e}", exc_info=True)
        raise


async def _load_polygon_ticker_details(status_id: int, ticker_symbols: List[str]) -> None:
    """
    Load detailed information for each ticker from Polygon API.
    
    Args:
        status_id: Status record ID for progress updates
        ticker_symbols: List of ticker symbols to load
    """
    logger.info(f"[{status_id}] Starting to load Polygon details for {len(ticker_symbols)} tickers")
    
    if not core.API_KEY:
        logger.error(f"[{status_id}] POLYGON_API_KEY not set in core.API_KEY")
        raise ValueError("POLYGON_API_KEY not set")
    
    logger.info(f"[{status_id}] Using Polygon API key: {core.API_KEY[:10]}...")
    
    processed = 0
    failed = 0
    batch_size = 50  # Process in batches for better performance
    
    logger.info(f"[{status_id}] Processing in batches of {batch_size}")
    
    async with httpx.AsyncClient() as client:
        for i in range(0, len(ticker_symbols), batch_size):
            if _cancel_flag:
                logger.info(f"[{status_id}] Cancel flag detected, stopping polygon loading")
                break
            
            batch_num = (i // batch_size) + 1
            total_batches = (len(ticker_symbols) + batch_size - 1) // batch_size
            batch = ticker_symbols[i:i + batch_size]
            
            logger.info(f"[{status_id}] Processing batch {batch_num}/{total_batches} with {len(batch)} tickers")
            logger.debug(f"[{status_id}] Batch tickers: {batch[:5]}...")
            
            # Process batch concurrently (but with rate limiting)
            tasks = []
            for ticker in batch:
                task = _load_single_ticker_details(client, ticker)
                tasks.append(task)
            
            # Wait for batch to complete
            logger.debug(f"[{status_id}] Awaiting {len(tasks)} concurrent tasks for batch {batch_num}")
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            batch_processed = 0
            batch_failed = 0
            
            for idx, result in enumerate(results):
                if isinstance(result, Exception):
                    batch_failed += 1
                    logger.warning(f"[{status_id}] Ticker {batch[idx]} failed: {result}")
                else:
                    batch_processed += 1
            
            processed += batch_processed
            failed += batch_failed
            
            logger.info(f"[{status_id}] Batch {batch_num} complete: {batch_processed} succeeded, {batch_failed} failed")
            logger.info(f"[{status_id}] Overall progress: {processed}/{len(ticker_symbols)} processed, {failed} failed")
            
            # Update progress
            await _update_status(status_id, "loading_polygon", 
                               f"Processed {processed}/{len(ticker_symbols)} tickers...",
                               processed_tickers=processed, failed_tickers=failed)
            
            # Rate limiting between batches (2s to be conservative with API limits)
            logger.debug(f"[{status_id}] Sleeping 2s between batches for rate limiting")
            await asyncio.sleep(2.0)
    
    logger.info(f"[{status_id}] ✅ Completed loading ticker details: {processed} processed, {failed} failed")


async def _load_single_ticker_details(client: httpx.AsyncClient, ticker: str) -> None:
    """
    Load details for a single ticker from Polygon API.
    
    Args:
        client: HTTP client instance
        ticker: Ticker symbol to load
    """
    try:
        url = f"https://api.polygon.io/v3/reference/tickers/{ticker}?apikey={core.API_KEY}"
        logger.debug(f"Fetching Polygon details for {ticker}")
        response = await client.get(url)
        
        if response.status_code != 200:
            logger.warning(f"Polygon API returned status {response.status_code} for {ticker}")
        
        response.raise_for_status()
        data = response.json()
        
        result = data.get("results")
        if not result:
            logger.warning(f"No results in response for ticker {ticker}")
            raise ValueError(f"No results for ticker {ticker}")
        
        # Extract data from Polygon response
        ticker_data = {
            "symbol": result.get("ticker"),
            "name": result.get("name"),
            "market": result.get("market"),
            "locale": result.get("locale"),
            "primary_exchange": result.get("primary_exchange"),
            "type": result.get("type"),
            "active": result.get("active"),
            "currency_name": result.get("currency_name"),
            "cik": result.get("cik"),
            "sic_code": result.get("sic_code"),
            "sic_description": result.get("sic_description"),
            "market_cap": result.get("market_cap"),
            "share_class_shares_outstanding": result.get("share_class_shares_outstanding"),
            "weighted_shares_outstanding": result.get("weighted_shares_outstanding"),
            "total_employees": result.get("total_employees"),
            "list_date": result.get("list_date"),
            "homepage_url": result.get("homepage_url"),
            "phone_number": result.get("phone_number"),
            "description": result.get("description"),
        }
        
        # Handle address
        address = result.get("address")
        if address and isinstance(address, dict):
            ticker_data.update({
                "address_line1": address.get("address1"),
                "address_city": address.get("city"),
                "address_state": address.get("state"),
                "address_postal_code": address.get("postal_code"),
            })
        
        # Handle branding
        branding = result.get("branding")
        if branding and isinstance(branding, dict):
            ticker_data.update({
                "logo_url": branding.get("logo_url"),
                "icon_url": branding.get("icon_url"),
            })
        
        # Parse list_date if present
        if ticker_data["list_date"]:
            try:
                ticker_data["list_date"] = datetime.fromisoformat(ticker_data["list_date"].replace("Z", "+00:00")).date()
            except (ValueError, AttributeError):
                ticker_data["list_date"] = None
        
        # Upsert into database
        async with get_async_session() as session:
            # Check if record exists
            existing = await session.get(TickerDetails, ticker)
            
            if existing:
                # Update existing record
                for key, value in ticker_data.items():
                    if value is not None:
                        setattr(existing, key, value)
                existing.updated_at = datetime.utcnow()
            else:
                # Create new record
                ticker_details = TickerDetails(**ticker_data)
                session.add(ticker_details)
            
            await session.commit()
            
    except Exception as e:
        logger.warning(f"Failed to load ticker {ticker}: {e}")
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
    Update the loading status record.
    
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
