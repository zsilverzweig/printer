"use client";

import { AlertTriangle, X } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import { Modal } from "@/lib/components/ui/modal";
import { useTradingContext } from "../contexts/trading-context";

interface ClosePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  symbol: string;
  qty: number;
  isClosing: boolean;
}

export function ClosePositionModal({
  isOpen,
  onClose,
  onConfirm,
  symbol,
  qty,
  isClosing,
}: ClosePositionModalProps) {
  const { environment, isPaperTrading } = useTradingContext();

  return (
    <Modal open={isOpen} onOpenChange={onClose} title="Close Position">
      <div className="space-y-4">
        {/* Environment Banner */}
        <div
          className={`rounded-md border-2 p-4 ${
            isPaperTrading
              ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950"
              : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
          }`}
        >
          <div className="flex items-center gap-3">
            {isPaperTrading ? (
              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-xs font-bold text-white">P</span>
              </div>
            ) : (
              <div className="h-6 w-6 rounded-full bg-red-600 flex items-center justify-center">
                <span className="text-xs font-bold text-white">L</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">
                  {isPaperTrading ? "Paper Trading" : "Live Trading"}
                </h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    isPaperTrading
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  }`}
                >
                  {isPaperTrading ? "SAFE" : "REAL MONEY"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {isPaperTrading
                  ? "This is a test transaction with virtual money - no real funds at risk."
                  : "This transaction will use real money from your account."}
              </p>
            </div>
          </div>
        </div>

        {/* Position Details */}
        <div className="rounded-md border p-4">
          <h4 className="font-semibold mb-3">Position Details</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Symbol:</span>
              <span className="font-medium">{symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity:</span>
              <span className="font-medium">{qty} shares</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Action:</span>
              <span className="font-medium text-red-600">Close Position</span>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="flex items-start gap-3 rounded-md bg-yellow-50 p-3 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="font-medium">Warning</p>
            <p className="text-sm">
              This will close your entire position in {symbol}. Any unrealized
              gains or losses will be realized.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isClosing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isClosing}
            className="flex items-center gap-2"
          >
            {isClosing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Closing...
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                Close Position
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
