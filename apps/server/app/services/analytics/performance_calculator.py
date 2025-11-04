"""
Performance Metrics Calculator

Calculates advanced performance metrics from Trade records.
Provides risk-adjusted returns, drawdown analysis, streak analysis, and more.
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Trade, Transfer

logger = logging.getLogger(__name__)


class PerformanceCalculator:
    """Service for calculating advanced performance metrics from trades."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def calculate_metrics(
        self,
        fund_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict:
        """
        Calculate comprehensive performance metrics for a fund.
        
        Args:
            fund_id: Fund ID
            start_date: Optional start date for filtering
            end_date: Optional end date for filtering
            
        Returns:
            Dictionary with all performance metrics
        """
        # Build query for closed trades
        conditions = [Trade.fund_id == fund_id, Trade.status == "closed"]
        if start_date:
            conditions.append(Trade.exit_time >= start_date)
        if end_date:
            conditions.append(Trade.exit_time <= end_date)
        
        result = await self.session.execute(
            select(Trade)
            .where(and_(*conditions))
            .order_by(Trade.exit_time)
        )
        trades = list(result.scalars().all())
        
        if not trades:
            return self._empty_metrics()
        
        # Calculate all metrics
        basic_metrics = self._calculate_basic_metrics(trades)
        risk_metrics = await self._calculate_risk_metrics(fund_id, trades, start_date, end_date)
        streak_metrics = self._calculate_streak_metrics(trades)
        distribution_metrics = self._calculate_distribution_metrics(trades)
        time_metrics = self._calculate_time_metrics(trades)
        
        return {
            **basic_metrics,
            **risk_metrics,
            **streak_metrics,
            **distribution_metrics,
            **time_metrics,
            "total_trades": len(trades),
            "date_range": {
                "start": trades[0].entry_time.isoformat() if trades else None,
                "end": trades[-1].exit_time.isoformat() if trades else None
            }
        }
    
    def _calculate_basic_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate basic performance metrics."""
        total_pnl = sum(t.realized_pnl for t in trades if t.realized_pnl)
        winning_trades = [t for t in trades if t.realized_pnl and t.realized_pnl > 0]
        losing_trades = [t for t in trades if t.realized_pnl and t.realized_pnl < 0]
        
        win_count = len(winning_trades)
        loss_count = len(losing_trades)
        total_count = len(trades)
        
        win_rate = (win_count / total_count * 100) if total_count > 0 else 0.0
        
        avg_win = (sum(t.realized_pnl for t in winning_trades) / win_count) if win_count > 0 else 0.0
        avg_loss = (sum(t.realized_pnl for t in losing_trades) / loss_count) if loss_count > 0 else 0.0
        
        # Profit factor = Total Wins / Total Losses
        total_wins = sum(t.realized_pnl for t in winning_trades)
        total_losses = abs(sum(t.realized_pnl for t in losing_trades))
        profit_factor = (total_wins / total_losses) if total_losses > 0 else float('inf') if total_wins > 0 else 0.0
        
        # Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
        expectancy = (win_rate/100 * avg_win) + ((100-win_rate)/100 * avg_loss)
        
        # Average hold duration
        hold_durations = [t.hold_duration_seconds for t in trades if t.hold_duration_seconds]
        avg_hold_duration = (sum(hold_durations) / len(hold_durations)) if hold_durations else 0
        
        return {
            "total_pnl": total_pnl,
            "winning_trades": win_count,
            "losing_trades": loss_count,
            "breakeven_trades": total_count - win_count - loss_count,
            "win_rate": win_rate,
            "average_win": avg_win,
            "average_loss": avg_loss,
            "profit_factor": profit_factor if profit_factor != float('inf') else None,
            "expectancy": expectancy,
            "average_hold_duration_seconds": avg_hold_duration
        }
    
    async def _calculate_risk_metrics(
        self,
        fund_id: str,
        trades: List[Trade],
        start_date: Optional[datetime],
        end_date: Optional[datetime]
    ) -> Dict:
        """Calculate risk-adjusted return metrics."""
        if not trades:
            return {}
        
        # Get returns series
        returns = [t.realized_pnl for t in trades if t.realized_pnl]
        
        if not returns:
            return {}
        
        # Calculate equity curve to find drawdowns
        equity_curve = []
        cumulative_pnl = 0
        peak = 0
        max_drawdown = 0
        max_drawdown_duration = 0
        current_drawdown_start = None
        
        for trade in trades:
            if trade.realized_pnl:
                cumulative_pnl += trade.realized_pnl
                equity_curve.append((trade.exit_time, cumulative_pnl))
                
                # Track peak and drawdown
                if cumulative_pnl > peak:
                    peak = cumulative_pnl
                    current_drawdown_start = None
                else:
                    drawdown = peak - cumulative_pnl
                    if drawdown > max_drawdown:
                        max_drawdown = drawdown
                    
                    if current_drawdown_start is None:
                        current_drawdown_start = trade.exit_time
                    else:
                        duration = (trade.exit_time - current_drawdown_start).total_seconds()
                        if duration > max_drawdown_duration:
                            max_drawdown_duration = duration
        
        # Sharpe Ratio (assume 0% risk-free rate for simplicity)
        mean_return = sum(returns) / len(returns)
        variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
        std_dev = math.sqrt(variance) if variance > 0 else 0
        
        # Annualize assuming ~252 trading days, but use actual trade frequency
        if trades[0].exit_time and trades[-1].exit_time:
            days_span = (trades[-1].exit_time - trades[0].exit_time).days or 1
            trades_per_day = len(trades) / days_span
            sharpe_ratio = (mean_return / std_dev * math.sqrt(252 * trades_per_day)) if std_dev > 0 else 0
        else:
            sharpe_ratio = 0
        
        # Sortino Ratio (only downside deviation)
        downside_returns = [r for r in returns if r < 0]
        if downside_returns:
            downside_variance = sum(r ** 2 for r in downside_returns) / len(downside_returns)
            downside_dev = math.sqrt(downside_variance)
            sortino_ratio = (mean_return / downside_dev * math.sqrt(252 * trades_per_day)) if downside_dev > 0 else 0
        else:
            sortino_ratio = sharpe_ratio  # No downside, same as Sharpe
        
        # Calmar Ratio = Annual Return / Max Drawdown
        total_return = sum(returns)
        if days_span and days_span > 0:
            annual_return = total_return * (365 / days_span)
            calmar_ratio = (annual_return / max_drawdown) if max_drawdown > 0 else 0
        else:
            calmar_ratio = 0
        
        return {
            "sharpe_ratio": sharpe_ratio,
            "sortino_ratio": sortino_ratio,
            "calmar_ratio": calmar_ratio,
            "max_drawdown": max_drawdown,
            "max_drawdown_duration_seconds": max_drawdown_duration,
            "standard_deviation": std_dev,
            "volatility_annualized": std_dev * math.sqrt(252 * trades_per_day) if days_span else 0
        }
    
    def _calculate_streak_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate winning/losing streak metrics."""
        current_streak = 0
        max_win_streak = 0
        max_loss_streak = 0
        last_was_win = None
        
        for trade in trades:
            if not trade.realized_pnl:
                continue
            
            is_win = trade.realized_pnl > 0
            
            if last_was_win is None or last_was_win == is_win:
                current_streak += 1
            else:
                # Streak broke
                if last_was_win:
                    max_win_streak = max(max_win_streak, current_streak)
                else:
                    max_loss_streak = max(max_loss_streak, current_streak)
                current_streak = 1
            
            last_was_win = is_win
        
        # Check final streak
        if last_was_win and current_streak > max_win_streak:
            max_win_streak = current_streak
        elif last_was_win is False and current_streak > max_loss_streak:
            max_loss_streak = current_streak
        
        return {
            "longest_winning_streak": max_win_streak,
            "longest_losing_streak": max_loss_streak,
            "current_streak": current_streak if last_was_win is not None else 0,
            "current_streak_type": "winning" if last_was_win else "losing" if last_was_win is False else "none"
        }
    
    def _calculate_distribution_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate trade distribution metrics."""
        pnls = sorted([t.realized_pnl for t in trades if t.realized_pnl])
        
        if not pnls:
            return {}
        
        n = len(pnls)
        
        return {
            "best_trade": max(pnls),
            "worst_trade": min(pnls),
            "median_trade": pnls[n // 2] if n > 0 else 0,
            "percentile_25": pnls[n // 4] if n > 0 else 0,
            "percentile_75": pnls[3 * n // 4] if n > 0 else 0,
            "percentile_90": pnls[9 * n // 10] if n > 0 else 0,
            "percentile_10": pnls[n // 10] if n > 0 else 0,
        }
    
    def _calculate_time_metrics(self, trades: List[Trade]) -> Dict:
        """Calculate time-based performance metrics."""
        # Group by hour of day
        hourly_pnl = {}
        hourly_counts = {}
        
        # Group by day of week
        daily_pnl = {}
        daily_counts = {}
        
        for trade in trades:
            if not trade.entry_time or not trade.realized_pnl:
                continue
            
            # Hour of day (entry time)
            hour = trade.entry_time.hour
            if hour not in hourly_pnl:
                hourly_pnl[hour] = 0
                hourly_counts[hour] = 0
            hourly_pnl[hour] += trade.realized_pnl
            hourly_counts[hour] += 1
            
            # Day of week (0=Monday, 6=Sunday)
            day = trade.entry_time.weekday()
            if day not in daily_pnl:
                daily_pnl[day] = 0
                daily_counts[day] = 0
            daily_pnl[day] += trade.realized_pnl
            daily_counts[day] += 1
        
        # Calculate averages
        hourly_avg = {hour: (hourly_pnl[hour] / hourly_counts[hour]) for hour in hourly_pnl}
        daily_avg = {day: (daily_pnl[day] / daily_counts[day]) for day in daily_pnl}
        
        # Find best hours and days
        best_hour = max(hourly_avg.items(), key=lambda x: x[1]) if hourly_avg else (None, 0)
        worst_hour = min(hourly_avg.items(), key=lambda x: x[1]) if hourly_avg else (None, 0)
        
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        best_day = max(daily_avg.items(), key=lambda x: x[1]) if daily_avg else (None, 0)
        worst_day = min(daily_avg.items(), key=lambda x: x[1]) if daily_avg else (None, 0)
        
        return {
            "hourly_performance": {
                hour: {
                    "avg_pnl": hourly_avg.get(hour, 0),
                    "total_pnl": hourly_pnl.get(hour, 0),
                    "count": hourly_counts.get(hour, 0)
                }
                for hour in range(24) if hour in hourly_pnl
            },
            "daily_performance": {
                day_names[day]: {
                    "avg_pnl": daily_avg.get(day, 0),
                    "total_pnl": daily_pnl.get(day, 0),
                    "count": daily_counts.get(day, 0)
                }
                for day in range(7) if day in daily_pnl
            },
            "best_hour": best_hour[0] if best_hour[0] is not None else None,
            "best_hour_avg_pnl": best_hour[1] if best_hour[0] is not None else 0,
            "worst_hour": worst_hour[0] if worst_hour[0] is not None else None,
            "worst_hour_avg_pnl": worst_hour[1] if worst_hour[0] is not None else 0,
            "best_day": day_names[best_day[0]] if best_day[0] is not None else None,
            "best_day_avg_pnl": best_day[1] if best_day[0] is not None else 0,
            "worst_day": day_names[worst_day[0]] if worst_day[0] is not None else None,
            "worst_day_avg_pnl": worst_day[1] if worst_day[0] is not None else 0,
        }
    
    def _empty_metrics(self) -> Dict:
        """Return empty metrics structure."""
        return {
            "total_trades": 0,
            "total_pnl": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "breakeven_trades": 0,
            "win_rate": 0,
            "average_win": 0,
            "average_loss": 0,
            "profit_factor": None,
            "expectancy": 0,
            "sharpe_ratio": 0,
            "sortino_ratio": 0,
            "calmar_ratio": 0,
            "max_drawdown": 0,
            "longest_winning_streak": 0,
            "longest_losing_streak": 0,
            "current_streak": 0,
            "best_trade": 0,
            "worst_trade": 0,
        }

