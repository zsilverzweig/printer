"use client";

import { ArrowUpRight, Info, Loader2 } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";

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
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/lib/types/alpaca";

import { useQuote } from "../hooks/use-quote";

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

interface OrderFormProps {
  onSubmit: (
    orderData: {
      symbol: string;
      qty: number;
      side: AlpacaOrderSide;
      type: "market";
      time_in_force: AlpacaTimeInForce;
      extended_hours: boolean;
      position_side: AlpacaPositionSide;
    },
    price?: number
  ) => void;
  isPlacingOrder: boolean;
  orderError: string | null;
  orderSuccess: string | null;
}

export function OrderForm({
  onSubmit,
  isPlacingOrder,
  orderError,
  orderSuccess,
}: OrderFormProps) {
  const [formState, setFormState] =
    useState<OrderFormState>(DEFAULT_FORM_STATE);
  const { fetchQuote, loading: quoteLoading } = useQuote();
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  // Fetch quote when symbol changes with debouncing
  useEffect(() => {
    const fetchPrice = async () => {
      const symbol = formState.symbol.trim().toUpperCase();

      // Only fetch if symbol is at least 2 characters and looks like a valid ticker
      if (symbol.length >= 2 && /^[A-Z]+$/.test(symbol)) {
        setPriceError(null);
        const quote = await fetchQuote(symbol);
        if (quote) {
          // Use mid-price (average of bid and ask) for market orders
          const midPrice = (quote.bid + quote.ask) / 2;
          setCurrentPrice(midPrice);
        } else {
          setCurrentPrice(null);
          setPriceError("Unable to fetch current price");
        }
      } else if (symbol.length > 0) {
        // Clear price if symbol is too short or invalid
        setCurrentPrice(null);
        setPriceError("Enter a valid stock symbol");
      } else {
        // Clear everything if no symbol
        setCurrentPrice(null);
        setPriceError(null);
      }
    };

    // Increased debounce time to 1 second to reduce API calls
    const timeoutId = setTimeout(fetchPrice, 1000);
    return () => clearTimeout(timeoutId);
  }, [formState.symbol, fetchQuote]);

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target as HTMLInputElement;
    setFormState((prev) => ({ ...prev, extendedHours: input.checked }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formState.symbol) {
      return;
    }

    const qty = Number.parseFloat(formState.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return;
    }

    onSubmit(
      {
        symbol: formState.symbol,
        qty,
        side: formState.side,
        type: "market",
        time_in_force: formState.timeInForce,
        extended_hours: formState.extendedHours,
        position_side: formState.positionSide,
      },
      currentPrice || undefined
    );

    // Reset form after successful submission
    if (orderSuccess) {
      setFormState((prev) => ({ ...prev, symbol: "", qty: "1" }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Place Order</CardTitle>
        <CardDescription>
          Submit a new trading order to your connected account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Symbol
              </label>
              <Input
                name="symbol"
                value={formState.symbol}
                onChange={handleInputChange}
                placeholder="e.g., AAPL"
                className="uppercase"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground">
                Quantity
              </label>
              <Input
                name="qty"
                type="number"
                value={formState.qty}
                onChange={handleInputChange}
                min="1"
                step="1"
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
              onChange={handleCheckboxChange}
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
                      Set <strong>Order Side</strong> to &quot;Sell&quot;
                    </li>
                    <li>
                      Set <strong>Position Type</strong> to &quot;Short&quot;
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
              <p className="text-muted-foreground">Market order</p>
            </div>
            <div>
              <p className="font-medium">Estimated Cost</p>
              <p className="text-muted-foreground">
                {formState.side === "buy" && formState.symbol && currentPrice
                  ? `~$${(
                      Number.parseFloat(formState.qty) * currentPrice
                    ).toFixed(2)}`
                  : formState.side === "buy" && formState.symbol && quoteLoading
                  ? "Loading price..."
                  : formState.side === "buy" && formState.symbol && priceError
                  ? "Price unavailable"
                  : "N/A"}
              </p>
              {currentPrice && (
                <p className="text-xs text-muted-foreground">
                  @ ${currentPrice.toFixed(2)}/share
                </p>
              )}
            </div>
          </div>

          {orderError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {orderError}
            </div>
          )}

          {orderSuccess && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              {orderSuccess}
            </div>
          )}

          <Button
            type="submit"
            disabled={isPlacingOrder || !formState.symbol}
            className="w-full"
          >
            {isPlacingOrder ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Order...
              </>
            ) : (
              <>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Submit Order
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
