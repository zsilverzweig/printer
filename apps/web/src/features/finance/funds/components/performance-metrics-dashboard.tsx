/**
 * Performance Metrics Dashboard
 *
 * Comprehensive performance metrics with visual indicators and comparisons.
 */

"use client";

import {
  Activity,
  Award,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Progress } from "@/lib/components/ui/progress";

import {
  analyticsService,
  PerformanceMetrics,
} from "../services/analytics-service";

interface PerformanceMetricsDashboardProps {
  fundId: string;
}

export function PerformanceMetricsDashboard({
  fundId,
}: PerformanceMetricsDashboardProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await analyticsService.getFundMetrics(fundId);
        setMetrics(result.metrics);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load metrics");
      } finally {
        setLoading(false);
      }
    };

    void loadMetrics();
  }, [fundId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const getGrade = (winRate: number): { grade: string; color: string } => {
    if (winRate >= 70) return { grade: "A", color: "text-green-600" };
    if (winRate >= 60) return { grade: "B", color: "text-blue-600" };
    if (winRate >= 50) return { grade: "C", color: "text-yellow-600" };
    if (winRate >= 40) return { grade: "D", color: "text-orange-600" };
    return { grade: "F", color: "text-red-600" };
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-full bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="text-sm">{error || "No metrics available"}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { grade, color: gradeColor } = getGrade(metrics.win_rate);

  return (
    <div className="space-y-4">
      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Win Rate with Grade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">
                {metrics.win_rate.toFixed(1)}%
              </div>
              <div className={`text-2xl font-bold ${gradeColor}`}>{grade}</div>
            </div>
            <Progress value={metrics.win_rate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.winning_trades}W / {metrics.losing_trades}L /{" "}
              {metrics.total_trades} total
            </p>
          </CardContent>
        </Card>

        {/* Total P&L */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Total P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${
                metrics.total_pnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(metrics.total_pnl)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Best: {formatCurrency(metrics.best_trade)} • Worst:{" "}
              {formatCurrency(metrics.worst_trade)}
            </p>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Profit Factor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics.profit_factor !== null
                ? metrics.profit_factor.toFixed(2)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Avg Win: {formatCurrency(metrics.average_win)} • Avg Loss:{" "}
              {formatCurrency(metrics.average_loss)}
            </p>
          </CardContent>
        </Card>

        {/* Expectancy */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Expectancy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-3xl font-bold ${
                metrics.expectancy >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(metrics.expectancy)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Expected profit per trade
            </p>
          </CardContent>
        </Card>

        {/* Sharpe Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sharpe Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics.sharpe_ratio.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Risk-adjusted return
            </p>
          </CardContent>
        </Card>

        {/* Sortino Ratio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sortino Ratio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metrics.sortino_ratio.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Downside-focused risk
            </p>
          </CardContent>
        </Card>

        {/* Max Drawdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Max Drawdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {formatCurrency(metrics.max_drawdown)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Largest peak-to-trough loss
            </p>
          </CardContent>
        </Card>

        {/* Hold Duration */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Avg Hold Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatDuration(metrics.average_hold_duration_seconds)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Average time in position
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Streak Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Streak Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">
                Current Streak
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={
                    metrics.current_streak_type === "winning"
                      ? "default"
                      : "destructive"
                  }
                  className="text-lg px-3 py-1"
                >
                  {metrics.current_streak}
                </Badge>
                <span className="text-sm capitalize">
                  {metrics.current_streak_type}
                </span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Longest Win Streak
              </div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {metrics.longest_winning_streak}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">
                Longest Loss Streak
              </div>
              <div className="text-2xl font-bold text-red-600 mt-1">
                {metrics.longest_losing_streak}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
