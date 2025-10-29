"""Trading API endpoints."""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func

from app.services.ai_service import AIService
from app.services.alpaca_service import alpaca_service, AlpacaService
from app.services.event_service import event_service
from app.services.database import get_async_session
from app.models.strategies import Fund

logger = logging.getLogger("app.routers.trading")

router = APIRouter()


class TradingAnalysisRequest(BaseModel):
    """Request model for trading analysis."""
    chart_image: str  # Base64 encoded image
    news_summary: dict
    financial_summary: dict


class OrderRequest(BaseModel):
    """Request model for placing orders."""
    symbol: str
    qty: float
    side: str
    order_type: str = "market"
    time_in_force: str = "gtc"  # day, gtc, ioc, fok
    notional: float = None  # For notional orders


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


@router.get("/account")
async def get_account():
    """Get account info (buying power, equity, cash)"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        account_data = await alpaca_service.get_account()
        return {"account": account_data}
    except Exception as e:
        logger.error(f"Failed to get account info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get account info: {str(e)}")


@router.get("/positions")
async def get_positions():
    """Get all current positions"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        positions = await alpaca_service.get_positions()
        return {"positions": positions}
    except Exception as e:
        logger.error(f"Failed to get positions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get positions: {str(e)}")


@router.get("/orders")
async def get_orders(status: str = "all", limit: int = 25):
    """Get order history"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        # For now, return empty orders - can be implemented later
        # when we add get_orders method to AlpacaService
        return {"orders": []}
    except Exception as e:
        logger.error(f"Failed to get orders: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get orders: {str(e)}")


@router.post("/orders")
async def place_order(request: OrderRequest):
    """Place a trading order"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        # Use qty if provided, otherwise use notional
        result = await alpaca_service.place_market_order(
            symbol=request.symbol,
            qty=request.qty if request.qty else None,
            notional=request.notional if request.notional else None,
            side=request.side,
            time_in_force=request.time_in_force
        )
        return {"order": result}
    except Exception as e:
        logger.error(f"Failed to place order: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to place order: {str(e)}")


@router.get("/quote")
async def get_quote(symbol: str):
    """Get latest quote for a symbol"""
    try:
        if not alpaca_service.is_available():
            raise HTTPException(
                status_code=503,
                detail="Alpaca trading service not configured. Please set ALPACA_API_KEY and ALPACA_SECRET_KEY."
            )
        
        quote = await alpaca_service.get_quote(symbol)
        return {"quote": quote}
    except Exception as e:
        logger.error(f"Failed to get quote for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get quote for {symbol}: {str(e)}")


@router.get("/alpaca/account-summary")
async def get_alpaca_account_summary():
    """Get Alpaca account balances and fund allocations for paper and real trading"""
    try:
        # Initialize both paper and real trading services
        paper_service = AlpacaService(paper_trading=True)
        real_service = AlpacaService(paper_trading=False)
        
        # Get account balances
        paper_balance = 0.0
        real_balance = 0.0
        
        if paper_service.is_available():
            try:
                paper_account = paper_service.client.get_account()
                paper_balance = float(paper_account.cash)
            except Exception as e:
                logger.warning(f"Failed to get paper trading account: {e}")
        
        if real_service.is_available():
            try:
                real_account = real_service.client.get_account()
                real_balance = float(real_account.cash)
            except Exception as e:
                logger.warning(f"Failed to get real trading account: {e}")
        
        # Calculate total allocated across funds
        async with get_async_session() as session:
            result = await session.execute(
                select(func.sum(Fund.balance), Fund.mode).group_by(Fund.mode)
            )
            allocations = {mode: float(total) if total else 0.0 for total, mode in result}
        
        paper_allocated = allocations.get("sim", 0.0)
        real_allocated = allocations.get("real", 0.0)
        
        return {
            "paper": {
                "balance": paper_balance,
                "allocated": paper_allocated,
                "available": paper_balance - paper_allocated,
                "allocated_percent": (paper_allocated / paper_balance * 100) if paper_balance > 0 else 0,
            },
            "real": {
                "balance": real_balance,
                "allocated": real_allocated,
                "available": real_balance - real_allocated,
                "allocated_percent": (real_allocated / real_balance * 100) if real_balance > 0 else 0,
            }
        }
    except Exception as e:
        logger.error(f"Failed to get Alpaca account summary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

