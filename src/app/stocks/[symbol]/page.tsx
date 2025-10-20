"use client";

import { useMarketStream } from "@/features/finance/trading/hooks/use-market-stream";
import { Button } from "@/lib/components/ui/button";
import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import {
  Card,
  CardContent,
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
import { SimpleLineChart } from "@/lib/components/ui/simple-line-chart";
import { marketService } from "@/lib/services/market-service";
import type { AggregateBar, LastTrade, Timespan } from "@/lib/types/market";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  const [timespan, setTimespan] = React.useState<Timespan>("day");
  const [multiplier, setMultiplier] = React.useState<number>(1);
  const [aggs, setAggs] = React.useState<AggregateBar[] | null>(null);
  const [lastTrade, setLastTrade] = React.useState<LastTrade | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tickerInput, setTickerInput] = React.useState<string>(symbol);
  const [wsLastEvent, setWsLastEvent] = React.useState<unknown | null>(null);
  const [wsError, setWsError] = React.useState<string | null>(null);

  const onSubmitTicker = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const next = tickerInput.trim().toUpperCase();
    if (!next) return;
    if (next !== symbol) router.push(`/stocks/${encodeURIComponent(next)}`);
  };

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

  // Realtime: subscribe to aggregate minute events for this symbol
  const onWsMessage = React.useCallback(
    (msg: unknown) => {
      try {
        // Polygon-style payloads are often arrays of events
        if (Array.isArray(msg)) {
          const match = msg.find((m: any) => {
            const s = (m && (m.sym || m.symbol || m.S)) as string | undefined;
            return typeof s === "string" && s.toUpperCase() === symbol;
          });
          if (match) setWsLastEvent(match);
        } else if (msg && typeof msg === "object") {
          const s = (msg as any).sym || (msg as any).symbol || (msg as any).S;
          if (typeof s === "string") {
            if (s.toUpperCase() === symbol) setWsLastEvent(msg);
          } else {
            // If message has no symbol, still surface it
            setWsLastEvent(msg);
          }
        } else if (typeof msg === "string") {
          // Attempt to parse stringified JSON arrays/objects
          try {
            const parsed = JSON.parse(msg);
            if (Array.isArray(parsed)) {
              const match = parsed.find((m: any) => {
                const s = (m && (m.sym || m.symbol || m.S)) as
                  | string
                  | undefined;
                return typeof s === "string" && s.toUpperCase() === symbol;
              });
              if (match) setWsLastEvent(match);
            } else {
              setWsLastEvent(parsed);
            }
          } catch {
            setWsLastEvent(msg);
          }
        }
      } catch (e) {
        setWsError(e instanceof Error ? e.message : "WS message error");
      }
    },
    [symbol]
  );

  const {
    isConnected,
    isConnecting,
    error: wsHookError,
  } = useMarketStream({
    endpoint: "/api/ws",
    subs: `AM.${symbol}`,
    onMessage: onWsMessage,
  });
  React.useEffect(() => {
    setWsError(wsHookError || null);
  }, [wsHookError]);

  const chartPoints = React.useMemo(
    () => (aggs ? toChartPoints(aggs) : []),
    [aggs]
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-2xl font-semibold tracking-tight">
          {symbol} chart
        </h1>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Ticker</Label>
            <form className="flex items-center gap-2" onSubmit={onSubmitTicker}>
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
        <CardContent className="p-0 sm:p-2">
          {loading ? (
            <div className="flex h-[90vh] items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : aggs && aggs.length > 0 ? (
            <div className="h-[90vh]">
              <CandlestickChart data={aggs} height="100%" />
            </div>
          ) : (
            <SimpleLineChart data={chartPoints} height={280} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Realtime (WS)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm grid gap-2">
            <div>
              <span className="text-muted-foreground">Status: </span>
              <span>
                {isConnecting
                  ? "Connecting"
                  : isConnected
                  ? "Connected"
                  : "Disconnected"}
              </span>
            </div>
            {wsError && <div className="text-destructive">{wsError}</div>}
            <div className="grid gap-1">
              <div className="text-muted-foreground">Last event</div>
              <pre className="max-h-64 overflow-auto rounded border bg-muted p-2 text-xs">
                {wsLastEvent
                  ? JSON.stringify(wsLastEvent as any, null, 2)
                  : "—"}
              </pre>
            </div>
          </div>
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
