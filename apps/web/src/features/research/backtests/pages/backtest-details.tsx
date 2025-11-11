"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ArrowLeft, Loader2 } from "lucide-react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/lib/components/ui/table";
import { Progress } from "@/lib/components/ui/progress";
import { cn } from "@/lib/utils/utils";

import { useBacktestDetails } from "../hooks/use-backtest-details";
import type { BacktestEvent } from "../types";

interface BacktestDetailsPageProps {
  backtestId: string;
}

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

function summarizeEventMetadata(event: BacktestEvent): string {
  if (!event.metadata) return "";
  const { minute_index, active_positions, pending_orders, filled_orders } =
    event.metadata as Record<string, unknown>;

  const parts: string[] = [];
  if (minute_index !== undefined) {
    parts.push(`minute ${minute_index}`);
  }
  if (active_positions !== undefined) {
    parts.push(`positions ${active_positions}`);
  }
  if (pending_orders !== undefined) {
    parts.push(`pending ${pending_orders}`);
  }
  if (filled_orders !== undefined) {
    parts.push(`fills ${filled_orders}`);
  }
  return parts.join(" • ");
}

export function BacktestDetailsPage({ backtestId }: BacktestDetailsPageProps) {
  const {
    backtest,
    events,
    orders,
    trades,
    loading,
    error,
    progressPercent,
    progressStats,
  } = useBacktestDetails(backtestId);

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

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">
                {backtest.fundName ?? backtest.fundId}
              </CardTitle>
              <p className="text-muted-foreground text-sm">
                {backtest.date} · Strategy {backtest.strategyId ?? "N/A"}
              </p>
            </div>
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
              <p className="text-xs text-muted-foreground uppercase">
                Total Trades
              </p>
              <p className="text-lg font-semibold">{backtest.totalTrades}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">
                Win Rate
              </p>
              <p className="text-lg font-semibold">
                {Number.isFinite(winRate) ? `${winRate.toFixed(1)}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">
                Duration
              </p>
              <p className="text-sm">
                Started: {formatDateTime(backtest.startedAt)}
                <br />
                Completed: {formatDateTime(backtest.completedAt)}
              </p>
            </div>
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
              <dl className="grid grid-cols-2 gap-2 text-sm">
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
                  <dt className="text-muted-foreground">Active Positions</dt>
                  <dd className="font-medium">
                    {progressStats.activePositions}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pending Orders</dt>
                  <dd className="font-medium">
                    {progressStats.pendingOrders}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fills This Minute</dt>
                  <dd className="font-medium">{progressStats.filledOrders}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Elapsed (ms)</dt>
                  <dd className="font-medium">
                    {progressStats.elapsedMs.toLocaleString()}
                  </dd>
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
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            event.eventType === "error"
                              ? "destructive"
                              : event.eventType === "iteration"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {event.eventType}
                        </Badge>
                        {event.message ? (
                          <span className="font-medium">{event.message}</span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      {summarizeEventMetadata(event)}
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
                        <TableCell className="capitalize">{trade.status}</TableCell>
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
                        <TableCell className="uppercase">{order.side}</TableCell>
                        <TableCell>{order.quantity}</TableCell>
                        <TableCell className="capitalize">
                          {order.status}
                        </TableCell>
                        <TableCell>{formatDateTime(order.submittedAt)}</TableCell>
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


