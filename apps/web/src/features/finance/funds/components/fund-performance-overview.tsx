/**
 * FundPerformanceOverview Component
 *
 * Displays aggregate trade performance metrics for all funds.
 */

"use client";

import { Copy, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

import { fundService } from "../services/fund-service";
import { Fund } from "../types";
import { formatCurrency } from "../utils/ledger-calculations";
import { calculateTradeMetrics, TradeMetrics } from "../utils/trade-metrics";
import type { FundTrade } from "@printer/shared";

import { TradeDistributionChart } from "./trade-distribution-chart";

interface FundPerformanceOverviewProps {
  funds: Fund[];
  isActive: boolean;
}

interface FundPerformanceSummary {
  fundId: string;
  fundName: string;
  metrics: TradeMetrics;
  trades: FundTrade[];
}

export function FundPerformanceOverview({
  funds,
  isActive,
}: FundPerformanceOverviewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<FundPerformanceSummary[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<TradeMetrics | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  const hasFunds = funds.length > 0;

  const loadMetrics = useCallback(async () => {
    if (!hasFunds) {
      setSummaries([]);
      setLoading(false);
      setPortfolioMetrics(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const allTrades: FundTrade[] = [];

      const data = await Promise.all(
        funds.map(async (fund) => {
          // Get closed trades for performance metrics
          const trades = await fundService.getFundTrades(fund.id, "closed");
          allTrades.push(...trades);
          const metrics = calculateTradeMetrics(trades);

          return {
            fundId: fund.id,
            fundName: fund.name,
            metrics,
            trades,
          } satisfies FundPerformanceSummary;
        })
      );

      setSummaries(data);
      setPortfolioMetrics(calculateTradeMetrics(allTrades));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load performance metrics"
      );
      setPortfolioMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [funds, hasFunds]);

  useEffect(() => {
    if (isActive) {
      void loadMetrics();
    }
  }, [isActive, loadMetrics]);

  const handleCopyPortfolioSummary = useCallback(async () => {
    if (!portfolioMetrics) return;

    const formatPnl = (value: number) => {
      const formatted = formatCurrency(value);
      return value >= 0 ? `+${formatted}` : formatted;
    };

    const text = `Portfolio Performance Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total P&L: ${formatPnl(portfolioMetrics.totalPnl)}
Total Trades: ${portfolioMetrics.totalTrades}
Win Rate: ${portfolioMetrics.winRate.toFixed(1)}%
Average Win: ${formatCurrency(portfolioMetrics.averageWin)}
Average Loss: ${formatCurrency(portfolioMetrics.averageLoss)}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [portfolioMetrics]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle>Performance Management</CardTitle>
          <CardDescription>
            Evaluate trade execution quality across your funds
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void loadMetrics();
          }}
          disabled={loading || !hasFunds}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2">Refreshing</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {!hasFunds ? (
          <div className="text-sm text-muted-foreground">
            Create a fund to start tracking performance metrics.
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading performance metrics...
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No performance data available yet. Execute trades to see metrics.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right"># Trades</TableHead>
                    <TableHead className="text-right">Total P&L</TableHead>
                    <TableHead className="text-right">% Winners</TableHead>
                    <TableHead className="text-right">Avg Win</TableHead>
                    <TableHead className="text-right">Avg Loss</TableHead>
                    <TableHead className="text-right">Std Dev</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map((summary) => (
                    <TableRow key={summary.fundId}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/funds/${summary.fundId}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {summary.fundName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {summary.metrics.totalTrades}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            summary.metrics.totalPnl >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {formatCurrency(summary.metrics.totalPnl)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {summary.metrics.winRate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(summary.metrics.averageWin)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(summary.metrics.averageLoss)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(summary.metrics.standardDeviation)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Distribution Chart */}
            <div className="mt-6">
              <div className="mb-3">
                <h3 className="text-sm font-semibold">
                  Trade Return Distribution
                </h3>
                <p className="text-xs text-muted-foreground">
                  Histogram of individual trade P&L across all funds
                </p>
              </div>
              <TradeDistributionChart
                trades={summaries.flatMap((s) => s.trades)}
                height={320}
              />
            </div>

            {portfolioMetrics && (
              <div className="rounded-md border bg-muted/50 p-4 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Portfolio Summary</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyPortfolioSummary}
                    className="h-7 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-5">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Total P&L
                    </div>
                    <div
                      className={`font-medium ${
                        portfolioMetrics.totalPnl >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(portfolioMetrics.totalPnl)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Trades</div>
                    <div className="font-medium">
                      {portfolioMetrics.totalTrades}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Win Rate
                    </div>
                    <div className="font-medium">
                      {portfolioMetrics.winRate.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Average Win
                    </div>
                    <div className="font-medium">
                      {formatCurrency(portfolioMetrics.averageWin)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Average Loss
                    </div>
                    <div className="font-medium">
                      {formatCurrency(portfolioMetrics.averageLoss)}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground">
                    Standard Deviation
                  </div>
                  <div className="font-medium">
                    {formatCurrency(portfolioMetrics.standardDeviation)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
