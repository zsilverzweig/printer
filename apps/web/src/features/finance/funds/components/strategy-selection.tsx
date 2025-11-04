/**
 * StrategySelection Component
 *
 * Component for selecting and configuring the execution strategy
 */

"use client";

import { ExecutionStrategy, Fund } from "@printer/shared";
import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

import { executionStrategyService } from "../services/execution-strategy-service";
import { fundService } from "../services/fund-service";

interface StrategySelectionProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function StrategySelection({
  fundId,
  fund,
  onUpdate,
  onSavingChange,
}: StrategySelectionProps) {
  const [executionStrategies, setExecutionStrategies] = useState<
    ExecutionStrategy[]
  >([]);
  const [executionStrategyId, setExecutionStrategyId] = useState(
    fund?.strategyId || ""
  );
  const [executionConfig, setExecutionConfig] = useState<Record<string, any>>(
    fund?.strategyConfig || {}
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const strategies =
          await executionStrategyService.getExecutionStrategies();
        setExecutionStrategies(strategies);
      } catch (err) {
        console.error("Error fetching execution strategies:", err);
        setError("Failed to load execution strategies");
      }
    };

    fetchStrategies();
  }, []);

  useEffect(() => {
    if (fund?.strategyId) {
      setExecutionStrategyId(fund.strategyId);
      setExecutionConfig(fund.strategyConfig || {});
    }
  }, [fund]);

  const selectedStrategy = executionStrategies.find(
    (s) => s.id === executionStrategyId
  );

  const saveIfChanged = async (
    overrides?: Partial<{
      executionStrategyId: string;
      executionConfig: Record<string, any>;
    }>
  ) => {
    const nextId = overrides?.executionStrategyId ?? executionStrategyId;
    const nextConfig = overrides?.executionConfig ?? executionConfig;

    const hasChanges =
      nextId !== fund?.strategyId ||
      JSON.stringify(nextConfig) !== JSON.stringify(fund?.strategyConfig || {});

    if (!hasChanges) return;

    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);
      setSuccess(false);

      await fundService.updateFund(fundId, {
        strategyId: nextId,
        strategyConfig: nextConfig,
      });

      onUpdate();
    } catch (err) {
      console.error("Error saving strategy:", err);
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const hasChanges =
    executionStrategyId !== fund?.strategyId ||
    JSON.stringify(executionConfig) !==
      JSON.stringify(fund?.strategyConfig || {});

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="executionStrategy">Strategy Type</Label>
            <Select
              value={executionStrategyId}
              onValueChange={(val) => {
                setExecutionStrategyId(val);
                void saveIfChanged({ executionStrategyId: val });
              }}
              disabled={isSaving}
            >
              <SelectTrigger id="executionStrategy">
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                {executionStrategies.map((strat) => (
                  <SelectItem key={strat.id} value={strat.id}>
                    {strat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedStrategy && (
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <p className="text-sm font-medium">{selectedStrategy.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedStrategy.description}
              </p>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Type: {selectedStrategy.strategyType}</span>
                <span>Timeframe: {selectedStrategy.expectedTimeframe}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Autosaves; no explicit save button */}
    </div>
  );
}
