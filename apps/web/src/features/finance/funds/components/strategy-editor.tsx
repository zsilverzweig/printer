/**
 * StrategyEditor Component
 *
 * Form for editing fund strategy including risk parameters, position sizing, and trading rules.
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
import { Textarea } from "@/lib/components/ui/textarea";

import { strategyService } from "../services/strategy-service";
import { Strategy } from "../types";

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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [maxLossPercent, setMaxLossPercent] = useState("2");
  const [maxLossDollars, setMaxLossDollars] = useState("1000");
  const [maxGivebackPercent, setMaxGivebackPercent] = useState("1.5");
  const [sizePerTrade, setSizePerTrade] = useState("5000");
  const [minBetPercent, setMinBetPercent] = useState("2");
  const [maxBetPercent, setMaxBetPercent] = useState("10");
  const [maxTotalExposure, setMaxTotalExposure] = useState("40000");
  const [riskRewardRatio, setRiskRewardRatio] = useState("2.0");
  const [aiTradingPrompt, setAiTradingPrompt] = useState("");
  const [chartTimeHorizon, setChartTimeHorizon] = useState("5d");
  const [chartGranularity, setChartGranularity] = useState("5min");

  // Load existing strategy data
  useEffect(() => {
    if (strategy) {
      setMaxLossPercent(strategy.maxLossPercent.toString());
      setMaxLossDollars(strategy.maxLossDollars.toString());
      setMaxGivebackPercent(strategy.maxGivebackPercent.toString());
      setSizePerTrade(strategy.sizePerTrade.toString());
      setMinBetPercent(strategy.minBetPercent.toString());
      setMaxBetPercent(strategy.maxBetPercent.toString());
      setMaxTotalExposure(strategy.maxTotalExposure.toString());
      setRiskRewardRatio(strategy.riskRewardRatio.toString());
      setAiTradingPrompt(strategy.aiTradingPrompt);
      setChartTimeHorizon(strategy.chartTimeHorizon);
      setChartGranularity(strategy.chartGranularity);
    }
  }, [strategy]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const data = {
        maxLossPercent: parseFloat(maxLossPercent),
        maxLossDollars: parseFloat(maxLossDollars),
        maxGivebackPercent: parseFloat(maxGivebackPercent),
        sizePerTrade: parseFloat(sizePerTrade),
        minBetPercent: parseFloat(minBetPercent),
        maxBetPercent: parseFloat(maxBetPercent),
        maxTotalExposure: parseFloat(maxTotalExposure),
        riskRewardRatio: parseFloat(riskRewardRatio),
        aiTradingPrompt,
        chartTimeHorizon,
        chartGranularity,
      };

      if (strategy) {
        await strategyService.updateStrategy(strategy.id, data);
      } else {
        await strategyService.createStrategy({ ...data, fundId });
      }

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

      {/* Trading Rules */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Rules</CardTitle>
          <CardDescription>
            Define trading behavior and AI guidance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="riskRewardRatio">Risk/Reward Ratio</Label>
              <Input
                id="riskRewardRatio"
                type="number"
                step="0.1"
                value={riskRewardRatio}
                onChange={(e) => setRiskRewardRatio(e.target.value)}
                disabled={isReadOnly || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="chartTimeHorizon">Chart Time Horizon</Label>
              <Select
                value={chartTimeHorizon}
                onValueChange={setChartTimeHorizon}
                disabled={isReadOnly || isSaving}
              >
                <SelectTrigger id="chartTimeHorizon">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">1 Day</SelectItem>
                  <SelectItem value="5d">5 Days</SelectItem>
                  <SelectItem value="1mo">1 Month</SelectItem>
                  <SelectItem value="3mo">3 Months</SelectItem>
                  <SelectItem value="6mo">6 Months</SelectItem>
                  <SelectItem value="1y">1 Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chartGranularity">Chart Granularity</Label>
              <Select
                value={chartGranularity}
                onValueChange={setChartGranularity}
                disabled={isReadOnly || isSaving}
              >
                <SelectTrigger id="chartGranularity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1min">1 Minute</SelectItem>
                  <SelectItem value="5min">5 Minutes</SelectItem>
                  <SelectItem value="15min">15 Minutes</SelectItem>
                  <SelectItem value="1hour">1 Hour</SelectItem>
                  <SelectItem value="1day">1 Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aiTradingPrompt">AI Trading Prompt</Label>
            <Textarea
              id="aiTradingPrompt"
              placeholder="Provide guidance for the AI trading system..."
              value={aiTradingPrompt}
              onChange={(e) => setAiTradingPrompt(e.target.value)}
              disabled={isReadOnly || isSaving}
              rows={6}
            />
            <p className="text-sm text-muted-foreground">
              This prompt guides the AI on how to analyze opportunities and make
              trading decisions
            </p>
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
