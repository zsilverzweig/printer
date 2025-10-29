/**
 * StrategySelection Component
 *
 * Focused tab for selecting and configuring the execution strategy
 */

"use client";

import { ExecutionStrategy, Strategy } from "@printer/shared";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { strategyService } from "../services/strategy-service";

interface StrategySelectionProps {
  fundId: string;
  strategy: Strategy | null;
  onUpdate: () => void;
}

export function StrategySelection({
  fundId,
  strategy,
  onUpdate,
}: StrategySelectionProps) {
  const [executionStrategies, setExecutionStrategies] = useState<
    ExecutionStrategy[]
  >([]);
  const [executionStrategyId, setExecutionStrategyId] = useState(
    strategy?.executionStrategyId || ""
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
    if (strategy?.executionStrategyId) {
      setExecutionStrategyId(strategy.executionStrategyId);
    }
  }, [strategy]);

  const selectedStrategy = executionStrategies.find(
    (s) => s.id === executionStrategyId
  );

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await strategyService.createOrUpdateStrategy({
        fundId,
        executionStrategyId,
        executionConfig: {}, // TODO: Dynamic config based on strategy schema
        // Keep existing values or use defaults
        maxLossPercent: strategy?.maxLossPercent || 0,
        maxLossDollars: strategy?.maxLossDollars || 0,
        maxGivebackPercent: strategy?.maxGivebackPercent || 0,
        sizePerTrade: strategy?.sizePerTrade || 0,
        minBetPercent: strategy?.minBetPercent || 0,
        maxBetPercent: strategy?.maxBetPercent || 0,
        maxTotalExposure: strategy?.maxTotalExposure || 0,
        tradingStartTime: strategy?.tradingStartTime || "",
        tradingEndTime: strategy?.tradingEndTime || "",
        timezone: strategy?.timezone || "America/New_York",
        screeningCriteriaId: strategy?.screeningCriteriaId,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      console.error("Error saving strategy:", err);
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = executionStrategyId !== strategy?.executionStrategyId;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-200">
          Strategy saved successfully!
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Execution Strategy</CardTitle>
          <CardDescription>
            Choose the trading logic that will execute trades for this fund
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="executionStrategy">Strategy Type</Label>
            <Select
              value={executionStrategyId}
              onValueChange={setExecutionStrategyId}
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
              {selectedStrategy.requiredIndicators?.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Requires: {selectedStrategy.requiredIndicators.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* TODO: Add dynamic config editor based on selectedStrategy.configSchema */}
          {selectedStrategy?.configSchema && (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Dynamic config editor coming soon
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
          {isSaving ? "Saving..." : "Save Strategy"}
        </Button>
      </div>
    </div>
  );
}
