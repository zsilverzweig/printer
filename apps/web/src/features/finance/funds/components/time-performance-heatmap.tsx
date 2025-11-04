/**
 * Time Performance Heatmap Component
 *
 * Visualizes performance by hour-of-day and day-of-week for intraday optimization.
 */

"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { analyticsService } from "../services/analytics-service";

interface TimePerformanceHeatmapProps {
  fundId: string;
}

interface HourlyData {
  avg_pnl: number;
  total_pnl: number;
  count: number;
}

export function TimePerformanceHeatmap({
  fundId,
}: TimePerformanceHeatmapProps) {
  const [hourlyPerf, setHourlyPerf] = useState<Record<string, HourlyData>>({});
  const [dailyPerf, setDailyPerf] = useState<Record<string, HourlyData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHeatmap = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await analyticsService.getHeatmap(fundId);
        setHourlyPerf(result.hourly_performance || {});
        setDailyPerf(result.daily_performance || {});
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load heatmap data"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadHeatmap();
  }, [fundId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getColorForValue = (
    value: number,
    max: number,
    min: number
  ): string => {
    if (value > 0) {
      const intensity = Math.min(value / max, 1);
      const green = Math.floor(intensity * 255);
      return `rgba(16, ${green + 100}, 129, ${0.3 + intensity * 0.7})`;
    } else {
      const intensity = Math.min(Math.abs(value) / Math.abs(min), 1);
      const red = Math.floor(intensity * 255);
      return `rgba(${red + 100}, 68, 68, ${0.3 + intensity * 0.7})`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading heatmap...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hourlyValues = Object.values(hourlyPerf).map((h) => h.avg_pnl);
  const maxHourly = Math.max(...hourlyValues, 0);
  const minHourly = Math.min(...hourlyValues, 0);

  const dailyValues = Object.values(dailyPerf).map((d) => d.avg_pnl);
  const maxDaily = Math.max(...dailyValues, 0);
  const minDaily = Math.min(...dailyValues, 0);

  const dayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Hourly Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hourly Performance</CardTitle>
          <CardDescription>
            Average P&L by hour of day (entry time)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(hourlyPerf).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hourly data available
            </div>
          ) : (
            <div className="space-y-1">
              {Array.from({ length: 24 }, (_, hour) => {
                const data = hourlyPerf[hour.toString()];
                if (!data) return null;

                const color = getColorForValue(
                  data.avg_pnl,
                  maxHourly,
                  minHourly
                );
                const hour12 = hour % 12 || 12;
                const ampm = hour >= 12 ? "PM" : "AM";

                return (
                  <div
                    key={hour}
                    className="flex items-center gap-2 p-2 rounded"
                    style={{ backgroundColor: color }}
                    title={`${data.count} trades, Total: ${formatCurrency(
                      data.total_pnl
                    )}`}
                  >
                    <div className="text-xs font-medium w-16">
                      {hour12}:00 {ampm}
                    </div>
                    <div className="flex-1" />
                    <div className="text-xs font-semibold">
                      {formatCurrency(data.avg_pnl)}
                    </div>
                    <div className="text-xs text-muted-foreground w-12 text-right">
                      ({data.count})
                    </div>
                  </div>
                );
              }).filter(Boolean)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Performance</CardTitle>
          <CardDescription>Average P&L by day of week</CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(dailyPerf).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No daily data available
            </div>
          ) : (
            <div className="space-y-2">
              {dayNames
                .map((dayName) => {
                  const data = dailyPerf[dayName];
                  if (!data) return null;

                  const color = getColorForValue(
                    data.avg_pnl,
                    maxDaily,
                    minDaily
                  );

                  return (
                    <div
                      key={dayName}
                      className="flex items-center gap-2 p-3 rounded"
                      style={{ backgroundColor: color }}
                      title={`${data.count} trades, Total: ${formatCurrency(
                        data.total_pnl
                      )}`}
                    >
                      <div className="text-sm font-medium w-24">{dayName}</div>
                      <div className="flex-1" />
                      <div className="text-sm font-semibold">
                        {formatCurrency(data.avg_pnl)}
                      </div>
                      <div className="text-xs text-muted-foreground w-12 text-right">
                        ({data.count})
                      </div>
                    </div>
                  );
                })
                .filter(Boolean)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
