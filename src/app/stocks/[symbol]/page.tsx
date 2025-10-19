"use client";

import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Label } from "@/lib/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { SimpleLineChart } from "@/lib/components/ui/simple-line-chart";
import { marketService } from "@/lib/services/market-service";
import type { AggregateBar, LastTrade, Timespan } from "@/lib/types/market";
import * as React from "react";

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toChartPoints(aggs: AggregateBar[]) {
  return aggs
    .map((a: any) => ({
      t: typeof a.t === "number" ? a.t : a.timestamp,
      c: typeof a.c === "number" ? a.c : a.close,
    }))
    .filter((a) => typeof a.c === "number" && typeof a.t === "number")
    .sort((a, b) => (a.t as number) - (b.t as number))
    .map((a) => ({ x: a.t as number, y: a.c as number }));
}

export default function StockPage({ params }: { params: { symbol: string } }) {
  const symbol = (params.symbol || "AAPL").toUpperCase();

  const [timespan, setTimespan] = React.useState<Timespan>("day");
  const [multiplier, setMultiplier] = React.useState<number>(1);
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
          marketService.getAggregates(symbol, {
            multiplier,
            timespan,
            from: formatDateISO(from),
            to: formatDateISO(to),
            limit: 5000,
            paginate: true,
          }),
          marketService.getLastTrade(symbol),
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

  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-2xl font-semibold tracking-tight">
          {symbol} chart
        </h1>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Timespan</Label>
            <Select
              value={timespan}
              onValueChange={(v) => setTimespan(v as Timespan)}
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
              onValueChange={(v) => setMultiplier(Number(v))}
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

      {error && (
        <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-medium text-muted-foreground">
            Price
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : aggs && aggs.length > 0 ? (
            <CandlestickChart data={aggs} height={320} />
          ) : (
            <SimpleLineChart data={chartPoints} height={280} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Last trade</CardTitle>
        </CardHeader>
        <CardContent>
          {lastTrade ? (
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-muted-foreground">Price</div>
                <div className="font-medium">
                  ${lastTrade.price?.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Size</div>
                <div className="font-medium">{lastTrade.size ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Exchange</div>
                <div className="font-medium">{lastTrade.exchange ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Time</div>
                <div className="font-medium">
                  {lastTrade.timestamp
                    ? new Date(
                        String(lastTrade.timestamp).length > 13
                          ? Math.floor(
                              (lastTrade.timestamp as number) / 1_000_000
                            )
                          : (lastTrade.timestamp as number)
                      ).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No trade data</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
