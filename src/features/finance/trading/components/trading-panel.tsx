"use client";

import {
  ArrowUpRight,
  CheckCircle,
  Info,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/components/ui/tooltip";
import {
  AlpacaOrderSide,
  AlpacaPosition,
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/lib/types";

import { TradingProvider } from "../contexts/trading-context";
import { useTrading } from "../hooks/use-trading";

import { TradingEnvironmentBanner } from "./trading-environment-banner";

const TIME_IN_FORCE_OPTIONS: AlpacaTimeInForce[] = ["day", "gtc", "ioc"];

// Helper component for info tooltips
function InfoTooltip({ content }: { content: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-4 w-4 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-sm">{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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

function TradingPanelContent() {
  const {
    account,
    positions,
    orders,
    loading,
    isPlacingOrder,
    error,
    lastUpdated,
    isConnected,
    refresh,
    placeOrder,
  } = useTrading();

  const [formState, setFormState] =
    useState<OrderFormState>(DEFAULT_FORM_STATE);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(
    null
  );

  const searchParams = useSearchParams();

  // Check for success message from OAuth callback
  useEffect(() => {
    const success = searchParams.get("success");
    const message = searchParams.get("message");

    if (success === "alpaca_connected" && message) {
      setConnectionSuccess(decodeURIComponent(message));
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("message");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  const accountCurrency = account?.currency || "USD";

  const openPositions = useMemo<AlpacaPosition[]>(() => {
    return [...positions].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [positions]);

  const recentOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      return (
        new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );
    });
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
        err instanceof Error ? err.message : "Failed to submit order."
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Trading Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your investment portfolio with real-time trading
            capabilities. Place orders, monitor positions, and track your
            performance.
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

      <TradingEnvironmentBanner />

      {!isConnected && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-muted-foreground">
                <p className="text-lg font-medium">
                  Connect Your Trading Account
                </p>
                <p className="text-sm">
                  To start trading, you need to connect your account in your
                  Profile settings.
                </p>
              </div>
              <Button
                onClick={() => (window.location.href = "/profile")}
                variant="outline"
              >
                Go to Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {connectionSuccess && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            <span>{connectionSuccess}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {isConnected && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>Account Overview</CardTitle>
                  <CardDescription>
                    Monitor buying power, equity, and account status.
                  </CardDescription>
                </div>
                {account && (
                  <Badge
                    variant={
                      account.trading_blocked ? "destructive" : "secondary"
                    }
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
                      <p className="text-sm text-muted-foreground">
                        Buying Power
                      </p>
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
                        Portfolio Value
                      </p>
                      <p className="text-xl font-semibold">
                        {formatCurrency(
                          account.portfolio_value,
                          accountCurrency
                        )}
                      </p>
                    </div>
                    <div className="sm:col-span-2 grid grid-cols-2 gap-4 rounded-md border p-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Shorting Enabled
                        </p>
                        <p className="text-sm font-medium">
                          {account.shorting_enabled ? "Yes" : "No"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">
                          Pattern Day Trader
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
                          Trading Blocked
                        </p>
                        <p className="text-sm font-medium">
                          {account.trading_blocked ? "Yes" : "No"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Unable to load account details. Please connect your trading
                    account.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Place Order</CardTitle>
                <CardDescription>
                  Submit market orders to buy or sell securities.
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
                      <label className="mb-1 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        Order Side
                        <InfoTooltip content="Buy = Purchase shares, Sell = Sell shares you own" />
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
                      <label className="mb-1 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        Position Type
                        <InfoTooltip content="Long = Profit when price goes up, Short = Profit when price goes down (requires borrowing shares)" />
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
                      <label className="mb-1 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        Time in Force
                        <InfoTooltip content="DAY = Expires at market close, GTC = Good until cancelled, IOC = Immediate or cancel" />
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
                      className="flex items-center gap-1 text-sm text-muted-foreground"
                    >
                      Allow extended hours trading
                      <InfoTooltip content="Trade before 9:30 AM or after 4:00 PM ET. Higher volatility and wider spreads." />
                    </label>
                  </div>

                  {/* Shorting Explanation */}
                  {formState.positionSide === "short" && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-amber-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            Short Selling Order
                          </p>
                          <p className="text-amber-700 dark:text-amber-300 mt-1">
                            To short a stock, you need to:
                          </p>
                          <ul className="list-disc list-inside text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                            <li>
                              Set <strong>Order Side</strong> to
                              &quot;Sell&quot;
                            </li>
                            <li>
                              Set <strong>Position Type</strong> to
                              &quot;Short&quot;
                            </li>
                            <li>Your broker will borrow shares to sell</li>
                            <li>You profit if the stock price goes down</li>
                            <li>You lose if the stock price goes up</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm">
                    <div>
                      <p className="font-medium">Order Type</p>
                      <p className="text-muted-foreground">
                        Market order for immediate execution.
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
                    Submit Order
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Open Positions</CardTitle>
                  <CardDescription>
                    Current holdings across long and short positions.
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
                          <th className="py-2 text-right">Market Value</th>
                          <th className="py-2 text-right">Unrealized P/L</th>
                          <th className="py-2 text-right">P/L %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPositions.map((position) => (
                          <tr key={position.symbol} className="border-t">
                            <td className="py-2 font-medium">
                              {position.symbol}
                            </td>
                            <td className="py-2 capitalize">{position.side}</td>
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
                    No open positions found.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>
                  Track your most recent trading activity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading && recentOrders.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{order.symbol}</span>
                            <Badge
                              variant={getOrderStatusVariant(order.status)}
                              className="text-xs"
                            >
                              {order.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {order.side.toUpperCase()}
                            {order.position_side
                              ? ` (${order.position_side})`
                              : ""}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            {order.qty
                              ? formatNumber(order.qty, 4)
                              : order.notional
                              ? formatCurrency(order.notional, accountCurrency)
                              : "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(order.submitted_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recent orders found.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export function TradingPanel() {
  return (
    <TradingProvider>
      <TradingPanelContent />
    </TradingProvider>
  );
}
