/**
 * RiskManagement Component
 *
 * Focused component for configuring risk parameters and position sizing
 * with validation and optional risk limits
 */

"use client";

import { Fund } from "@printer/shared";
import { AlertCircle, X } from "lucide-react";
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

import { fundService } from "../services/fund-service";
import { useFundDetails } from "../hooks/use-fund-details";

interface RiskManagementProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
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
}: RiskManagementProps) {
  const { details } = useFundDetails(fundId);
  const fundBalance = details?.fund?.balance || fund.balance || 0;

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
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);

  useEffect(() => {
    if (fund) {
      setMaxLossPercent(
        fund.maxLossPercent != null
          ? fund.maxLossPercent.toString()
          : ""
      );
      setMaxLossDollars(
        fund.maxLossDollars != null
          ? fund.maxLossDollars.toString()
          : ""
      );
      setMaxGivebackPercent(
        fund.maxGivebackPercent != null
          ? fund.maxGivebackPercent.toString()
          : ""
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
        fund.maxTotalExposure != null
          ? fund.maxTotalExposure.toString()
          : ""
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

  const handleSave = async () => {
    // Check for blocking errors
    const hasErrors = warnings.some((w) => w.severity === "error");
    if (hasErrors) {
      setError("Please fix the errors before saving");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await fundService.updateFund(fundId, {
        // Send null if empty, otherwise parse the value
        maxLossPercent: maxLossPercent ? parseFloat(maxLossPercent) : null,
        maxLossDollars: maxLossDollars ? parseFloat(maxLossDollars) : null,
        maxGivebackPercent: maxGivebackPercent
          ? parseFloat(maxGivebackPercent)
          : null,
        sizePerTrade: parseFloat(sizePerTrade) || 1000,
        minBetPercent: minBetPercent ? parseFloat(minBetPercent) : null,
        maxBetPercent: maxBetPercent ? parseFloat(maxBetPercent) : null,
        maxTotalExposure: maxTotalExposure
          ? parseFloat(maxTotalExposure)
          : null,
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

  const getWarningsForField = (field: string) =>
    warnings.filter((w) => w.field === field);

  return (
    <div className="space-y-6">
      {/* Fund Balance Info */}
      {fundBalance > 0 && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4 text-sm text-blue-800 dark:text-blue-200">
          <p>
            <strong>Fund Balance:</strong> ${fundBalance.toFixed(2)}
          </p>
          <p className="text-xs mt-1">
            Risk parameters are optional. Leave empty to disable that check.
          </p>
        </div>
      )}

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
            Set maximum loss limits to protect your capital (optional)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxLossPercent">Max Loss % Per Day</Label>
                {maxLossPercent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMaxLossPercent("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="maxLossPercent"
                type="number"
                step="0.1"
                value={maxLossPercent}
                onChange={(e) => setMaxLossPercent(e.target.value)}
                disabled={isSaving}
                placeholder="2.0 (optional)"
              />
              <p className="text-xs text-muted-foreground">
                Stop trading if down this % from start
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxLossDollars">Max Loss $ Per Day</Label>
                {maxLossDollars && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMaxLossDollars("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="maxLossDollars"
                type="number"
                step="1"
                value={maxLossDollars}
                onChange={(e) => setMaxLossDollars(e.target.value)}
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
              <p className="text-xs text-muted-foreground">
                Hard dollar limit for daily losses
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxGivebackPercent">Max Giveback %</Label>
                {maxGivebackPercent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMaxGivebackPercent("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="maxGivebackPercent"
                type="number"
                step="0.1"
                value={maxGivebackPercent}
                onChange={(e) => setMaxGivebackPercent(e.target.value)}
                disabled={isSaving}
                placeholder="30.0 (optional)"
              />
              <p className="text-xs text-muted-foreground">
                Max loss from high water mark
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
              <Label htmlFor="sizePerTrade">
                Size Per Trade ($) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sizePerTrade"
                type="number"
                step="100"
                value={sizePerTrade}
                onChange={(e) => setSizePerTrade(e.target.value)}
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
              <p className="text-xs text-muted-foreground">
                Default dollar amount per trade (required)
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxTotalExposure">Max Total Exposure ($)</Label>
                {maxTotalExposure && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMaxTotalExposure("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="maxTotalExposure"
                type="number"
                step="1000"
                value={maxTotalExposure}
                onChange={(e) => setMaxTotalExposure(e.target.value)}
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
              <p className="text-xs text-muted-foreground">
                Maximum capital at risk across all positions
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="minBetPercent">Min Bet % of Fund</Label>
                {minBetPercent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMinBetPercent("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="minBetPercent"
                type="number"
                step="0.1"
                value={minBetPercent}
                onChange={(e) => setMinBetPercent(e.target.value)}
                disabled={isSaving}
                placeholder="1.0 (optional)"
              />
              <p className="text-xs text-muted-foreground">
                Minimum position size as % of fund balance
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxBetPercent">Max Bet % of Fund</Label>
                {maxBetPercent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setMaxBetPercent("")}
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Input
                id="maxBetPercent"
                type="number"
                step="0.1"
                value={maxBetPercent}
                onChange={(e) => setMaxBetPercent(e.target.value)}
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
