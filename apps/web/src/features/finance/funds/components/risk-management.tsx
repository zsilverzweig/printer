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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
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
      setMaxLossPercent(
        fund.maxLossPercent != null ? fund.maxLossPercent.toString() : ""
      );
      setMaxLossDollars(
        fund.maxLossDollars != null ? fund.maxLossDollars.toString() : ""
      );
      setMaxGivebackPercent(
        fund.maxGivebackPercent != null
          ? fund.maxGivebackPercent.toString()
          : ""
      );
      setMaxOrderAgeSeconds(
        fund.maxOrderAgeSeconds != null
          ? fund.maxOrderAgeSeconds.toString()
          : "60"
      );
      setSizePerTrade(
        fund.sizePerTrade != null ? fund.sizePerTrade.toString() : "1000"
      );
      setMinBetPercent(
        fund.minBetPercent != null ? fund.minBetPercent.toString() : ""
      );
      setMaxBetPercent(
        fund.maxBetPercent != null ? fund.maxBetPercent.toString() : ""
      );
      setMaxTotalExposure(
        fund.maxTotalExposure != null ? fund.maxTotalExposure.toString() : ""
      );
    }
  }, [fund]);

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

    const parsed = {
      maxLossPercent: maxLossPercent ? parseFloat(maxLossPercent) : null,
      maxLossDollars: maxLossDollars ? parseFloat(maxLossDollars) : null,
      maxGivebackPercent: maxGivebackPercent
        ? parseFloat(maxGivebackPercent)
        : null,
      maxOrderAgeSeconds: maxOrderAgeSeconds
        ? parseInt(maxOrderAgeSeconds)
        : 60,
      sizePerTrade: sizePerTrade ? parseFloat(sizePerTrade) : 1000,
      minBetPercent: minBetPercent ? parseFloat(minBetPercent) : null,
      maxBetPercent: maxBetPercent ? parseFloat(maxBetPercent) : null,
      maxTotalExposure: maxTotalExposure ? parseFloat(maxTotalExposure) : null,
    } as const;

    const differs =
      (fund.maxLossPercent ?? null) !== parsed.maxLossPercent ||
      (fund.maxLossDollars ?? null) !== parsed.maxLossDollars ||
      (fund.maxGivebackPercent ?? null) !== parsed.maxGivebackPercent ||
      (fund.maxOrderAgeSeconds ?? 60) !== parsed.maxOrderAgeSeconds ||
      (fund.sizePerTrade ?? 1000) !== parsed.sizePerTrade ||
      (fund.minBetPercent ?? null) !== parsed.minBetPercent ||
      (fund.maxBetPercent ?? null) !== parsed.maxBetPercent ||
      (fund.maxTotalExposure ?? null) !== parsed.maxTotalExposure;

    if (!differs) return;

    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);
      await fundService.updateFund(fundId, parsed);
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

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Risk Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="maxLossPercent">Max Loss % Per Day</Label>
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
              <Label htmlFor="maxLossDollars">Max Loss $ Per Day</Label>
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
              <Label htmlFor="maxGivebackPercent">Max Giveback %</Label>
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
              <Label htmlFor="maxOrderAgeSeconds">Max Order Age (sec)</Label>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Position Sizing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sizePerTrade">
                Size Per Trade ($) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sizePerTrade"
                type="number"
                step="100"
                value={sizePerTrade}
                onChange={(e) => setSizePerTrade(e.target.value)}
                onBlur={saveIfChanged}
                disabled={isSaving}
                placeholder="1000"
                required
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
              <Label htmlFor="maxTotalExposure">Max Total Exposure ($)</Label>
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
              <Label htmlFor="minBetPercent">Min Bet % of Fund</Label>
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
              <Label htmlFor="maxBetPercent">Max Bet % of Fund</Label>
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
        </CardContent>
      </Card>
    </div>
  );
}
