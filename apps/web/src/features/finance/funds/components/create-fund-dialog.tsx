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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { Textarea } from "@/lib/components/ui/textarea";

import {
  COLOR_OPTIONS,
  getColorClasses,
  getIconByName,
  ICON_OPTIONS,
} from "../config/icon-options";
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
  const [selectedIcon, setSelectedIcon] = useState("Wallet");
  const [selectedColor, setSelectedColor] = useState("blue");
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
        icon: selectedIcon,
        iconColor: selectedColor,
      });

      // Reset form
      setName("");
      setDescription("");
      setMode("sim");
      setInitialBalance("10000");
      setSelectedIcon("Wallet");
      setSelectedColor("blue");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fund");
    } finally {
      setIsSubmitting(false);
    }
  };

  const SelectedIconComponent = getIconByName(selectedIcon);
  const colorClasses = getColorClasses(selectedColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Fund</DialogTitle>
            <DialogDescription>
              Set up a new trading fund with an initial balance. You can
              configure the strategy and risk parameters after creation.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="py-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
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
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    ⚠️ Real money mode will execute actual trades with your
                    linked account.
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
            </TabsContent>

            <TabsContent value="appearance" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="grid grid-cols-7 gap-2">
                  {ICON_OPTIONS.map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = selectedIcon === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setSelectedIcon(option.name)}
                        disabled={isSubmitting}
                        className={`
                          p-3 rounded-md border-2 transition-all
                          flex items-center justify-center
                          hover:scale-110
                          ${
                            isSelected
                              ? `${colorClasses.borderClass} ${colorClasses.bgClass}`
                              : "border-border hover:border-muted-foreground"
                          }
                        `}
                        title={option.label}
                      >
                        <IconComponent
                          className={`h-5 w-5 ${
                            isSelected
                              ? colorClasses.textClass
                              : "text-foreground"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_OPTIONS.map((option) => {
                    const isSelected = selectedColor === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setSelectedColor(option.name)}
                        disabled={isSubmitting}
                        className={`
                          p-3 rounded-md border-2 transition-all
                          flex flex-col items-center justify-center gap-1
                          hover:scale-105
                          ${
                            isSelected
                              ? `${option.borderClass} ${option.bgClass}`
                              : "border-border hover:border-muted-foreground"
                          }
                        `}
                      >
                        <div
                          className={`w-6 h-6 rounded-full ${option.bgClass} border ${option.borderClass}`}
                        />
                        <span className="text-xs">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="p-4 border rounded-md bg-muted/30 flex items-center gap-3">
                  <div
                    className={`
                    p-3 rounded-lg ${colorClasses.bgClass} border ${colorClasses.borderClass}
                  `}
                  >
                    <SelectedIconComponent
                      className={`h-6 w-6 ${colorClasses.textClass}`}
                    />
                  </div>
                  <div>
                    <div className="font-semibold">{name || "Fund Name"}</div>
                    {description && (
                      <div className="text-sm text-muted-foreground">
                        {description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

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
