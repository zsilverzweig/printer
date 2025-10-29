/**
 * ScreeningCriteriaForm Component
 *
 * Form for creating/editing screening criteria with both database and real-time filters
 */

"use client";

import { useEffect, useState } from "react";

import { ScreeningCriteria, ScreeningCriteriaParams } from "@printer/shared";

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

interface ScreeningCriteriaFormProps {
  criteria?: ScreeningCriteria;
  onSave: (data: {
    name: string;
    description?: string;
    criteria: ScreeningCriteriaParams;
  }) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

const ASSET_TYPES = [
  { value: "CS", label: "Common Stock" },
  { value: "ETF", label: "ETF" },
  { value: "ADRC", label: "ADR" },
  { value: "WARRANT", label: "Warrant" },
];

const MARKET_CAP_PRESETS = [
  { label: "Micro (<$300M)", min: 0, max: 300_000_000 },
  { label: "Small ($300M-$2B)", min: 300_000_000, max: 2_000_000_000 },
  { label: "Mid ($2B-$10B)", min: 2_000_000_000, max: 10_000_000_000 },
  { label: "Large ($10B-$200B)", min: 10_000_000_000, max: 200_000_000_000 },
  { label: "Mega (>$200B)", min: 200_000_000_000, max: null },
  { label: "Custom", min: null, max: null },
];

const ORDER_BY_OPTIONS = [
  { value: "rv14", label: "Relative Volume (14d)" },
  { value: "rv30", label: "Relative Volume (30d)" },
  { value: "rv60", label: "Relative Volume (60d)" },
  { value: "avg_volume", label: "Average Volume" },
];

export function ScreeningCriteriaForm({
  criteria,
  onSave,
  onCancel,
  isSaving = false,
}: ScreeningCriteriaFormProps) {
  // Basic fields
  const [name, setName] = useState(criteria?.name || "");
  const [description, setDescription] = useState(criteria?.description || "");

  // Database filters
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>(
    criteria?.criteria.asset_types || []
  );
  const [marketCapPreset, setMarketCapPreset] = useState<string>("");
  const [marketCapMin, setMarketCapMin] = useState<number | null>(
    criteria?.criteria.market_cap_min || null
  );
  const [marketCapMax, setMarketCapMax] = useState<number | null>(
    criteria?.criteria.market_cap_max || null
  );
  const [sicCodes, setSicCodes] = useState<string[]>(
    criteria?.criteria.sic_codes || []
  );

  // Real-time filters
  const [minPrice, setMinPrice] = useState<number>(
    criteria?.criteria.min_price || 2.0
  );
  const [maxPrice, setMaxPrice] = useState<number>(
    criteria?.criteria.max_price || 20.0
  );
  const [minVolume, setMinVolume] = useState<number>(
    criteria?.criteria.min_volume || 50000.0
  );
  const [minChangePercent, setMinChangePercent] = useState<number>(
    criteria?.criteria.min_change_percent || 5.0
  );
  const [orderBy, setOrderBy] = useState<string>(
    criteria?.criteria.order_by || "rv14"
  );
  const [limit, setLimit] = useState<number>(criteria?.criteria.limit || 200);

  const [error, setError] = useState<string | null>(null);

  // Initialize market cap preset based on loaded values
  useEffect(() => {
    if (
      criteria?.criteria.market_cap_min ||
      criteria?.criteria.market_cap_max
    ) {
      const preset = MARKET_CAP_PRESETS.find(
        (p) =>
          p.min === criteria.criteria.market_cap_min &&
          p.max === criteria.criteria.market_cap_max
      );
      if (preset) {
        setMarketCapPreset(preset.label);
      } else {
        setMarketCapPreset("Custom");
      }
    }
  }, [criteria]);

  const toggleAssetType = (type: string) => {
    setSelectedAssetTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleMarketCapPresetChange = (preset: string) => {
    setMarketCapPreset(preset);
    const selected = MARKET_CAP_PRESETS.find((p) => p.label === preset);
    if (selected && preset !== "Custom") {
      setMarketCapMin(selected.min);
      setMarketCapMax(selected.max);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (minPrice >= maxPrice) {
      setError("Min price must be less than max price");
      return;
    }

    try {
      const criteriaParams: ScreeningCriteriaParams = {};

      // Only include filters that are set
      if (selectedAssetTypes.length > 0) {
        criteriaParams.asset_types = selectedAssetTypes;
      }
      if (marketCapMin !== null) {
        criteriaParams.market_cap_min = marketCapMin;
      }
      if (marketCapMax !== null) {
        criteriaParams.market_cap_max = marketCapMax;
      }
      if (sicCodes.length > 0) {
        criteriaParams.sic_codes = sicCodes;
      }

      // Real-time filters
      criteriaParams.min_price = minPrice;
      criteriaParams.max_price = maxPrice;
      criteriaParams.min_volume = minVolume;
      criteriaParams.min_change_percent = minChangePercent;
      criteriaParams.order_by = orderBy;
      criteriaParams.limit = limit;

      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        criteria: criteriaParams,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>
            Name and describe this screening criteria
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Small Cap Momentum"
              disabled={isSaving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this criteria"
              disabled={isSaving}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Database Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Database Filters</CardTitle>
          <CardDescription>
            Filter by asset metadata (type, market cap, industry)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Asset Types */}
          <div className="space-y-2">
            <Label>Asset Types</Label>
            <div className="flex flex-wrap gap-2">
              {ASSET_TYPES.map((type) => (
                <Button
                  key={type.value}
                  type="button"
                  variant={
                    selectedAssetTypes.includes(type.value)
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  onClick={() => toggleAssetType(type.value)}
                  disabled={isSaving}
                >
                  {type.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty to include all asset types
            </p>
          </div>

          {/* Market Cap */}
          <div className="space-y-2">
            <Label htmlFor="marketCap">Market Cap</Label>
            <Select
              value={marketCapPreset}
              onValueChange={handleMarketCapPresetChange}
              disabled={isSaving}
            >
              <SelectTrigger id="marketCap">
                <SelectValue placeholder="Any market cap..." />
              </SelectTrigger>
              <SelectContent>
                {MARKET_CAP_PRESETS.map((preset) => (
                  <SelectItem key={preset.label} value={preset.label}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {marketCapPreset === "Custom" && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="space-y-1">
                  <Label htmlFor="marketCapMin" className="text-xs">
                    Min ($)
                  </Label>
                  <Input
                    id="marketCapMin"
                    type="number"
                    value={marketCapMin || ""}
                    onChange={(e) =>
                      setMarketCapMin(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    placeholder="0"
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="marketCapMax" className="text-xs">
                    Max ($)
                  </Label>
                  <Input
                    id="marketCapMax"
                    type="number"
                    value={marketCapMax || ""}
                    onChange={(e) =>
                      setMarketCapMax(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    placeholder="Unlimited"
                    disabled={isSaving}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Real-time Screener Filters</CardTitle>
          <CardDescription>
            Filter by price, volume, and momentum criteria
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Price Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minPrice">Min Price ($)</Label>
              <Input
                id="minPrice"
                type="number"
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Min yesterday close
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPrice">Max Price ($)</Label>
              <Input
                id="maxPrice"
                type="number"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">
                Max yesterday close
              </p>
            </div>
          </div>

          {/* Min Volume */}
          <div className="space-y-2">
            <Label htmlFor="minVolume">Min Volume</Label>
            <Input
              id="minVolume"
              type="number"
              step="1000"
              value={minVolume}
              onChange={(e) => setMinVolume(Number(e.target.value))}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Minimum daily volume for liquidity
            </p>
          </div>

          {/* Min Change % */}
          <div className="space-y-2">
            <Label htmlFor="minChangePercent">Min Change %</Label>
            <Input
              id="minChangePercent"
              type="number"
              step="0.1"
              value={minChangePercent}
              onChange={(e) => setMinChangePercent(Number(e.target.value))}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Minimum % change from yesterday&apos;s close
            </p>
          </div>

          {/* Order By */}
          <div className="space-y-2">
            <Label htmlFor="orderBy">Sort By</Label>
            <Select
              value={orderBy}
              onValueChange={setOrderBy}
              disabled={isSaving}
            >
              <SelectTrigger id="orderBy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_BY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Field to sort results by
            </p>
          </div>

          {/* Limit */}
          <div className="space-y-2">
            <Label htmlFor="limit">Max Results</Label>
            <Input
              id="limit"
              type="number"
              step="10"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of stocks to return
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : criteria ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
