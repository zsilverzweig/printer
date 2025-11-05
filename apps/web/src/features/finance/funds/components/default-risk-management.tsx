/**
 * DefaultRiskManagement Component
 *
 * Component for configuring default risk management settings
 * that apply to all funds unless overridden.
 */

"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_VALUES,
  riskManagementService,
  type DefaultRiskSettings,
} from "../services/risk-management-service";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";

export function DefaultRiskManagement() {
  const [settings, setSettings] = useState<DefaultRiskSettings>(DEFAULT_VALUES);
  const [originalSettings, setOriginalSettings] =
    useState<DefaultRiskSettings>(DEFAULT_VALUES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const loaded = await riskManagementService.getDefaults();
        setSettings(loaded);
        setOriginalSettings(loaded);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load defaults"
        );
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const saveIfChanged = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await riskManagementService.updateDefaults(settings);
      setOriginalSettings(settings);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save defaults");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await riskManagementService.resetDefaults();
      const reset = await riskManagementService.getDefaults();
      setSettings(reset);
      setOriginalSettings(reset);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset defaults");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Default Risk Management Settings</CardTitle>
          <CardDescription>
            These settings apply to all funds by default. Individual funds can
            override these values in their configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
              <p className="text-muted-foreground">
                Loading default settings...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Risk Management Settings</CardTitle>
        <CardDescription>
          These settings apply to all funds by default. Individual funds can
          override these values in their configuration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-800 dark:text-green-200">
            Default settings saved successfully!
          </div>
        )}

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-4">Risk Parameters</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="default-maxLossPercent">
                  Max Loss % Per Day
                </Label>
                <Input
                  id="default-maxLossPercent"
                  type="number"
                  step="0.1"
                  value={settings.maxLossPercent ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxLossPercent: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="2.0 (optional)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-maxLossDollars">
                  Max Loss $ Per Day
                </Label>
                <Input
                  id="default-maxLossDollars"
                  type="number"
                  step="1"
                  value={settings.maxLossDollars ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxLossDollars: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="500 (optional)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-maxGivebackPercent">
                  Max Giveback %
                </Label>
                <Input
                  id="default-maxGivebackPercent"
                  type="number"
                  step="0.1"
                  value={settings.maxGivebackPercent ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxGivebackPercent: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="30.0 (optional)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-maxOrderAgeSeconds">
                  Max Order Age (sec)
                </Label>
                <Input
                  id="default-maxOrderAgeSeconds"
                  type="number"
                  step="10"
                  min="10"
                  value={settings.maxOrderAgeSeconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxOrderAgeSeconds: parseInt(e.target.value) || 60,
                    })
                  }
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
                <Label htmlFor="default-sizePerTrade">
                  Size Per Trade ($) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="default-sizePerTrade"
                  type="number"
                  step="100"
                  value={settings.sizePerTrade}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sizePerTrade: parseFloat(e.target.value) || 1000,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="1000"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-maxTotalExposure">
                  Max Total Exposure ($)
                </Label>
                <Input
                  id="default-maxTotalExposure"
                  type="number"
                  step="1000"
                  value={settings.maxTotalExposure ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxTotalExposure: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="5000 (optional)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-minBetPercent">Min Bet % of Fund</Label>
                <Input
                  id="default-minBetPercent"
                  type="number"
                  step="0.1"
                  value={settings.minBetPercent ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minBetPercent: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="1.0 (optional)"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="default-maxBetPercent">Max Bet % of Fund</Label>
                <Input
                  id="default-maxBetPercent"
                  type="number"
                  step="0.1"
                  value={settings.maxBetPercent ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxBetPercent: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  onBlur={saveIfChanged}
                  disabled={isSaving}
                  placeholder="5.0 (optional)"
                />
              </div>
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="flex gap-2 pt-4 border-t">
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Reset to Saved
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
