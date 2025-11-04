"""
Pattern Effectiveness Analyzer

Analyzes strategy effectiveness by screening criteria and patterns.
Core focus on identifying which setups work best.
"""

import logging
from typing import Dict, List, Optional
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Trade, ScreeningCriteria

logger = logging.getLogger(__name__)


class PatternAnalyzer:
    """Service for analyzing pattern/setup effectiveness."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def analyze_patterns(
        self,
        fund_id: Optional[str] = None,
        min_sample_size: int = 5
    ) -> List[Dict]:
        """
        Analyze performance by screening criteria/pattern.
        
        Args:
            fund_id: Optional fund ID to filter by
            min_sample_size: Minimum trades for statistical significance
            
        Returns:
            List of pattern performance summaries
        """
        # Build query
        conditions = [Trade.status == "closed"]
        if fund_id:
            conditions.append(Trade.fund_id == fund_id)
        
        # Get all trades grouped by screening_criteria_id
        result = await self.session.execute(
            select(Trade)
            .where(and_(*conditions))
            .order_by(Trade.screening_criteria_id, Trade.exit_time)
        )
        trades = list(result.scalars().all())
        
        # Group by screening criteria
        patterns = {}
        for trade in trades:
            criteria_id = trade.screening_criteria_id or "no_criteria"
            if criteria_id not in patterns:
                patterns[criteria_id] = []
            patterns[criteria_id].append(trade)
        
        # Load screening criteria names
        criteria_names = await self._load_criteria_names()
        
        # Calculate metrics for each pattern
        pattern_summaries = []
        
        for criteria_id, trades_list in patterns.items():
            if len(trades_list) < min_sample_size:
                continue  # Skip patterns with insufficient data
            
            summary = self._calculate_pattern_metrics(
                criteria_id=criteria_id,
                criteria_name=criteria_names.get(criteria_id, "Unknown"),
                trades=trades_list
            )
            
            summary["sample_size"] = len(trades_list)
            summary["statistically_significant"] = len(trades_list) >= min_sample_size
            
            pattern_summaries.append(summary)
        
        # Sort by profit factor (best performing first)
        pattern_summaries.sort(
            key=lambda x: x.get("profit_factor") or 0,
            reverse=True
        )
        
        return pattern_summaries
    
    async def analyze_pattern_by_id(
        self,
        screening_criteria_id: str,
        fund_id: Optional[str] = None
    ) -> Dict:
        """
        Get detailed analysis for a specific pattern.
        
        Args:
            screening_criteria_id: Screening criteria ID to analyze
            fund_id: Optional fund ID to filter by
            
        Returns:
            Detailed pattern analysis
        """
        # Get trades for this pattern
        conditions = [
            Trade.screening_criteria_id == screening_criteria_id,
            Trade.status == "closed"
        ]
        if fund_id:
            conditions.append(Trade.fund_id == fund_id)
        
        result = await self.session.execute(
            select(Trade)
            .where(and_(*conditions))
            .order_by(Trade.exit_time)
        )
        trades = list(result.scalars().all())
        
        if not trades:
            return {"error": "No trades found for this pattern"}
        
        # Get pattern name
        criteria_result = await self.session.execute(
            select(ScreeningCriteria).where(
                ScreeningCriteria.id == screening_criteria_id
            )
        )
        criteria = criteria_result.scalar_one_or_none()
        criteria_name = criteria.name if criteria else "Unknown"
        
        # Calculate metrics
        summary = self._calculate_pattern_metrics(
            criteria_id=screening_criteria_id,
            criteria_name=criteria_name,
            trades=trades
        )
        
        # Add trade list
        summary["trades"] = [
            {
                "id": t.id,
                "symbol": t.symbol,
                "entry_time": t.entry_time.isoformat(),
                "exit_time": t.exit_time.isoformat() if t.exit_time else None,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "quantity": t.entry_quantity,
                "realized_pnl": t.realized_pnl,
                "realized_pnl_percent": t.realized_pnl_percent,
                "hold_duration_seconds": t.hold_duration_seconds
            }
            for t in trades
        ]
        
        return summary
    
    async def analyze_by_strategy(
        self,
        fund_id: Optional[str] = None
    ) -> List[Dict]:
        """
        Analyze performance by strategy type.
        
        Args:
            fund_id: Optional fund ID to filter by
            
        Returns:
            List of strategy performance summaries
        """
        # Build query
        conditions = [Trade.status == "closed"]
        if fund_id:
            conditions.append(Trade.fund_id == fund_id)
        
        result = await self.session.execute(
            select(Trade)
            .where(and_(*conditions))
            .order_by(Trade.strategy_id, Trade.exit_time)
        )
        trades = list(result.scalars().all())
        
        # Group by strategy
        strategies = {}
        for trade in trades:
            strategy_id = trade.strategy_id or "no_strategy"
            if strategy_id not in strategies:
                strategies[strategy_id] = []
            strategies[strategy_id].append(trade)
        
        # Calculate metrics for each strategy
        strategy_summaries = []
        
        for strategy_id, trades_list in strategies.items():
            summary = self._calculate_pattern_metrics(
                criteria_id=strategy_id,
                criteria_name=strategy_id,
                trades=trades_list
            )
            
            summary["strategy_id"] = strategy_id
            summary["sample_size"] = len(trades_list)
            
            strategy_summaries.append(summary)
        
        # Sort by profit factor
        strategy_summaries.sort(
            key=lambda x: x.get("profit_factor") or 0,
            reverse=True
        )
        
        return strategy_summaries
    
    async def correlate_confidence_with_outcome(
        self,
        fund_id: Optional[str] = None
    ) -> Dict:
        """
        Analyze correlation between AI confidence and trade outcome.
        
        Args:
            fund_id: Optional fund ID to filter by
            
        Returns:
            Correlation analysis
        """
        # Get trades with AI confidence scores
        conditions = [
            Trade.status == "closed",
            Trade.ai_confidence.isnot(None)
        ]
        if fund_id:
            conditions.append(Trade.fund_id == fund_id)
        
        result = await self.session.execute(
            select(Trade)
            .where(and_(*conditions))
        )
        trades = list(result.scalars().all())
        
        if not trades:
            return {"error": "No trades with AI confidence found"}
        
        # Group by confidence buckets
        buckets = {
            "0.0-0.2": [],
            "0.2-0.4": [],
            "0.4-0.6": [],
            "0.6-0.8": [],
            "0.8-1.0": []
        }
        
        for trade in trades:
            if trade.ai_confidence <= 0.2:
                buckets["0.0-0.2"].append(trade)
            elif trade.ai_confidence <= 0.4:
                buckets["0.2-0.4"].append(trade)
            elif trade.ai_confidence <= 0.6:
                buckets["0.4-0.6"].append(trade)
            elif trade.ai_confidence <= 0.8:
                buckets["0.6-0.8"].append(trade)
            else:
                buckets["0.8-1.0"].append(trade)
        
        # Calculate metrics for each bucket
        bucket_analysis = {}
        for bucket_name, bucket_trades in buckets.items():
            if not bucket_trades:
                continue
            
            winning = [t for t in bucket_trades if t.realized_pnl and t.realized_pnl > 0]
            win_rate = (len(winning) / len(bucket_trades) * 100) if bucket_trades else 0
            avg_pnl = (sum(t.realized_pnl for t in bucket_trades if t.realized_pnl) / len(bucket_trades)) if bucket_trades else 0
            
            bucket_analysis[bucket_name] = {
                "count": len(bucket_trades),
                "win_rate": win_rate,
                "average_pnl": avg_pnl,
                "total_pnl": sum(t.realized_pnl for t in bucket_trades if t.realized_pnl)
            }
        
        return {
            "total_trades": len(trades),
            "confidence_buckets": bucket_analysis,
            "overall_win_rate": (len([t for t in trades if t.realized_pnl and t.realized_pnl > 0]) / len(trades) * 100) if trades else 0
        }
    
    def _calculate_pattern_metrics(
        self,
        criteria_id: str,
        criteria_name: str,
        trades: List[Trade]
    ) -> Dict:
        """Calculate performance metrics for a pattern."""
        total_pnl = sum(t.realized_pnl for t in trades if t.realized_pnl)
        winning_trades = [t for t in trades if t.realized_pnl and t.realized_pnl > 0]
        losing_trades = [t for t in trades if t.realized_pnl and t.realized_pnl < 0]
        
        win_count = len(winning_trades)
        loss_count = len(losing_trades)
        total_count = len(trades)
        
        win_rate = (win_count / total_count * 100) if total_count > 0 else 0.0
        
        avg_win = (sum(t.realized_pnl for t in winning_trades) / win_count) if win_count > 0 else 0.0
        avg_loss = (sum(t.realized_pnl for t in losing_trades) / loss_count) if loss_count > 0 else 0.0
        avg_pnl = total_pnl / total_count if total_count > 0 else 0.0
        
        # Profit factor
        total_wins = sum(t.realized_pnl for t in winning_trades)
        total_losses = abs(sum(t.realized_pnl for t in losing_trades))
        profit_factor = (total_wins / total_losses) if total_losses > 0 else None
        
        # Best and worst trades
        pnls = [t.realized_pnl for t in trades if t.realized_pnl]
        best_trade = max(pnls) if pnls else 0
        worst_trade = min(pnls) if pnls else 0
        
        # Average hold duration
        durations = [t.hold_duration_seconds for t in trades if t.hold_duration_seconds]
        avg_duration = (sum(durations) / len(durations)) if durations else 0
        
        return {
            "criteria_id": criteria_id,
            "criteria_name": criteria_name,
            "total_trades": total_count,
            "winning_trades": win_count,
            "losing_trades": loss_count,
            "win_rate": win_rate,
            "total_pnl": total_pnl,
            "average_pnl": avg_pnl,
            "average_win": avg_win,
            "average_loss": avg_loss,
            "profit_factor": profit_factor,
            "best_trade": best_trade,
            "worst_trade": worst_trade,
            "average_hold_duration_seconds": avg_duration
        }
    
    async def _load_criteria_names(self) -> Dict[str, str]:
        """Load screening criteria names."""
        result = await self.session.execute(
            select(ScreeningCriteria)
        )
        criteria_list = result.scalars().all()
        
        return {
            c.id: c.name
            for c in criteria_list
        }

