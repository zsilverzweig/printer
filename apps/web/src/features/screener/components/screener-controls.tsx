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
import { cn } from "@/lib/utils/utils";
import { Check, ChevronDown, Play } from "lucide-react";
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

  return (
    <div className="space-y-3">
      {/* Row 1: Mode + Date/Time + Run (Historical only) */}
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
          <>
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
            <Button
              onClick={onRun}
              size="sm"
              disabled={loading}
              className="h-8"
            >
              <Play className="h-3 w-3 mr-1" />
              Run Historical
            </Button>
          </>
        )}
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
        </div>

        {/* Market Cap Range */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Market Cap:</Label>
          <Input
            type="number"
            step="100"
            placeholder="Min"
            value={
              filters.market_cap_min
                ? (filters.market_cap_min / 1000000).toString()
                : ""
            }
            onChange={(e) =>
              handleFilterUpdate(
                "market_cap_min",
                e.target.value ? parseInt(e.target.value) * 1000000 : undefined
              )
            }
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-24 h-7 text-xs"
            disabled={loading}
            title="Minimum market cap in millions (e.g., 1000 for $1B)"
          />
          <span className="text-muted-foreground">M to</span>
          <Input
            type="number"
            step="100"
            placeholder="Max"
            value={
              filters.market_cap_max
                ? (filters.market_cap_max / 1000000).toString()
                : ""
            }
            onChange={(e) =>
              handleFilterUpdate(
                "market_cap_max",
                e.target.value ? parseInt(e.target.value) * 1000000 : undefined
              )
            }
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-24 h-7 text-xs"
            disabled={loading}
            title="Maximum market cap in millions (e.g., 100000 for $100B)"
          />
          <span className="text-muted-foreground">M</span>
        </div>

        {/* Float Range */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Float:</Label>
          <Input
            type="number"
            step="100"
            placeholder="Min"
            value={
              filters.float_min ? (filters.float_min / 1000000).toString() : ""
            }
            onChange={(e) =>
              handleFilterUpdate(
                "float_min",
                e.target.value ? parseInt(e.target.value) * 1000000 : undefined
              )
            }
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-24 h-7 text-xs"
            disabled={loading}
            title="Minimum public float in millions (e.g., 1000 for $1B)"
          />
          <span className="text-muted-foreground">M to</span>
          <Input
            type="number"
            step="100"
            placeholder="Max"
            value={
              filters.float_max ? (filters.float_max / 1000000).toString() : ""
            }
            onChange={(e) =>
              handleFilterUpdate(
                "float_max",
                e.target.value ? parseInt(e.target.value) * 1000000 : undefined
              )
            }
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-24 h-7 text-xs"
            disabled={loading}
            title="Maximum public float in millions (e.g., 100000 for $100B)"
          />
          <span className="text-muted-foreground">M</span>
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-28 h-7 text-xs"
            disabled={loading}
          />
        </div>

        {/* Relative Volume Range */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">RV Range:</Label>
          <Input
            type="number"
            min="1"
            max="5"
            step="0.1"
            placeholder="1.5"
            value={filters.min_relative_volume ?? ""}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              handleFilterUpdate(
                "min_relative_volume",
                Number.isNaN(next) ? undefined : next
              );
            }}
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-20 h-7 text-xs"
            disabled={loading}
            title="Minimum relative volume (RV14) - e.g., 1.5 means 1.5x average volume"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="number"
            min="1"
            max="10"
            step="0.1"
            placeholder="Max"
            value={filters.max_relative_volume ?? ""}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              handleFilterUpdate(
                "max_relative_volume",
                Number.isNaN(next) ? undefined : next
              );
            }}
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-20 h-7 text-xs"
            disabled={loading}
            title="Maximum relative volume (RV14) - e.g., 4.0 caps results at 4x average volume"
          />
          <span className="text-muted-foreground">x</span>
        </div>

        {/* Min Relative Volume Last Week */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1 rounded">
          <Label className="text-xs font-medium">Min RV LW:</Label>
          <Input
            type="number"
            min="1"
            max="5"
            step="0.1"
            placeholder="1.2"
            value={filters.min_relative_volume_last_week ?? ""}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              handleFilterUpdate(
                "min_relative_volume_last_week",
                Number.isNaN(next) ? undefined : next
              );
            }}
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-20 h-7 text-xs"
            disabled={loading}
            title="Minimum relative volume compared to the same time last week"
          />
          <span className="text-muted-foreground">x</span>
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
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
            onValueChange={(value) => {
              handleFilterUpdate("order_by", value);
              if (mode === "live" && !loading) onRun();
            }}
            disabled={loading}
          >
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rv14">RV14</SelectItem>
              <SelectItem value="rv_lw">RV vs Last Week</SelectItem>
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
                          if (mode === "live" && !loading) onRun();
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
            onBlur={() => {
              if (mode === "live" && !loading) onRun();
            }}
            className="w-20 h-7 text-xs"
            disabled={loading}
          />
        </div>
      </div>

    </div>
  );
}
