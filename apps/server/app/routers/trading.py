"""Trading API endpoints."""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ai_service import AIService
from app.services.alpaca_service import alpaca_service
from app.services.event_service import event_service

logger = logging.getLogger("app.routers.trading")

router = APIRouter()


class TradingAnalysisRequest(BaseModel):
    """Request model for trading analysis."""
    chart_image: str  # Base64 encoded image
    news_summary: dict
    financial_summary: dict


@router.post("/analyze/{ticker}")
async def analyze_trade(ticker: str, request: TradingAnalysisRequest):
    """
    Analyze trading decision using AI with chart image, news, and financial data.
    
    If AI recommends buying with high confidence, executes a $1k paper trade via Alpaca.
    """
    logger.info(f"Trading analysis requested for {ticker}")
    logger.info(f"Request data: chart_image_length={len(request.chart_image)}, "
                f"has_news_summary={bool(request.news_summary)}, "
                f"has_financial_summary={bool(request.financial_summary)}")
    
    try:
        # Validate Alpaca service is available
        if not alpaca_service.is_available():
            logger.error("Alpaca service not available - missing API credentials")
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        # Get AI service
        ai_service = AIService()
        
        # Analyze trading decision
        logger.info(f"Sending data to AI for analysis: {ticker}")
        decision = await ai_service.analyze_trading_decision(
            ticker=ticker,
            chart_image_base64=request.chart_image,
            news_data=request.news_summary,
            financial_data=request.financial_summary
        )
        
        logger.info(f"AI Decision received: action={decision.get('action')}, "
                   f"confidence={decision.get('confidence', 0):.2f}")
        
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
                logger.info(f"AI recommends BUY with confidence {decision['confidence']:.2f}")
                
                # Check buying power
                has_power = await alpaca_service.check_buying_power(required_amount=1000.0)
                
                if not has_power:
                    trade_error = "Insufficient buying power for $1,000 trade"
                    logger.warning(f"Insufficient buying power for {ticker}")
                else:
                    # Check if we already have a position
                    existing_position = await alpaca_service.get_position(ticker)
                    
                    if existing_position:
                        trade_error = f"Already have an open position in {ticker}"
                        logger.info(f"Skipping trade - already have position in {ticker}")
                    else:
                        # Place market order
                        logger.info(f"Placing $1,000 market order for {ticker}")
                        trade_result = await alpaca_service.place_market_order(
                            symbol=ticker,
                            notional=1000.0,
                            side="buy"
                        )
                        logger.info(f"Trade executed successfully!")
                        
                        # Log Alpaca trade event
                        from dateutil import parser as date_parser
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
                logger.error(f"Failed to execute trade for {ticker}: {trade_error}", exc_info=True)
                
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
                f"No trade executed for {ticker}: "
                f"action={decision.get('action')}, "
                f"confidence={decision.get('confidence', 0):.2f} (threshold: 0.7)"
            )
        
        # Return response
        return {
            "ticker": ticker,
            "decision": decision,
            "trade_result": trade_result,
            "trade_error": trade_error,
            "timestamp": ai_service._get_current_utc_timestamp()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error analyzing trade for {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze trade for {ticker}: {str(e)}")

