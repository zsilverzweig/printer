"""
News Service (AI-Specific)

Service for fetching and caching news context for AI-powered strategies.
Separate from math-based utilities as it's specific to AI trading approaches.
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.services.core.task_manager import BackgroundTaskManager, CacheWithExpiry
from app.services.core.time_context import get_current_time
from app.services.market import market as market_service
from app.services.ai.ai_service import AIService

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
        
        Extracts and formats key events that were filtered for specific types:
        - Earnings reports or financial announcements
        - Product launches or major updates
        - Leadership changes (CEO, CFO, etc.)
        - Mergers, acquisitions, or partnerships
        - Regulatory actions or legal issues
        - Major contracts or deals
        - Fundraising or capital events
        
        Args:
            data: News API response data
            
        Returns:
            Formatted string
        """
        key_events = data.get("key_events", [])
        news_summary = data.get("news_summary", "No recent news")
        
        if key_events:
            # Handle both dict and Pydantic model formats
            events_text = []
            for event in key_events:
                # Handle Pydantic model or dict
                if hasattr(event, 'name'):
                    # Pydantic model
                    name = event.name
                    summary = event.summary
                elif isinstance(event, dict):
                    # Dict format
                    name = event.get('name', 'Unknown Event')
                    summary = event.get('summary', '')
                else:
                    continue
                
                events_text.append(f"  • {name}: {summary}")
            
            events_section = "\n".join(events_text)
            
            # Include event count in summary
            event_count = len(key_events)
            if event_count > 0:
                return f"{news_summary}\n\nKey Events ({event_count} identified):\n{events_section}"
            else:
                return news_summary
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
    
    async def get_recent_events(
        self,
        symbol: str,
        days: int = 14
    ) -> str:
        """
        Get recent key events extracted from news using AI.
        
        This method:
        1. Fetches recent news from Benzinga
        2. Uses AI to extract and filter key events (earnings, product launches, 
           leadership changes, M&A, regulatory actions, major contracts, fundraising)
        3. Returns formatted events string for use in AI prompts
        
        Args:
            symbol: Stock symbol
            days: Number of days of news to analyze (default 1)
            
        Returns:
            Formatted string with key events ready for AI prompts
        """
        try:
            # Calculate date range using get_current_time() for backtesting support
            end_date = get_current_time()
            if end_date.tzinfo is None:
                end_date = end_date.replace(tzinfo=timezone.utc)
            start_date = end_date - timedelta(days=days)
            
            # Fetch news from Benzinga
            # Filter to only news channel and articles explicitly tagged with the ticker
            news_data = market_service.list_benzinga_news(
                ticker=symbol,
                channels="news",  # Only include news channel (exclude Price Target, etc.)
                stocks=symbol,  # Only articles explicitly tagged with this ticker
                published=None,  # Don't filter by date in API call
                limit=100,  # Get more articles to ensure coverage
                sort="published.desc"  # Sort by most recent first
            )
            
            # Filter news by date range
            if news_data and isinstance(news_data, list):
                from dateutil import parser as date_parser
                filtered_news = []
                for article in news_data:
                    try:
                        pub_date_str = article.get('published_utc') or article.get('published')
                        if pub_date_str:
                            pub_date = date_parser.parse(pub_date_str)
                            if pub_date.tzinfo is None:
                                pub_date = pub_date.replace(tzinfo=timezone.utc)
                            if start_date <= pub_date <= end_date:
                                filtered_news.append(article)
                    except Exception:
                        # Include article if we can't parse date
                        filtered_news.append(article)
                
                news_data = filtered_news
            
            if not news_data:
                return "No recent news found"
            
            # Use AI service to extract key events
            ai_service = AIService()
            key_events = await ai_service.extract_key_events(symbol, news_data)
            
            # Format events for AI prompt
            if key_events:
                events_text = "\n".join([
                    f"  • {event.name}: {event.summary}"
                    for event in key_events
                ])
                return f"Recent Key Events ({len(key_events)} identified):\n{events_text}"
            else:
                return "No significant events identified in recent news"
        
        except Exception as e:
            logger.warning(f"Error fetching recent events for {symbol}: {e}")
            return "News events unavailable"


