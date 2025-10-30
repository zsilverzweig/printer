/**
 * StrategySelection Component
 *
 * Component for selecting and configuring the execution strategy
 */

"use client";

import { ExecutionStrategy, Fund } from "@printer/shared";
import { useEffect, useState } from "react";

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
}

export function StrategySelection({
  fundId,
  fund,
  onUpdate,
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

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await fundService.updateFund(fundId, {
        strategyId: executionStrategyId,
        strategyConfig: executionConfig,
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

          {/* Strategy-specific configuration */}
          {selectedStrategy?.configSchema?.properties && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Strategy Configuration
                </h4>
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(
                    selectedStrategy.configSchema.properties as Record<
                      string,
                      any
                    >
                  ).map(([key, schema]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={key}>{schema.description || key}</Label>
                      <Input
                        id={key}
                        type={schema.type === "integer" ? "number" : "text"}
                        min={schema.minimum}
                        max={schema.maximum}
                        step={schema.type === "integer" ? 1 : undefined}
                        value={executionConfig[key] ?? schema.default ?? ""}
                        onChange={(e) => {
                          const value =
                            schema.type === "integer"
                              ? parseInt(e.target.value) || schema.default
                              : e.target.value;
                          setExecutionConfig({
                            ...executionConfig,
                            [key]: value,
                          });
                        }}
                        placeholder={
                          schema.default
                            ? `Default: ${schema.default}`
                            : undefined
                        }
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">
                        {schema.minimum && schema.maximum
                          ? `Range: ${schema.minimum}-${schema.maximum}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
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
