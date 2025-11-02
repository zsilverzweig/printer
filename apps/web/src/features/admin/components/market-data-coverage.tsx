// Market Data Coverage Visualization Component
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import { BarChart3, Calendar, TrendingUp } from "lucide-react";

import type { DatabaseStats } from "../hooks/use-market-data-loader";

interface MarketDataCoverageProps {
  stats: DatabaseStats;
}

export function MarketDataCoverage({ stats }: MarketDataCoverageProps) {
  if (!stats.symbol_details || !stats.date_coverage || !stats.bar_distribution) {
    return null;
  }

  // Top 20 symbols by bar count
  const topSymbols = stats.symbol_details.slice(0, 20);

  // Bar distribution visualization
  const maxDistCount = Math.max(
    ...stats.bar_distribution.map((d) => d.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Coverage Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.bar_distribution.map((dist) => {
                const percentage = (dist.count / stats.symbol_count) * 100;
                const widthPct = (dist.count / maxDistCount) * 100;

                return (
                  <div key={dist.range} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-900 dark:text-blue-100 font-medium">
                        {dist.range}
                      </span>
                      <span className="text-blue-700 dark:text-blue-300">
                        {dist.count} ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-blue-200 dark:bg-blue-900/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-900 dark:text-purple-100 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Date Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.date_coverage.slice(0, 5).map((coverage) => {
                const date = new Date(coverage.date);
                const percentage =
                  (coverage.symbol_count / stats.symbol_count) * 100;

                return (
                  <div key={coverage.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-purple-900 dark:text-purple-100 font-medium">
                        {date.toLocaleDateString()}
                      </span>
                      <span className="text-purple-700 dark:text-purple-300">
                        {coverage.symbol_count} symbols
                      </span>
                    </div>
                    <div className="h-2 bg-purple-200 dark:bg-purple-900/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 dark:bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {stats.date_coverage.length > 5 && (
                <p className="text-xs text-purple-600 dark:text-purple-400 text-center pt-1">
                  +{stats.date_coverage.length - 5} more dates
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/30 dark:to-green-900/30 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-900 dark:text-green-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Coverage Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-700 dark:text-green-300">
                  Total Symbols
                </span>
                <Badge
                  variant="outline"
                  className="bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 border-green-300 dark:border-green-700"
                >
                  {stats.symbol_count}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-700 dark:text-green-300">
                  Avg Bars/Symbol
                </span>
                <Badge
                  variant="outline"
                  className="bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 border-green-300 dark:border-green-700"
                >
                  {Math.round(stats.total_bars / stats.symbol_count)}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-green-700 dark:text-green-300">
                  Date Range
                </span>
                <Badge
                  variant="outline"
                  className="bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 border-green-300 dark:border-green-700"
                >
                  {stats.date_coverage.length} days
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Symbols Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Top 20 Symbols by Data Volume
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Bars</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>First Date</TableHead>
                  <TableHead>Last Date</TableHead>
                  <TableHead className="text-right">Avg Bars/Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSymbols.map((symbol, idx) => {
                  const avgBarsPerDay =
                    symbol.unique_days > 0
                      ? Math.round(symbol.bar_count / symbol.unique_days)
                      : 0;

                  return (
                    <TableRow key={symbol.symbol}>
                      <TableCell className="font-medium text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {symbol.symbol}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {symbol.bar_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {symbol.unique_days}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {symbol.first_date
                          ? new Date(symbol.first_date).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {symbol.last_date
                          ? new Date(symbol.last_date).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {avgBarsPerDay}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {stats.total_symbols_analyzed &&
            stats.total_symbols_analyzed > 20 && (
              <p className="text-sm text-muted-foreground text-center mt-3">
                Showing top 20 of {stats.total_symbols_analyzed} symbols
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

