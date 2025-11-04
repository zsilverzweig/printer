/**
 * RunBacktestDialog Component
 *
 * Dialog for running a new backtest.
 */

"use client";

import { useState } from "react";

import { useFunds } from "@/features/finance/funds/hooks/use-funds";
import { Button } from "@/lib/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { RunBacktestRequest } from "../types";

interface RunBacktestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: RunBacktestRequest) => Promise<void>;
}

export function RunBacktestDialog({
  open,
  onOpenChange,
  onSubmit,
}: RunBacktestDialogProps) {
  const { funds, loading: fundsLoading } = useFunds();
  const [fundId, setFundId] = useState<string>("");
  // Set default date to yesterday (most recent trading day)
  const [date, setDate] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fundId) {
      setError("Please select a fund");
      return;
    }

    if (!date) {
      setError("Please select a date");
      return;
    }

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Invalid date format. Please use YYYY-MM-DD");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        fundId,
        date,
      });

      // Reset form
      setFundId("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter out active funds (can't backtest while active)
  const availableFunds = funds.filter((f) => f.status !== "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Run Backtest</DialogTitle>
            <DialogDescription>
              Run a backtest for a fund on a specific trading date. The fund
              must be paused before running a backtest.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fund">Fund *</Label>
              {fundsLoading ? (
                <div className="text-sm text-muted-foreground">
                  Loading funds...
                </div>
              ) : availableFunds.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No paused funds available. Please pause a fund first.
                </div>
              ) : (
                <Select
                  value={fundId}
                  onValueChange={setFundId}
                  disabled={isSubmitting || fundsLoading}
                >
                  <SelectTrigger id="fund">
                    <SelectValue placeholder="Select a fund" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFunds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Trading Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
                max={new Date().toISOString().split("T")[0]} // Can't backtest future dates
              />
              <p className="text-xs text-muted-foreground">
                Select the trading day to backtest (YYYY-MM-DD format)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !fundId || !date}>
              {isSubmitting ? "Running..." : "Run Backtest"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
