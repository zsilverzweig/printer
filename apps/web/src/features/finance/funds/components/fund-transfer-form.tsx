/**
 * FundTransferForm Component
 *
 * Form for depositing or withdrawing funds.
 */

import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import { Textarea } from "@/lib/components/ui/textarea";

import { TransferType } from "../types";

interface FundTransferFormProps {
  fundId: string;
  currentBalance: number;
  onTransfer: (
    amount: number,
    type: TransferType,
    notes?: string
  ) => Promise<void>;
}

export function FundTransferForm({
  fundId,
  currentBalance,
  onTransfer,
}: FundTransferFormProps) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (type: TransferType) => {
    const amountValue = parseFloat(amount);

    if (isNaN(amountValue) || amountValue <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (type === "withdrawal" && amountValue > currentBalance) {
      setError("Withdrawal amount exceeds current balance");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      await onTransfer(amountValue, type, notes || undefined);

      setSuccess(
        `Successfully ${
          type === "deposit" ? "deposited" : "withdrew"
        } $${amountValue.toFixed(2)}`
      );
      setAmount("");
      setNotes("");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fund Transfers</CardTitle>
        <CardDescription>
          Deposit or withdraw funds. Transfers are tracked in the event system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 border border-green-200">
            {success}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="1000.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              className="pl-7"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            placeholder="Add a note about this transfer"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => handleSubmit("deposit")}
            disabled={isSubmitting}
            className="flex-1"
          >
            Deposit
          </Button>
          <Button
            onClick={() => handleSubmit("withdrawal")}
            disabled={isSubmitting}
            variant="outline"
            className="flex-1"
          >
            Withdraw
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Current Balance:{" "}
          <span className="font-medium">
            $
            {currentBalance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
