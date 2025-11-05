"""
Background Task Management

Utilities for managing async background tasks and caches with expiry.
Used by strategies to track long-running operations and cached data.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from app.services.core.time_context import get_current_time
from typing import Any, Coroutine, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class BackgroundTaskManager:
    """Manage background tasks with automatic cleanup."""
    
    def __init__(self):
        """Initialize task manager."""
        self._tasks: Dict[str, asyncio.Task] = {}
    
    def start_task(
        self,
        key: str,
        coro: Coroutine,
        replace_existing: bool = False
    ) -> asyncio.Task:
        """
        Start a background task with tracking.
        
        Args:
            key: Unique identifier for the task
            coro: Coroutine to run
            replace_existing: If True, cancel existing task with same key
            
        Returns:
            The created asyncio.Task
            
        Raises:
            ValueError: If task with key already exists and replace_existing is False
        """
        # Check if task already exists
        if key in self._tasks:
            existing_task = self._tasks[key]
            if not existing_task.done():
                if replace_existing:
                    logger.debug(f"Cancelling existing task: {key}")
                    existing_task.cancel()
                else:
                    raise ValueError(f"Task with key '{key}' already running")
        
        # Create and track new task
        task = asyncio.create_task(coro)
        self._tasks[key] = task
        
        # Add callback to remove from tracking when done
        def _done_callback(t):
            self._tasks.pop(key, None)
            if t.cancelled():
                logger.debug(f"Task cancelled: {key}")
            elif t.exception():
                logger.error(f"Task failed: {key}, error: {t.exception()}")
        
        task.add_done_callback(_done_callback)
        
        logger.debug(f"Started background task: {key}")
        return task
    
    async def cancel_task(self, key: str) -> None:
        """
        Cancel and cleanup a specific task.
        
        Args:
            key: Task identifier
        """
        if key not in self._tasks:
            return
        
        task = self._tasks[key]
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
        self._tasks.pop(key, None)
        logger.debug(f"Cancelled task: {key}")
    
    async def cancel_all(self) -> None:
        """Cancel all tracked tasks."""
        if not self._tasks:
            return
        
        logger.debug(f"Cancelling {len(self._tasks)} background tasks")
        
        # Cancel all tasks
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        
        # Wait for all to complete
        results = await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        
        # Log any unexpected errors (not CancelledError)
        for i, result in enumerate(results):
            if isinstance(result, Exception) and not isinstance(result, asyncio.CancelledError):
                logger.error(f"Task raised exception during cancellation: {result}")
        
        self._tasks.clear()
        logger.debug("All background tasks cancelled")
    
    def is_running(self, key: str) -> bool:
        """
        Check if task is running.
        
        Args:
            key: Task identifier
            
        Returns:
            True if task exists and is not done
        """
        if key not in self._tasks:
            return False
        
        task = self._tasks[key]
        return not task.done()
    
    def get_task(self, key: str) -> Optional[asyncio.Task]:
        """
        Get task by key.
        
        Args:
            key: Task identifier
            
        Returns:
            Task if exists, None otherwise
        """
        return self._tasks.get(key)
    
    def count_active(self) -> int:
        """
        Count active (not done) tasks.
        
        Returns:
            Number of active tasks
        """
        return sum(1 for task in self._tasks.values() if not task.done())
    
    def get_all_keys(self) -> list[str]:
        """
        Get all tracked task keys.
        
        Returns:
            List of task keys
        """
        return list(self._tasks.keys())


class CacheWithExpiry:
    """Cache with timestamp-based expiry."""
    
    def __init__(self, ttl_seconds: float = 7200):
        """
        Initialize cache with expiry.
        
        Args:
            ttl_seconds: Time-to-live in seconds (default: 2 hours)
        """
        self._cache: Dict[str, Tuple[Any, datetime]] = {}
        self._ttl = ttl_seconds
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get cached value if not expired.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found or expired
        """
        if key not in self._cache:
            return None
        
        value, timestamp = self._cache[key]
        
        # Check if expired
        age = (get_current_time() - timestamp).total_seconds()
        if age > self._ttl:
            # Remove expired entry
            del self._cache[key]
            logger.debug(f"Cache expired: {key} (age: {age:.0f}s)")
            return None
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """
        Cache a value with timestamp.
        
        Args:
            key: Cache key
            value: Value to cache
        """
        self._cache[key] = (value, get_current_time())
    
    def clear(self, key: str) -> None:
        """
        Remove from cache.
        
        Args:
            key: Cache key to remove
        """
        self._cache.pop(key, None)
    
    def clear_all(self) -> None:
        """Clear all cached items."""
        self._cache.clear()
    
    def get_age(self, key: str) -> Optional[float]:
        """
        Get age of cached item in seconds.
        
        Args:
            key: Cache key
            
        Returns:
            Age in seconds or None if not found
        """
        if key not in self._cache:
            return None
        
        _, timestamp = self._cache[key]
        return (get_current_time() - timestamp).total_seconds()
    
    def is_fresh(self, key: str) -> bool:
        """
        Check if cached value exists and is fresh.
        
        Args:
            key: Cache key
            
        Returns:
            True if exists and not expired
        """
        return self.get(key) is not None
    
    def cleanup_expired(self) -> int:
        """
        Remove all expired entries.
        
        Returns:
            Number of entries removed
        """
        now = get_current_time()
        expired_keys = []
        
        for key, (_, timestamp) in self._cache.items():
            age = (now - timestamp).total_seconds()
            if age > self._ttl:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self._cache[key]
        
        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")
        
        return len(expired_keys)
    
    def count(self) -> int:
        """
        Count cached items.
        
        Returns:
            Number of items in cache
        """
        return len(self._cache)
    
    def get_all_keys(self) -> list[str]:
        """
        Get all cache keys.
        
        Returns:
            List of cache keys
        """
        return list(self._cache.keys())
    
    def get_with_metadata(self, key: str) -> Optional[Tuple[Any, float]]:
        """
        Get cached value with age metadata.
        
        Args:
            key: Cache key
            
        Returns:
            (value, age_seconds) tuple or None if not found/expired
        """
        value = self.get(key)
        if value is None:
            return None
        
        age = self.get_age(key)
        return (value, age)


