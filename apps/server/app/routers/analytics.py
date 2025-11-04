"""
Analytics API Router

Provides endpoints for trade analytics, performance metrics, and pattern analysis.
"""

import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, or_

from app.models.strategies import Trade, Fund
from app.services.core.database import get_async_session
from app.services.analytics.trade_builder import TradeBuilder
from app.services.analytics.performance_calculator import PerformanceCalculator
from app.services.analytics.pattern_analyzer import PatternAnalyzer

logger = logging.getLogger(__name__)

router = APIRouter()


# Response Models
class TradeResponse(BaseModel):
    id: str
    fund_id: str
    symbol: str
    entry_time: str
    exit_time: Optional[str]
    entry_price: float
    exit_price: Optional[float]
    entry_quantity: float
    exit_quantity: Optional[float]
    realized_pnl: Optional[float]
    realized_pnl_percent: Optional[float]
    hold_duration_seconds: Optional[int]
    status: str
    strategy_id: Optional[str]
    screening_criteria_id: Optional[str]
    ai_confidence: Optional[float]


@router.get("/trades")
async def list_trades(
    fund_id: Optional[str] = Query(None, description="Filter by fund ID"),
    symbol: Optional[str] = Query(None, description="Filter by symbol"),
    status: Optional[str] = Query(None, description="Filter by status (open/closed)"),
    screening_criteria_id: Optional[str] = Query(None, description="Filter by screening criteria"),
    start_date: Optional[str] = Query(None, description="Filter by start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="Filter by end date (ISO format)"),
    limit: int = Query(100, description="Maximum number of trades to return"),
    offset: int = Query(0, description="Number of trades to skip")
):
    """
    List trades with optional filtering.
    
    Returns paginated list of trades with performance metrics.
    """
    try:
        async for session in get_async_session():
            # Build query conditions
            conditions = []
            if fund_id:
                conditions.append(Trade.fund_id == fund_id)
            if symbol:
                conditions.append(Trade.symbol == symbol)
            if status:
                conditions.append(Trade.status == status)
            if screening_criteria_id:
                conditions.append(Trade.screening_criteria_id == screening_criteria_id)
            if start_date:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                conditions.append(Trade.entry_time >= start_dt)
            if end_date:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                conditions.append(Trade.entry_time <= end_dt)
            
            # Execute query
            query = select(Trade)
            if conditions:
                query = query.where(and_(*conditions))
            
            query = query.order_by(Trade.entry_time.desc()).limit(limit).offset(offset)
            
            result = await session.execute(query)
            trades = result.scalars().all()
            
            # Convert to response format
            return {
                "trades": [
                    TradeResponse(
                        id=t.id,
                        fund_id=t.fund_id,
                        symbol=t.symbol,
                        entry_time=t.entry_time.isoformat(),
                        exit_time=t.exit_time.isoformat() if t.exit_time else None,
                        entry_price=t.entry_price,
                        exit_price=t.exit_price,
                        entry_quantity=t.entry_quantity,
                        exit_quantity=t.exit_quantity,
                        realized_pnl=t.realized_pnl,
                        realized_pnl_percent=t.realized_pnl_percent,
                        hold_duration_seconds=t.hold_duration_seconds,
                        status=t.status,
                        strategy_id=t.strategy_id,
                        screening_criteria_id=t.screening_criteria_id,
                        ai_confidence=t.ai_confidence
                    ).dict()
                    for t in trades
                ],
                "total": len(trades),
                "limit": limit,
                "offset": offset
            }
    except Exception as e:
        logger.error(f"Error listing trades: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trades/{trade_id}")
async def get_trade(trade_id: str):
    """
    Get detailed information for a specific trade.
    
    Includes all linked orders and transactions.
    """
    try:
        async for session in get_async_session():
            result = await session.execute(
                select(Trade).where(Trade.id == trade_id)
            )
            trade = result.scalar_one_or_none()
            
            if not trade:
                raise HTTPException(status_code=404, detail="Trade not found")
            
            return {
                "id": trade.id,
                "fund_id": trade.fund_id,
                "symbol": trade.symbol,
                "entry_time": trade.entry_time.isoformat(),
                "exit_time": trade.exit_time.isoformat() if trade.exit_time else None,
                "entry_price": trade.entry_price,
                "exit_price": trade.exit_price,
                "entry_quantity": trade.entry_quantity,
                "exit_quantity": trade.exit_quantity,
                "realized_pnl": trade.realized_pnl,
                "realized_pnl_percent": trade.realized_pnl_percent,
                "hold_duration_seconds": trade.hold_duration_seconds,
                "status": trade.status,
                "strategy_id": trade.strategy_id,
                "screening_criteria_id": trade.screening_criteria_id,
                "ai_confidence": trade.ai_confidence,
                "ai_reasoning": trade.ai_reasoning,
                "max_adverse_excursion": trade.max_adverse_excursion,
                "max_favorable_excursion": trade.max_favorable_excursion,
                "commission_fees": trade.commission_fees,
                "trade_metadata": trade.trade_metadata,
                "created_at": trade.created_at.isoformat(),
                "updated_at": trade.updated_at.isoformat()
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting trade: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/metrics/{fund_id}")
async def get_fund_metrics(
    fund_id: str,
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """
    Get comprehensive performance metrics for a fund.
    
    Includes: win rate, Sharpe ratio, drawdown, streaks, and more.
    """
    try:
        async for session in get_async_session():
            # Verify fund exists
            fund_result = await session.execute(
                select(Fund).where(Fund.id == fund_id)
            )
            fund = fund_result.scalar_one_or_none()
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Parse dates
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00')) if start_date else None
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00')) if end_date else None
            
            # Calculate metrics
            calculator = PerformanceCalculator(session)
            metrics = await calculator.calculate_metrics(
                fund_id=fund_id,
                start_date=start_dt,
                end_date=end_dt
            )
            
            return {
                "fund_id": fund_id,
                "fund_name": fund.name,
                "metrics": metrics
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating metrics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns")
async def analyze_patterns(
    fund_id: Optional[str] = Query(None, description="Filter by fund ID"),
    min_sample_size: int = Query(5, description="Minimum trades for significance")
):
    """
    Analyze performance by screening criteria/pattern.
    
    Shows which setups and patterns perform best.
    """
    try:
        async for session in get_async_session():
            analyzer = PatternAnalyzer(session)
            patterns = await analyzer.analyze_patterns(
                fund_id=fund_id,
                min_sample_size=min_sample_size
            )
            
            return {
                "patterns": patterns,
                "total_patterns": len(patterns)
            }
    except Exception as e:
        logger.error(f"Error analyzing patterns: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns/{criteria_id}")
async def analyze_pattern(
    criteria_id: str,
    fund_id: Optional[str] = Query(None, description="Filter by fund ID")
):
    """
    Get detailed analysis for a specific pattern/screening criteria.
    
    Includes list of all trades using this pattern.
    """
    try:
        async for session in get_async_session():
            analyzer = PatternAnalyzer(session)
            analysis = await analyzer.analyze_pattern_by_id(
                screening_criteria_id=criteria_id,
                fund_id=fund_id
            )
            
            return analysis
    except Exception as e:
        logger.error(f"Error analyzing pattern: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/comparative")
async def comparative_analysis(
    fund_ids: Optional[str] = Query(None, description="Comma-separated fund IDs")
):
    """
    Compare performance across multiple funds.
    
    Returns side-by-side metrics for easy comparison.
    """
    try:
        async for session in get_async_session():
            # Parse fund IDs
            if fund_ids:
                fund_id_list = [fid.strip() for fid in fund_ids.split(',')]
            else:
                # Get all funds
                result = await session.execute(
                    select(Fund).where(Fund.archived == False)
                )
                funds = result.scalars().all()
                fund_id_list = [f.id for f in funds]
            
            # Calculate metrics for each fund
            calculator = PerformanceCalculator(session)
            fund_metrics = []
            
            for fund_id in fund_id_list:
                # Get fund
                result = await session.execute(
                    select(Fund).where(Fund.id == fund_id)
                )
                fund = result.scalar_one_or_none()
                if not fund:
                    continue
                
                metrics = await calculator.calculate_metrics(fund_id=fund_id)
                
                fund_metrics.append({
                    "fund_id": fund_id,
                    "fund_name": fund.name,
                    "metrics": metrics
                })
            
            return {
                "funds": fund_metrics,
                "total_funds": len(fund_metrics)
            }
    except Exception as e:
        logger.error(f"Error in comparative analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/equity-curve/{fund_id}")
async def get_equity_curve(
    fund_id: str,
    start_date: Optional[str] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[str] = Query(None, description="End date (ISO format)")
):
    """
    Get equity curve data for a fund.
    
    Returns time-series of cumulative P&L for visualization.
    """
    try:
        async for session in get_async_session():
            # Build query
            conditions = [Trade.fund_id == fund_id, Trade.status == "closed"]
            if start_date:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                conditions.append(Trade.exit_time >= start_dt)
            if end_date:
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                conditions.append(Trade.exit_time <= end_dt)
            
            result = await session.execute(
                select(Trade)
                .where(and_(*conditions))
                .order_by(Trade.exit_time)
            )
            trades = result.scalars().all()
            
            # Build equity curve
            equity_points = []
            cumulative_pnl = 0
            peak = 0
            
            for trade in trades:
                if trade.realized_pnl and trade.exit_time:
                    cumulative_pnl += trade.realized_pnl
                    
                    # Calculate drawdown
                    if cumulative_pnl > peak:
                        peak = cumulative_pnl
                    drawdown = peak - cumulative_pnl
                    drawdown_percent = (drawdown / peak * 100) if peak > 0 else 0
                    
                    equity_points.append({
                        "timestamp": trade.exit_time.isoformat(),
                        "trade_id": trade.id,
                        "symbol": trade.symbol,
                        "trade_pnl": trade.realized_pnl,
                        "cumulative_pnl": cumulative_pnl,
                        "peak": peak,
                        "drawdown": drawdown,
                        "drawdown_percent": drawdown_percent
                    })
            
            return {
                "fund_id": fund_id,
                "equity_curve": equity_points,
                "total_trades": len(trades),
                "final_pnl": cumulative_pnl
            }
    except Exception as e:
        logger.error(f"Error getting equity curve: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap/{fund_id}")
async def get_performance_heatmap(
    fund_id: str
):
    """
    Get time-of-day performance heatmap data.
    
    Returns performance by hour and day of week for intraday optimization.
    """
    try:
        async for session in get_async_session():
            calculator = PerformanceCalculator(session)
            metrics = await calculator.calculate_metrics(fund_id=fund_id)
            
            # Extract time-based metrics
            hourly = metrics.get("hourly_performance", {})
            daily = metrics.get("daily_performance", {})
            
            return {
                "fund_id": fund_id,
                "hourly_performance": hourly,
                "daily_performance": daily,
                "best_hour": metrics.get("best_hour"),
                "best_day": metrics.get("best_day"),
                "worst_hour": metrics.get("worst_hour"),
                "worst_day": metrics.get("worst_day")
            }
    except Exception as e:
        logger.error(f"Error getting heatmap: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rebuild-trades/{fund_id}")
async def rebuild_trades(fund_id: str):
    """
    Rebuild trade records for a fund from transactions.
    
    Useful for fixing data issues or reprocessing historical data.
    """
    try:
        async for session in get_async_session():
            # Verify fund exists
            fund_result = await session.execute(
                select(Fund).where(Fund.id == fund_id)
            )
            fund = fund_result.scalar_one_or_none()
            if not fund:
                raise HTTPException(status_code=404, detail="Fund not found")
            
            # Rebuild trades
            trade_builder = TradeBuilder(session)
            stats = await trade_builder.backfill_trades_for_fund(
                fund_id=fund_id,
                dry_run=False
            )
            
            await session.commit()
            
            return {
                "message": "Trades rebuilt successfully",
                "stats": stats
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rebuilding trades: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

