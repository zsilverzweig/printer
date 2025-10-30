/**
 * TimeWindows Component
 *
 * Component for configuring trading time windows
 */

"use client";

import { useEffect, useState } from "react";

import { Fund } from "@printer/shared";

import { fundService } from "../services/fund-service";

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

interface TimeWindowsProps {
  fundId: string;
  fund: Fund;
  onUpdate: () => void;
}

export function TimeWindows({ fundId, fund, onUpdate }: TimeWindowsProps) {
  const [tradingStartTime, setTradingStartTime] = useState("");
  const [tradingEndTime, setTradingEndTime] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (fund) {
      setTradingStartTime(fund.tradingStartTime || "");
      setTradingEndTime(fund.tradingEndTime || "");
      setTimezone(fund.timezone || "America/New_York");
    }
  }, [fund]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      await fundService.updateFund(fundId, {
        tradingStartTime,
        tradingEndTime,
        timezone,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onUpdate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save time windows"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-800 dark:text-green-200">
          Time windows saved successfully!
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trading Time Windows</CardTitle>
          <CardDescription>
            Define when trades can be executed during market hours
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tradingStartTime">Trading Start Time</Label>
              <Input
                id="tradingStartTime"
                type="time"
                value={tradingStartTime}
                onChange={(e) => setTradingStartTime(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-sm text-muted-foreground">
                Market open (e.g., 09:30)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tradingEndTime">Trading End Time</Label>
              <Input
                id="tradingEndTime"
                type="time"
                value={tradingEndTime}
                onChange={(e) => setTradingEndTime(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-sm text-muted-foreground">
                Market close (e.g., 16:00)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={timezone}
                onValueChange={setTimezone}
                disabled={isSaving}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">
                    Eastern Time (ET)
                  </SelectItem>
                  <SelectItem value="America/Chicago">
                    Central Time (CT)
                  </SelectItem>
                  <SelectItem value="America/Denver">
                    Mountain Time (MT)
                  </SelectItem>
                  <SelectItem value="America/Los_Angeles">
                    Pacific Time (PT)
                  </SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Time zone for trading hours
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>Tip:</strong> Standard US market hours are 9:30 AM -
              4:00 PM ET. Adjust these times if you want to trade only during
              specific intraday windows.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Time Windows"}
        </Button>
      </div>
    </div>
  );
}
