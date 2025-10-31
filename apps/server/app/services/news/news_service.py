"""
News Service (AI-Specific)

Service for fetching and caching news context for AI-powered strategies.
Separate from math-based utilities as it's specific to AI trading approaches.
"""

import logging
import os
from typing import Optional

from app.services.core.task_manager import BackgroundTaskManager, CacheWithExpiry

logger = logging.getLogger(__name__)


class NewsService:
    """Service for fetching and caching news context."""
    
    def __init__(self, api_url: Optional[str] = None, cache_ttl_seconds: float = 7200):
        """
        Initialize news service.
        
        Args:
            api_url: Base API URL for news endpoint (defaults to env var or localhost)
            cache_ttl_seconds: Cache time-to-live in seconds (default: 2 hours)
        """
        self.api_url = api_url or os.getenv("API_URL", "http://localhost:8000")
        self._cache = CacheWithExpiry(ttl_seconds=cache_ttl_seconds)
    
    async def fetch_news_context(
        self,
        symbol: str,
        days: int = 1
    ) -> str:
        """
        Fetch recent news and format for AI context.
        
        Args:
            symbol: Stock symbol
            days: Number of days of news to fetch
            
        Returns:
            Formatted news context string ready for AI prompts
        """
        try:
            import httpx
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.api_url}/api/news/analyze/{symbol}",
                    params={"days": days}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return self._format_news_data(data)
                else:
                    logger.warning(
                        f"Failed to fetch news for {symbol}: "
                        f"status {response.status_code}"
                    )
                    return "News data unavailable"
        
        except Exception as e:
            logger.warning(f"Error fetching news for {symbol}: {e}")
            return "News data unavailable"
    
    def _format_news_data(self, data: dict) -> str:
        """
        Format news API response for AI context.
        
        Args:
            data: News API response data
            
        Returns:
            Formatted string
        """
        key_events = data.get("key_events", [])
        news_summary = data.get("news_summary", "No recent news")
        
        if key_events:
            events_text = "\n".join([
                f"  • {event['name']}: {event['summary']}"
                for event in key_events[:3]  # Top 3 events
            ])
            return f"{news_summary}\n\nKey Events:\n{events_text}"
        else:
            return news_summary
    
    async def prefetch_background(
        self,
        symbol: str,
        task_manager: BackgroundTaskManager,
        days: int = 1
    ) -> None:
        """
        Start background news fetch and cache result.
        
        This allows pre-fetching news when price approaches a level,
        so it's ready when needed without blocking trade execution.
        
        Args:
            symbol: Stock symbol
            task_manager: Task manager to track the fetch operation
            days: Number of days of news to fetch
        """
        task_key = f"news_fetch_{symbol}"
        
        async def _fetch_and_cache():
            logger.debug(f"🔄 Background news fetch started for {symbol}")
            news_context = await self.fetch_news_context(symbol, days)
            self._cache.set(symbol, news_context)
            logger.info(f"✅ News pre-fetched and cached for {symbol}")
        
        try:
            task_manager.start_task(
                task_key,
                _fetch_and_cache(),
                replace_existing=True
            )
        except Exception as e:
            logger.warning(f"Failed to start background news fetch for {symbol}: {e}")
    
    def get_cached(self, symbol: str) -> Optional[str]:
        """
        Get cached news if available and fresh.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            Cached news context or None if not cached/expired
        """
        return self._cache.get(symbol)
    
    async def get_cached_or_fetch(
        self,
        symbol: str,
        days: int = 1
    ) -> str:
        """
        Get news from cache if available, otherwise fetch fresh.
        
        Args:
            symbol: Stock symbol
            days: Number of days of news (used if fetching)
            
        Returns:
            News context string
        """
        # Try cache first
        cached = self.get_cached(symbol)
        if cached is not None:
            age = self._cache.get_age(symbol)
            logger.debug(
                f"📋 Using cached news for {symbol} "
                f"(age: {age:.0f}s)" if age else ""
            )
            return cached
        
        # Fetch if not cached
        logger.debug(f"🔍 Fetching fresh news for {symbol}")
        news = await self.fetch_news_context(symbol, days)
        
        # Cache for next time
        self._cache.set(symbol, news)
        
        return news
    
    def clear_cache(self, symbol: Optional[str] = None) -> None:
        """
        Clear news cache.
        
        Args:
            symbol: Symbol to clear, or None to clear all
        """
        if symbol:
            self._cache.clear(symbol)
            logger.debug(f"Cleared news cache for {symbol}")
        else:
            self._cache.clear_all()
            logger.debug("Cleared all news cache")
    
    def get_cache_stats(self) -> dict:
        """
        Get cache statistics.
        
        Returns:
            Dict with cache stats
        """
        return {
            "count": self._cache.count(),
            "keys": self._cache.get_all_keys(),
        }
    
    async def wait_for_prefetch(
        self,
        symbol: str,
        task_manager: BackgroundTaskManager,
        timeout_seconds: float = 5.0
    ) -> Optional[str]:
        """
        Wait for a prefetch task to complete with timeout.
        
        Useful when you started a prefetch but now need the result.
        
        Args:
            symbol: Stock symbol
            task_manager: Task manager tracking the fetch
            timeout_seconds: Maximum time to wait
            
        Returns:
            News context if completed, None if timeout
        """
        import asyncio
        
        task_key = f"news_fetch_{symbol}"
        task = task_manager.get_task(task_key)
        
        if task is None:
            # No task running, check cache
            return self.get_cached(symbol)
        
        try:
            # Wait for task with timeout
            await asyncio.wait_for(task, timeout=timeout_seconds)
            return self.get_cached(symbol)
        except asyncio.TimeoutError:
            logger.warning(f"News prefetch timeout for {symbol}")
            return None
        except Exception as e:
            logger.error(f"Error waiting for news prefetch for {symbol}: {e}")
            return None


