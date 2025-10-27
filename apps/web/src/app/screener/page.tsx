"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useScreenerData } from "@/lib/hooks/use-screener-data";
import { Card } from "@/lib/components/ui/card";
import type { ScreenedStockPreview } from "@/lib/types/market";
import { log } from "@/lib/utils/logger";

function formatNumber(n: number | undefined) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMultiple(n: number | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return `${n.toFixed(2)}x`;
}

function formatPercent(n: number | null | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

type TimeframeFilter = "1m" | "5m" | "1h" | "close";

const TIMEFRAME_LABELS: Record<TimeframeFilter, string> = {
  "1m": "Last 1m",
  "5m": "Last 5m",
  "1h": "Last Hour",
  close: "Since Close",
};

export default function ScreenerPage() {
  const [selectedTimeframe, setSelectedTimeframe] =
    React.useState<TimeframeFilter>("close");
  const router = useRouter();
  
  // Use new unified WebSocket hook
  const { data, isConnected, error } = useScreenerData();
  
  const avgVolume = React.useMemo(() => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce(
      (acc, d) => acc + (typeof d.volume === "number" ? d.volume : 0),
      0
    );
    return sum / data.length;
  }, [data]);

  // Filter and sort data based on selected timeframe
  const filteredData = React.useMemo(() => {
    if (!data) return null;

    const getChangeValue = (row: ScreenedStockPreview): number | null => {
      switch (selectedTimeframe) {
        case "1m":
          return row.change_1m ?? null;
        case "5m":
          return row.change_5m ?? null;
        case "1h":
          return row.change_1h ?? null;
        case "close":
          return row.change_close ?? null;
        default:
          return null;
      }
    };

    // Filter: only show stocks with valid change data
    const filtered = data.filter((row) => {
      const change = getChangeValue(row);
      return change !== null && typeof change === "number";
    });

    // Sort by change % descending (highest gainers first)
    return filtered.sort((a, b) => {
      const changeA = getChangeValue(a) ?? 0;
      const changeB = getChangeValue(b) ?? 0;
      return changeB - changeA;
    });
  }, [data, selectedTimeframe]);

  const getChangeForRow = React.useCallback(
    (row: ScreenedStockPreview): number | null => {
      switch (selectedTimeframe) {
        case "1m":
          return row.change_1m ?? null;
        case "5m":
          return row.change_5m ?? null;
        case "1h":
          return row.change_1h ?? null;
        case "close":
          return row.change_close ?? null;
        default:
          return null;
      }
    },
    [selectedTimeframe]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Screener</h1>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Timeframe filter buttons */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIMEFRAME_LABELS) as TimeframeFilter[]).map(
          (timeframe) => (
            <button
              key={timeframe}
              onClick={() => setSelectedTimeframe(timeframe)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTimeframe === timeframe
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {TIMEFRAME_LABELS[timeframe]}
            </button>
          )
        )}
      </div>

      <Card className="p-4 overflow-x-auto space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`} />
            <span>
              {isConnected ? "Live" : "Disconnected"}
            </span>
          </div>
          {avgVolume > 0 && <div>Avg Volume: {formatNumber(avgVolume)}</div>}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-2 text-left">Ticker</th>
              <th className="py-2 text-right font-semibold">% Change</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Open</th>
              <th className="py-2 text-right">High</th>
              <th className="py-2 text-right">Low</th>
              <th className="py-2 text-right">Close</th>
              <th className="py-2 text-right">Volume</th>
              <th className="py-2 text-right">RV</th>
              <th className="py-2 text-right">RV30</th>
              <th className="py-2 text-right">RV60</th>
              <th className="py-2 text-right">Transactions</th>
              <th className="py-2 text-right">Window Start</th>
            </tr>
          </thead>
          <tbody>
            {filteredData?.map((row) => {
              const change = getChangeForRow(row);
              const isUp = change !== null && change > 0;
              const isDown = change !== null && change < 0;
              const rowClass = isUp
                ? "bg-emerald-50 dark:bg-emerald-950/30"
                : isDown
                ? "bg-rose-50 dark:bg-rose-950/30"
                : "";

              return (
                <tr
                  key={`${row.ticker}-${row.window_start}`}
                  className={`border-t ${rowClass} cursor-pointer hover:bg-muted/50`}
                  onClick={() =>
                    router.push(`/stocks/${encodeURIComponent(row.ticker)}`)
                  }
                >
                  <td className="py-2 font-medium">
                    <Link
                      href={`/stocks/${encodeURIComponent(row.ticker)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {row.ticker}
                    </Link>
                  </td>
                  <td
                    className={`py-2 text-right font-semibold ${
                      isUp
                        ? "text-emerald-600 dark:text-emerald-400"
                        : isDown
                        ? "text-rose-600 dark:text-rose-400"
                        : ""
                    }`}
                  >
                    {formatPercent(change)}
                  </td>
                  <td className="py-2 text-right">{formatNumber(row.price)}</td>
                  <td className="py-2 text-right">{formatNumber(row.open)}</td>
                  <td className="py-2 text-right">{formatNumber(row.high)}</td>
                  <td className="py-2 text-right">{formatNumber(row.low)}</td>
                  <td className="py-2 text-right">{formatNumber(row.close)}</td>
                  <td className="py-2 text-right">
                    {formatNumber(row.volume)}
                  </td>
                  <td className="py-2 text-right">{formatMultiple(row.rv)}</td>
                  <td className="py-2 text-right">
                    {formatMultiple(row.rv30)}
                  </td>
                  <td className="py-2 text-right">
                    {formatMultiple(row.rv60)}
                  </td>
                  <td className="py-2 text-right">
                    {formatNumber(row.transactions)}
                  </td>
                  <td className="py-2 text-right">
                    {row.window_start
                      ? new Date(row.window_start).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              );
            })}
            {(!filteredData || filteredData.length === 0) && (
              <tr>
                <td
                  className="py-6 text-center text-muted-foreground"
                  colSpan={13}
                >
                  {data && data.length > 0
                    ? "No stocks match the selected timeframe filter"
                    : "No results"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
