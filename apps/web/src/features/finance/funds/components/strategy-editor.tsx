/**
 * StrategyEditor Component
 *
 * Form for configuring fund strategy with execution strategy selection,
 * risk parameters, position sizing, and trading windows.
 *
 * Now uses the plugin architecture with ExecutionStrategy selection.
 */

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

import type { ExecutionStrategy, Strategy } from "@printer/shared";
import { executionStrategyService } from "../services/execution-strategy-service";
import { strategyService } from "../services/strategy-service";

interface StrategyEditorProps {
  fundId: string;
  strategy: Strategy | null;
  onUpdate: () => void;
}

export function StrategyEditor({
  fundId,
  strategy,
  onUpdate,
}: StrategyEditorProps) {
  const [isEditing, setIsEditing] = useState(!strategy);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Available execution strategies
  const [executionStrategies, setExecutionStrategies] = useState<
    ExecutionStrategy[]
  >([]);
  const [loadingStrategies, setLoadingStrategies] = useState(true);

  // Form state
  const [executionStrategyId, setExecutionStrategyId] = useState("");
  const [executionConfig, setExecutionConfig] = useState<Record<string, any>>(
    {}
  );

  // Risk parameters
  const [maxLossPercent, setMaxLossPercent] = useState("2");
  const [maxLossDollars, setMaxLossDollars] = useState("1000");
  const [maxGivebackPercent, setMaxGivebackPercent] = useState("50");

  // Position sizing
  const [sizePerTrade, setSizePerTrade] = useState("1000");
  const [minBetPercent, setMinBetPercent] = useState("1");
  const [maxBetPercent, setMaxBetPercent] = useState("5");
  const [maxTotalExposure, setMaxTotalExposure] = useState("10000");

  // Trading windows
  const [tradingStartTime, setTradingStartTime] = useState("09:30");
  const [tradingEndTime, setTradingEndTime] = useState("16:00");
  const [timezone, setTimezone] = useState("America/New_York");

  // Load available execution strategies
  useEffect(() => {
    const loadExecutionStrategies = async () => {
      try {
        const strategies =
          await executionStrategyService.getExecutionStrategies();
        setExecutionStrategies(strategies);

        // Default to first strategy if creating new
        if (!strategy && strategies.length > 0) {
          setExecutionStrategyId(strategies[0].id);
        }
      } catch (err) {
        console.error("Failed to load execution strategies:", err);
        setError("Failed to load available strategies");
      } finally {
        setLoadingStrategies(false);
      }
    };

    loadExecutionStrategies();
  }, [strategy]);

  // Load existing strategy data
  useEffect(() => {
    if (strategy) {
      setExecutionStrategyId(strategy.executionStrategyId);
      setExecutionConfig(strategy.executionConfig || {});
      setMaxLossPercent(strategy.maxLossPercent.toString());
      setMaxLossDollars(strategy.maxLossDollars.toString());
      setMaxGivebackPercent(strategy.maxGivebackPercent.toString());
      setSizePerTrade(strategy.sizePerTrade.toString());
      setMinBetPercent(strategy.minBetPercent.toString());
      setMaxBetPercent(strategy.maxBetPercent.toString());
      setMaxTotalExposure(strategy.maxTotalExposure.toString());
      setTradingStartTime(strategy.tradingStartTime || "09:30");
      setTradingEndTime(strategy.tradingEndTime || "16:00");
      setTimezone(strategy.timezone || "America/New_York");
    }
  }, [strategy]);

  const selectedStrategy = executionStrategies.find(
    (s) => s.id === executionStrategyId
  );

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const data = {
        fundId,
        executionStrategyId,
        executionConfig,
        maxLossPercent: parseFloat(maxLossPercent),
        maxLossDollars: parseFloat(maxLossDollars),
        maxGivebackPercent: parseFloat(maxGivebackPercent),
        sizePerTrade: parseFloat(sizePerTrade),
        minBetPercent: parseFloat(minBetPercent),
        maxBetPercent: parseFloat(maxBetPercent),
        maxTotalExposure: parseFloat(maxTotalExposure),
        tradingStartTime,
        tradingEndTime,
        timezone,
      };

      await strategyService.createOrUpdateStrategy(data);

      setSuccess("Strategy saved successfully");
      setIsEditing(false);
      onUpdate();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save strategy");
    } finally {
      setIsSaving(false);
    }
  };

  const isReadOnly = !isEditing && strategy !== null;

  if (loadingStrategies) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Loading strategies...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {/* Execution Strategy Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Strategy</CardTitle>
          <CardDescription>
            Choose the trading logic for this fund
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="executionStrategy">Strategy Type</Label>
            <Select
              value={executionStrategyId}
              onValueChange={setExecutionStrategyId}
              disabled={isReadOnly || isSaving}
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
        </CardContent>
      </Card>

      {/* Risk Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Parameters</CardTitle>
          <CardDescription>
            Set maximum loss limits to protect your capital
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="maxLossPercent">Max Loss % Per Day</Label>
              <Input
                id="maxLossPercent"
                type="number"
                step="0.1"
                value={maxLossPercent}
                onChange={(e) => setMaxLossPercent(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLossDollars">Max Loss $ Per Day</Label>
              <Input
                id="maxLossDollars"
                type="number"
                step="1"
                value={maxLossDollars}
                onChange={(e) => setMaxLossDollars(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxGivebackPercent">Max Giveback %</Label>
              <Input
                id="maxGivebackPercent"
                type="number"
                step="0.1"
                value={maxGivebackPercent}
                onChange={(e) => setMaxGivebackPercent(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Max loss from high water mark before stopping
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Position Sizing */}
      <Card>
        <CardHeader>
          <CardTitle>Position Sizing</CardTitle>
          <CardDescription>
            Configure trade sizes and exposure limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sizePerTrade">Size Per Trade ($)</Label>
              <Input
                id="sizePerTrade"
                type="number"
                step="100"
                value={sizePerTrade}
                onChange={(e) => setSizePerTrade(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTotalExposure">Max Total Exposure ($)</Label>
              <Input
                id="maxTotalExposure"
                type="number"
                step="1000"
                value={maxTotalExposure}
                onChange={(e) => setMaxTotalExposure(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minBetPercent">Min Bet % of Fund</Label>
              <Input
                id="minBetPercent"
                type="number"
                step="0.1"
                value={minBetPercent}
                onChange={(e) => setMinBetPercent(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxBetPercent">Max Bet % of Fund</Label>
              <Input
                id="maxBetPercent"
                type="number"
                step="0.1"
                value={maxBetPercent}
                onChange={(e) => setMaxBetPercent(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trading Time Windows */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Time Windows</CardTitle>
          <CardDescription>Define when trades can be executed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tradingStartTime">Trading Start Time</Label>
              <Input
                id="tradingStartTime"
                type="time"
                value={tradingStartTime}
                onChange={(e) => setTradingStartTime(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
              <p className="text-sm text-muted-foreground">
                Market open (e.g., 09:30)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradingEndTime">Trading End Time</Label>
              <Input
                id="tradingEndTime"
                type="time"
                value={tradingEndTime}
                onChange={(e) => setTradingEndTime(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
              <p className="text-sm text-muted-foreground">
                Market close (e.g., 16:00)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={timezone}
                onValueChange={setTimezone}
                disabled={isReadOnly || isSaving}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">
                    Eastern Time (ET)
                  </SelectItem>
                  <SelectItem value="America/Chicago">
                    Central Time (CT)
                  </SelectItem>
                  <SelectItem value="America/Denver">
                    Mountain Time (MT)
                  </SelectItem>
                  <SelectItem value="America/Los_Angeles">
                    Pacific Time (PT)
                  </SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        {!isEditing && strategy ? (
          <Button onClick={() => setIsEditing(true)}>Edit Strategy</Button>
        ) : (
          <>
            {strategy && (
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : strategy
                ? "Save Changes"
                : "Create Strategy"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
