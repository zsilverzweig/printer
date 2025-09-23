"use client";

import { CheckCircle, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { useAuth } from "@/lib/hooks/use-auth";
import {
  AlpacaOrderSide,
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/lib/types/alpaca";

import {
  TradingProvider,
  useTradingContext,
} from "../contexts/trading-context";
import { useTrading } from "../hooks/use-trading";

import { AccountSummary } from "./account-summary";
import { OrderConfirmationModal } from "./order-confirmation-modal";
import { OrderForm } from "./order-form";
import { PositionsList } from "./positions-list";
import { RecentOrdersList } from "./recent-orders-list";
import { TradingEnvironmentToggle } from "./trading-environment-toggle";

interface OrderFormData {
  symbol: string;
  qty: number;
  side: AlpacaOrderSide;
  type: "market";
  time_in_force: AlpacaTimeInForce;
  extended_hours: boolean;
  position_side: AlpacaPositionSide;
}

interface OrderConfirmationData {
  symbol: string;
  qty: string;
  side: AlpacaOrderSide;
  positionSide: AlpacaPositionSide;
  timeInForce: AlpacaTimeInForce;
  extendedHours: boolean;
}

function TradingPanelContent() {
  const { user } = useAuth();
  const { environment } = useTradingContext();
  const {
    account,
    positions,
    orders,
    loading,
    isPlacingOrder,
    isConnected,
    refresh,
    placeOrder,
  } = useTrading();

  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(
    null
  );
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [confirmationData, setConfirmationData] =
    useState<OrderConfirmationData | null>(null);
  const [isClosingPosition, setIsClosingPosition] = useState(false);

  const searchParams = useSearchParams();

  // Check for success message from OAuth callback
  useEffect(() => {
    const success = searchParams.get("success");
    if (success === "alpaca_connected") {
      setConnectionSuccess("Alpaca account connected successfully!");
      // Clear the success message after 5 seconds
      setTimeout(() => setConnectionSuccess(null), 5000);
    }
  }, [searchParams]);

  const accountCurrency = account?.currency || "USD";

  // Calculate estimated cost for market orders
  const calculateEstimatedCost = (
    symbol: string,
    qty: number,
    side: string
  ) => {
    // For market orders, we can't get exact price, but we can estimate
    // This is a placeholder - in a real app, you'd fetch current market price
    const estimatedPrice = 100; // Placeholder price
    return side === "buy" ? qty * estimatedPrice : 0;
  };

  const handleOrderSubmit = (orderData: OrderFormData, price?: number) => {
    setOrderError(null);
    setOrderSuccess(null);

    // Calculate estimated cost using real price if available
    const cost = price && orderData.side === "buy" 
      ? orderData.qty * price 
      : calculateEstimatedCost(
          orderData.symbol,
          orderData.qty,
          orderData.side
        );
    
    setEstimatedCost(cost);
    setCurrentPrice(price || null);

    setConfirmationData({
      symbol: orderData.symbol,
      qty: orderData.qty.toString(),
      side: orderData.side,
      positionSide: orderData.position_side,
      timeInForce: orderData.time_in_force,
      extendedHours: orderData.extended_hours,
    });

    setShowConfirmation(true);
  };

  const handleConfirmOrder = async () => {
    if (!confirmationData) return;

    setShowConfirmation(false);
    setOrderError(null);
    setOrderSuccess(null);

    const qty = Number.parseFloat(confirmationData.qty);

    try {
      const order = await placeOrder({
        symbol: confirmationData.symbol,
        qty,
        side: confirmationData.side,
        type: "market",
        time_in_force: confirmationData.timeInForce,
        extended_hours: confirmationData.extendedHours,
        position_side: confirmationData.positionSide,
      });

      setOrderSuccess(
        `Submitted ${order.side.toUpperCase()} order for ${order.symbol} (${
          order.qty || qty
        }).`
      );
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to submit order."
      );
    }
  };

  const handleClosePosition = async (symbol: string, qty: number) => {
    setIsClosingPosition(true);
    setOrderError(null);
    setOrderSuccess(null);

    try {
      // Determine the side based on the position
      const position = positions.find((p) => p.symbol === symbol);
      const side = position && Number(position.qty) > 0 ? "sell" : "buy";

      await placeOrder({
        symbol,
        qty,
        side: side as AlpacaOrderSide,
        type: "market",
        time_in_force: "day",
        extended_hours: false,
        position_side: "long", // This will be handled by the broker
      });

      setOrderSuccess(`Closed position for ${symbol} (${qty} shares).`);
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to close position."
      );
    } finally {
      setIsClosingPosition(false);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-muted-foreground">
            Please log in to access trading
          </h2>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Trading Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your investment portfolio with real-time trading
              capabilities. Place orders, monitor positions, and track your
              performance.
            </p>
          </div>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh data
          </Button>
        </div>

        {connectionSuccess && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {connectionSuccess}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-muted-foreground">
              Trading account integration not yet implemented
            </h2>
            <p className="text-muted-foreground mt-2">
              Connect your Alpaca account to start trading.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trading Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your investment portfolio with real-time trading
            capabilities. Place orders, monitor positions, and track your
            performance.
          </p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh data
        </Button>
      </div>

      {connectionSuccess && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {connectionSuccess}
          </div>
        </div>
      )}

      <TradingEnvironmentToggle />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <AccountSummary account={account} loading={loading} />
          <PositionsList
            positions={positions}
            loading={loading}
            accountCurrency={accountCurrency}
            onClosePosition={handleClosePosition}
            isClosingPosition={isClosingPosition}
          />
        </div>
        <div className="space-y-6">
          <OrderForm
            onSubmit={handleOrderSubmit}
            isPlacingOrder={isPlacingOrder}
            orderError={orderError}
            orderSuccess={orderSuccess}
          />
          <RecentOrdersList
            orders={orders}
            loading={loading}
            accountCurrency={accountCurrency}
          />
        </div>
      </div>

      {confirmationData && (
        <OrderConfirmationModal
          isOpen={showConfirmation}
          onClose={() => setShowConfirmation(false)}
          onConfirm={handleConfirmOrder}
          isPlacingOrder={isPlacingOrder}
          orderData={confirmationData}
          estimatedCost={estimatedCost}
          accountCurrency={accountCurrency}
          environment={environment}
        />
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
