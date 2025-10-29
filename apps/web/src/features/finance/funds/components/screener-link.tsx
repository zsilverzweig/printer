/**
 * ScreenerLink Component
 *
 * Focused tab for linking the fund to screening criteria
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
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

import { strategyService } from "../services/strategy-service";

interface ScreenerLinkProps {
  fundId: string;
  strategy: Strategy | null;
  onUpdate: () => void;
}

export function ScreenerLink({
  fundId,
  strategy,
  onUpdate,
}: ScreenerLinkProps) {
  const [screeningCriteriaId, setScreeningCriteriaId] =
    useState<string>("none");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // TODO: Fetch available screening criteria from backend
  const availableScreeners = [
    { id: "default", name: "Default Screener" },
    // Will be populated from API
  ];

  useEffect(() => {
    if (strategy?.screeningCriteriaId) {
      setScreeningCriteriaId(strategy.screeningCriteriaId);
    } else {
      setScreeningCriteriaId("none");
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
        screeningCriteriaId:
          screeningCriteriaId === "none"
            ? undefined
            : screeningCriteriaId || undefined,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      console.error("Error saving screener link:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setScreeningCriteriaId("none");
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
          Screener configuration saved successfully!
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Screening Criteria</CardTitle>
          <CardDescription>
            Optional: Link this fund to specific screening criteria to filter
            tradeable stocks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="screeningCriteria">Screening Configuration</Label>
            <Select
              value={screeningCriteriaId}
              onValueChange={setScreeningCriteriaId}
              disabled={isSaving}
            >
              <SelectTrigger id="screeningCriteria">
                <SelectValue placeholder="No screening criteria (use all symbols)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  None - Use all available symbols
                </SelectItem>
                {availableScreeners.map((screener) => (
                  <SelectItem key={screener.id} value={screener.id}>
                    {screener.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose a screening configuration or leave blank to use all symbols
              from the global screener
            </p>
          </div>

          {screeningCriteriaId && screeningCriteriaId !== "none" && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm font-medium mb-2">Selected Screener</p>
              <p className="text-sm text-muted-foreground">
                Criteria details will be shown here once screening criteria API
                is implemented
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={handleClear}
              >
                Clear Selection
              </Button>
            </div>
          )}

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>Note:</strong> Screening criteria can be used to filter
              stocks by price, volume, market cap, and other fundamental
              metrics. The execution strategy will only consider stocks that
              pass these filters.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Screener Link"}
        </Button>
      </div>
    </div>
  );
}
