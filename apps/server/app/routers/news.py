"""News API endpoints."""

import logging
import urllib.error
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException

from app.services.market import market as market_service
from app.services.ai.ai_service import AIService, NewsAnalysisResponse

logger = logging.getLogger("app.routers.news")

router = APIRouter()


@router.get("")
async def list_news(
    ticker: Optional[str] = None,
    published_utc: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 10,
    sort: Optional[str] = None,
    channels: Optional[str] = None,
    tags: Optional[str] = None,
    author: Optional[str] = None,
    stocks: Optional[str] = None,
):
    """List news articles using Benzinga news service.
    
    Supports all Benzinga API filters:
    - ticker: Filter by ticker symbol
    - published_utc: Date filter (YYYY-MM-DD) or timestamp
    - channels: Filter by channel (e.g., "news", "Price Target")
    - tags: Filter by tags
    - author: Filter by author name
    - stocks: Filter by stock symbols
    """
    logger.info(f"News API request - ticker: {ticker}, limit: {limit}, filters: channels={channels}, tags={tags}, author={author}, stocks={stocks}")
    
    try:
        # Use Benzinga news service directly
        result = market_service.list_benzinga_news(
            ticker=ticker,
            published=published_utc,
            order=order,
            limit=limit,
            sort=sort,
            channels=channels,
            tags=tags,
            author=author,
            stocks=stocks,
        )
        logger.info(f"News API returned {len(result) if isinstance(result, list) else -1} items")
        return result
        
    except urllib.error.HTTPError as e:
        status = getattr(e, "code", 502)
        detail = (
            "Polygon Benzinga News access required (subscription). "
            "Please enable the Benzinga news add-on in Polygon."
        )
        raise HTTPException(status_code=int(status), detail=detail)
    except Exception as e:
        logger.error(f"Error in news endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stats")
async def get_news_stats(
    date: Optional[str] = None,
    limit: int = 50000,  # Use max limit since API supports it
    channels: Optional[str] = None,
    tags: Optional[str] = None,
    author: Optional[str] = None,
    stocks: Optional[str] = None,
    tickers: Optional[str] = None,
):
    """Get news statistics for a given date.
    
    Uses the API's published parameter for server-side filtering when possible.
    According to Benzinga API docs, published accepts 'yyyy-mm-dd' format.
    
    Returns:
    - Total number of articles
    - Number of unique tickers with news
    - Tags/categories breakdown
    - Sample article structure
    - Diagnostic info about date ranges found
    """
    from dateutil import parser as date_parser
    from collections import Counter
    
    try:
        # Parse date or use today
        if date:
            target_date = date_parser.parse(date).date()
        else:
            target_date = datetime.now(timezone.utc).date()
        
        logger.info(f"Fetching news stats for date: {target_date}")
        
        # Use published parameter for server-side filtering
        # Format: YYYY-MM-DD (per API docs: https://massive.com/docs/rest/partners/benzinga/news)
        published_param = target_date.strftime("%Y-%m-%d")
        
        # Fetch news with date filter and additional filters - trust API filtering
        # If API filters correctly, we shouldn't need client-side filtering
        news_data = None
        api_filtered = False
        active_filters = []
        if date:
            active_filters.append(f"published={published_param}")
        if channels:
            active_filters.append(f"channels={channels}")
        if tags:
            active_filters.append(f"tags={tags}")
        if author:
            active_filters.append(f"author={author}")
        if stocks:
            active_filters.append(f"stocks={stocks}")
        if tickers:
            active_filters.append(f"tickers={tickers}")
        
        try:
            news_data = market_service.list_benzinga_news(
                ticker=tickers,  # Use tickers parameter if provided
                published=published_param if date else None,  # Server-side filtering
                limit=limit,
                sort="published.desc",
                channels=channels,
                tags=tags,
                author=author,
                stocks=stocks,
            )
            api_filtered = True
            filter_str = ", ".join(active_filters) if active_filters else "none"
            logger.info(f"Fetched {len(news_data) if isinstance(news_data, list) else 0} articles with filters: {filter_str} (API filtered)")
        except Exception as e:
            logger.warning(f"API filtering failed: {e}, falling back to client-side filtering")
            # Fallback: fetch without filters and filter client-side
            news_data = market_service.list_benzinga_news(
                ticker=None,
                published=None,
                limit=limit,
                sort="published.desc",
            )
            api_filtered = False
        
        if not news_data or not isinstance(news_data, list):
            return {
                "date": str(target_date),
                "total_articles": 0,
                "unique_tickers": 0,
                "ticker_counts": {},
                "tags": {},
                "categories": {},
                "sample_article": None,
                "all_fields": [],
                "diagnostics": {
                    "articles_fetched": 0,
                    "articles_matching_date": 0,
                    "date_range_found": {
                        "earliest": None,
                        "latest": None,
                    },
                    "target_date": str(target_date),
                    "api_filter_used": api_filtered,
                    "note": "No news data returned from API"
                }
            }
        
        # Process articles - if API filtered, trust it; otherwise validate dates
        filtered_news = []
        ticker_set = set()
        tags_counter = Counter()
        categories_counter = Counter()
        all_fields = set()
        date_range = {"earliest": None, "latest": None}
        
        for article in news_data:
            try:
                pub_date_str = article.get('published_utc') or article.get('published') or article.get('published_at')
                if not pub_date_str:
                    continue
                    
                pub_date = date_parser.parse(pub_date_str)
                if pub_date.tzinfo is None:
                    pub_date = pub_date.replace(tzinfo=timezone.utc)
                article_date = pub_date.date()
                
                # Track date range for diagnostics
                if date_range["earliest"] is None or article_date < date_range["earliest"]:
                    date_range["earliest"] = article_date
                if date_range["latest"] is None or article_date > date_range["latest"]:
                    date_range["latest"] = article_date
                
                # If API filtered, trust it; otherwise validate
                if api_filtered or article_date == target_date:
                    filtered_news.append(article)
                    
                    # Extract tickers
                    tickers = article.get('tickers', [])
                    if isinstance(tickers, list):
                        ticker_set.update(tickers)
                    elif isinstance(tickers, str):
                        ticker_set.add(tickers)
                    
                    # Extract tags
                    tags = article.get('tags', [])
                    if isinstance(tags, list):
                        tags_counter.update(tags)
                    elif isinstance(tags, str):
                        tags_counter[tags] += 1
                    
                    # Extract categories
                    categories = article.get('categories', [])
                    if isinstance(categories, list):
                        categories_counter.update(categories)
                    elif isinstance(categories, str):
                        categories_counter[categories] += 1
                    
                    # Track all fields for sample
                    all_fields.update(article.keys())
            except Exception as e:
                logger.debug(f"Error parsing article date: {e}")
                continue
        
        # Count tickers
        ticker_counts = Counter()
        for article in filtered_news:
            tickers = article.get('tickers', [])
            if isinstance(tickers, list):
                ticker_counts.update(tickers)
            elif isinstance(tickers, str):
                ticker_counts[tickers] += 1
        
        # Get sample article (one with most fields)
        sample_article = None
        if filtered_news:
            sample_article = max(filtered_news, key=lambda x: len(x.keys()))
        
        # Build diagnostics
        diagnostics = {
            "articles_fetched": len(news_data),
            "articles_matching_date": len(filtered_news),
            "date_range_found": {
                "earliest": str(date_range["earliest"]) if date_range["earliest"] else None,
                "latest": str(date_range["latest"]) if date_range["latest"] else None,
            },
            "target_date": str(target_date),
            "api_filter_used": api_filtered,
            "active_filters": active_filters,
        }
        
        # Only add note if we have issues
        if len(filtered_news) == 0:
            if api_filtered:
                diagnostics["note"] = f"No articles found for {target_date}. The API returned no results for this date."
            else:
                if date_range["earliest"] and target_date < date_range["earliest"]:
                    diagnostics["note"] = f"Target date {target_date} is before earliest available date {date_range['earliest']}. Try a more recent date."
                elif date_range["latest"] and target_date > date_range["latest"]:
                    diagnostics["note"] = f"Target date {target_date} is after latest available date {date_range['latest']}. This is a future date."
                else:
                    diagnostics["note"] = f"No articles found for {target_date}. Date range in fetched articles: {date_range['earliest']} to {date_range['latest']}"
        
        logger.info(f"Stats for {target_date}: {len(filtered_news)} articles found (API filtered: {api_filtered})")
        
        return {
            "date": str(target_date),
            "total_articles": len(filtered_news),
            "unique_tickers": len(ticker_set),
            "ticker_counts": dict(ticker_counts.most_common(50)),
            "tags": dict(tags_counter.most_common(20)),
            "categories": dict(categories_counter.most_common(20)),
            "sample_article": sample_article,
            "all_fields": sorted(list(all_fields)),
            "diagnostics": diagnostics,
        }
        
    except Exception as e:
        logger.error(f"Error getting news stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get news stats: {str(e)}")


@router.get("/analyze/{ticker}")
async def analyze_news(ticker: str, days: int = 7):
    """Analyze news for a ticker using AI to extract key events and provide objective summary."""
    # Only log if we'll actually process news (reduces spam when no news found)
    
    try:
        # Initialize services
        ai_service = AIService()
        
        # Calculate date range for filtering
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        # Fetch news from Polygon Benzinga endpoint
        try:
            news_data = market_service.list_benzinga_news(
                ticker=ticker,
                published=None,  # Don't filter by date in API call
                limit=100,  # Get more articles to ensure coverage
                sort="published.desc"  # Sort by most recent first
            )
            
            # Filter news by date range (since API doesn't support date filtering)
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
                
                # Only log if we have news to process
                if filtered_news:
                    logger.debug(f"{ticker}: {len(filtered_news)} articles in date range")
                news_data = filtered_news
            
        except urllib.error.HTTPError as e:
            status = getattr(e, "code", 502)
            detail = (
                "Polygon Benzinga News access required (subscription). "
                "Please enable the Benzinga news add-on in Polygon."
            )
            raise HTTPException(status_code=int(status), detail=detail)
        
        if not news_data:
            # Silent return for no news (reduces spam)
            return {
                "ticker": ticker,
                "analyzed_at": ai_service._get_current_utc_timestamp(),
                "key_events": [],
                "news_summary": "No recent news found",
                "trade_recommendation": "No news available for analysis",
                "raw_news": []
            }
        
        # Only log when we have news to process
        logger.info(f"Analyzing {len(news_data)} articles for {ticker}")
        
        # Extract key events using AI
        key_events = await ai_service.extract_key_events(ticker, news_data)
        
        # Generate objective news summary using AI
        news_analysis = await ai_service.analyze_news_summary(ticker, news_data, key_events)
        
        # Create more informative news summary
        if len(key_events) > 0:
            event_names = [event.name for event in key_events[:3]]
            events_preview = ", ".join(event_names)
            if len(key_events) > 3:
                events_preview += f", and {len(key_events) - 3} more"
            news_summary = f"Analyzed {len(news_data)} recent articles for {ticker}. Identified {len(key_events)} key event{'s' if len(key_events) != 1 else ''}: {events_preview}."
        else:
            news_summary = f"Analyzed {len(news_data)} recent articles for {ticker}. No major events identified - mostly routine market coverage."
        
        # Create response
        response = NewsAnalysisResponse(
            ticker=ticker,
            analyzed_at=ai_service._get_current_utc_timestamp(),
            key_events=key_events,
            news_summary=news_summary,
            trade_recommendation=news_analysis,
            raw_news=news_data
        )
        
        # Only log if we found events
        if key_events:
            logger.info(f"{ticker}: {len(key_events)} events found")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing news for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze news for {ticker}: {str(e)}")

