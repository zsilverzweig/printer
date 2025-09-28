"use client";

import { Info, TestTube, DollarSign } from "lucide-react";

import { ConfirmationDialog } from "@/lib/components/ui/confirmation-dialog";
import {
  AlpacaOrderSide,
  AlpacaPositionSide,
  AlpacaTimeInForce,
} from "@/lib/types/alpaca";

interface OrderConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPlacingOrder: boolean;
  orderData: {
    symbol: string;
    qty: string;
    side: AlpacaOrderSide;
    positionSide: AlpacaPositionSide;
    timeInForce: AlpacaTimeInForce;
    extendedHours: boolean;
  };
  estimatedCost: number | null;
  accountCurrency: string;
  environment: "paper" | "live";
}

export function OrderConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isPlacingOrder,
  orderData,
  estimatedCost,
  accountCurrency,
  environment,
}: OrderConfirmationModalProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Confirm Order"
      confirmText={isPlacingOrder ? "Submitting..." : "Confirm Order"}
      cancelText="Cancel"
      isLoading={isPlacingOrder}
      loadingText="Submitting..."
      size="md"
    >
      <div className="space-y-4">
        {/* Environment Banner */}
        <div className={`rounded-md border-2 p-4 ${
          environment === "paper"
            ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
            : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
        }`}>
          <div className="flex items-center gap-3">
            {environment === "paper" ? (
              <TestTube className="h-6 w-6 text-blue-600" />
            ) : (
              <DollarSign className="h-6 w-6 text-red-600" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">
                  {environment === "paper" ? "Paper Trading" : "Live Trading"}
                </h3>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                  environment === "paper"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}>
                  {environment === "paper" ? "SAFE" : "REAL MONEY"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {environment === "paper"
                  ? "This is a test transaction with virtual money - no real funds at risk."
                  : "This transaction will use real money from your account."}
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Please review your order details before submitting.
        </p>

        {/* Order Summary */}
        <div className="rounded-md border p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Symbol:</span>
              <div className="font-medium">{orderData.symbol}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Quantity:</span>
              <div className="font-medium">{orderData.qty} shares</div>
            </div>
            <div>
              <span className="text-muted-foreground">Order Side:</span>
              <div className="font-medium capitalize">{orderData.side}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Position Type:</span>
              <div className="font-medium capitalize">
                {orderData.positionSide}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Order Type:</span>
              <div className="font-medium">Market</div>
            </div>
            <div>
              <span className="text-muted-foreground">Time in Force:</span>
              <div className="font-medium">
                {orderData.timeInForce.toUpperCase()}
              </div>
            </div>
            {orderData.extendedHours && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Extended Hours:</span>
                <div className="font-medium text-amber-600">Enabled</div>
              </div>
            )}
          </div>
        </div>

        {/* Cost Summary */}
        {orderData.side === "buy" && estimatedCost && (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Estimated Cost:
              </span>
              <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(estimatedCost, accountCurrency)}
              </span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              * Market orders execute at current market price. Final cost may
              vary.
            </p>
          </div>
        )}

        {/* Short Position Warning */}
        {orderData.positionSide === "short" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-red-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-800 dark:text-red-200">
                  Short Position Warning
                </p>
                <p className="text-red-700 dark:text-red-300 mt-1">
                  You are opening a short position. You will profit if{" "}
                  {orderData.symbol} goes down, but lose money if it goes up.
                  Short positions have unlimited loss potential.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConfirmationDialog>
  );
}
