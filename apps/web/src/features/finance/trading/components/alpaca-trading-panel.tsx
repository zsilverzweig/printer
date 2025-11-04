"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import {
  AlpacaOrder,
  AlpacaOrderSide,
  AlpacaPosition,
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/lib/types";

import { useAlpacaTrading } from "../hooks/use-alpaca-trading";

const TIME_IN_FORCE_OPTIONS: AlpacaTimeInForce[] = ["day", "gtc", "ioc"];

interface OrderFormState {
  symbol: string;
  qty: string;
  side: AlpacaOrderSide;
  positionSide: AlpacaPositionSide;
  timeInForce: AlpacaTimeInForce;
  extendedHours: boolean;
}

const DEFAULT_FORM_STATE: OrderFormState = {
  symbol: "",
  qty: "1",
  side: "buy",
  positionSide: "long",
  timeInForce: "day",
  extendedHours: false,
};

function formatCurrency(value: string | number, currency = "USD"): string {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatNumber(value: string | number, fractionDigits = 2): string {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
  }).format(numeric);
}

function formatPercent(value: string | number): string {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return `${(numeric * 100).toFixed(2)}%`;
}

function getOrderStatusVariant(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "filled" || normalized === "accepted") {
    return "secondary" as const;
  }

  if (
    normalized.includes("pending") ||
    normalized === "new" ||
    normalized === "partially_filled"
  ) {
    return "default" as const;
  }

  if (
    normalized.includes("rejected") ||
    normalized.includes("canceled") ||
    normalized.includes("replaced")
  ) {
    return "destructive" as const;
  }

  return "outline" as const;
}

export function AlpacaTradingPanel() {
  const {
    account,
    positions,
    orders,
    loading,
    isPlacingOrder,
    error,
    lastUpdated,
    refresh,
    placeOrder,
  } = useAlpacaTrading();

  const [formState, setFormState] =
    useState<OrderFormState>(DEFAULT_FORM_STATE);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [positionsSorting, setPositionsSorting] = useState<SortingState>([
    { id: "symbol", desc: false },
  ]);
  const [ordersSorting, setOrdersSorting] = useState<SortingState>([
    { id: "submitted_at", desc: true },
  ]);

  const accountCurrency = account?.currency || "USD";

  const openPositions = useMemo<AlpacaPosition[]>(() => {
    return [...positions];
  }, [positions]);

  const recentOrders = useMemo(() => {
    return [...orders];
  }, [orders]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;

    if (name === "symbol") {
      setFormState((prev) => ({ ...prev, symbol: value.toUpperCase() }));
      return;
    }

    if (name === "qty") {
      setFormState((prev) => ({ ...prev, qty: value }));
      return;
    }

    if (name === "side") {
      setFormState((prev) => ({ ...prev, side: value as AlpacaOrderSide }));
      return;
    }

    if (name === "positionSide") {
      setFormState((prev) => ({
        ...prev,
        positionSide: value as AlpacaPositionSide,
      }));
      return;
    }

    if (name === "timeInForce") {
      setFormState((prev) => ({
        ...prev,
        timeInForce: value as AlpacaTimeInForce,
      }));
      return;
    }

    if (name === "extendedHours") {
      const input = event.target as HTMLInputElement;
      setFormState((prev) => ({ ...prev, extendedHours: input.checked }));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOrderError(null);
    setOrderSuccess(null);

    if (!formState.symbol) {
      setOrderError("Enter a stock symbol to trade.");
      return;
    }

    const qty = Number.parseFloat(formState.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setOrderError("Quantity must be a positive number.");
      return;
    }

    try {
      const order = await placeOrder({
        symbol: formState.symbol,
        qty,
        side: formState.side,
        type: "market",
        time_in_force: formState.timeInForce,
        extended_hours: formState.extendedHours,
        position_side: formState.positionSide,
      });

      setOrderSuccess(
        `Submitted ${order.side.toUpperCase()} order for ${order.symbol} (${
          order.qty || qty
        }).`
      );
      setFormState((prev) => ({ ...prev, symbol: "", qty: "1" }));
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to submit Alpaca order."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Alpaca Paper Trading Sandbox
          </h1>
          <p className="text-muted-foreground mt-2">
            Test paper buy and sell orders using your Alpaca credentials. Orders
            placed here operate in the paper trading environment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Last updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button onClick={refresh} variant="outline" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh data
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Account overview</CardTitle>
              <CardDescription>
                Monitor buying power, equity, and account restrictions.
              </CardDescription>
            </div>
            {account && (
              <Badge
                variant={account.trading_blocked ? "destructive" : "secondary"}
              >
                {account.status.toUpperCase()}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {loading && !account ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : account ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Buying power</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(account.buying_power, accountCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cash</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(account.cash, accountCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Equity</p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(account.equity, accountCurrency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Portfolio value
                  </p>
                  <p className="text-xl font-semibold">
                    {formatCurrency(account.portfolio_value, accountCurrency)}
                  </p>
                </div>
                <div className="sm:col-span-2 grid grid-cols-2 gap-4 rounded-md border p-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Shorting enabled
                    </p>
                    <p className="text-sm font-medium">
                      {account.shorting_enabled ? "Yes" : "No"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Pattern day trader
                    </p>
                    <p className="text-sm font-medium">
                      {account.pattern_day_trader ? "Yes" : "No"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Multiplier
                    </p>
                    <p className="text-sm font-medium">
                      {formatNumber(account.multiplier, 2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      Trading blocked
                    </p>
                    <p className="text-sm font-medium">
                      {account.trading_blocked ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Unable to load account details. Verify your Alpaca API keys are
                configured.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Place a paper order</CardTitle>
            <CardDescription>
              Submit a market order to go long or short in the paper trading
              environment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                    htmlFor="symbol"
                  >
                    Symbol
                  </label>
                  <Input
                    id="symbol"
                    name="symbol"
                    placeholder="AAPL"
                    value={formState.symbol}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-sm font-medium text-muted-foreground"
                    htmlFor="qty"
                  >
                    Quantity
                  </label>
                  <Input
                    id="qty"
                    name="qty"
                    type="number"
                    min="0"
                    step="1"
                    value={formState.qty}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Side
                  </label>
                  <select
                    name="side"
                    value={formState.side}
                    onChange={handleInputChange}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Position side
                  </label>
                  <select
                    name="positionSide"
                    value={formState.positionSide}
                    onChange={handleInputChange}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted-foreground">
                    Time in force
                  </label>
                  <select
                    name="timeInForce"
                    value={formState.timeInForce}
                    onChange={handleInputChange}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {TIME_IN_FORCE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  id="extendedHours"
                  name="extendedHours"
                  type="checkbox"
                  checked={formState.extendedHours}
                  onChange={handleInputChange}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                />
                <label
                  htmlFor="extendedHours"
                  className="text-sm text-muted-foreground"
                >
                  Allow extended hours trading
                </label>
              </div>

              <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm">
                <div>
                  <p className="font-medium">Order type</p>
                  <p className="text-muted-foreground">
                    Market order submitted to the Alpaca paper API.
                  </p>
                </div>
                <Badge variant="outline" className="uppercase">
                  Market
                </Badge>
              </div>

              {orderError && (
                <div className="text-sm text-destructive">{orderError}</div>
              )}

              {orderSuccess && (
                <div className="text-sm text-green-600">{orderSuccess}</div>
              )}

              <Button
                type="submit"
                disabled={isPlacingOrder}
                className="w-full"
              >
                {isPlacingOrder ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                )}
                Submit paper trade
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Open positions</CardTitle>
              <CardDescription>
                Current holdings across long and short paper trades.
              </CardDescription>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading && openPositions.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : openPositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Symbol</th>
                      <th className="py-2">Side</th>
                      <th className="py-2 text-right">Quantity</th>
                      <th className="py-2 text-right">Market value</th>
                      <th className="py-2 text-right">Unrealized P/L</th>
                      <th className="py-2 text-right">P/L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((position) => (
                      <tr key={position.symbol} className="border-t">
                        <td className="py-2 font-medium">{position.symbol}</td>
                        <td className="py-2 capitalize">
                          {position.side || "N/A"}
                        </td>
                        <td className="py-2 text-right">
                          {formatNumber(position.qty, 4)}
                        </td>
                        <td className="py-2 text-right">
                          {formatCurrency(
                            position.market_value,
                            accountCurrency
                          )}
                        </td>
                        <td
                          className={`py-2 text-right ${
                            Number.parseFloat(position.unrealized_pl) >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(
                            position.unrealized_pl,
                            accountCurrency
                          )}
                        </td>
                        <td
                          className={`py-2 text-right ${
                            Number.parseFloat(position.unrealized_plpc) >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatPercent(position.unrealized_plpc)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No open paper trading positions found.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>
              Track the most recent paper trading activity executed via Alpaca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && recentOrders.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2">Submitted</th>
                      <th className="py-2">Symbol</th>
                      <th className="py-2">Side</th>
                      <th className="py-2 text-right">Quantity</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id} className="border-t">
                        <td className="py-2 text-muted-foreground">
                          {new Date(order.submitted_at).toLocaleString()}
                        </td>
                        <td className="py-2 font-medium">{order.symbol}</td>
                        <td className="py-2 capitalize">
                          {order.side}
                          {order.position_side
                            ? ` (${order.position_side})`
                            : ""}
                        </td>
                        <td className="py-2 text-right">
                          {order.qty
                            ? formatNumber(order.qty, 4)
                            : order.notional
                            ? formatCurrency(order.notional, accountCurrency)
                            : "-"}
                        </td>
                        <td className="py-2">
                          <Badge variant={getOrderStatusVariant(order.status)}>
                            {order.status.replace(/_/g, " ")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent paper trading orders found.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
