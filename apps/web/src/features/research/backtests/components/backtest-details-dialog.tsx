/**
 * BacktestDetailsDialog Component
 *
 * Dialog for viewing detailed backtest results.
 */

"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
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
import { backtestService } from "../services/backtest-service";
import { Backtest, BacktestOrder, BacktestTrade } from "../types";

interface BacktestDetailsDialogProps {
  backtest: Backtest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function formatDateTime(dateString: string | undefined): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function BacktestDetailsDialog({
  backtest,
  open,
  onOpenChange,
}: BacktestDetailsDialogProps) {
  const [orders, setOrders] = useState<BacktestOrder[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && backtest) {
      loadDetails();
    }
  }, [open, backtest]);

  const loadDetails = async () => {
    if (!backtest) return;

    setLoading(true);
    try {
      const [ordersData, tradesData] = await Promise.all([
        backtestService.getBacktestOrders(backtest.id),
        backtestService.getBacktestTrades(backtest.id),
      ]);
      setOrders(ordersData.orders);
      setTrades(tradesData.trades);
    } catch (error) {
      console.error("Failed to load backtest details:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!backtest) return null;

  const pnl = backtest.totalPnl;
  const pnlPercent = backtest.totalPnlPercent;
  const isPositive = pnl !== undefined && pnl !== null && pnl >= 0;
  const winRate =
    backtest.totalTrades > 0
      ? (backtest.winningTrades / backtest.totalTrades) * 100
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Backtest Details</DialogTitle>
          <DialogDescription>
            {backtest.date} - {backtest.fundId.slice(0, 8)}...
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
            <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge
                    variant={
                      backtest.status === "completed" ? "default" : "secondary"
                    }
                  >
                    {backtest.status}
                  </Badge>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    P&L
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-2xl font-bold ${
                      pnl !== undefined && pnl !== null
                        ? isPositive
                          ? "text-green-600"
                          : "text-red-600"
                        : ""
                    }`}
                  >
                    {formatCurrency(pnl)}
                  </div>
                  <div
                    className={`text-xs ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatPercent(pnlPercent)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Starting Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(backtest.startingBalance)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Ending Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(backtest.endingBalance)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Trades
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {backtest.totalTrades}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {backtest.winningTrades}W / {backtest.losingTrades}L (
                    {winRate.toFixed(1)}%)
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {backtest.totalOrders}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {backtest.filledOrders} filled / {backtest.cancelledOrders}{" "}
                    cancelled
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Timing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">
                    Started:
                  </span>
                  <span className="text-sm font-medium">
                    {formatDateTime(backtest.startedAt)}
                  </span>
                </div>
                {backtest.completedAt && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Completed:
                    </span>
                    <span className="text-sm font-medium">
                      {formatDateTime(backtest.completedAt)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {backtest.errorMessage && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/50">
                <CardHeader>
                  <CardTitle className="text-red-800 dark:text-red-200">
                    Error
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {backtest.errorMessage}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="trades" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading trades...</div>
            ) : trades.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No trades found
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Exit Price</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>P&L</TableHead>
                      <TableHead>P&L %</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="font-medium">
                          {trade.symbol}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(trade.entryPrice)}
                        </TableCell>
                        <TableCell>{formatCurrency(trade.exitPrice)}</TableCell>
                        <TableCell>{trade.quantity.toFixed(2)}</TableCell>
                        <TableCell
                          className={
                            trade.realizedPnl && trade.realizedPnl >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {formatCurrency(trade.realizedPnl)}
                        </TableCell>
                        <TableCell
                          className={
                            trade.realizedPnlPercent &&
                            trade.realizedPnlPercent >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {formatPercent(trade.realizedPnlPercent)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{trade.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            {loading ? (
              <div className="text-center py-8">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders found
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Filled Price</TableHead>
                      <TableHead>Filled Qty</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">
                          {order.symbol}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              order.side === "buy" ? "default" : "secondary"
                            }
                          >
                            {order.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{order.quantity.toFixed(2)}</TableCell>
                        <TableCell>{order.orderType}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(order.filledAvgPrice)}
                        </TableCell>
                        <TableCell>
                          {order.filledQty?.toFixed(2) ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(order.submittedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
