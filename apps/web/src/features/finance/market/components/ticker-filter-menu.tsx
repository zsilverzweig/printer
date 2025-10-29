"use client";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/lib/components/ui/collapsible";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { ChevronDown, Filter, X } from "lucide-react";
import { useEffect, useState } from "react";

export interface FilterCriteria {
  assetTypes: string[];
  marketCapMin: number | null;
  marketCapMax: number | null;
  sicCodes: string[];
}

interface TickerFilterMenuProps {
  onFilterApply: (criteria: FilterCriteria) => void;
  onFilterClear: () => void;
  activeFilterCount: number;
}

interface FilterMetadata {
  available_asset_types: string[];
  available_sic_codes: Array<{ code: string; description: string }>;
  market_cap_range: { min: number; max: number };
}

const COMMON_ASSET_TYPES = [
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
];

export function TickerFilterMenu({
  onFilterApply,
  onFilterClear,
  activeFilterCount,
}: TickerFilterMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [marketCapPreset, setMarketCapPreset] = useState<string>("");
  const [selectedSicCodes, setSelectedSicCodes] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<FilterMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch filter metadata on mount
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
            "wss://",
            "https://"
          ) || "http://localhost:8000";

        const response = await fetch(`${baseUrl}/api/screener/filter/metadata`);
        if (response.ok) {
          const data = await response.json();
          setMetadata(data);
        }
      } catch (error) {
        console.error("Failed to fetch filter metadata:", error);
      }
    };

    fetchMetadata();
  }, []);

  const toggleAssetType = (type: string) => {
    setSelectedAssetTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleApply = () => {
    const preset = MARKET_CAP_PRESETS.find((p) => p.label === marketCapPreset);

    const criteria: FilterCriteria = {
      assetTypes: selectedAssetTypes,
      marketCapMin: preset?.min || null,
      marketCapMax: preset?.max || null,
      sicCodes: selectedSicCodes,
    };

    onFilterApply(criteria);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedAssetTypes([]);
    setMarketCapPreset("");
    setSelectedSicCodes([]);
    onFilterClear();
  };

  const hasActiveFilters =
    selectedAssetTypes.length > 0 ||
    marketCapPreset !== "" ||
    selectedSicCodes.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 h-7 px-2"
        >
          <Filter className="h-3 w-3" />
          <span className="text-xs">Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="default" className="h-4 px-1 text-xs">
              {activeFilterCount}
            </Badge>
          )}
          <ChevronDown
            className={`h-3 w-3 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pt-2 pb-2 space-y-2">
        {/* Asset Type Selection */}
        <div className="space-y-1">
          <Label className="text-[10px] font-medium text-muted-foreground">
            ASSET TYPE
          </Label>
          <div className="flex flex-wrap gap-1">
            {COMMON_ASSET_TYPES.map((type) => (
              <Button
                key={type.value}
                variant={
                  selectedAssetTypes.includes(type.value)
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => toggleAssetType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Market Cap Selection */}
        <div className="space-y-1">
          <Label className="text-[10px] font-medium text-muted-foreground">
            MARKET CAP
          </Label>
          <Select value={marketCapPreset} onValueChange={setMarketCapPreset}>
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="Any size..." />
            </SelectTrigger>
            <SelectContent>
              {MARKET_CAP_PRESETS.map((preset) => (
                <SelectItem
                  key={preset.label}
                  value={preset.label}
                  className="text-xs"
                >
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Industry Selection (if we have SIC data) */}
        {metadata?.available_sic_codes &&
          metadata.available_sic_codes.length > 0 && (
            <div className="space-y-1">
              <Label className="text-[10px] font-medium text-muted-foreground">
                INDUSTRY
              </Label>
              <Select
                value={selectedSicCodes[0] || ""}
                onValueChange={(value) => setSelectedSicCodes([value])}
              >
                <SelectTrigger className="h-7 text-[11px]">
                  <SelectValue placeholder="Any industry..." />
                </SelectTrigger>
                <SelectContent>
                  {metadata.available_sic_codes.slice(0, 10).map((sic) => (
                    <SelectItem
                      key={sic.code}
                      value={sic.code}
                      className="text-xs"
                    >
                      {sic.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

        {/* Action Buttons */}
        <div className="flex gap-1.5 pt-1">
          <Button
            size="sm"
            className="flex-1 h-7 text-[11px]"
            onClick={handleApply}
            disabled={!hasActiveFilters}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2"
            onClick={handleClear}
            disabled={!hasActiveFilters && activeFilterCount === 0}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
