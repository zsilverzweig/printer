/**
 * CreateFundDialog Component
 *
 * Dialog for creating a new fund.
 */

import { useState } from "react";

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
import { Textarea } from "@/lib/components/ui/textarea";

import { CreateFundInput, FundMode } from "../types";

interface CreateFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateFundInput) => Promise<void>;
}

export function CreateFundDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateFundDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<FundMode>("sim");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Fund name is required");
      return;
    }

    const balance = parseFloat(initialBalance);
    if (isNaN(balance) || balance <= 0) {
      setError("Initial balance must be a positive number");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        initialBalance: balance,
      });

      // Reset form
      setName("");
      setDescription("");
      setMode("sim");
      setInitialBalance("10000");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fund");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Fund</DialogTitle>
            <DialogDescription>
              Set up a new trading fund with an initial balance. You can
              configure the strategy and risk parameters after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 border border-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Fund Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Momentum Breakout Fund"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the fund's strategy or purpose"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mode">Mode *</Label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as FundMode)}
                disabled={isSubmitting}
              >
                <SelectTrigger id="mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                      Simulation (Paper Trading)
                    </span>
                  </SelectItem>
                  <SelectItem value="real">
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      Real Money
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {mode === "real" && (
                <p className="text-sm text-amber-600">
                  ⚠️ Real money mode will execute actual trades with your linked
                  account.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="initialBalance">Initial Balance *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="initialBalance"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="10000"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  disabled={isSubmitting}
                  className="pl-7"
                />
              </div>
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Fund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
