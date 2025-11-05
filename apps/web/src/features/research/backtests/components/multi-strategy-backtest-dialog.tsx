/**
 * MultiStrategyBacktestDialog Component
 *
 * Dialog for running multi-strategy backtests with multiple strategy/screener combinations.
 */

"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useFunds } from "@/features/finance/funds/hooks/use-funds";
import { executionStrategyService } from "@/features/finance/funds/services/execution-strategy-service";
import { screeningCriteriaService } from "@/features/finance/funds/services/screening-criteria-service";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import type { ExecutionStrategy, ScreeningCriteria } from "@printer/shared";
import { MultiStrategyBacktestRequest, StrategyScreenerCombo } from "../types";

interface MultiStrategyBacktestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: MultiStrategyBacktestRequest) => Promise<void>;
}

export function MultiStrategyBacktestDialog({
  open,
  onOpenChange,
  onSubmit,
}: MultiStrategyBacktestDialogProps) {
  const { funds, loading: fundsLoading } = useFunds();
  const [strategies, setStrategies] = useState<ExecutionStrategy[]>([]);
  const [screeners, setScreeners] = useState<ScreeningCriteria[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [loadingScreeners, setLoadingScreeners] = useState(false);

  const [fundTemplateId, setFundTemplateId] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split("T")[0];
  });
  const [selectedStrategies, setSelectedStrategies] = useState<Set<string>>(
    new Set()
  );
  const [selectedScreeners, setSelectedScreeners] = useState<Set<string>>(
    new Set()
  );
  const [combinations, setCombinations] = useState<StrategyScreenerCombo[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load strategies and screeners
  useEffect(() => {
    if (open) {
      const loadData = async () => {
        setLoadingStrategies(true);
        setLoadingScreeners(true);
        try {
          const [strategiesData, screenersData] = await Promise.all([
            executionStrategyService.getExecutionStrategies(),
            screeningCriteriaService.getScreeningCriteria(),
          ]);
          setStrategies(strategiesData);
          setScreeners(screenersData);
        } catch (err) {
          console.error("Failed to load strategies/screeners:", err);
        } finally {
          setLoadingStrategies(false);
          setLoadingScreeners(false);
        }
      };
      loadData();
    }
  }, [open]);

  // Generate all combinations when strategies/screeners change
  useEffect(() => {
    if (selectedStrategies.size === 0) {
      setCombinations([]);
      return;
    }

    if (selectedScreeners.size === 0) {
      // Just strategies, no screeners
      const newCombos: StrategyScreenerCombo[] = Array.from(
        selectedStrategies
      ).map((strategyId) => ({
        strategyId,
        strategyConfig: {},
        screeningCriteriaId: null,
      }));
      setCombinations(newCombos);
    } else {
      // All strategy × screener combinations
      const newCombos: StrategyScreenerCombo[] = [];
      for (const strategyId of selectedStrategies) {
        for (const screenerId of selectedScreeners) {
          newCombos.push({
            strategyId,
            strategyConfig: {},
            screeningCriteriaId: screenerId,
          });
        }
      }
      setCombinations(newCombos);
    }
  }, [selectedStrategies, selectedScreeners]);

  const handleGenerateCombinations = () => {
    // Already handled by useEffect above
  };

  const handleRemoveCombination = (index: number) => {
    setCombinations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fundTemplateId) {
      setError("Please select a fund template");
      return;
    }

    if (!date) {
      setError("Please select a date");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Invalid date format. Please use YYYY-MM-DD");
      return;
    }

    if (combinations.length === 0) {
      setError("Please select at least one strategy/screener combination");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      await onSubmit({
        fundTemplateId,
        date,
        combinations,
      });

      // Reset form
      setFundTemplateId("");
      setSelectedStrategies(new Set());
      setSelectedScreeners(new Set());
      setCombinations([]);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run backtest");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter out active funds
  const availableFunds = funds.filter((f) => f.status !== "active");

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(strategyId)) {
        next.delete(strategyId);
      } else {
        next.add(strategyId);
      }
      return next;
    });
  };

  const toggleScreener = (screenerId: string) => {
    setSelectedScreeners((prev) => {
      const next = new Set(prev);
      if (next.has(screenerId)) {
        next.delete(screenerId);
      } else {
        next.add(screenerId);
      }
      return next;
    });
  };

  const getStrategyName = (strategyId: string) => {
    return strategies.find((s) => s.id === strategyId)?.name || strategyId;
  };

  const getScreenerName = (screenerId: string | null) => {
    if (!screenerId) return "None";
    return screeners.find((s) => s.id === screenerId)?.name || screenerId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Run Multi-Strategy Backtest</DialogTitle>
            <DialogDescription>
              Test multiple strategy/screener combinations on the same day. Each
              combination runs independently with the same starting balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-3 text-sm text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}

            {/* Fund Template */}
            <div className="space-y-2">
              <Label htmlFor="fund-template">Fund Template *</Label>
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
                  value={fundTemplateId}
                  onValueChange={setFundTemplateId}
                  disabled={isSubmitting || fundsLoading}
                >
                  <SelectTrigger id="fund-template">
                    <SelectValue placeholder="Select a fund template" />
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

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Trading Date *</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
                max={new Date().toISOString().split("T")[0]}
              />
              <p className="text-xs text-muted-foreground">
                Select the trading day to backtest (YYYY-MM-DD format)
              </p>
            </div>

            {/* Strategy Selection */}
            <div className="space-y-2">
              <Label>Strategies *</Label>
              {loadingStrategies ? (
                <div className="text-sm text-muted-foreground">
                  Loading strategies...
                </div>
              ) : (
                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {strategies.map((strategy) => (
                    <label
                      key={strategy.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStrategies.has(strategy.id)}
                        onChange={() => toggleStrategy(strategy.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{strategy.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Screener Selection */}
            <div className="space-y-2">
              <Label>Screeners (Optional)</Label>
              {loadingScreeners ? (
                <div className="text-sm text-muted-foreground">
                  Loading screeners...
                </div>
              ) : (
                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {screeners.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No screeners available
                    </div>
                  ) : (
                    screeners.map((screener) => (
                      <label
                        key={screener.id}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScreeners.has(screener.id)}
                          onChange={() => toggleScreener(screener.id)}
                          className="rounded"
                        />
                        <span className="text-sm">{screener.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                If no screeners selected, each strategy will run without a
                screener. If screeners selected, all strategy × screener
                combinations will be generated.
              </p>
            </div>

            {/* Combinations Preview */}
            {combinations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Generated Combinations ({combinations.length})</Label>
                </div>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Strategy</TableHead>
                        <TableHead>Screener</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {combinations.map((combo, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {getStrategyName(combo.strategyId)}
                          </TableCell>
                          <TableCell>
                            {getScreenerName(combo.screeningCriteriaId)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveCombination(index)}
                              disabled={isSubmitting}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
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
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !fundTemplateId ||
                !date ||
                combinations.length === 0
              }
            >
              {isSubmitting
                ? "Running..."
                : `Run ${combinations.length} Backtest${
                    combinations.length !== 1 ? "s" : ""
                  }`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
