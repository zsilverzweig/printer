"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { ArrowLeft, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { useBacktestDetails } from "../hooks/use-backtest-details";
import { backtestService } from "../services/backtest-service";
import type { BacktestEvent } from "../types";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Button } from "@/lib/components/ui/button";
import { Progress } from "@/lib/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { cn } from "@/lib/utils/utils";

function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatCount(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US");
}

function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateString;
  }
}

function summarizeEventDetails(event: BacktestEvent): string {
  if (!event.details) return "";
  const metadata = event.details as Record<string, unknown>;
  const minuteIndex = metadata.minute_index ?? metadata.minuteIndex;
  const iterationCount =
    metadata.iteration_count ?? metadata.iterationCount ?? null;
  const activePositions = metadata.active_positions ?? metadata.activePositions;
  const pendingOrders = metadata.pending_orders ?? metadata.pendingOrders;
  const filledOrders = metadata.filled_orders ?? metadata.filledOrders;
  const iterationMs = metadata.iteration_ms ?? metadata.iterationMs;
  const rawTickerCount = metadata.raw_ticker_count ?? metadata.rawTickerCount;
  const tickersAfterSetup =
    metadata.tickers_after_setup ?? metadata.tickersAfterSetup;
  const canTrade = metadata.can_trade ?? metadata.canTrade;
  const restrictionReason =
    metadata.restriction_reason ?? metadata.restrictionReason;

  const parts: string[] = [];
  if (minuteIndex !== undefined) {
    parts.push(`minute ${minuteIndex}`);
  }
  if (iterationCount !== null && iterationCount !== undefined) {
    parts.push(`iteration ${iterationCount}`);
  }
  if (activePositions !== undefined) {
    parts.push(`positions ${activePositions}`);
  }
  if (pendingOrders !== undefined) {
    parts.push(`pending ${pendingOrders}`);
  }
  if (filledOrders !== undefined) {
    parts.push(`fills ${filledOrders}`);
  }
  if (rawTickerCount !== undefined) {
    parts.push(`tickers ${rawTickerCount}`);
  }
  if (tickersAfterSetup !== undefined) {
    parts.push(`after setup ${tickersAfterSetup}`);
  }
  if (iterationMs !== undefined) {
    parts.push(`iter ${Number(iterationMs).toFixed(1)}ms`);
  }
  if (typeof canTrade === "boolean" && !canTrade) {
    parts.push(
      `trade blocked${restrictionReason ? ` (${restrictionReason})` : ""}`
    );
  }
  return parts.join(" • ");
}

interface BacktestDetailsPageProps {
  backtestId: string;
}

export function BacktestDetailsPage({ backtestId }: BacktestDetailsPageProps) {
  const router = useRouter();
  const {
    backtest,
    events,
    orders,
    trades,
    loading,
    error,
    progressPercent,
    progressStats,
    metrics,
    refresh,
  } = useBacktestDetails(backtestId);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const orderedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const timeDiff =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.sequence - b.sequence;
      }),
    [events]
  );

  const lifecycleStats = useMemo(
    () => [
      {
        key: "screened",
        label: "Screened",
        value: progressStats ? progressStats.rawTickerCount : null,
        description: "Candidates currently passing the screener",
      },
      {
        key: "setup",
        label: "Setup",
        value: progressStats ? progressStats.tickersAfterSetup : null,
        description: "Tickers that cleared setup checks",
      },
      {
        key: "ordered",
        label: "Ordered",
        value: progressStats ? progressStats.pendingOrders : null,
        description: "Open orders waiting to fill",
      },
      {
        key: "filled",
        label: "Filled / Active",
        value: progressStats ? progressStats.activePositions : null,
        description: "Active positions being managed",
      },
    ],
    [progressStats]
  );

  const canRestart = backtest?.status !== "running";

  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const handleRestart = useCallback(async () => {
    if (!backtest) return;
    if (!canRestart) {
      setRestartError("Backtest is still running. Please wait for it to complete before restarting.");
      return;
    }

    setIsRestarting(true);
    setRestartError(null);

    try {
      const payload: {
        fundId: string;
        date: string;
        monitoring_interval_minutes?: number;
        duration_minutes?: number;
      } = {
        fundId: backtest.fundId,
        date: backtest.date,
      };

      if (
        typeof metrics?.monitoringIntervalMinutes === "number" &&
        Number.isFinite(metrics.monitoringIntervalMinutes)
      ) {
        payload.monitoring_interval_minutes = Number(metrics.monitoringIntervalMinutes);
      }
      if (
        typeof metrics?.durationMinutes === "number" &&
        Number.isFinite(metrics.durationMinutes)
      ) {
        payload.duration_minutes = metrics.durationMinutes;
      }

      const restarted = await backtestService.runBacktest({
        fundId: payload.fundId,
        date: payload.date,
        monitoringIntervalMinutes: payload.monitoring_interval_minutes,
        durationMinutes: payload.duration_minutes,
      });

      router.push(`/backtests/${restarted.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restart backtest";
      setRestartError(message);
    } finally {
      setIsRestarting(false);
    }
  }, [backtest, canRestart, metrics, router]);

  const hasLifecycleSnapshot = lifecycleStats.some(
    (stat) => stat.value !== null && stat.value !== undefined
  );
  const primaryLifecycleStat = lifecycleStats[0];
  const secondaryLifecycleStats = lifecycleStats.slice(1);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading backtest details...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/backtests"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Backtests
        </Link>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!backtest) {
    return (
      <div className="space-y-4">
        <Link
          href="/backtests"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Backtests
        </Link>
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground">
              Backtest {backtestId} could not be found.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPositive =
    backtest.totalPnl !== undefined && (backtest.totalPnl ?? 0) >= 0;
  const winRate =
    backtest.totalTrades > 0
      ? (backtest.winningTrades / backtest.totalTrades) * 100
      : 0;

  return (
    <div className="space-y-6">
      <Link
        href="/backtests"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Backtests
      </Link>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-xl">
                  {backtest.fundName ?? backtest.fundId}
                </CardTitle>
                <Badge
                  variant={
                    backtest.status === "completed"
                      ? "default"
                      : backtest.status === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {backtest.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {backtest.date} · Strategy {backtest.strategyId ?? "N/A"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={loading || isRestarting}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Data
              </Button>
              <Button
                size="sm"
                onClick={() => void handleRestart()}
                disabled={isRestarting || !canRestart}
              >
                {isRestarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Restarting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restart Backtest
                  </>
                )}
              </Button>
            </div>
          </div>
          {restartError ? (
            <p className="text-sm text-destructive">{restartError}</p>
          ) : null}
          {!canRestart && backtest.status === "running" ? (
            <p className="text-xs text-muted-foreground">
              The backtest is currently running. Restart becomes available once it completes.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase">
              Starting Balance
            </p>
            <p className="text-lg font-semibold">
              {formatCurrency(backtest.startingBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">
              Ending Balance
            </p>
            <p className="text-lg font-semibold">
              {formatCurrency(backtest.endingBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">P&amp;L</p>
            <p
              className={cn("text-lg font-semibold", {
                "text-green-600": isPositive,
                "text-red-600": !isPositive,
              })}
            >
              {formatCurrency(backtest.totalPnl)} (
              {formatPercent(backtest.totalPnlPercent)})
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">Total Trades</p>
            <p className="text-lg font-semibold">{backtest.totalTrades}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">Win Rate</p>
            <p className="text-lg font-semibold">
              {Number.isFinite(winRate) ? `${winRate.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase">Duration</p>
            <p className="text-sm">
              Started: {formatDateTime(backtest.startedAt)}
              <br />
              Completed: {formatDateTime(backtest.completedAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ticker Lifecycle</CardTitle>
            <p className="text-sm text-muted-foreground">
              Latest snapshot of candidates moving through the lifecycle.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasLifecycleSnapshot && primaryLifecycleStat ? (
              <>
                <div className="rounded-lg border bg-muted/40 px-4 py-3">
                  <p className="text-xs uppercase text-muted-foreground">
                    Candidates Passing Screener
                  </p>
                  <p className="text-2xl font-semibold">
                    {formatCount(primaryLifecycleStat.value)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Based on the most recent iteration event.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {secondaryLifecycleStats.map((stat) => (
                    <div key={stat.key} className="rounded-lg border p-3">
                      <p className="text-xs uppercase text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="text-xl font-semibold">
                        {formatCount(stat.value)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {stat.description}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Lifecycle stats will appear once the backtest emits iteration updates.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Simulated Day</span>
              <span className="font-medium">{progressPercent.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercent} max={100} />
            {progressStats ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Minute</dt>
                  <dd className="font-medium">{progressStats.minuteIndex}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Simulated Time</dt>
                  <dd className="font-medium">
                    {formatDateTime(progressStats.simulatedTime ?? null)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Iteration (ms)</dt>
                  <dd className="font-medium">
                    {progressStats.iterationMs.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Elapsed (ms)</dt>
                  <dd className="font-medium">
                    {progressStats.elapsedMs.toLocaleString()}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Trading Status</dt>
                  <dd
                    className={cn("font-medium", {
                      "text-green-600": progressStats.canTrade,
                      "text-red-600": !progressStats.canTrade,
                    })}
                  >
                    {progressStats.canTrade ? "Allowed" : "Blocked"}
                  </dd>
                  {!progressStats.canTrade && progressStats.restrictionReason ? (
                    <p className="text-xs text-muted-foreground">
                      {progressStats.restrictionReason}
                    </p>
                  ) : null}
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                Awaiting first iteration update...
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Event Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events recorded yet. Start a backtest to see activity.
              </p>
            ) : (
              <ul className="space-y-3">
                {orderedEvents.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border bg-card px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant={
                            event.eventType === "error"
                              ? "destructive"
                              : event.eventType === "iteration"
                              ? "secondary"
                              : event.eventType === "orders_filled"
                              ? "default"
                              : "outline"
                          }
                        >
                          {event.eventType}
                        </Badge>
                        {event.message ? (
                          <span className="font-medium truncate">
                            {event.message}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      {summarizeEventDetails(event)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Orders</span>
              <span className="font-medium">{backtest.totalOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Filled Orders</span>
              <span className="font-medium">{backtest.filledOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cancelled Orders</span>
              <span className="font-medium">{backtest.cancelledOrders}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Winning Trades</span>
              <span className="font-medium">{backtest.winningTrades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Losing Trades</span>
              <span className="font-medium">{backtest.losingTrades}</span>
            </div>
            {metrics ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Runtime (s)</span>
                  <span className="font-medium">
                    {metrics.elapsedMs !== undefined
                      ? (Number(metrics.elapsedMs) / 1000).toFixed(2)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Avg Iteration (ms)
                  </span>
                  <span className="font-medium">
                    {metrics.avgIterationMs !== undefined
                      ? metrics.avgIterationMs.toLocaleString()
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fill Rate</span>
                  <span className="font-medium">
                    {metrics.fillRate !== undefined
                      ? `${metrics.fillRate.toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Monitoring Interval
                  </span>
                  <span className="font-medium">
                    {metrics.monitoringIntervalMinutes !== undefined
                      ? `${metrics.monitoringIntervalMinutes} min`
                      : "—"}
                  </span>
                </div>
                {metrics.durationMinutes ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Simulated Duration
                    </span>
                    <span className="font-medium">
                      {metrics.durationMinutes} min
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
            {backtest.errorMessage ? (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive">
                <p className="font-semibold text-sm">Error</p>
                <p className="text-xs">{backtest.errorMessage}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orders & Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="trades" className="w-full">
            <TabsList>
              <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
              <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="trades">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Entry</TableHead>
                      <TableHead>Exit</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>P&amp;L</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell>{trade.symbol}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {formatCurrency(trade.entryPrice)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(trade.entryTime)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {formatCurrency(trade.exitPrice)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(trade.exitTime)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{trade.quantity}</TableCell>
                        <TableCell>
                          <div
                            className={cn("font-medium", {
                              "text-green-600": (trade.realizedPnl ?? 0) >= 0,
                              "text-red-600": (trade.realizedPnl ?? 0) < 0,
                            })}
                          >
                            {formatCurrency(trade.realizedPnl)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatPercent(trade.realizedPnlPercent)}
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">
                          {trade.status}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="orders">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Filled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.symbol}</TableCell>
                        <TableCell className="uppercase">
                          {order.side}
                        </TableCell>
                        <TableCell>{order.quantity}</TableCell>
                        <TableCell className="capitalize">
                          {order.status}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(order.submittedAt)}
                        </TableCell>
                        <TableCell>{formatDateTime(order.filledAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
