/**
 * AI Model Selector Component
 *
 * Allows selecting an AI model override for the fund's strategy.
 * This override will be used by the strategy engine instead of the default model.
 */

"use client";

import { Fund, UpdateFundInput } from "@printer/shared";
import { useEffect, useState } from "react";

import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { AI_MODELS } from "@/lib/models/ai-models";

import { fundService } from "../services/fund-service";

interface AIModelSelectorProps {
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function AIModelSelector({
  fund,
  onUpdate,
  onSavingChange,
}: AIModelSelectorProps) {
  const currentModelOverride = fund.strategyConfig?.ai_model_override || null;
  const [selectedModel, setSelectedModel] = useState<string | null>(
    currentModelOverride
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local state with fund prop when it changes
  useEffect(() => {
    const modelOverride = fund.strategyConfig?.ai_model_override || null;
    setSelectedModel(modelOverride);
  }, [fund]);

  const hasChanges = selectedModel !== currentModelOverride;

  const saveModel = async (model: string | null) => {
    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);

      // Update strategy_config with the new model override
      const updatedStrategyConfig = {
        ...fund.strategyConfig,
        ...(model ? { ai_model_override: model } : {}),
      };

      // Remove ai_model_override if null/empty
      if (!model) {
        delete updatedStrategyConfig.ai_model_override;
      }

      const input: UpdateFundInput = {
        strategyConfig: updatedStrategyConfig,
      };

      await fundService.updateFund(fund.id, input);
      onUpdate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update AI model"
      );
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const handleModelChange = (value: string) => {
    const newModel = value === "default" ? null : value;
    setSelectedModel(newModel);
    void saveModel(newModel);
  };

  const handleReset = () => {
    setSelectedModel(currentModelOverride);
    setError(null);
  };

  const modelOptions = [
    { value: "default", label: "Default (Strategy Default)" },
    { value: "gpt5_pro", label: "GPT-5 Pro (gpt-5-pro)" },
    { value: "gpt5_nano", label: "GPT-5 Nano (gpt-5-nano)" },
    { value: "premium", label: "Premium (gpt-4o)" },
    { value: "balanced", label: "Balanced (gpt-4o-mini)" },
    { value: "fast", label: "Fast (gpt-4-turbo)" },
    { value: "cheap", label: "Cheap (gpt-3.5-turbo)" },
  ];

  // Map UI model keys to AI_MODELS keys
  const modelKeyMap: Record<string, keyof typeof AI_MODELS> = {
    gpt5_pro: "gpt5Pro",
    gpt5_nano: "gpt5Nano",
    premium: "premium",
    balanced: "balanced",
    fast: "fast",
    cheap: "cheap",
  };

  const displayValue = selectedModel || "default";

  const content = (
    <div className="space-y-3">
      <Select
        value={displayValue}
        onValueChange={handleModelChange}
        disabled={isSaving}
      >
        <SelectTrigger id="ai-model">
          <SelectValue placeholder="Select AI model..." />
        </SelectTrigger>
        <SelectContent>
          {modelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Override the default AI model used by the strategy engine. This will be
        used for all AI decisions unless the strategy specifies otherwise.
      </p>

      {selectedModel && (
        <div className="rounded-md bg-muted/50 p-2 text-xs">
          <div className="font-medium mb-1">Selected Model Details</div>
          <div className="space-y-1 text-muted-foreground">
            {(() => {
              const modelKey = modelKeyMap[selectedModel];
              const model = modelKey ? AI_MODELS[modelKey] : null;
              if (!model) return null;
              return (
                <>
                  <div>
                    Model: <span className="font-mono">{model.name}</span>
                  </div>
                  <div>
                    Context Window: {model.contextWindow.toLocaleString()}{" "}
                    tokens
                  </div>
                  <div>
                    Cost: ${(model.costPerInputToken * 1000000).toFixed(2)}
                    /M input tokens, $
                    {(model.costPerOutputToken * 1000000).toFixed(2)}/M output
                    tokens
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {hasChanges && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-2 text-xs text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="ai-model" className="text-sm">
          AI Model
        </Label>
        {content}
      </div>
    </div>
  );
}
