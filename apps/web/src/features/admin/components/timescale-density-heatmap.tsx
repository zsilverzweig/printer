"use client";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

type DensityDay = {
  date: string;
  complete_symbols: number;
  symbol_count: number;
  completion_rate: number;
};

export interface TimescaleDensityHeatmapProps {
  title?: string;
  density: { timescale: string; days: DensityDay[] }[];
}

function colorForRate(rate: number): string {
  // Tailwind color scale from gray -> green
  if (rate >= 90) return "bg-green-600";
  if (rate >= 70) return "bg-green-500";
  if (rate >= 40) return "bg-green-400";
  if (rate > 0) return "bg-green-300";
  return "bg-gray-200 dark:bg-gray-800";
}

export function TimescaleDensityHeatmap({
  title = "Data Density (last 90 days)",
  density,
}: TimescaleDensityHeatmapProps) {
  if (!density || density.length === 0) return null;

  // Normalize days per timescale: ensure same chronological order
  // Each row contains small squares for each date; group by weeks for GitHub-like layout
  const byTimescale = density.map((row) => {
    const days = [...row.days].sort((a, b) => a.date.localeCompare(b.date));
    return { timescale: row.timescale, days };
  });

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {byTimescale.map((row) => (
            <div key={row.timescale} className="flex items-start gap-3">
              <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground pt-0.5">
                {row.timescale}
              </div>
              <div className="grid grid-flow-col auto-cols-max gap-1">
                {row.days.map((d, idx) => (
                  <div
                    key={`${row.timescale}-${d.date}`}
                    title={`${new Date(d.date).toLocaleDateString()}: ${
                      d.complete_symbols
                    }/${d.symbol_count} complete (${d.completion_rate.toFixed(
                      0
                    )}%)`}
                    className={`w-3 h-3 rounded-sm ${colorForRate(
                      d.completion_rate
                    )}`}
                    style={{ marginRight: (idx + 1) % 7 === 0 ? 6 : undefined }}
                  />
                ))}
              </div>
              <div className="ml-2">
                <Badge variant="secondary" className="text-[10px]">
                  {row.days.length} days
                </Badge>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <span>Less</span>
            <div className="w-3 h-3 rounded-sm bg-gray-200 dark:bg-gray-800" />
            <div className="w-3 h-3 rounded-sm bg-green-300" />
            <div className="w-3 h-3 rounded-sm bg-green-400" />
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <div className="w-3 h-3 rounded-sm bg-green-600" />
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
