/**
 * RiskManagement Component
 *
 * Focused component for configuring risk parameters and position sizing
 * with validation and optional risk limits
 */

"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Fund } from "@printer/shared";

import { useFundDetails } from "../hooks/use-fund-details";
import { fundService } from "../services/fund-service";
import {
  riskManagementService,
  type DefaultRiskSettings,
} from "../services/risk-management-service";

import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

interface RiskManagementProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

interface ValidationWarning {
  field: string;
  message: string;
  severity: "warning" | "error";
}

export function RiskManagement({
  fundId,
  fund,
  onUpdate,
  onSavingChange,
}: RiskManagementProps) {
  const { details } = useFundDetails(fundId);
  const fundBalance = details?.fund?.balance || fund.balance || 0;

  // Get merged settings (defaults + fund overrides)
  const [mergedSettings, setMergedSettings] = useState<DefaultRiskSettings>({
    maxLossPercent: null,
    maxLossDollars: null,
    maxGivebackPercent: null,
    maxOrderAgeSeconds: 60,
    sizePerTrade: 1000,
    minBetPercent: null,
    maxBetPercent: null,
    maxTotalExposure: null,
  });

  // Cache defaults to avoid repeated API calls
  const [defaultsCache, setDefaultsCache] =
    useState<DefaultRiskSettings | null>(null);

  // Load defaults once on mount
  useEffect(() => {
    const loadDefaults = async () => {
      if (!defaultsCache) {
        const defaults = await riskManagementService.getDefaults();
        setDefaultsCache(defaults);
      }
    };
    void loadDefaults();
  }, [defaultsCache]);

  // Update merged settings when fund changes (using specific fields to avoid unnecessary re-renders)
  useEffect(() => {
    if (!defaultsCache) return; // Wait for defaults to load

    const merged = {
      maxLossPercent: fund.maxLossPercent ?? defaultsCache.maxLossPercent,
      maxLossDollars: fund.maxLossDollars ?? defaultsCache.maxLossDollars,
      maxGivebackPercent:
        fund.maxGivebackPercent ?? defaultsCache.maxGivebackPercent,
      maxOrderAgeSeconds:
        fund.maxOrderAgeSeconds ?? defaultsCache.maxOrderAgeSeconds,
      sizePerTrade: fund.sizePerTrade ?? defaultsCache.sizePerTrade,
      minBetPercent: fund.minBetPercent ?? defaultsCache.minBetPercent,
      maxBetPercent: fund.maxBetPercent ?? defaultsCache.maxBetPercent,
      maxTotalExposure: fund.maxTotalExposure ?? defaultsCache.maxTotalExposure,
    };
    setMergedSettings(merged);
  }, [
    fund.maxLossPercent,
    fund.maxLossDollars,
    fund.maxGivebackPercent,
    fund.maxOrderAgeSeconds,
    fund.sizePerTrade,
    fund.minBetPercent,
    fund.maxBetPercent,
    fund.maxTotalExposure,
    defaultsCache,
  ]);

  // Track which fields are overridden vs using defaults
  const isOverridden = (field: keyof typeof mergedSettings): boolean => {
    const fundField = field as keyof Fund;
    return fund[fundField] !== null && fund[fundField] !== undefined;
  };

  const [maxLossPercent, setMaxLossPercent] = useState("");
  const [maxLossDollars, setMaxLossDollars] = useState("");
  const [maxGivebackPercent, setMaxGivebackPercent] = useState("");
  const [maxOrderAgeSeconds, setMaxOrderAgeSeconds] = useState("");
  const [sizePerTrade, setSizePerTrade] = useState("");
  const [minBetPercent, setMinBetPercent] = useState("");
  const [maxBetPercent, setMaxBetPercent] = useState("");
  const [maxTotalExposure, setMaxTotalExposure] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);

  useEffect(() => {
    if (fund) {
      // Use merged settings for display, but track overrides separately
      setMaxLossPercent(
        mergedSettings.maxLossPercent != null
          ? mergedSettings.maxLossPercent.toString()
          : ""
      );
      setMaxLossDollars(
        mergedSettings.maxLossDollars != null
          ? mergedSettings.maxLossDollars.toString()
          : ""
      );
      setMaxGivebackPercent(
        mergedSettings.maxGivebackPercent != null
          ? mergedSettings.maxGivebackPercent.toString()
          : ""
      );
      setMaxOrderAgeSeconds(mergedSettings.maxOrderAgeSeconds.toString());
      setSizePerTrade(mergedSettings.sizePerTrade.toString());
      setMinBetPercent(
        mergedSettings.minBetPercent != null
          ? mergedSettings.minBetPercent.toString()
          : ""
      );
      setMaxBetPercent(
        mergedSettings.maxBetPercent != null
          ? mergedSettings.maxBetPercent.toString()
          : ""
      );
      setMaxTotalExposure(
        mergedSettings.maxTotalExposure != null
          ? mergedSettings.maxTotalExposure.toString()
          : ""
      );
    }
  }, [fund, mergedSettings]);

  // Validate inputs and generate warnings
  useEffect(() => {
    const newWarnings: ValidationWarning[] = [];

    if (fundBalance > 0) {
      // Check if max loss dollar amount is too small
      if (maxLossDollars && parseFloat(maxLossDollars) > 0) {
        const lossAmount = parseFloat(maxLossDollars);
        const percentOfFund = (lossAmount / fundBalance) * 100;
        if (percentOfFund < 1) {
          newWarnings.push({
            field: "maxLossDollars",
            message: `$${lossAmount} is only ${percentOfFund.toFixed(
              2
            )}% of your $${fundBalance.toFixed(2)} fund balance`,
            severity: "warning",
          });
        }
      }

      // Check if size per trade makes sense
      if (sizePerTrade && parseFloat(sizePerTrade) > 0) {
        const tradeSize = parseFloat(sizePerTrade);
        const percentOfFund = (tradeSize / fundBalance) * 100;

        if (tradeSize > fundBalance) {
          newWarnings.push({
            field: "sizePerTrade",
            message: `Trade size ($${tradeSize}) exceeds fund balance ($${fundBalance.toFixed(
              2
            )})`,
            severity: "error",
          });
        } else if (percentOfFund < 1) {
          newWarnings.push({
            field: "sizePerTrade",
            message: `$${tradeSize} is only ${percentOfFund.toFixed(
              2
            )}% of your fund balance`,
            severity: "warning",
          });
        }
      }

      // Check if max total exposure makes sense
      if (maxTotalExposure && parseFloat(maxTotalExposure) > 0) {
        const exposure = parseFloat(maxTotalExposure);
        const percentOfFund = (exposure / fundBalance) * 100;

        if (exposure > fundBalance * 2) {
          newWarnings.push({
            field: "maxTotalExposure",
            message: `Exposure ($${exposure}) is more than 2x your fund balance`,
            severity: "warning",
          });
        } else if (exposure < fundBalance * 0.1) {
          newWarnings.push({
            field: "maxTotalExposure",
            message: `Exposure ($${exposure}) is only ${percentOfFund.toFixed(
              1
            )}% of fund balance - may be too conservative`,
            severity: "warning",
          });
        }
      }

      // Check bet percent logic
      if (minBetPercent && maxBetPercent) {
        const minBet = parseFloat(minBetPercent);
        const maxBet = parseFloat(maxBetPercent);
        if (minBet > maxBet) {
          newWarnings.push({
            field: "maxBetPercent",
            message: "Min bet % cannot be greater than max bet %",
            severity: "error",
          });
        }
      }
    }

    setWarnings(newWarnings);
  }, [
    maxLossDollars,
    sizePerTrade,
    maxTotalExposure,
    minBetPercent,
    maxBetPercent,
    fundBalance,
  ]);

  const saveIfChanged = async () => {
    const hasBlockingErrors = warnings.some((w) => w.severity === "error");
    if (hasBlockingErrors) {
      return;
    }

    // Use cached defaults or fetch if not available
    const defaults =
      defaultsCache || (await riskManagementService.getDefaults());
    const parsed = {
      maxLossPercent: maxLossPercent ? parseFloat(maxLossPercent) : null,
      maxLossDollars: maxLossDollars ? parseFloat(maxLossDollars) : null,
      maxGivebackPercent: maxGivebackPercent
        ? parseFloat(maxGivebackPercent)
        : null,
      maxOrderAgeSeconds: maxOrderAgeSeconds
        ? parseInt(maxOrderAgeSeconds)
        : null,
      sizePerTrade: sizePerTrade ? parseFloat(sizePerTrade) : null,
      minBetPercent: minBetPercent ? parseFloat(minBetPercent) : null,
      maxBetPercent: maxBetPercent ? parseFloat(maxBetPercent) : null,
      maxTotalExposure: maxTotalExposure ? parseFloat(maxTotalExposure) : null,
    } as const;

    // Build update object: only include values that differ from defaults
    // If a value matches the default, set it to null to clear the override
    const update: Partial<typeof parsed> = {};

    if (parsed.maxLossPercent !== defaults.maxLossPercent) {
      update.maxLossPercent = parsed.maxLossPercent;
    } else if (isOverridden("maxLossPercent")) {
      update.maxLossPercent = null; // Clear override
    }

    if (parsed.maxLossDollars !== defaults.maxLossDollars) {
      update.maxLossDollars = parsed.maxLossDollars;
    } else if (isOverridden("maxLossDollars")) {
      update.maxLossDollars = null;
    }

    if (parsed.maxGivebackPercent !== defaults.maxGivebackPercent) {
      update.maxGivebackPercent = parsed.maxGivebackPercent;
    } else if (isOverridden("maxGivebackPercent")) {
      update.maxGivebackPercent = null;
    }

    if (parsed.maxOrderAgeSeconds !== defaults.maxOrderAgeSeconds) {
      update.maxOrderAgeSeconds = parsed.maxOrderAgeSeconds;
    } else if (isOverridden("maxOrderAgeSeconds")) {
      update.maxOrderAgeSeconds = null;
    }

    if (parsed.sizePerTrade !== defaults.sizePerTrade) {
      update.sizePerTrade = parsed.sizePerTrade;
    } else if (isOverridden("sizePerTrade")) {
      update.sizePerTrade = null;
    }

    if (parsed.minBetPercent !== defaults.minBetPercent) {
      update.minBetPercent = parsed.minBetPercent;
    } else if (isOverridden("minBetPercent")) {
      update.minBetPercent = null;
    }

    if (parsed.maxBetPercent !== defaults.maxBetPercent) {
      update.maxBetPercent = parsed.maxBetPercent;
    } else if (isOverridden("maxBetPercent")) {
      update.maxBetPercent = null;
    }

    if (parsed.maxTotalExposure !== defaults.maxTotalExposure) {
      update.maxTotalExposure = parsed.maxTotalExposure;
    } else if (isOverridden("maxTotalExposure")) {
      update.maxTotalExposure = null;
    }

    if (Object.keys(update).length === 0) return;

    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);
      await fundService.updateFund(fundId, update);
      onUpdate();
    } catch (err) {
      console.error("Error saving risk management:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const getWarningsForField = (field: string) =>
    warnings.filter((w) => w.field === field);

  const content = (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-4">Risk Parameters</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxLossPercent">Max Loss % Per Day</Label>
              {!isOverridden("maxLossPercent") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxLossPercent"
              type="number"
              step="0.1"
              value={maxLossPercent}
              onChange={(e) => setMaxLossPercent(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="2.0 (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxLossDollars">Max Loss $ Per Day</Label>
              {!isOverridden("maxLossDollars") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxLossDollars"
              type="number"
              step="1"
              value={maxLossDollars}
              onChange={(e) => setMaxLossDollars(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="500 (optional)"
            />
            {getWarningsForField("maxLossDollars").map((warning, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs ${
                  warning.severity === "error"
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}
              >
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxGivebackPercent">Max Giveback %</Label>
              {!isOverridden("maxGivebackPercent") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxGivebackPercent"
              type="number"
              step="0.1"
              value={maxGivebackPercent}
              onChange={(e) => setMaxGivebackPercent(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="30.0 (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxOrderAgeSeconds">Max Order Age (sec)</Label>
              {!isOverridden("maxOrderAgeSeconds") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxOrderAgeSeconds"
              type="number"
              step="10"
              min="10"
              value={maxOrderAgeSeconds}
              onChange={(e) => setMaxOrderAgeSeconds(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="60"
            />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t">
        <h3 className="text-sm font-medium mb-4">Position Sizing</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="sizePerTrade">Size Per Trade ($)</Label>
              {!isOverridden("sizePerTrade") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="sizePerTrade"
              type="number"
              step="100"
              value={sizePerTrade}
              onChange={(e) => setSizePerTrade(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="1000 (optional)"
            />
            {getWarningsForField("sizePerTrade").map((warning, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs ${
                  warning.severity === "error"
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}
              >
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxTotalExposure">Max Total Exposure ($)</Label>
              {!isOverridden("maxTotalExposure") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxTotalExposure"
              type="number"
              step="1000"
              value={maxTotalExposure}
              onChange={(e) => setMaxTotalExposure(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="5000 (optional)"
            />
            {getWarningsForField("maxTotalExposure").map((warning, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs ${
                  warning.severity === "error"
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}
              >
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="minBetPercent">Min Bet % of Fund</Label>
              {!isOverridden("minBetPercent") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="minBetPercent"
              type="number"
              step="0.1"
              value={minBetPercent}
              onChange={(e) => setMinBetPercent(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="1.0 (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxBetPercent">Max Bet % of Fund</Label>
              {!isOverridden("maxBetPercent") && (
                <span className="text-xs text-muted-foreground">(default)</span>
              )}
            </div>
            <Input
              id="maxBetPercent"
              type="number"
              step="0.1"
              value={maxBetPercent}
              onChange={(e) => setMaxBetPercent(e.target.value)}
              onBlur={saveIfChanged}
              disabled={isSaving}
              placeholder="5.0 (optional)"
            />
            {getWarningsForField("maxBetPercent").map((warning, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 text-xs ${
                  warning.severity === "error"
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}
              >
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}
      {content}
    </div>
  );
}
