"use client";

import { Button } from "@/lib/components/ui/button";
import { DateTimePicker } from "@/lib/components/ui/date-time-picker";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/lib/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { Switch } from "@/lib/components/ui/switch";
import { Play, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import type { ScreeningCriteria } from "../hooks/use-screeners";

interface ScreenerControlsProps {
  screener: ScreeningCriteria | null;
  mode: "live" | "historical";
  filters: ScreeningCriteria["criteria"];
  timestamp?: Date;
  onModeChange: (mode: "live" | "historical") => void;
  onTimestampChange: (date: Date | undefined) => void;
  onFilterChange: (filters: Partial<ScreeningCriteria["criteria"]>) => void;
  onRun: () => void;
  loading?: boolean;
}

export function ScreenerControls({
  screener,
  mode,
  filters,
  timestamp,
  onModeChange,
  onTimestampChange,
  onFilterChange,
  onRun,
  loading = false,
}: ScreenerControlsProps) {
  const handleFilterUpdate = (key: string, value: any) => {
    console.log("[ScreenerControls] Filter update:", {
      key,
      value,
      currentFilters: filters,
    });
    onFilterChange({ [key]: value });
  };

  const handleTechnicalFilterUpdate = (
    key: string,
    value: boolean | number | undefined
  ) => {
    const technical_filters = {
      ...(filters.technical_filters || {}),
      [key]: value === undefined ? undefined : value,
    };
    const cleaned = Object.fromEntries(
      Object.entries(technical_filters).filter(([_, v]) => v !== undefined)
    );
    onFilterChange({
      technical_filters: Object.keys(cleaned).length > 0 ? cleaned : undefined,
    });
  };

  return (
    <div className="space-y-3">
      {/* Row 1: Mode + Date/Time + Run */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="mode-toggle" className="text-xs cursor-pointer">
            Historical Mode
          </Label>
          <Switch
            id="mode-toggle"
            checked={mode === "historical"}
            onCheckedChange={(checked) => {
              if (!loading) {
                onModeChange(checked ? "historical" : "live");
                if (checked && !timestamp) {
                  onTimestampChange(new Date());
                }
              }
            }}
            disabled={loading}
            className="cursor-pointer"
          />
        </div>

        {mode === "historical" && (
          <div className="flex items-center gap-2">
            <DateTimePicker
              date={timestamp}
              onDateChange={onTimestampChange}
              placeholder="Pick date and time"
              disabled={loading}
              className="w-[280px]"
              showTime={true}
            />
          </div>
        )}

        <Button onClick={onRun} size="sm" disabled={loading} className="h-8">
          <Play className="h-3 w-3 mr-1" />
          {mode === "historical" ? "Run Historical" : "Refresh"}
        </Button>
      </div>

      {/* Row 2: Basic Filters */}
      <div className="flex items-center gap-4 flex-wrap text-xs border-t pt-3">
        {/* Price Range */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Price Range:</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="Min $"
            value={filters.min_price || ""}
            onChange={(e) =>
              handleFilterUpdate(
                "min_price",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            step="0.01"
            placeholder="Max $"
            value={filters.max_price || ""}
            onChange={(e) =>
              handleFilterUpdate(
                "max_price",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
        </div>

        {/* Min Volume */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Min Volume:</Label>
          <Input
            type="number"
            step="1000"
            placeholder="e.g. 50000"
            value={filters.min_volume || ""}
            onChange={(e) =>
              handleFilterUpdate(
                "min_volume",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-28 h-7 text-xs"
            disabled={loading}
          />
        </div>

        {/* Change % Range */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Change % Range:</Label>
          <Input
            type="number"
            step="0.1"
            placeholder="Min %"
            value={filters.min_change_percent || ""}
            onChange={(e) =>
              handleFilterUpdate(
                "min_change_percent",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number"
            step="0.1"
            placeholder="Max %"
            value={filters.max_change_percent || ""}
            onChange={(e) =>
              handleFilterUpdate(
                "max_change_percent",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Sort By */}
        <div className="flex items-center gap-1">
          <Label className="text-xs font-medium">Sort By:</Label>
          <Select
            value={filters.order_by || "rv14"}
            onValueChange={(value) => handleFilterUpdate("order_by", value)}
            disabled={loading}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rv14">RV14</SelectItem>
              <SelectItem value="avg_volume">Volume</SelectItem>
              <SelectItem value="change_close">Change %</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Asset Type Multi-Select */}
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium">Asset Types:</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs w-40 justify-between"
                disabled={loading}
              >
                {filters.asset_types && filters.asset_types.length > 0
                  ? `${filters.asset_types.length} selected`
                  : "All types"}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-2">
                {["CS", "ETF", "ADRC", "FUND"].map((type) => {
                  const isSelected =
                    filters.asset_types?.includes(type) ?? false;
                  const typeLabels: Record<string, string> = {
                    CS: "Stocks",
                    ETF: "ETFs",
                    ADRC: "ADRs",
                    FUND: "Funds",
                  };
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 p-1 hover:bg-accent rounded cursor-pointer"
                      onClick={() => {
                        if (!loading) {
                          const currentTypes = filters.asset_types || [];
                          const newTypes = isSelected
                            ? currentTypes.filter((t) => t !== type)
                            : [...currentTypes, type];
                          handleFilterUpdate(
                            "asset_types",
                            newTypes.length > 0 ? newTypes : undefined
                          );
                        }
                      }}
                    >
                      <div
                        className={cn(
                          "h-4 w-4 border rounded flex items-center justify-center",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <Label className="text-xs cursor-pointer font-normal">
                        {typeLabels[type] || type}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Result Limit */}
        <div className="flex items-center gap-1">
          <Label className="text-xs font-medium">Limit:</Label>
          <Input
            type="number"
            step="1"
            placeholder="200"
            value={filters.limit || ""}
            onChange={(e) =>
              handleFilterUpdate("limit", parseInt(e.target.value) || undefined)
            }
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
        </div>
      </div>

      {/* Row 3: Technical Filters - Always Visible */}
      <div className="flex flex-wrap gap-3 p-3 bg-muted/20 rounded-lg text-xs border">
        <Label className="text-xs font-semibold w-full mb-1">Technical Filters:</Label>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.near_resistance || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate(
                "near_resistance",
                checked || undefined
              )
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Near Resistance</Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.near_support || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate("near_support", checked || undefined)
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Near Support</Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.has_equal_highs || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate(
                "has_equal_highs",
                checked || undefined
              )
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Equal Highs</Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.has_equal_lows || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate(
                "has_equal_lows",
                checked || undefined
              )
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Equal Lows</Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.above_90day_high || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate(
                "above_90day_high",
                checked || undefined
              )
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Above 90d High</Label>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={filters.technical_filters?.below_90day_low || false}
            onCheckedChange={(checked) =>
              handleTechnicalFilterUpdate(
                "below_90day_low",
                checked || undefined
              )
            }
            disabled={loading}
          />
          <Label className="text-xs cursor-pointer">Below 90d Low</Label>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs w-20">Min RV:</Label>
          <Input
            type="number"
            min="1"
            max="5"
            step="0.1"
            value={filters.technical_filters?.relative_volume_min || 1}
            onChange={(e) =>
              handleTechnicalFilterUpdate(
                "relative_volume_min",
                parseFloat(e.target.value) || undefined
              )
            }
            className="w-16 h-7 text-xs"
            disabled={loading}
          />
          <span className="text-xs text-muted-foreground">x</span>
        </div>
      </div>
    </div>
  );
}
