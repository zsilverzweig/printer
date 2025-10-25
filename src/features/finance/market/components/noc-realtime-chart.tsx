"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMarketStream } from "@/features/finance/market/hooks/use-market-stream";
import { Button } from "@/lib/components/ui/button";
import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import { CardActionButton } from "@/lib/components/ui/card-action-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { useShortcut } from "@/lib/hooks/use-shortcut";
import type { AggregateBar } from "@/lib/types/market";

import { FinancialInfoPanel } from "./financial-info-panel";

interface NocRealtimeChartProps {
  symbol: string;
  onClose?: () => void;
  onSymbolChange?: (symbol: string) => void;
  onCaptureChart?: () => Promise<string>;
}

type Timeframe = "1min" | "5min";
type ViewMode = "default" | "focus"; // default = 24h, focus = 2h

/**
 * Aggregates 1-minute bars into 5-minute bars
 */
function aggregate5MinBars(minuteBars: AggregateBar[]): AggregateBar[] {
  if (minuteBars.length === 0) return [];

  const fiveMinBars: AggregateBar[] = [];
  const barsByFiveMin = new Map<number, AggregateBar[]>();

  // Group bars by 5-minute intervals
  minuteBars.forEach((bar) => {
    const fiveMinTimestamp =
      Math.floor(bar.t / (5 * 60 * 1000)) * (5 * 60 * 1000);
    if (!barsByFiveMin.has(fiveMinTimestamp)) {
      barsByFiveMin.set(fiveMinTimestamp, []);
    }
    const group = barsByFiveMin.get(fiveMinTimestamp);
    if (group) group.push(bar);
  });

  // Aggregate each 5-minute group
  barsByFiveMin.forEach((bars, timestamp) => {
    if (bars.length === 0) return;

    const open = bars[0].o;
    const close = bars[bars.length - 1].c;
    const high = Math.max(...bars.map((b) => b.h));
    const low = Math.min(...bars.map((b) => b.l));
    const volume = bars.reduce((sum, b) => sum + (b.v || 0), 0);
    const transactions = bars.reduce((sum, b) => sum + (b.n || 0), 0);

    // Calculate weighted average VWAP
    const totalVolumeForVwap = bars.reduce((sum, b) => sum + (b.v || 0), 0);
    const vwap =
      totalVolumeForVwap > 0
        ? bars.reduce((sum, b) => sum + (b.vw || 0) * (b.v || 0), 0) /
          totalVolumeForVwap
        : bars[bars.length - 1].vw;

    fiveMinBars.push({
      t: timestamp,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume,
      vw: vwap,
      n: transactions,
    });
  });

  return fiveMinBars.sort((a, b) => a.t - b.t);
}

/**
 * Real-time candlestick chart for NOC
 * Subscribes to Polygon aggregate bars (real-time, not delayed)
 */
export function NocRealtimeChart({
  symbol,
  onClose,
  onSymbolChange,
  onCaptureChart,
}: NocRealtimeChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1min");
  const [viewMode, setViewMode] = useState<ViewMode>("default");
  const [bars, setBars] = useState<AggregateBar[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [tickerInput, setTickerInput] = useState(symbol);
  const [isEditingTicker, setIsEditingTicker] = useState(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

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
                  v: (existing.v || 0) + (bar.v || 0), // Cumulative volume
                  vw: bar.vw, // Latest VWAP
                  n: (existing.n || 0) + (bar.n || 0), // Cumulative transactions
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

            // Keep last 2000 bars for performance (enough for 4+ days of minute data)
            const maxBars = 2000;
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
        // Fetch minute bars for the last 4 days
        // This provides sufficient historical context for technical indicators
        // and captures pre-market, regular hours, and after-hours trading
        const now = new Date();
        const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
        const from = fourDaysAgo;

        const baseUrl =
          process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
            "wss://",
            "https://"
          ) || "http://localhost:8000";

        const params = new URLSearchParams({
          multiplier: "1",
          timespan: "minute",
          from: from.getTime().toString(), // Unix timestamp in milliseconds
          to: now.getTime().toString(), // Unix timestamp in milliseconds
          limit: "10000", // 4 days of minute bars (including pre/after-hours)
          paginate: "true", // Enable pagination to get all bars
        });

        const url = `${baseUrl}/aggs/${encodeURIComponent(
          symbol
        )}?${params.toString()}`;
        console.log(
          `[NOC Chart] Fetching 4 days of minute bars: ${url}`,
          `\n  From: ${from.toLocaleString()} (4 days ago)`,
          `\n  To: ${now.toLocaleString()} (now)`
        );

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(
          `[NOC Chart] Received ${data.length} historical bars for ${symbol}`,
          data.length > 0
            ? `\n  First bar: ${new Date(data[0].t).toLocaleString()}`
            : "",
          data.length > 0
            ? `\n  Last bar: ${new Date(
                data[data.length - 1].t
              ).toLocaleString()}`
            : ""
        );

        // Convert to our format if needed
        const historicalBars: AggregateBar[] = data
          .map((bar: Record<string, unknown>) => ({
            t: (bar.t as number) || (bar.timestamp as number),
            o: (bar.o as number) || (bar.open as number),
            h: (bar.h as number) || (bar.high as number),
            l: (bar.l as number) || (bar.low as number),
            c: (bar.c as number) || (bar.close as number),
            v: (bar.v as number) || (bar.volume as number),
            vw: (bar.vw as number) || (bar.vwap as number),
            n: (bar.n as number) || (bar.transactions as number),
          }))
          .filter(
            (bar: AggregateBar) =>
              bar.t &&
              bar.o != null &&
              bar.h != null &&
              bar.l != null &&
              bar.c != null
          )
          .sort((a: AggregateBar, b: AggregateBar) => a.t - b.t); // Sort by timestamp ascending

        // Deduplicate bars by minute timestamp
        const dedupedBars: AggregateBar[] = [];
        const seen = new Set<number>();

        for (const bar of historicalBars) {
          const minuteTimestamp = Math.floor(bar.t / 60000) * 60000;
          if (!seen.has(minuteTimestamp)) {
            seen.add(minuteTimestamp);
            dedupedBars.push({ ...bar, t: minuteTimestamp });
          }
        }

        console.log(
          `[NOC Chart] Loaded ${dedupedBars.length} unique minute bars (${
            historicalBars.length - dedupedBars.length
          } duplicates removed)`
        );

        setBars(dedupedBars);
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

    if (timeframe === "5min") {
      return aggregate5MinBars(bars);
    }

    return bars;
  }, [bars, timeframe]);

  // Sync ticker input with symbol prop
  useEffect(() => {
    setTickerInput(symbol);
  }, [symbol]);

  // Focus ticker input when entering edit mode
  useEffect(() => {
    if (isEditingTicker && tickerInputRef.current) {
      tickerInputRef.current.focus();
      tickerInputRef.current.select();
    }
  }, [isEditingTicker]);

  // Handle ticker submission
  const handleTickerSubmit = () => {
    const newSymbol = tickerInput.trim().toUpperCase();
    if (newSymbol && newSymbol !== symbol && onSymbolChange) {
      onSymbolChange(newSymbol);
    }
    setIsEditingTicker(false);
  };

  // Keyboard shortcuts
  useShortcut(
    "1",
    () => {
      setTimeframe("1min");
      console.log("[NOC Chart] Switched to 1-minute timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "5",
    () => {
      setTimeframe("5min");
      console.log("[NOC Chart] Switched to 5-minute timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "f",
    () => {
      setViewMode((prev) => {
        const newMode = prev === "default" ? "focus" : "default";
        console.log(`[NOC Chart] Switched to ${newMode} view`);
        return newMode;
      });
    },
    [setViewMode]
  );

  useShortcut(
    "t",
    () => {
      setIsEditingTicker(true);
      console.log("[NOC Chart] Edit ticker mode");
    },
    [setIsEditingTicker]
  );

  // Capture chart as base64 image
  const captureChartImage = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!chartContainerRef.current) {
        reject(new Error("Chart container not found"));
        return;
      }

      try {
        // Try to use html2canvas if available
        if (
          typeof window !== "undefined" &&
          (window as Window & { html2canvas?: Function }).html2canvas
        ) {
          const html2canvas = (window as Window & { html2canvas: Function })
            .html2canvas;
          html2canvas(chartContainerRef.current, {
            backgroundColor: null,
            scale: 2, // Higher resolution
          })
            .then((canvas: HTMLCanvasElement) => {
              const base64 = canvas.toDataURL("image/png").split(",")[1];
              resolve(base64);
            })
            .catch((error: Error) => {
              // eslint-disable-next-line no-console
              console.error("html2canvas error:", error);
              reject(error);
            });
        } else {
          // Fallback: Try to find canvas element directly
          const canvasElements =
            chartContainerRef.current.getElementsByTagName("canvas");

          if (canvasElements.length === 0) {
            reject(new Error("No canvas found in chart container"));
            return;
          }

          // Use the first canvas (main chart)
          const canvas = canvasElements[0];
          const base64 = canvas.toDataURL("image/png").split(",")[1];
          resolve(base64);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Chart capture error:", error);
        reject(error);
      }
    });
  };

  // Expose capture function via prop
  useEffect(() => {
    if (onCaptureChart) {
      // Store reference to capture function
      (
        window as Window & { __captureChartForTrading?: () => Promise<string> }
      ).__captureChartForTrading = captureChartImage;
    }
  }, [onCaptureChart]);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Chart Section */}
      <Card className="flex flex-col flex-1 min-h-0" ref={chartContainerRef}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            {isEditingTicker ? (
              <Input
                ref={tickerInputRef}
                type="text"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleTickerSubmit();
                  } else if (e.key === "Escape") {
                    setTickerInput(symbol);
                    setIsEditingTicker(false);
                  }
                }}
                onBlur={handleTickerSubmit}
                className="h-8 w-24 text-lg font-semibold"
                placeholder="Ticker"
              />
            ) : (
              <CardTitle
                className="text-lg font-semibold cursor-pointer hover:text-primary transition-colors"
                onClick={() => setIsEditingTicker(true)}
                title="Click to change ticker (press T)"
              >
                {symbol}
              </CardTitle>
            )}
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
              <CardActionButton
                variant={timeframe === "1min" ? "default" : "outline"}
                onClick={() => setTimeframe("1min")}
                title="1-minute bars (press 1)"
              >
                1m
              </CardActionButton>
              <CardActionButton
                variant={timeframe === "5min" ? "default" : "outline"}
                onClick={() => setTimeframe("5min")}
                title="5-minute bars (press 5)"
              >
                5m
              </CardActionButton>
            </div>
            <CardActionButton
              variant={viewMode === "focus" ? "default" : "outline"}
              onClick={() => {
                setViewMode((prev) =>
                  prev === "default" ? "focus" : "default"
                );
              }}
              title="Focus on last 2 hours (press F)"
            >
              Focus
            </CardActionButton>
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
                viewMode={viewMode}
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

      {/* Financial Info Panel */}
      <FinancialInfoPanel ticker={symbol} />
    </div>
  );
}
