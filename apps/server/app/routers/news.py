"""News API endpoints."""

import logging
import urllib.error
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException

from app.services import market as market_service
from app.services.ai_service import AIService, NewsAnalysisResponse

logger = logging.getLogger("app.routers.news")

router = APIRouter()


@router.get("")
async def list_news(
    ticker: Optional[str] = None,
    published_utc: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 10,
    sort: Optional[str] = None,
):
    """List news articles using Benzinga news service."""
    logger.info(f"News API request - ticker: {ticker}, limit: {limit}")
    
    try:
        # Use Benzinga news service directly
        result = market_service.list_benzinga_news(
            ticker=ticker,
            published=published_utc,
            order=order,
            limit=limit,
            sort=sort,
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


@router.get("/analyze/{ticker}")
async def analyze_news(ticker: str, days: int = 7):
    """Analyze news for a ticker using AI to extract key events and provide objective summary."""
    logger.info(f"Starting news analysis - ticker: {ticker}, days: {days}")
    
    try:
        # Initialize services
        ai_service = AIService()
        
        # Calculate date range for filtering
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching news from last {days} days")
        
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
                
                logger.info(f"Filtered to {len(filtered_news)} articles within date range")
                news_data = filtered_news
            
        except urllib.error.HTTPError as e:
            status = getattr(e, "code", 502)
            detail = (
                "Polygon Benzinga News access required (subscription). "
                "Please enable the Benzinga news add-on in Polygon."
            )
            raise HTTPException(status_code=int(status), detail=detail)
        
        if not news_data:
            logger.info("No news data returned, returning empty response")
            return {
                "ticker": ticker,
                "analyzed_at": ai_service._get_current_utc_timestamp(),
                "key_events": [],
                "news_summary": "No recent news found",
                "trade_recommendation": "No news available for analysis",
                "raw_news": []
            }
        
        logger.info(f"Processing {len(news_data)} news articles for {ticker}")
        
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
        
        logger.info(f"News analysis completed for {ticker}: {len(key_events)} events")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing news for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze news for {ticker}: {str(e)}")

