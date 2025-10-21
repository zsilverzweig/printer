"use client";

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
import { useEffect, useMemo, useState } from "react";

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

  // Subscribe to real-time aggregates through FastAPI server
  // Polygon WebSocket subscription types:
  // - T.{ticker} = Individual trades
  // - A.{ticker} = Aggregate bars per SECOND
  // - AM.{ticker} = Aggregate bars per MINUTE
  const subscription = useMemo(() => {
    // Use AM.{ticker} for 1-minute bars (one candle per minute)
    // For future: Could use A.{ticker} for second bars if needed
    return `AM.${symbol}`;
  }, [symbol]);

  const handleMessage = useMemo(
    () => (msg: unknown) => {
      try {
        // Handle both array and single message formats
        const messages = Array.isArray(msg) ? msg : [msg];

        const aggregateBars = messages
          .filter((m: any) => {
            // Polygon can use different field formats:
            // Format 1: ev, sym (short form)
            // Format 2: event_type, symbol (full form)
            const eventType = m?.ev || m?.event_type;
            const ticker = m?.sym || m?.symbol || m?.T;

            const isAggregate = eventType === "A" || eventType === "AM";
            const matchesSymbol = ticker === symbol;

            return isAggregate && matchesSymbol;
          })
          .map((m: any) => {
            // Convert Polygon aggregate format to our AggregateBar format
            // Support both short and full field names
            return {
              t: m.s || m.start_timestamp || m.t, // start timestamp (milliseconds)
              o: m.o || m.open, // open
              h: m.h || m.high, // high
              l: m.l || m.low, // low
              c: m.c || m.close, // close
              v: m.v || m.volume, // volume
              vw: m.vw || m.vwap, // VWAP
              n: m.n || m.accumulated_volume, // number of transactions
            } as AggregateBar;
          })
          .filter((bar) => bar.t && bar.o && bar.h && bar.l && bar.c); // Ensure valid bars

        if (aggregateBars.length > 0) {
          console.log(
            `[NOC Chart] Received ${aggregateBars.length} bars for ${symbol}:`,
            aggregateBars[0]
          );

          setBars((prev) => {
            // Since we're using AM.{ticker}, we get one bar per minute from Polygon
            // But we still deduplicate by timestamp in case of reconnections or duplicates
            const allBars = [...prev, ...aggregateBars];

            // Deduplicate by timestamp (keep latest bar for each unique timestamp)
            const uniqueBars = Array.from(
              new Map(allBars.map((bar) => [bar.t, bar])).values()
            );

            // Sort by timestamp
            uniqueBars.sort((a, b) => a.t - b.t);

            // Keep last 200 bars for performance
            const maxBars = 200;
            if (uniqueBars.length > maxBars) {
              return uniqueBars.slice(-maxBars);
            }

            console.log(
              `[NOC Chart] Total bars for ${symbol}: ${uniqueBars.length}`
            );
            return uniqueBars;
          });
        }
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

  // Reset bars when symbol changes
  useEffect(() => {
    setBars([]);
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
        {filteredBars.length > 0 ? (
          <CandlestickChart
            data={filteredBars}
            height="100%"
            showEMA12={false}
            showEMA26={false}
            showVWAP={true}
            showVolume={true}
            showMACD={false}
            showLegend={true}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {isConnected
              ? "Waiting for data..."
              : "Connecting to real-time feed..."}
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground">
          Showing {filteredBars.length} bars • Real-time data from Polygon
        </div>
      </CardContent>
    </Card>
  );
}
