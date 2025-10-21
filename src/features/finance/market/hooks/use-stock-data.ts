import * as React from "react";

import { fastApiService } from "@/lib/services/fast-api-service";
import type { AggregateBar, LastTrade, Timespan } from "@/lib/types/market";

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toChartPoints(aggs: AggregateBar[]) {
  return aggs
    .map((a: any) => ({
      t: typeof a.t === "number" ? a.t : (a as any).timestamp,
      c: typeof a.c === "number" ? a.c : (a as any).close,
    }))
    .filter((a) => typeof a.c === "number" && typeof a.t === "number")
    .sort((a, b) => (a.t as number) - (b.t as number))
    .map((a) => ({ x: a.t as number, y: a.c as number }));
}

export interface UseStockDataOptions {
  symbol: string;
  timespan: Timespan;
  multiplier: number;
}

export function useStockData({
  symbol,
  timespan,
  multiplier,
}: UseStockDataOptions) {
  const [aggs, setAggs] = React.useState<AggregateBar[] | null>(null);
  const [lastTrade, setLastTrade] = React.useState<LastTrade | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const to = new Date();
        const from = new Date();
        // Default: ~90 days of daily bars
        from.setDate(to.getDate() - 90);

        const [bars, trade] = await Promise.all([
          fastApiService.getAggregates(symbol, {
            multiplier,
            timespan,
            from: formatDateISO(from),
            to: formatDateISO(to),
            limit: 5000,
            paginate: true,
          }),
          fastApiService.getLastTrade(symbol),
        ]);

        setAggs(bars);
        setLastTrade(trade);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to load market data";
        setError(message);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [symbol, timespan, multiplier]);

  const chartPoints = React.useMemo(
    () => (aggs ? toChartPoints(aggs) : []),
    [aggs]
  );

  return { aggs, lastTrade, loading, error, chartPoints } as const;
}
