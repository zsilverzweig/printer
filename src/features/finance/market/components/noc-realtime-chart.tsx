"use client";

import { useEffect, useMemo, useState } from "react";

import { useMarketStream } from "@/features/finance/market/hooks/use-market-stream";
import { Button } from "@/lib/components/ui/button";
import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import type { AggregateBar } from "@/lib/types/market";

interface NocRealtimeChartProps {
  symbol: string;
  onClose?: () => void;
}

type Timeframe = "1min" | "5min";

/**
 * Real-time candlestick chart for NOC
 * Subscribes to Polygon aggregate bars (real-time, not delayed)
 */
export function NocRealtimeChart({ symbol, onClose }: NocRealtimeChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1min");
  const [bars, setBars] = useState<AggregateBar[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Subscribe to real-time aggregates through FastAPI server
  // Polygon WebSocket subscription types:
  // - T.{ticker} = Individual trades
  // - A.{ticker} = Aggregate bars per SECOND
  // - AM.{ticker} = Aggregate bars per MINUTE
  const subscription = useMemo(() => {
    // Subscribe to BOTH second bars and minute bars:
    // - A.{ticker} for real-time updates within current minute
    // - AM.{ticker} for completed minute bars (official/final)
    return `A.${symbol},AM.${symbol}`;
  }, [symbol]);

  const handleMessage = useMemo(
    () => (msg: unknown) => {
      try {
        // Handle both array and single message formats
        const messages = Array.isArray(msg) ? msg : [msg];

        messages.forEach((m: any) => {
          // Polygon can use different field formats:
          // Format 1: ev, sym (short form)
          // Format 2: event_type, symbol (full form)
          const eventType = m?.ev || m?.event_type;
          const ticker = m?.sym || m?.symbol || m?.T;

          if (ticker !== symbol) return; // Only process our symbol

          const isSecondBar = eventType === "A";
          const isMinuteBar = eventType === "AM";

          if (!isSecondBar && !isMinuteBar) return;

          // Convert to our format
          const bar: AggregateBar = {
            t: m.s || m.start_timestamp || m.t, // start timestamp (milliseconds)
            o: m.o || m.open, // open
            h: m.h || m.high, // high
            l: m.l || m.low, // low
            c: m.c || m.close, // close
            v: m.v || m.volume, // volume
            vw: m.vw || m.vwap, // VWAP
            n: m.n || m.accumulated_volume, // number of transactions
          };

          if (
            !bar.t ||
            bar.o == null ||
            bar.h == null ||
            bar.l == null ||
            bar.c == null
          ) {
            return; // Skip invalid bars
          }

          setBars((prev) => {
            // Round timestamp to minute boundary to identify which minute this belongs to
            const minuteTimestamp = Math.floor(bar.t / 60000) * 60000;

            // Separate completed bars from current bar
            const completedBars = prev.filter((b) => b.t < minuteTimestamp);
            const currentBars = prev.filter((b) => b.t === minuteTimestamp);

            let updatedCurrentBar: AggregateBar;

            if (isMinuteBar) {
              // Minute bar received - this is the final bar for this minute
              // Use it directly, replacing any accumulated second data
              updatedCurrentBar = { ...bar, t: minuteTimestamp };
              console.log(
                `[NOC Chart] Minute bar for ${symbol}: ${new Date(
                  minuteTimestamp
                ).toLocaleTimeString()}`
              );
            } else if (isSecondBar) {
              // Second bar received - update the current minute's bar
              if (currentBars.length > 0) {
                const existing = currentBars[0];
                // Merge: keep earliest open, update close, expand high/low, sum volume
                updatedCurrentBar = {
                  t: minuteTimestamp,
                  o: existing.o, // Keep original open
                  h: Math.max(existing.h, bar.h), // Highest high
                  l: Math.min(existing.l, bar.l), // Lowest low
                  c: bar.c, // Latest close
                  v: existing.v + bar.v, // Cumulative volume
                  vw: bar.vw, // Latest VWAP
                  n: existing.n + bar.n, // Cumulative transactions
                };
              } else {
                // First bar for this minute
                updatedCurrentBar = { ...bar, t: minuteTimestamp };
              }
            } else {
              return prev; // Shouldn't happen
            }

            // Combine: all completed bars + updated current bar
            const allBars = [...completedBars, updatedCurrentBar];

            // Sort by timestamp
            allBars.sort((a, b) => a.t - b.t);

            // Keep last 200 bars for performance
            const maxBars = 200;
            if (allBars.length > maxBars) {
              return allBars.slice(-maxBars);
            }

            return allBars;
          });
        });
      } catch (error) {
        console.error("Error processing market stream message:", error);
      }
    },
    [symbol]
  );

  // Connect to FastAPI WebSocket proxy
  // URL format: ws://localhost:8000/ws?subs=A.AAPL
  const wsEndpoint = process.env.NEXT_PUBLIC_WS_URL
    ? `${process.env.NEXT_PUBLIC_WS_URL}/ws`
    : "ws://localhost:8000/ws";

  const { isConnected: wsConnected } = useMarketStream({
    endpoint: wsEndpoint,
    subs: subscription,
    onMessage: handleMessage,
    debug: true,
  });

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Fetch historical data when symbol changes
  useEffect(() => {
    const fetchHistoricalData = async () => {
      setIsLoadingHistory(true);
      setBars([]); // Clear existing bars

      try {
        // Fetch last 50 minutes of 1-minute bars for indicator calculation
        // MACD needs ~35 bars, EMAs need ~26 bars
        const to = new Date();
        const from = new Date(to.getTime() - 50 * 60 * 1000); // 50 minutes ago

        const baseUrl =
          process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
            "wss://",
            "https://"
          ) || "http://localhost:8000";

        const params = new URLSearchParams({
          multiplier: "1",
          timespan: "minute",
          from: from.toISOString().split("T")[0], // YYYY-MM-DD
          to: to.toISOString().split("T")[0],
          limit: "50",
          paginate: "false",
        });

        const url = `${baseUrl}/aggs/${encodeURIComponent(
          symbol
        )}?${params.toString()}`;
        console.log(`[NOC Chart] Fetching historical data: ${url}`);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(
          `[NOC Chart] Received ${data.length} historical bars for ${symbol}`
        );

        // Convert to our format if needed
        const historicalBars: AggregateBar[] = data.map((bar: any) => ({
          t: bar.t || bar.timestamp,
          o: bar.o || bar.open,
          h: bar.h || bar.high,
          l: bar.l || bar.low,
          c: bar.c || bar.close,
          v: bar.v || bar.volume,
          vw: bar.vw || bar.vwap,
          n: bar.n || bar.transactions,
        }));

        setBars(historicalBars);
      } catch (error) {
        console.error(`[NOC Chart] Failed to fetch historical data:`, error);
        // Continue with real-time data even if historical fetch fails
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistoricalData();
  }, [symbol]);

  // Filter bars based on timeframe
  const filteredBars = useMemo(() => {
    if (bars.length === 0) return [];

    // For now, show all bars received
    // In production, you might want to aggregate 1-min bars into 5-min bars
    // when timeframe === "5min"
    return bars;
  }, [bars]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold">{symbol}</CardTitle>
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2 w-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
              title={isConnected ? "Live" : "Disconnected"}
            />
            <span className="text-xs text-muted-foreground">
              {isConnected ? "Live" : "Disconnected"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button
              variant={timeframe === "1min" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe("1min")}
            >
              1m
            </Button>
            <Button
              variant={timeframe === "5min" ? "default" : "outline"}
              size="sm"
              onClick={() => setTimeframe("5min")}
            >
              5m
            </Button>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-4">
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading historical data...
          </div>
        ) : filteredBars.length > 0 ? (
          <>
            <CandlestickChart
              data={filteredBars}
              height="calc(100% - 24px)"
              showEMA12={true}
              showEMA26={true}
              showVWAP={true}
              showVolume={true}
              showMACD={true}
              showLegend={true}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {filteredBars.length} bars
                {filteredBars.length > 0 && (
                  <>
                    {" • "}
                    {new Date(filteredBars[0].t).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" - "}
                    {new Date(
                      filteredBars[filteredBars.length - 1].t
                    ).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </>
                )}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                {isConnected ? "Live" : "Disconnected"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {isConnected
              ? "Waiting for data..."
              : "Connecting to real-time feed..."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
