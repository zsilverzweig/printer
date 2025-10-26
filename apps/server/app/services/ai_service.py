from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Any, List

import openai
from pydantic import BaseModel, Field

logger = logging.getLogger("app.ai_service")


class KeyEvent(BaseModel):
    event_id: str
    name: str
    summary: str
    url: str
    published_at: str  # UTC ISO 8601
    event_at: str  # UTC ISO 8601


class NewsAnalysisResponse(BaseModel):
    ticker: str
    analyzed_at: str  # UTC ISO 8601
    key_events: List[KeyEvent]
    news_summary: str
    trade_recommendation: str  # Keep for compatibility, but contains objective summary
    raw_news: List[Dict[str, Any]]


class AIService:
    """Simple AI service for news analysis with JSON enforcement."""
    
    def __init__(self):
        self.client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    async def extract_key_events(self, ticker: str, news_data: List[Dict[str, Any]]) -> List[KeyEvent]:
        """Extract key events from news data using AI."""
        news_text = self._format_news_for_ai(news_data)
        
        prompt = f"""Analyze the following news articles for {ticker} and extract the most important key events that could impact stock price.

You will receive {len(news_data)} news articles below. Carefully review each article and identify significant events.

News Data:
{news_text}

Identify major events such as:
- Earnings reports or financial announcements
- Product launches or major updates
- Leadership changes (CEO, CFO, etc.)
- Mergers, acquisitions, or partnerships
- Regulatory actions or legal issues
- Major contracts or deals
- Fundraising or capital events

For each key event, provide:
- event_id: unique identifier (use format: {ticker.lower()}_event_1, {ticker.lower()}_event_2, etc.)
- name: brief event name (2-5 words)
- summary: 1-2 sentence summary of the event and its potential impact
- url: the article URL for this event
- published_at: when the news was published (UTC ISO 8601 format from the article)
- event_at: when the actual event occurred (UTC ISO 8601, use published date if unclear)

Return ONLY a JSON object with this exact structure:
{{
  "events": [
    {{
      "event_id": "bitf_event_1",
      "name": "AI Fundraise Announcement",
      "summary": "Company raised $X million for AI infrastructure.",
      "url": "https://...",
      "published_at": "2025-10-20T15:21:01Z",
      "event_at": "2025-10-20T15:21:01Z"
    }}
  ]
}}

If no significant events are found, return: {{"events": []}}
"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a financial analyst who extracts key events from news. Always respond with valid JSON in the exact format requested."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        
        result = json.loads(response.choices[0].message.content)
        logger.info(f"AI extracted {len(result.get('events', []))} key events for {ticker}")
        logger.debug(f"Key events response: {result}")
        
        # Convert to KeyEvent objects
        events = []
        for event_data in result.get('events', []):
            try:
                events.append(KeyEvent(**event_data))
            except Exception as e:
                logger.warning(f"Failed to parse event: {event_data}. Error: {e}")
        
        return events
    
    async def analyze_news_summary(self, ticker: str, news_data: List[Dict[str, Any]], key_events: List[KeyEvent]) -> str:
        """Provide objective summary of news without trading recommendations."""
        news_text = self._format_news_for_ai(news_data)
        events_text = "\n".join([f"- {event.name}: {event.summary}" for event in key_events]) if key_events else "No key events identified"
        
        prompt = f"""Summarize the recent news for {ticker} objectively, without providing trading advice or sentiment projections.

News Summary:
{news_text}

Key Events:
{events_text}

Provide a factual 2-3 paragraph summary covering:
- What has been happening with {ticker} recently
- Key developments and their context
- Any notable changes or announcements

Be objective and informative. Do NOT include:
- Trading recommendations (buy/sell/hold)
- Sentiment projections (bullish/bearish)
- Price predictions
- Investment advice

Return ONLY a JSON object with this exact structure:
{{
  "summary": "Your objective summary here as a plain text string."
}}
"""
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a financial news analyst providing objective summaries. Never provide trading advice or sentiment. Always respond with valid JSON containing only a 'summary' field with plain text."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )
        
        result = json.loads(response.choices[0].message.content)
        summary = result.get('summary', result.get('analysis', 'Unable to analyze'))
        
        # Ensure summary is a string
        if not isinstance(summary, str):
            # If AI returned nested JSON, try to extract meaningful text
            logger.warning(f"AI returned non-string summary: {type(summary)}")
            if isinstance(summary, dict):
                # Try common keys
                summary = summary.get('text', summary.get('content', str(summary)))
            else:
                summary = str(summary)
        
        logger.info(f"AI news summary for {ticker}: {summary[:100]}...")
        logger.debug(f"Full summary response: {result}")
        
        return summary
    
    def _format_news_for_ai(self, news_data: List[Dict[str, Any]]) -> str:
        """Format news data for AI consumption."""
        formatted_news = []
        
        for i, article in enumerate(news_data, 1):
            title = article.get('title', 'No title')
            summary = article.get('description', article.get('summary', 'No summary'))
            published = article.get('published_utc', article.get('published_at', 'Unknown date'))
            # Try multiple possible URL fields
            url = article.get('article_url', article.get('url', article.get('amp_url', 'No URL')))
            
            formatted_news.append(f"""
[Article {i}]
Title: {title}
Summary: {summary}
Published: {published}
URL: {url}
---""")
        
        return "\n".join(formatted_news)
    
    async def analyze_trading_decision(
        self,
        ticker: str,
        chart_image_base64: str,
        news_data: Dict[str, Any],
        financial_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Analyze trading decision using GPT-4o with vision.
        
        Args:
            ticker: Stock ticker symbol
            chart_image_base64: Base64 encoded chart image
            news_data: News analysis data including key events and summary
            financial_data: Financial information including overview and financials
            
        Returns:
            Dictionary with action, reasoning, and confidence
        """
        logger.info(f"🧠 [analyze_trading_decision] Starting analysis for {ticker}")
        logger.info(f"📊 [analyze_trading_decision] Input data: chart_length={len(chart_image_base64)}, "
                   f"news_keys={list(news_data.keys())}, financial_keys={list(financial_data.keys())}")
        
        # Format news summary
        news_summary = news_data.get('news_summary', 'No recent news available')
        key_events = news_data.get('key_events', [])
        events_text = "\n".join([
            f"- {event.get('name', 'Unknown')}: {event.get('summary', 'No summary')}"
            for event in key_events
        ]) if key_events else "No significant events"
        
        logger.info(f"📰 [analyze_trading_decision] News summary length: {len(news_summary)}, "
                   f"key_events_count: {len(key_events)}")
        
        # Format financial data
        overview = financial_data.get('overview', {})
        financials = financial_data.get('financials', {})
        
        logger.info(f"💰 [analyze_trading_decision] Financial data: overview_keys={list(overview.keys())}, "
                   f"financials_keys={list(financials.keys())}")
        
        financial_summary = f"""
Market Cap: {overview.get('market_cap', 'N/A')}
Exchange: {overview.get('primary_exchange', 'N/A')}
Revenue: {financials.get('revenue', 'N/A')}
Net Income: {financials.get('net_income', 'N/A')}
EPS: {financials.get('eps', 'N/A')}
Total Assets: {financials.get('total_assets', 'N/A')}
Total Liabilities: {financials.get('total_liabilities', 'N/A')}
"""
        
        prompt = f"""You are an expert trading analyst. Analyze this stock and provide a trading decision.

Stock: {ticker}

NEWS ANALYSIS:
{news_summary}

KEY EVENTS:
{events_text}

FINANCIAL DATA:
{financial_summary}

The image shows the stock's price chart with technical indicators including:
- Candlestick price action
- EMA 12 and EMA 26 (moving averages)
- VWAP (Volume Weighted Average Price)
- Volume bars
- MACD indicator

Analyze the chart for:
1. Trend direction and strength
2. Support and resistance levels
3. Moving average crossovers
4. Volume patterns
5. MACD signals

Consider:
- Technical patterns visible in the chart
- Recent news sentiment and key events
- Financial health of the company
- Risk factors and market conditions
- This is PAPER TRADING with a fixed $1,000 position size

Provide your trading decision as JSON with this exact structure:
{{
  "action": "buy" or "hold" or "sell",
  "reasoning": "Detailed explanation of your decision covering technical analysis, news impact, and financial health",
  "confidence": 0.0 to 1.0 (confidence level in your decision),
  "key_factors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"]
}}

Be conservative. Only recommend "buy" if you have high confidence (>0.7) based on multiple positive signals.
"""
        
        try:
            # Use GPT-4o with vision
            response = await self.client.chat.completions.create(
                model="gpt-4o",  # Use full gpt-4o, not mini
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert trading analyst. Analyze charts and data to make informed trading decisions. Always respond with valid JSON."
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{chart_image_base64}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.3,
                max_tokens=1000
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Validate response structure
            required_fields = ['action', 'reasoning', 'confidence']
            for field in required_fields:
                if field not in result:
                    raise ValueError(f"Missing required field: {field}")
            
            # Validate action
            if result['action'] not in ['buy', 'hold', 'sell']:
                logger.warning(f"Invalid action: {result['action']}, defaulting to 'hold'")
                result['action'] = 'hold'
            
            # Validate confidence
            try:
                result['confidence'] = float(result['confidence'])
                result['confidence'] = max(0.0, min(1.0, result['confidence']))
            except (ValueError, TypeError):
                logger.warning(f"Invalid confidence value, defaulting to 0.5")
                result['confidence'] = 0.5
            
            logger.info(
                f"AI trading decision for {ticker}: {result['action']} "
                f"(confidence: {result['confidence']:.2f})"
            )
            logger.debug(f"Full trading analysis: {result}")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to analyze trading decision for {ticker}: {e}")
            # Return safe default
            return {
                "action": "hold",
                "reasoning": f"Error during analysis: {str(e)}",
                "confidence": 0.0,
                "key_factors": [],
                "risks": ["Analysis error"]
            }
    
    def _get_current_utc_timestamp(self) -> str:
        """Get current UTC timestamp in ISO 8601 format."""
        return datetime.now(timezone.utc).isoformat()
