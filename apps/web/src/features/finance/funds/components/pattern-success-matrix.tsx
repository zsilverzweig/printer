/**
 * Pattern Success Matrix Component
 *
 * Shows strategy effectiveness by screening criteria/pattern with heatmap visualization.
 * Core component for identifying which setups work best.
 */

"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
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
  PatternPerformance,
} from "../services/analytics-service";

interface PatternSuccessMatrixProps {
  fundId?: string;
  minSampleSize?: number;
}

export function PatternSuccessMatrix({
  fundId,
  minSampleSize = 5,
}: PatternSuccessMatrixProps) {
  const [patterns, setPatterns] = useState<PatternPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] =
    useState<keyof PatternPerformance>("profit_factor");
  const [sortDesc, setSortDesc] = useState(true);

  const loadPatterns = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await analyticsService.getPatterns(fundId, minSampleSize);
      setPatterns(result.patterns);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load pattern analysis"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPatterns();
  }, [fundId, minSampleSize]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const getWinRateColor = (winRate: number): string => {
    if (winRate >= 70) return "bg-green-500";
    if (winRate >= 60) return "bg-green-400";
    if (winRate >= 50) return "bg-yellow-500";
    if (winRate >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getProfitFactorColor = (pf: number | null): string => {
    if (pf === null) return "bg-gray-500";
    if (pf >= 2.0) return "bg-green-500";
    if (pf >= 1.5) return "bg-green-400";
    if (pf >= 1.0) return "bg-yellow-500";
    if (pf >= 0.5) return "bg-orange-500";
    return "bg-red-500";
  };

  const handleSort = (column: keyof PatternPerformance) => {
    if (sortBy === column) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(column);
      setSortDesc(true);
    }
  };

  const sortedPatterns = [...patterns].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDesc ? bVal - aVal : aVal - bVal;
    }

    return 0;
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading pattern analysis...</p>
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
            <Button onClick={loadPatterns} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pattern Effectiveness Matrix</CardTitle>
            <CardDescription>
              Which screening criteria and setups perform best
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadPatterns}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No patterns with sufficient sample size ({minSampleSize}+ trades).
            Execute more trades to see pattern analysis.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("criteria_name")}
                  >
                    Pattern
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("total_trades")}
                  >
                    # Trades
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("win_rate")}
                  >
                    Win Rate
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("profit_factor")}
                  >
                    Profit Factor
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("total_pnl")}
                  >
                    Total P&L
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("average_pnl")}
                  >
                    Avg P&L
                  </TableHead>
                  <TableHead className="text-right">Best/Worst</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPatterns.map((pattern) => {
                  const winRateColor = getWinRateColor(pattern.win_rate);
                  const profitFactorColor = getProfitFactorColor(
                    pattern.profit_factor
                  );

                  return (
                    <TableRow
                      key={pattern.criteria_id}
                      className="hover:bg-muted/30"
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{pattern.criteria_name}</span>
                          {!pattern.statistically_significant && (
                            <Badge
                              variant="outline"
                              className="text-xs text-yellow-600 border-yellow-600"
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Low sample
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {pattern.total_trades}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${winRateColor}`}
                          />
                          <span className="font-medium">
                            {pattern.win_rate.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${profitFactorColor}`}
                          />
                          <span className="font-medium">
                            {pattern.profit_factor !== null
                              ? pattern.profit_factor.toFixed(2)
                              : "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          pattern.total_pnl >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(pattern.total_pnl)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${
                          pattern.average_pnl >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {formatCurrency(pattern.average_pnl)}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <div className="text-green-600">
                          {formatCurrency(pattern.best_trade)}
                        </div>
                        <div className="text-red-600">
                          {formatCurrency(pattern.worst_trade)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Legend */}
        {patterns.length > 0 && (
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>Excellent (&gt;70%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span>Average (50-60%)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span>Poor (&lt;40%)</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
