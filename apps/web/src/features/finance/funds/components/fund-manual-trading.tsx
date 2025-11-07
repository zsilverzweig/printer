"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import type { Fund } from "@printer/shared";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { Separator } from "@/lib/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { fundService } from "../services/fund-service";
import type { FundPosition } from "../hooks/use-fund-ledger";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type OrderSide = "buy" | "sell";
type TimeInForce = "day" | "gtc" | "ioc" | "fok";

interface FundManualTradingProps {
  fundId: string;
  fund: Fund;
  positions: FundPosition[];
  onOrderPlaced?: () => Promise<void> | void;
}

interface QuoteState {
  status: "idle" | "loading" | "error";
  message: string | null;
}

export function FundManualTrading({
  fundId,
  fund,
  positions,
  onOrderPlaced,
}: FundManualTradingProps) {
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [side, setSide] = useState<OrderSide>("buy");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("day");
  const [estimatedPrice, setEstimatedPrice] = useState<number | null>(null);
  const [quoteState, setQuoteState] = useState<QuoteState>({
    status: "idle",
    message: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const normalizedSymbol = symbol.trim().toUpperCase();

  const handleFetchQuote = useCallback(async () => {
    if (!normalizedSymbol) {
      setEstimatedPrice(null);
      setQuoteState({ status: "idle", message: null });
      return;
    }

    setQuoteState({ status: "loading", message: null });

    try {
      const response = await fetch(
        `${API_BASE}/api/trading/quote?symbol=${normalizedSymbol}`
      );
      if (!response.ok) {
        throw new Error("Quote request failed");
      }

      const result = await response.json();
      const quote = result.quote ?? result;
      const bid = Number(quote.bid_price ?? quote.bid ?? 0);
      const ask = Number(quote.ask_price ?? quote.ask ?? 0);

      if (bid > 0 && ask > 0) {
        setEstimatedPrice((bid + ask) / 2);
        setQuoteState({ status: "idle", message: null });
      } else {
        setEstimatedPrice(null);
        setQuoteState({
          status: "error",
          message: "Quote unavailable – try again in a moment",
        });
      }
    } catch (error) {
      console.error("Failed to fetch quote", error); // eslint-disable-line no-console
      setEstimatedPrice(null);
      setQuoteState({
        status: "error",
        message: "Failed to fetch latest quote",
      });
    }
  }, [normalizedSymbol]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const qty = Number.parseFloat(quantity);
      if (!normalizedSymbol) {
        setFormError("Enter a symbol before placing an order");
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError("Quantity must be a positive number");
        return;
      }

      setFormError(null);
      setSubmitting(true);

      try {
        const order = await fundService.placeManualOrder(fundId, {
          symbol: normalizedSymbol,
          side,
          quantity: qty,
          timeInForce,
          estimatedPrice,
        });

        toast.success(`Manual ${order.side.toUpperCase()} order sent`, {
          description: `${order.quantity} shares of ${order.symbol} submitted to Alpaca`,
        });

        setSymbol("");
        setQuantity("1");
        setEstimatedPrice(null);
        setQuoteState({ status: "idle", message: null });

        if (onOrderPlaced) {
          await onOrderPlaced();
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to submit order";
        setFormError(message);
        toast.error("Failed to submit order", {
          description: message,
        });
      } finally {
        setSubmitting(false);
      }
    },
    [
      estimatedPrice,
      fundId,
      normalizedSymbol,
      onOrderPlaced,
      quantity,
      side,
      timeInForce,
    ]
  );

  const positionPreview = useMemo(() => {
    const sorted = [...positions].sort((a, b) => b.quantity - a.quantity);
    return sorted.slice(0, 5);
  }, [positions]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Manual Trading Sandbox</CardTitle>
          <CardDescription>
            Submit a market order directly into the fund. Orders flow through the
            same reconciliation and position tracking as automated trades.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  name="symbol"
                  value={symbol}
                  onChange={(event) =>
                    setSymbol(event.target.value.toUpperCase())
                  }
                  onBlur={handleFetchQuote}
                  placeholder="e.g. HIVE"
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  onBlur={(event) => {
                    const value = event.target.value;
                    if (value) {
                      const parsed = Number.parseFloat(value);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        setFormError("Quantity must be positive");
                      }
                    }
                  }}
                  required
                />
              </div>
              <div>
                <Label>Side</Label>
                <Select
                  value={side}
                  onValueChange={(value) => setSide(value as OrderSide)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select side" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Time in Force</Label>
                <Select
                  value={timeInForce}
                  onValueChange={(value) =>
                    setTimeInForce(value as TimeInForce)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select TIF" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">DAY</SelectItem>
                    <SelectItem value="gtc">GTC</SelectItem>
                    <SelectItem value="ioc">IOC</SelectItem>
                    <SelectItem value="fok">FOK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-sm text-muted-foreground">
                  {quoteState.status === "loading" ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Fetching quote…
                    </span>
                  ) : estimatedPrice ? (
                    <span>
                      Est. price: <strong>${estimatedPrice.toFixed(2)}</strong>
                    </span>
                  ) : quoteState.message ? (
                    <span className="text-amber-600">{quoteState.message}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Quote will populate after the symbol field loses focus
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="rounded-md border border-dashed p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Fund</p>
                  <p className="text-muted-foreground">{fund.name}</p>
                </div>
                <div>
                  <p className="font-medium">Balance</p>
                  <p className="text-muted-foreground">
                    ${fund.balance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Order Summary</p>
                  <p className="text-muted-foreground">
                    {normalizedSymbol || "—"} · {quantity} share(s) · {side.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <CardFooter className="px-0">
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Order
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" /> Current Positions Snapshot
          </CardTitle>
          <CardDescription>
            Latest ledger positions for this fund. Manual trades will reconcile
            into this view after fills are processed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {positionPreview.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open positions.</p>
          ) : (
            <div className="grid gap-3">
              {positionPreview.map((position) => (
                <div
                  key={position.symbol}
                  className="rounded-md border p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {position.symbol}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          position.unrealizedPl && position.unrealizedPl >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        )}
                      >
                        {position.unrealizedPlpc !== null
                          ? `${position.unrealizedPlpc.toFixed(2)}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Qty: {position.quantity}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      Avg Entry: ${position.avgEntryPrice.toFixed(2)}
                    </div>
                    <div>
                      Current: {position.currentPrice ? `$${position.currentPrice.toFixed(2)}` : "—"}
                    </div>
                    <div>
                      Market Value: {position.marketValue ? `$${position.marketValue.toFixed(2)}` : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


