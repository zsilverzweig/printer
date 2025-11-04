/**
 * Comparative Performance Component
 *
 * Multi-fund performance comparison dashboard.
 */

"use client";

import { Award } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

import {
  analyticsService,
  PerformanceMetrics,
} from "../services/analytics-service";

interface ComparativePerformanceProps {
  fundIds?: string[];
}

interface FundMetrics {
  fund_id: string;
  fund_name: string;
  metrics: PerformanceMetrics;
}

export function ComparativePerformance({
  fundIds,
}: ComparativePerformanceProps) {
  const [fundMetrics, setFundMetrics] = useState<FundMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadComparative = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await analyticsService.getComparative(fundIds);
        setFundMetrics(result.funds);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load comparative analysis"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadComparative();
  }, [fundIds]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1)
      return (
        <Badge className="bg-yellow-500 text-white">
          <Award className="h-3 w-3 mr-1" />
          1st
        </Badge>
      );
    if (rank === 2)
      return <Badge className="bg-gray-400 text-white">2nd</Badge>;
    if (rank === 3)
      return <Badge className="bg-orange-600 text-white">3rd</Badge>;
    return <Badge variant="outline">{rank}th</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading comparison...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (fundMetrics.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparative Performance</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          No funds with trade data available
        </CardContent>
      </Card>
    );
  }

  // Rank funds by total P&L
  const rankedByPnl = [...fundMetrics].sort(
    (a, b) => b.metrics.total_pnl - a.metrics.total_pnl
  );

  // Rank by Sharpe ratio
  const rankedBySharpe = [...fundMetrics].sort(
    (a, b) => b.metrics.sharpe_ratio - a.metrics.sharpe_ratio
  );

  return (
    <div className="space-y-4">
      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Leaderboard</CardTitle>
          <CardDescription>Funds ranked by total P&L</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rankedByPnl.map((fund, index) => {
              const rank = index + 1;
              const isPositive = fund.metrics.total_pnl >= 0;

              return (
                <div
                  key={fund.fund_id}
                  className="flex items-center gap-4 p-3 rounded-md border bg-muted/30"
                >
                  <div className="w-16">{getRankBadge(rank)}</div>
                  <div className="flex-1">
                    <div className="font-medium">{fund.fund_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fund.metrics.total_trades} trades •{" "}
                      {fund.metrics.win_rate.toFixed(1)}% win rate
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-lg font-bold ${
                        isPositive ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(fund.metrics.total_pnl)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Metrics Comparison</CardTitle>
          <CardDescription>Side-by-side performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fund</TableHead>
                  <TableHead className="text-right"># Trades</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Total P&L</TableHead>
                  <TableHead className="text-right">Profit Factor</TableHead>
                  <TableHead className="text-right">Sharpe</TableHead>
                  <TableHead className="text-right">Max DD</TableHead>
                  <TableHead className="text-right">Expectancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fundMetrics.map((fund) => (
                  <TableRow key={fund.fund_id}>
                    <TableCell className="font-medium">
                      {fund.fund_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {fund.metrics.total_trades}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          fund.metrics.win_rate >= 60 ? "default" : "outline"
                        }
                      >
                        {fund.metrics.win_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        fund.metrics.total_pnl >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(fund.metrics.total_pnl)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fund.metrics.profit_factor !== null
                        ? fund.metrics.profit_factor.toFixed(2)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {fund.metrics.sharpe_ratio.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      {formatCurrency(fund.metrics.max_drawdown)}
                    </TableCell>
                    <TableCell
                      className={`text-right ${
                        fund.metrics.expectancy >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(fund.metrics.expectancy)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Risk-Adjusted Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk-Adjusted Performance</CardTitle>
          <CardDescription>Funds ranked by Sharpe ratio</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rankedBySharpe.map((fund, index) => {
              const rank = index + 1;

              return (
                <div
                  key={fund.fund_id}
                  className="flex items-center gap-4 p-3 rounded-md border"
                >
                  <div className="w-12 text-center font-bold text-muted-foreground">
                    #{rank}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{fund.fund_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Sortino: {fund.metrics.sortino_ratio.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {fund.metrics.sharpe_ratio.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">Sharpe</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
