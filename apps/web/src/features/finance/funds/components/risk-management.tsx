/**
 * RiskManagement Component
 *
 * Focused tab for configuring risk parameters and position sizing
 */

"use client";

import { Strategy } from "@printer/shared";
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

import { strategyService } from "../services/strategy-service";

interface RiskManagementProps {
  fundId: string;
  strategy: Strategy | null;
  onUpdate: () => void;
}

export function RiskManagement({
  fundId,
  strategy,
  onUpdate,
}: RiskManagementProps) {
  const [maxLossPercent, setMaxLossPercent] = useState("");
  const [maxLossDollars, setMaxLossDollars] = useState("");
  const [maxGivebackPercent, setMaxGivebackPercent] = useState("");
  const [sizePerTrade, setSizePerTrade] = useState("");
  const [minBetPercent, setMinBetPercent] = useState("");
  const [maxBetPercent, setMaxBetPercent] = useState("");
  const [maxTotalExposure, setMaxTotalExposure] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (strategy) {
      setMaxLossPercent(strategy.maxLossPercent?.toString() || "");
      setMaxLossDollars(strategy.maxLossDollars?.toString() || "");
      setMaxGivebackPercent(strategy.maxGivebackPercent?.toString() || "");
      setSizePerTrade(strategy.sizePerTrade?.toString() || "");
      setMinBetPercent(strategy.minBetPercent?.toString() || "");
      setMaxBetPercent(strategy.maxBetPercent?.toString() || "");
      setMaxTotalExposure(strategy.maxTotalExposure?.toString() || "");
    }
  }, [strategy]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await strategyService.createOrUpdateStrategy({
        fundId,
        executionStrategyId: strategy?.executionStrategyId || "",
        executionConfig: strategy?.executionConfig || {},
        maxLossPercent: parseFloat(maxLossPercent) || 0,
        maxLossDollars: parseFloat(maxLossDollars) || 0,
        maxGivebackPercent: parseFloat(maxGivebackPercent) || 0,
        sizePerTrade: parseFloat(sizePerTrade) || 0,
        minBetPercent: parseFloat(minBetPercent) || 0,
        maxBetPercent: parseFloat(maxBetPercent) || 0,
        maxTotalExposure: parseFloat(maxTotalExposure) || 0,
        tradingStartTime: strategy?.tradingStartTime || "",
        tradingEndTime: strategy?.tradingEndTime || "",
        timezone: strategy?.timezone || "America/New_York",
        screeningCriteriaId: strategy?.screeningCriteriaId,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      console.error("Error saving risk management:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-200">
          Risk management settings saved successfully!
        </div>
      )}

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
                disabled={isSaving}
                placeholder="2.0"
              />
              <p className="text-xs text-muted-foreground">
                Stop trading if down this % from start
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLossDollars">Max Loss $ Per Day</Label>
              <Input
                id="maxLossDollars"
                type="number"
                step="1"
                value={maxLossDollars}
                onChange={(e) => setMaxLossDollars(e.target.value)}
                disabled={isSaving}
                placeholder="500"
              />
              <p className="text-xs text-muted-foreground">
                Hard dollar limit for daily losses
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxGivebackPercent">Max Giveback %</Label>
              <Input
                id="maxGivebackPercent"
                type="number"
                step="0.1"
                value={maxGivebackPercent}
                onChange={(e) => setMaxGivebackPercent(e.target.value)}
                disabled={isSaving}
                placeholder="30.0"
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
                disabled={isSaving}
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground">
                Default dollar amount per trade
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxTotalExposure">Max Total Exposure ($)</Label>
              <Input
                id="maxTotalExposure"
                type="number"
                step="1000"
                value={maxTotalExposure}
                onChange={(e) => setMaxTotalExposure(e.target.value)}
                disabled={isSaving}
                placeholder="5000"
              />
              <p className="text-xs text-muted-foreground">
                Maximum capital at risk across all positions
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minBetPercent">Min Bet % of Fund</Label>
              <Input
                id="minBetPercent"
                type="number"
                step="0.1"
                value={minBetPercent}
                onChange={(e) => setMinBetPercent(e.target.value)}
                disabled={isSaving}
                placeholder="1.0"
              />
              <p className="text-xs text-muted-foreground">
                Minimum position size as % of fund balance
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxBetPercent">Max Bet % of Fund</Label>
              <Input
                id="maxBetPercent"
                type="number"
                step="0.1"
                value={maxBetPercent}
                onChange={(e) => setMaxBetPercent(e.target.value)}
                disabled={isSaving}
                placeholder="5.0"
              />
              <p className="text-xs text-muted-foreground">
                Maximum position size as % of fund balance
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Risk Settings"}
        </Button>
      </div>
    </div>
  );
}
