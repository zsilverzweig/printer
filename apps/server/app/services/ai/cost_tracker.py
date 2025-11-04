"""
AI Cost Tracker Service

Tracks AI service usage costs and associates them with funds for performance impact analysis.
"""

import logging
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.strategies import AICost, Fund

logger = logging.getLogger(__name__)


# Model pricing per 1M tokens (as of November 2024)
MODEL_PRICING = {
    'gpt-5-pro': {
        'input': 5.00 / 1_000_000,  # Estimated - update with actual pricing
        'output': 15.00 / 1_000_000,
    },
    'gpt-5-nano': {
        'input': 0.25 / 1_000_000,  # Estimated - cheaper than gpt-5-pro, similar to gpt-4o-mini
        'output': 0.75 / 1_000_000,
    },
    'gpt-4o': {
        'input': 2.50 / 1_000_000,
        'output': 10.00 / 1_000_000,
    },
    'gpt-4o-mini': {
        'input': 0.15 / 1_000_000,
        'output': 0.60 / 1_000_000,
    },
    'gpt-4-turbo': {
        'input': 10.00 / 1_000_000,
        'output': 30.00 / 1_000_000,
    },
    'gpt-3.5-turbo': {
        'input': 0.50 / 1_000_000,
        'output': 1.50 / 1_000_000,
    },
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """
    Calculate the cost of an AI API call.
    
    Args:
        model: Model name (e.g., "gpt-4o-mini")
        prompt_tokens: Number of input/prompt tokens
        completion_tokens: Number of output/completion tokens
        
    Returns:
        Cost in USD
    """
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        logger.warning(f"Unknown model '{model}', using gpt-4o-mini pricing as fallback")
        pricing = MODEL_PRICING['gpt-4o-mini']
    
    input_cost = prompt_tokens * pricing['input']
    output_cost = completion_tokens * pricing['output']
    total_cost = input_cost + output_cost
    
    return total_cost


def record_ai_cost(
    db: Session,
    fund_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    operation: str,
    symbol: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AICost:
    """
    Record an AI service cost to the database and update fund totals.
    
    Args:
        db: Database session
        fund_id: Fund ID that incurred the cost
        model: AI model used
        prompt_tokens: Number of input tokens
        completion_tokens: Number of output tokens
        operation: Type of operation (e.g., "entry_analysis", "stop_update")
        symbol: Optional ticker symbol related to the operation
        metadata: Optional additional context
        
    Returns:
        Created AICost record
    """
    # Calculate cost
    total_tokens = prompt_tokens + completion_tokens
    cost = calculate_cost(model, prompt_tokens, completion_tokens)
    
    # Create AI cost record
    ai_cost = AICost(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol=symbol,
        operation=operation,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost=cost,
        timestamp=datetime.utcnow(),
        extra_data=metadata or {},
    )
    
    db.add(ai_cost)
    
    # Update fund AI cost totals
    fund = db.query(Fund).filter(Fund.id == fund_id).first()
    if fund:
        fund.total_ai_cost += cost
        fund.ai_cost_mtd += cost
        fund.ai_cost_ytd += cost
        
        logger.info(
            f"💰 AI cost recorded: {operation} for {symbol or 'N/A'} - "
            f"${cost:.6f} ({prompt_tokens} + {completion_tokens} tokens, {model}). "
            f"Fund total: ${fund.total_ai_cost:.4f}"
        )
    else:
        logger.warning(f"Fund {fund_id} not found when recording AI cost")
    
    return ai_cost


async def record_ai_cost_async(
    fund_id: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    operation: str,
    symbol: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AICost:
    """
    Async version: Record an AI service cost to the database and update fund totals.
    
    Args:
        fund_id: Fund ID that incurred the cost
        model: AI model used
        prompt_tokens: Number of input tokens
        completion_tokens: Number of output tokens
        operation: Type of operation (e.g., "entry_analysis", "stop_update")
        symbol: Optional ticker symbol related to the operation
        metadata: Optional additional context
        
    Returns:
        Created AICost record
    """
    from app.services.core.database import get_async_session
    
    # Calculate cost
    total_tokens = prompt_tokens + completion_tokens
    cost = calculate_cost(model, prompt_tokens, completion_tokens)
    
    # Create AI cost record
    ai_cost = AICost(
        id=str(uuid.uuid4()),
        fund_id=fund_id,
        symbol=symbol,
        operation=operation,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost=cost,
        timestamp=datetime.utcnow(),
        extra_data=metadata or {},
    )
    
    async with get_async_session() as session:
        try:
            session.add(ai_cost)
            
            # Update fund AI cost totals
            result = await session.execute(
                select(Fund).where(Fund.id == fund_id)
            )
            fund = result.scalar_one_or_none()
            
            if fund:
                fund.total_ai_cost += cost
                fund.ai_cost_mtd += cost
                fund.ai_cost_ytd += cost
                
                logger.info(
                    f"💰 AI cost recorded: {operation} for {symbol or 'N/A'} - "
                    f"${cost:.6f} ({prompt_tokens} + {completion_tokens} tokens, {model}). "
                    f"Fund total: ${fund.total_ai_cost:.4f}, MTD: ${fund.ai_cost_mtd:.4f}"
                )
            else:
                logger.error(
                    f"❌ Fund {fund_id} not found when recording AI cost. "
                    f"Operation: {operation}, Symbol: {symbol}, Cost: ${cost:.6f}"
                )
                # Still save the cost record even if fund not found (for debugging)
            
            await session.flush()  # Flush before commit to catch any issues early
            await session.commit()
        except Exception as e:
            logger.error(
                f"❌ Failed to save AI cost to database: {e}. "
                f"fund_id={fund_id}, operation={operation}, cost=${cost:.6f}",
                exc_info=True
            )
            await session.rollback()
            raise
    
    return ai_cost


def get_fund_ai_costs(
    db: Session,
    fund_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
) -> list[AICost]:
    """
    Get AI costs for a fund within a date range.
    
    Args:
        db: Database session
        fund_id: Fund ID
        start_date: Optional start date filter
        end_date: Optional end date filter
        
    Returns:
        List of AICost records
    """
    query = db.query(AICost).filter(AICost.fund_id == fund_id)
    
    if start_date:
        query = query.filter(AICost.timestamp >= start_date)
    if end_date:
        query = query.filter(AICost.timestamp <= end_date)
    
    return query.order_by(AICost.timestamp.desc()).all()


def get_fund_ai_cost_summary(db: Session, fund_id: str) -> Dict[str, Any]:
    """
    Get summary statistics of AI costs for a fund.
    
    Args:
        db: Database session
        fund_id: Fund ID
        
    Returns:
        Dictionary with cost breakdown and statistics
    """
    from sqlalchemy import func
    
    # Get total costs by operation type
    operation_costs = (
        db.query(
            AICost.operation,
            func.sum(AICost.cost).label('total_cost'),
            func.count(AICost.id).label('call_count'),
            func.sum(AICost.total_tokens).label('total_tokens'),
        )
        .filter(AICost.fund_id == fund_id)
        .group_by(AICost.operation)
        .all()
    )
    
    # Get total costs by model
    model_costs = (
        db.query(
            AICost.model,
            func.sum(AICost.cost).label('total_cost'),
            func.count(AICost.id).label('call_count'),
        )
        .filter(AICost.fund_id == fund_id)
        .group_by(AICost.model)
        .all()
    )
    
    # Get fund data
    fund = db.query(Fund).filter(Fund.id == fund_id).first()
    
    return {
        'total_cost': fund.total_ai_cost if fund else 0.0,
        'mtd_cost': fund.ai_cost_mtd if fund else 0.0,
        'ytd_cost': fund.ai_cost_ytd if fund else 0.0,
        'by_operation': [
            {
                'operation': op.operation,
                'cost': float(op.total_cost),
                'calls': op.call_count,
                'tokens': op.total_tokens,
            }
            for op in operation_costs
        ],
        'by_model': [
            {
                'model': m.model,
                'cost': float(m.total_cost),
                'calls': m.call_count,
            }
            for m in model_costs
        ],
    }


def reset_periodic_costs(db: Session, period: str = 'month') -> None:
    """
    Reset periodic cost trackers (MTD/YTD) for all funds.
    
    Args:
        db: Database session
        period: 'month' or 'year'
    """
    funds = db.query(Fund).all()
    
    for fund in funds:
        if period == 'month':
            fund.ai_cost_mtd = 0.0
            logger.info(f"Reset MTD AI costs for fund {fund.id} ({fund.name})")
        elif period == 'year':
            fund.ai_cost_ytd = 0.0
            fund.ai_cost_mtd = 0.0
            logger.info(f"Reset YTD AI costs for fund {fund.id} ({fund.name})")
        
        fund.last_ai_cost_reset = datetime.utcnow()
    
    db.commit()

