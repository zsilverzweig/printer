/**
 * TimeWindows Component
 *
 * Component for configuring trading time windows
 */

"use client";

import { useEffect, useState } from "react";

import { Fund } from "@printer/shared";

import { fundService } from "../services/fund-service";

import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";

interface TimeWindowsProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
  onSavingChange?: (saving: boolean) => void;
}

export function TimeWindows({
  fundId,
  fund,
  onUpdate,
  onSavingChange,
}: TimeWindowsProps) {
  const [tradingStartTime, setTradingStartTime] = useState("");
  const [tradingEndTime, setTradingEndTime] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fund) {
      setTradingStartTime(fund.tradingStartTime || "");
      setTradingEndTime(fund.tradingEndTime || "");
      setTimezone(fund.timezone || "America/New_York");
    }
  }, [fund]);

  const saveIfChanged = async (
    overrides?: Partial<{
      tradingStartTime: string;
      tradingEndTime: string;
      timezone: string;
    }>
  ) => {
    const nextStart = overrides?.tradingStartTime ?? tradingStartTime;
    const nextEnd = overrides?.tradingEndTime ?? tradingEndTime;
    const nextTz = overrides?.timezone ?? timezone;

    const differs =
      (fund.tradingStartTime || "") !== nextStart ||
      (fund.tradingEndTime || "") !== nextEnd ||
      (fund.timezone || "America/New_York") !== nextTz;

    if (!differs) return;

    try {
      setIsSaving(true);
      onSavingChange?.(true);
      setError(null);
      await fundService.updateFund(fundId, {
        tradingStartTime: nextStart,
        tradingEndTime: nextEnd,
        timezone: nextTz,
      });
      onUpdate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save time windows"
      );
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  };

  const content = (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="tradingStartTime">Start Time</Label>
          <Input
            id="tradingStartTime"
            type="time"
            value={tradingStartTime}
            onChange={(e) => setTradingStartTime(e.target.value)}
            onBlur={() => {
              void saveIfChanged();
            }}
            disabled={isSaving}
            placeholder="09:30"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tradingEndTime">End Time</Label>
          <Input
            id="tradingEndTime"
            type="time"
            value={tradingEndTime}
            onChange={(e) => setTradingEndTime(e.target.value)}
            onBlur={() => {
              void saveIfChanged();
            }}
            disabled={isSaving}
            placeholder="16:00"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Select
            value={timezone}
            onValueChange={(value) => {
              setTimezone(value);
              void saveIfChanged({ timezone: value });
            }}
            disabled={isSaving}
          >
            <SelectTrigger id="timezone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/New_York">
                Eastern Time (ET)
              </SelectItem>
              <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
              <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
              <SelectItem value="America/Los_Angeles">
                Pacific Time (PT)
              </SelectItem>
              <SelectItem value="UTC">UTC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2 text-xs text-red-800 dark:text-red-200">
          {error}
        </div>
      )}
      {content}
    </div>
  );
}
