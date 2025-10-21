"use client";

import * as React from "react";

import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { Skeleton } from "@/lib/components/ui/skeleton";
import { fastApiService } from "@/lib/services/fast-api-service";
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

export default function ScreenerPage() {
  const [data, setData] = React.useState<ScreenedStockPreview[] | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [date, setDate] = React.useState<string>("");
  const avgVolume = React.useMemo(() => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce(
      (acc, d) => acc + (typeof d.volume === "number" ? d.volume : 0),
      0
    );
    return sum / data.length;
  }, [data]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        log.info("Fetching screener", { date }, "ScreenerPage");
        const items = await fastApiService.getScreener(date || undefined);
        log.success(
          "Screener loaded",
          { count: items.length, sample: items[0] },
          "ScreenerPage"
        );
        if (!cancelled) setData(items);
      } catch (e) {
        if (!cancelled) {
          log.error("Screener failed", e, "ScreenerPage");
          setError(e instanceof Error ? e.message : "Failed to load screener");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Screener</h1>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="p-4 overflow-x-auto space-y-4">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setDate(date.trim());
          }}
        >
          <Input
            type="date"
            placeholder="YYYY-MM-DD"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="max-w-xs"
          />
          <Button type="submit" variant="outline" disabled={loading}>
            {loading ? "Loading..." : "Run Screener"}
          </Button>
        </form>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}

        {!loading && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 text-left">Ticker</th>
                <th className="py-2 text-right">Open</th>
                <th className="py-2 text-right">High</th>
                <th className="py-2 text-right">Low</th>
                <th className="py-2 text-right">Close</th>
                <th className="py-2 text-right">Volume</th>
                <th className="py-2 text-right">Rel Vol</th>
                <th className="py-2 text-right">Transactions</th>
                <th className="py-2 text-right">Window Start</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((row) => {
                const isUp =
                  typeof row.close === "number" &&
                  typeof row.open === "number" &&
                  row.close > row.open;
                const isDown =
                  typeof row.close === "number" &&
                  typeof row.open === "number" &&
                  row.close < row.open;
                const rowClass = isUp
                  ? "bg-emerald-50 dark:bg-emerald-950/30"
                  : isDown
                  ? "bg-rose-50 dark:bg-rose-950/30"
                  : "";
                const relVol = row.rv;

                return (
                  <tr
                    key={`${row.ticker}-${row.window_start}`}
                    className={`border-t ${rowClass}`}
                  >
                    <td className="py-2 font-medium">{row.ticker}</td>
                    <td className="py-2 text-right">
                      {formatNumber(row.open)}
                    </td>
                    <td className="py-2 text-right">
                      {formatNumber(row.high)}
                    </td>
                    <td className="py-2 text-right">{formatNumber(row.low)}</td>
                    <td className="py-2 text-right">
                      {formatNumber(row.close)}
                    </td>
                    <td className="py-2 text-right">
                      {formatNumber(row.volume)}
                    </td>
                    <td className="py-2 text-right">
                      {formatMultiple(relVol)}
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
              {(!data || data.length === 0) && (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={8}
                  >
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
