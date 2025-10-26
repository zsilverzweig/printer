"use client";

import * as React from "react";

import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import type { Timespan } from "@/lib/types/market";

export interface TickerControlsProps {
  symbol: string;
  onSubmitSymbol: (symbol: string) => void;
  timespan: Timespan;
  onTimespanChange: (t: Timespan) => void;
  multiplier: number;
  onMultiplierChange: (m: number) => void;
}

export function TickerControls({
  symbol,
  onSubmitSymbol,
  timespan,
  onTimespanChange,
  multiplier,
  onMultiplierChange,
}: TickerControlsProps) {
  const [tickerInput, setTickerInput] = React.useState<string>(symbol);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = tickerInput.trim().toUpperCase();
    if (!next) return;
    if (next !== symbol) onSubmitSymbol(next);
  };

  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <h1 className="text-2xl font-semibold tracking-tight">{symbol} chart</h1>
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Ticker</Label>
          <form className="flex items-center gap-2" onSubmit={onSubmit}>
            <Input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              className="w-[140px]"
              placeholder="AAPL"
              aria-label="Ticker"
            />
            <Button type="submit" size="sm">
              Go
            </Button>
          </form>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Timespan</Label>
          <Select
            value={timespan}
            onValueChange={(v) => onTimespanChange(v as Timespan)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select timespan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Multiplier</Label>
          <Select
            value={String(multiplier)}
            onValueChange={(v) => onMultiplierChange(Number(v))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="15">15</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
