from __future__ import annotations

from typing import Optional
import json
import logging
import urllib.parse
import urllib.request

from fastapi import APIRouter, HTTPException, Query
import urllib.error
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.core import get_client
import app.core as core
from app.services import market as market_service
from app.services import analytics as analytics_service
from app.services.ai_service import AIService, NewsAnalysisResponse

logger = logging.getLogger("app.routers.rest")

router = APIRouter()


class NocConfigUpdate(BaseModel):
    """Request model for updating NOC filter configuration."""
    timeframe: Optional[str] = None  # "1m", "5m", "1h", "close"
    min_change_percent: Optional[float] = None


@router.get("/aggs/{ticker}")
def get_aggregates(
    ticker: str,
    multiplier: int,
    timespan: str,
    from_: str = Query(alias="from"),
    to: str = Query(),
    limit: int = 50000,
    paginate: bool = True,
):
    try:
        client = get_client(pagination=paginate)
        return market_service.list_aggs(client, ticker, multiplier, timespan, from_, to, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/last-trade/{ticker}")
def get_last_trade(ticker: str):
    try:
        client = get_client()
        return market_service.get_last_trade(client, ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/last-quote/{ticker}")
def get_last_quote(ticker: str):
    try:
        client = get_client()
        return market_service.get_last_quote(client, ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/trades/{ticker}")
def list_trades(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
):
    try:
        client = get_client(pagination=paginate)
        return market_service.list_trades(client, ticker, timestamp, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/quotes/{ticker}")
def list_quotes(
    ticker: str,
    timestamp: Optional[str] = None,
    limit: int = 100,
    paginate: bool = True,
):
    try:
        client = get_client(pagination=paginate)
        return market_service.list_quotes(client, ticker, timestamp, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/news")
def list_news(
    ticker: Optional[str] = None,
    published_utc: Optional[str] = None,
    order: Optional[str] = None,
    limit: int = 10,
    sort: Optional[str] = None,
    paginate: bool = True,
):
    import logging
    logger = logging.getLogger("app.rest")
    
    logger.info(f"=== NEWS API REQUEST START ===")
    logger.info(f"News API request received - ticker: {ticker}, limit: {limit}, paginate: {paginate}")
    logger.info(f"All parameters - ticker: {ticker}, published_utc: {published_utc}, order: {order}, limit: {limit}, sort: {sort}, paginate: {paginate}")
    try:
        from app import core as _core
        masked_key = (getattr(_core, "API_KEY", None) or "")
        if masked_key:
            masked_key = masked_key[:6] + "***" + masked_key[-4:]
        logger.info(f"News API using Polygon key: {masked_key}")
    except Exception:
        pass
    
    try:
        # Route to Polygon's Benzinga endpoint by default
        logger.info("Calling market_service.list_benzinga_news...")
        # Map published_utc (YYYY-MM-DD) to Benzinga 'published'
        try:
            result = market_service.list_benzinga_news(
                ticker=ticker,
                published=published_utc,
                order=order,
                limit=limit,
                sort=sort,
            )
            logger.info(
                "News API returned %s items (Benzinga)",
                len(result) if isinstance(result, list) else -1,
            )
        except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
            status = getattr(e, "code", 502)
            detail = (
                "Polygon Benzinga News access required (subscription). "
                "Please enable the Benzinga news add-on in Polygon."
            )
            raise HTTPException(status_code=int(status), detail=detail)
        logger.info(f"News service returned {len(result)} items")
        logger.info(f"Result type: {type(result)}")
        if result:
            logger.info(f"First item type: {type(result[0])}")
            logger.info(f"First item keys: {list(result[0].keys()) if isinstance(result[0], dict) else 'Not a dict'}")
        
        logger.info(f"=== NEWS API REQUEST COMPLETE ===")
        return result
    except HTTPException as he:  # preserve mapped HTTP errors (e.g., subscription required)
        raise he
    except Exception as e:
        logger.error(f"=== NEWS API REQUEST ERROR ===")
        logger.error(f"Error in news endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stock-history")
def stock_history(
    date: Optional[str] = None,
    days: int = 7,
    limit: int = 20,
    adjusted: bool = True,
    min_price: float = 2.0,
    max_price: float = 20.0,
    order_by: str = "avg_volume",
):
    try:
        return analytics_service.stock_history(
            date=date,
            days=days,
            limit=limit,
            adjusted=adjusted,
            min_price=min_price,
            max_price=max_price,
            order_by=order_by,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/ticker-details/{ticker}")
def get_ticker_details(ticker: str):
    """Get detailed company information for a ticker."""
    try:
        client = get_client()
        return market_service.get_ticker_details(client, ticker)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/financials/{ticker}")
def get_ticker_financials(ticker: str, limit: int = 5):
    """Get financial data for a ticker (quarterly/annual reports)."""
    try:
        client = get_client()
        return market_service.get_ticker_financials(client, ticker, limit)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/noc/config")
async def update_noc_config(config: NocConfigUpdate):
    """Update NOC service filter configuration.
    
    This updates the in-memory settings used by the NOC service.
    Changes take effect on the next broadcast cycle.
    """
    from app.routers.realtime import noc_service
    
    if noc_service is None:
        raise HTTPException(
            status_code=503,
            detail="NOC service not initialized. Connect to /noc/ws first."
        )
    
    # Update settings
    if config.timeframe is not None:
        valid_timeframes = ["1m", "5m", "1h", "close"]
        if config.timeframe not in valid_timeframes:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timeframe. Must be one of: {valid_timeframes}"
            )
        noc_service.timeframe = config.timeframe
    
    if config.min_change_percent is not None:
        if config.min_change_percent < 0:
            raise HTTPException(
                status_code=400,
                detail="min_change_percent must be >= 0"
            )
        noc_service.min_change_percent = config.min_change_percent
    
    return {
        "status": "success",
        "config": {
            "timeframe": noc_service.timeframe,
            "min_change_percent": noc_service.min_change_percent,
        }
    }


@router.get("/noc/config")
async def get_noc_config():
    """Get current NOC service filter configuration."""
    from app.routers.realtime import noc_service
    
    if noc_service is None:
        raise HTTPException(
            status_code=503,
            detail="NOC service not initialized. Connect to /noc/ws first."
        )
    
    return {
        "timeframe": noc_service.timeframe,
        "min_change_percent": noc_service.min_change_percent,
    }


@router.get("/test-news")
def test_news():
    """Test endpoint to verify Polygon news API is working"""
    import logging
    logger = logging.getLogger("app.rest")
    
    logger.info("=== TEST NEWS ENDPOINT START ===")
    
    try:
        client = get_client(pagination=True)
        logger.info(f"Client obtained: {type(client)}")
        
        # Test direct Polygon API call
        logger.info("Testing direct Polygon API call...")
        news_items = list(client.list_ticker_news(ticker='AAPL', limit=2))
        logger.info(f"Direct API call returned {len(news_items)} items")
        
        if news_items:
            first_item = news_items[0]
            logger.info(f"First item: {first_item.title if hasattr(first_item, 'title') else 'No title'}")
        
        return {
            "status": "success",
            "items_count": len(news_items),
            "client_type": str(type(client)),
            "has_list_ticker_news": hasattr(client, 'list_ticker_news')
        }
        
    except Exception as e:
        logger.error(f"Test news endpoint error: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e)
        }


@router.get("/news/analyze/{ticker}")
async def analyze_news(ticker: str, days: int = 7):
    """Analyze news for a ticker using AI to extract key events and provide objective summary."""
    import logging
    from datetime import datetime, timedelta, timezone
    logger = logging.getLogger("app.rest")
    
    logger.info("[NewsAnalyze] === STARTING NEWS ANALYSIS ===")
    logger.info("[NewsAnalyze] Ticker: %s, Days: %s", ticker, days)
    
    try:
        # Initialize AI service
        ai_service = AIService()
        logger.info("[NewsAnalyze] AI service initialized")
        
        # Calculate date range for filtering
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        logger.info("[NewsAnalyze] Fetching news from last %s days (%s to %s)", 
                   days, start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
        logger.info("[NewsAnalyze] About to call market_service.list_benzinga_news...")
        
        # Fetch news from Polygon Benzinga endpoint
        # Note: Benzinga API doesn't support date ranges, so we fetch more articles
        # and filter by date after retrieval
        try:
            news_data = market_service.list_benzinga_news(
                ticker=ticker,
                published=None,  # Don't filter by date in API call
                limit=100,  # Get more articles to ensure coverage
                sort="published.desc"  # Sort by most recent first
            )
            logger.info("[NewsAnalyze] list_benzinga_news returned, data type: %s, length: %s", 
                       type(news_data), len(news_data) if isinstance(news_data, list) else "N/A")
            
            # Filter news by date range (since API doesn't support date filtering)
            if news_data and isinstance(news_data, list):
                from dateutil import parser as date_parser
                filtered_news = []
                for article in news_data:
                    try:
                        # Get published date from article
                        pub_date_str = article.get('published_utc') or article.get('published')
                        if pub_date_str:
                            pub_date = date_parser.parse(pub_date_str)
                            # Make sure it's timezone-aware
                            if pub_date.tzinfo is None:
                                pub_date = pub_date.replace(tzinfo=timezone.utc)
                            # Check if within date range
                            if start_date <= pub_date <= end_date:
                                filtered_news.append(article)
                    except Exception as e:
                        logger.warning("[NewsAnalyze] Failed to parse date for article: %s", e)
                        # Include article if we can't parse date
                        filtered_news.append(article)
                
                logger.info("[NewsAnalyze] Filtered to %s articles within date range (from %s total)", 
                           len(filtered_news), len(news_data))
                news_data = filtered_news
            
        except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
            status = getattr(e, "code", 502)
            detail = (
                "Polygon Benzinga News access required (subscription). "
                "Please enable the Benzinga news add-on in Polygon."
            )
            raise HTTPException(status_code=int(status), detail=detail)
        
        if not news_data:
            logger.info("[NewsAnalyze] No news data returned, returning empty response")
            return {
                "ticker": ticker,
                "analyzed_at": ai_service._get_current_utc_timestamp(),
                "key_events": [],
                "news_summary": "No recent news found",
                "trade_recommendation": "No news available for analysis",
                "raw_news": []
            }
        
        logger.info(f"Fetched {len(news_data)} news articles for {ticker}")
        
        # Log sample article titles for debugging
        if news_data:
            sample_titles = [article.get('title', 'No title')[:50] for article in news_data[:3]]
            logger.info(f"Sample article titles: {sample_titles}")
        
        # Log if there's a lot of news (potential problem)
        if len(news_data) >= 8:
            logger.warning(f"High volume of news for {ticker}: {len(news_data)} articles")
        
        # Extract key events using AI
        key_events = await ai_service.extract_key_events(ticker, news_data)
        logger.info(f"Extracted {len(key_events)} key events for {ticker}")
        
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
            trade_recommendation=news_analysis,  # Contains objective summary
            raw_news=news_data  # Include raw news articles
        )
        
        logger.info(f"News analysis completed for {ticker}: {len(key_events)} events, {len(news_data)} raw articles")
        
        return response
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error analyzing news for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze news for {ticker}: {str(e)}")


class TradingAnalysisRequest(BaseModel):
    """Request model for trading analysis."""
    chart_image: str  # Base64 encoded image
    news_summary: dict
    financial_summary: dict


@router.get("/events")
async def get_events(limit: int = 50, event_type: Optional[str] = None):
    """
    Get recent events from the database.
    
    Args:
        limit: Maximum number of events to return (default 50)
        event_type: Filter by event type ('ai_trade' or 'alpaca_trade')
    
    Returns:
        List of events with details
    """
    from app.services.database import get_async_session
    from app.models.events import Event, AITradeEvent, AlpacaTradeEvent
    from sqlalchemy import select, desc
    
    try:
        async with get_async_session() as session:
            events_list = []
            
            if event_type == "ai_trade":
                # Get AI trade events
                stmt = select(AITradeEvent).order_by(desc(AITradeEvent.id)).limit(limit)
                result = await session.execute(stmt)
                ai_events = result.scalars().all()
                
                for event in ai_events:
                    events_list.append({
                        "id": event.id,
                        "type": "ai_trade",
                        "timestamp": event.timestamp.isoformat(),
                        "ticker": event.ticker,
                        "action": event.action,
                        "confidence": event.confidence,
                        "reasoning": event.reasoning,
                        "chart_data_present": event.chart_data_present,
                        "news_data_present": event.news_data_present,
                        "financial_data_present": event.financial_data_present,
                    })
            
            elif event_type == "alpaca_trade":
                # Get Alpaca trade events
                stmt = select(AlpacaTradeEvent).order_by(desc(AlpacaTradeEvent.id)).limit(limit)
                result = await session.execute(stmt)
                alpaca_events = result.scalars().all()
                
                for event in alpaca_events:
                    events_list.append({
                        "id": event.id,
                        "type": "alpaca_trade",
                        "timestamp": event.timestamp.isoformat(),
                        "ticker": event.ticker,
                        "order_id": event.order_id,
                        "side": event.side,
                        "notional": event.notional,
                        "filled_qty": event.filled_qty,
                        "filled_avg_price": event.filled_avg_price,
                        "status": event.status,
                        "submitted_at": event.submitted_at.isoformat() if event.submitted_at else None,
                        "filled_at": event.filled_at.isoformat() if event.filled_at else None,
                        "error_message": event.error_message,
                    })
            
            else:
                # Get all events with proper joins
                # First get AI trade events
                stmt_ai = select(AITradeEvent).order_by(desc(AITradeEvent.id)).limit(limit)
                result_ai = await session.execute(stmt_ai)
                ai_events = result_ai.scalars().all()
                
                for event in ai_events:
                    events_list.append({
                        "id": event.id,
                        "type": "ai_trade",
                        "timestamp": event.timestamp.isoformat(),
                        "ticker": event.ticker,
                        "action": event.action,
                        "confidence": event.confidence,
                        "reasoning": event.reasoning,
                        "chart_data_present": event.chart_data_present,
                        "news_data_present": event.news_data_present,
                        "financial_data_present": event.financial_data_present,
                    })
                
                # Then get Alpaca trade events
                stmt_alpaca = select(AlpacaTradeEvent).order_by(desc(AlpacaTradeEvent.id)).limit(limit)
                result_alpaca = await session.execute(stmt_alpaca)
                alpaca_events = result_alpaca.scalars().all()
                
                for event in alpaca_events:
                    events_list.append({
                        "id": event.id,
                        "type": "alpaca_trade",
                        "timestamp": event.timestamp.isoformat(),
                        "ticker": event.ticker,
                        "order_id": event.order_id,
                        "side": event.side,
                        "notional": event.notional,
                        "filled_qty": event.filled_qty,
                        "filled_avg_price": event.filled_avg_price,
                        "status": event.status,
                        "submitted_at": event.submitted_at.isoformat() if event.submitted_at else None,
                        "filled_at": event.filled_at.isoformat() if event.filled_at else None,
                        "error_message": event.error_message,
                    })
                
                # Sort all events by timestamp descending
                events_list.sort(key=lambda x: x["timestamp"], reverse=True)
                # Limit to requested amount
                events_list = events_list[:limit]
            
            return {"events": events_list, "count": len(events_list)}
    
    except Exception as e:
        logger.error(f"Failed to fetch events: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch events: {str(e)}")


@router.post("/trade/analyze/{ticker}")
async def analyze_trade(ticker: str, request: TradingAnalysisRequest):
    """
    Analyze trading decision using AI with chart image, news, and financial data.
    
    If AI recommends buying with high confidence, executes a $1k paper trade via Alpaca.
    """
    from app.services.alpaca_service import alpaca_service
    from app.services.event_service import event_service
    from dateutil import parser as date_parser
    
    logger.info(f"🔍 [analyze_trade] Trading analysis requested for {ticker}")
    logger.info(f"📊 [analyze_trade] Request data: chart_image_length={len(request.chart_image)}, "
                f"has_news_summary={bool(request.news_summary)}, "
                f"has_financial_summary={bool(request.financial_summary)}")
    
    try:
        # Validate Alpaca service is available
        logger.info(f"🔧 [analyze_trade] Checking Alpaca service availability...")
        if not alpaca_service.is_available():
            logger.error(f"❌ [analyze_trade] Alpaca service not available - missing API credentials")
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        logger.info(f"✅ [analyze_trade] Alpaca service is available")
        
        # Get AI service
        logger.info(f"🤖 [analyze_trade] Initializing AI service...")
        ai_service = AIService()
        logger.info(f"✅ [analyze_trade] AI service initialized")
        
        # Analyze trading decision
        logger.info(f"🧠 [analyze_trade] Sending data to AI for analysis: {ticker}")
        logger.info(f"📈 [analyze_trade] News summary length: {len(str(request.news_summary))}, "
                   f"Financial summary length: {len(str(request.financial_summary))}")
        
        decision = await ai_service.analyze_trading_decision(
            ticker=ticker,
            chart_image_base64=request.chart_image,
            news_data=request.news_summary,
            financial_data=request.financial_summary
        )
        
        logger.info(f"📊 [analyze_trade] AI Decision received: action={decision.get('action')}, "
                   f"confidence={decision.get('confidence', 0):.2f}")
        logger.info(f"📝 [analyze_trade] Key factors: {decision.get('key_factors', [])}")
        logger.info(f"⚠️  [analyze_trade] Risks: {decision.get('risks', [])}")
        
        # Log AI trade analysis event
        await event_service.log_ai_trade_event(
            ticker=ticker,
            action=decision.get('action', 'unknown'),
            confidence=decision.get('confidence', 0.0),
            reasoning=decision.get('reasoning'),
            chart_data_present=bool(request.chart_image),
            news_data_present=bool(request.news_summary),
            financial_data_present=bool(request.financial_summary),
        )
        
        trade_result = None
        trade_error = None
        
        # Execute trade if conditions are met
        if decision.get('action') == 'buy' and decision.get('confidence', 0) > 0.7:
            try:
                logger.info(f"💰 [analyze_trade] AI recommends BUY with confidence {decision['confidence']:.2f}")
                logger.info(f"💵 [analyze_trade] Checking buying power for $1,000 trade...")
                
                # Check buying power
                has_power = await alpaca_service.check_buying_power(required_amount=1000.0)
                logger.info(f"💵 [analyze_trade] Buying power check result: {has_power}")
                
                if not has_power:
                    trade_error = "Insufficient buying power for $1,000 trade"
                    logger.warning(f"⚠️  [analyze_trade] Insufficient buying power for {ticker}")
                else:
                    logger.info(f"🔍 [analyze_trade] Checking for existing position in {ticker}...")
                    # Check if we already have a position
                    existing_position = await alpaca_service.get_position(ticker)
                    
                    if existing_position:
                        trade_error = f"Already have an open position in {ticker}"
                        logger.info(f"⚠️  [analyze_trade] Skipping trade - already have position in {ticker}: {existing_position}")
                    else:
                        logger.info(f"✅ [analyze_trade] No existing position found")
                        # Place market order
                        logger.info(f"📈 [analyze_trade] Placing $1,000 market order for {ticker}")
                        trade_result = await alpaca_service.place_market_order(
                            symbol=ticker,
                            notional=1000.0,
                            side="buy"
                        )
                        logger.info(f"✅ [analyze_trade] Trade executed successfully!")
                        logger.info(f"📝 [analyze_trade] Order details: id={trade_result['id']}, "
                                   f"status={trade_result.get('status')}, "
                                   f"submitted_at={trade_result.get('submitted_at')}")
                        
                        # Log Alpaca trade event
                        submitted_at = None
                        filled_at = None
                        if trade_result.get('submitted_at'):
                            try:
                                submitted_at = date_parser.parse(trade_result['submitted_at'])
                            except Exception:
                                pass
                        if trade_result.get('filled_at'):
                            try:
                                filled_at = date_parser.parse(trade_result['filled_at'])
                            except Exception:
                                pass
                        
                        await event_service.log_alpaca_trade_event(
                            ticker=ticker,
                            side="buy",
                            notional=1000.0,
                            order_id=trade_result.get('id'),
                            client_order_id=trade_result.get('client_order_id'),
                            filled_qty=trade_result.get('filled_qty'),
                            filled_avg_price=trade_result.get('filled_avg_price'),
                            status=trade_result.get('status'),
                            submitted_at=submitted_at,
                            filled_at=filled_at,
                        )
                        
            except Exception as trade_error_exc:
                trade_error = str(trade_error_exc)
                logger.error(f"❌ [analyze_trade] Failed to execute trade for {ticker}: {trade_error}", exc_info=True)
                
                # Log failed trade attempt
                await event_service.log_alpaca_trade_event(
                    ticker=ticker,
                    side="buy",
                    notional=1000.0,
                    error_message=trade_error,
                    status="error",
                )
        else:
            logger.info(
                f"⏸️  [analyze_trade] No trade executed for {ticker}: "
                f"action={decision.get('action')}, "
                f"confidence={decision.get('confidence', 0):.2f} (threshold: 0.7)"
            )
        
        # Return response
        response_data = {
            "ticker": ticker,
            "decision": decision,
            "trade_result": trade_result,
            "trade_error": trade_error,
            "timestamp": ai_service._get_current_utc_timestamp()
        }
        
        logger.info(f"✅ [analyze_trade] Returning response for {ticker}")
        logger.info(f"📦 [analyze_trade] Response summary: has_trade_result={bool(trade_result)}, "
                   f"has_trade_error={bool(trade_error)}")
        
        return response_data
        
    except HTTPException as he:
        logger.error(f"❌ [analyze_trade] HTTP Exception for {ticker}: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"❌ [analyze_trade] Unexpected error analyzing trade for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze trade for {ticker}: {str(e)}")

