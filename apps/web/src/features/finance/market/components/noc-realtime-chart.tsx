"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CandlestickChart } from "@/lib/components/ui/candlestick-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { CardActionButton } from "@/lib/components/ui/card-action-button";
import { Input } from "@/lib/components/ui/input";
import { useMarketData } from "@/lib/hooks/use-market-data";
import { useShortcut } from "@/lib/hooks/use-shortcut";
import type { AggregateBar } from "@printer/shared";

interface NocRealtimeChartProps {
  symbol: string;
  onClose?: () => void;
  onSymbolChange?: (symbol: string) => void;
  onCaptureChart?: () => Promise<string>;
}

type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d"; // Database timeframes
type LookbackPeriod = "1hr" | "4hr" | "1d" | "1w" | "1m"; // Lookback periods

const BASE_BAR_KEYS = new Set<string>([
  "ev",
  "event_type",
  "sym",
  "symbol",
  "T",
  "pair",
  "s",
  "start",
  "start_timestamp",
  "e",
  "end",
  "end_timestamp",
  "t",
  "timestamp",
  "time",
  "updated_at",
  "window_start",
  "window_end",
  "o",
  "open",
  "h",
  "high",
  "l",
  "low",
  "c",
  "close",
  "v",
  "volume",
  "vw",
  "vwap",
  "n",
  "trade_count",
  "av",
  "accumulated_volume",
  "op",
  "a",
  "z",
  "price",
  "market",
  "conditions",
  "exchange",
  "type",
  "message",
  "status",
  "request_id",
]);

const NESTED_METRIC_KEYS = new Set(["metrics", "indicators", "indicator_values"]);

function extractIndicatorMetrics(source: unknown): AggregateBar["metrics"] | undefined {
  if (!source || typeof source !== "object") {
    return undefined;
  }

  const metrics: Record<string, number | null | undefined> = {};

  const addMetric = (key: string, value: unknown) => {
    if (typeof value === "number" || value === null) {
      metrics[key] = value;
    }
  };

  for (const nestedKey of NESTED_METRIC_KEYS) {
    const nested = (source as Record<string, unknown>)[nestedKey];
    if (nested && typeof nested === "object") {
      for (const [key, value] of Object.entries(
        nested as Record<string, unknown>
      )) {
        addMetric(key, value);
      }
    }
  }

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (BASE_BAR_KEYS.has(key) || NESTED_METRIC_KEYS.has(key)) {
      continue;
    }
    addMetric(key, value);
  }

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

function mergeMetricMaps(
  existing?: AggregateBar["metrics"],
  incoming?: AggregateBar["metrics"]
): AggregateBar["metrics"] | undefined {
  if (existing && incoming) {
    return { ...existing, ...incoming };
  }
  return incoming ?? existing;
}

function applyIndicatorFields(
  target: AggregateBar,
  metrics?: AggregateBar["metrics"]
): void {
  if (!metrics) return;
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === "number" || value === null) {
      (target as Record<string, number | null | undefined>)[key] = value;
    }
  }
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
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [lookbackPeriod, setLookbackPeriod] = useState<LookbackPeriod>("1d");
  const [bars, setBars] = useState<AggregateBar[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [tickerInput, setTickerInput] = useState(symbol);
  const [isEditingTicker, setIsEditingTicker] = useState(false);
  const tickerInputRef = useRef<HTMLInputElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Calculate lookback period in milliseconds
  const getLookbackMs = (period: LookbackPeriod): number => {
    switch (period) {
      case "1hr":
        return 1 * 60 * 60 * 1000;
      case "4hr":
        return 4 * 60 * 60 * 1000;
      case "1d":
        return 24 * 60 * 60 * 1000;
      case "1w":
        return 7 * 24 * 60 * 60 * 1000;
      case "1m":
        return 30 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000;
    }
  };

  // Calculate appropriate limit based on timeframe and lookback period
  const getLimit = (tf: Timeframe, period: LookbackPeriod): number => {
    const lookbackMs = getLookbackMs(period);
    const barIntervalMs = {
      "1m": 60 * 1000,
      "5m": 5 * 60 * 1000,
      "15m": 15 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "1d": 24 * 60 * 60 * 1000,
    }[tf];

    // Calculate max bars needed + buffer
    const maxBars = Math.ceil(lookbackMs / barIntervalMs) + 100;
    return Math.min(maxBars, 100000); // Cap at 100k bars
  };

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

          const realtimeMetrics = extractIndicatorMetrics(m);
          if (realtimeMetrics) {
            bar.metrics = realtimeMetrics;
            applyIndicatorFields(bar, realtimeMetrics);
          }

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
                const mergedMetrics = mergeMetricMaps(
                  existing.metrics,
                  bar.metrics
                );
                updatedCurrentBar = {
                  ...existing,
                  t: minuteTimestamp,
                  o: existing.o, // Keep original open
                  h: Math.max(existing.h, bar.h), // Highest high
                  l: Math.min(existing.l, bar.l), // Lowest low
                  c: bar.c, // Latest close
                  v: (existing.v || 0) + (bar.v || 0), // Cumulative volume
                  vw: bar.vw, // Latest VWAP
                  n: (existing.n || 0) + (bar.n || 0), // Cumulative transactions
                };
                if (mergedMetrics) {
                  updatedCurrentBar.metrics = mergedMetrics;
                  applyIndicatorFields(updatedCurrentBar, mergedMetrics);
                } else {
                  delete updatedCurrentBar.metrics;
                }
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

  // Use new unified WebSocket hook
  const { data: marketData, isConnected: wsConnected } = useMarketData(symbol);

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Handle market data updates
  useEffect(() => {
    if (marketData) {
      handleMessage(marketData);
    }
  }, [marketData, handleMessage]);

  // Fetch historical data when symbol changes
  useEffect(() => {
    const fetchHistoricalData = async () => {
      setIsLoadingHistory(true);
      setBars([]); // Clear existing bars

      try {
        const now = new Date();
        const lookbackMs = getLookbackMs(lookbackPeriod);
        const from = new Date(now.getTime() - lookbackMs);
        const limit = getLimit(timeframe, lookbackPeriod);

        // Build backend URL from NEXT_PUBLIC_WS_URL (consistent with other components)
        const baseUrl =
          process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
            "wss://",
            "https://"
          ) || "http://localhost:8000";

        const params = new URLSearchParams({
          from_time: from.toISOString(),
          to_time: now.toISOString(),
          timeframe: timeframe, // Use selected database timeframe
          limit: String(limit),
        });

        const url = `${baseUrl}/api/market/bars/${encodeURIComponent(
          symbol
        )}?${params.toString()}`;

        console.log(
          `[NOC Chart] Fetching ${lookbackPeriod} of ${timeframe} bars from database`,
          `\n  Symbol: ${symbol}`,
          `\n  URL: ${url}`,
          `\n  From: ${from.toISOString()} (${lookbackPeriod} ago)`,
          `\n  To: ${now.toISOString()} (now)`,
          `\n  Timeframe: ${timeframe}`,
          `\n  Limit: ${limit}`
        );

        // Fetch from database via MarketDataService endpoint
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform database format to AggregateBar format
        const historicalBars: AggregateBar[] = data.bars
          .map((rawBar: any) => {
            const normalizedBar: AggregateBar = {
              t: new Date(rawBar.time).getTime(), // ISO string to milliseconds
              o: rawBar.open ?? 0,
              h: rawBar.high ?? 0,
              l: rawBar.low ?? 0,
              c: rawBar.close ?? 0,
              v: rawBar.volume ?? undefined,
              vw: rawBar.vwap ?? undefined,
              n: rawBar.trade_count ?? undefined,
            };
            const metrics = extractIndicatorMetrics(rawBar);
            if (metrics) {
              normalizedBar.metrics = metrics;
              applyIndicatorFields(normalizedBar, metrics);
            }
            return normalizedBar;
          })
          .filter(
            (bar: AggregateBar) =>
              bar.t &&
              bar.o != null &&
              bar.h != null &&
              bar.l != null &&
              bar.c != null
          )
          .sort((a: AggregateBar, b: AggregateBar) => a.t - b.t); // Sort ascending

        console.log(
          `[NOC Chart] Received ${historicalBars.length} historical bars for ${symbol}`,
          historicalBars.length > 0
            ? `\n  First bar: ${new Date(historicalBars[0].t).toLocaleString()}`
            : "",
          historicalBars.length > 0
            ? `\n  Last bar: ${new Date(
                historicalBars[historicalBars.length - 1].t
              ).toLocaleString()}`
            : ""
        );

        // Bars come from database already in correct timeframe, just deduplicate by timestamp
        const dedupedBars: AggregateBar[] = [];
        const seen = new Set<number>();

        for (const bar of historicalBars) {
          // Use the exact timestamp from the bar (database already provides correct timeframe)
          if (!seen.has(bar.t)) {
            seen.add(bar.t);
            dedupedBars.push(bar);
          }
        }

        console.log(
          `[NOC Chart] Loaded ${dedupedBars.length} ${timeframe} bars (${
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
  }, [symbol, timeframe, lookbackPeriod]);

  // No need to filter/aggregate - bars come from database in the correct timeframe
  const filteredBars = useMemo(() => {
    return bars;
  }, [bars]);

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

  // Keyboard shortcuts for timeframes
  useShortcut(
    "1",
    () => {
      setTimeframe("1m");
      console.log("[NOC Chart] Switched to 1-minute timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "5",
    () => {
      setTimeframe("5m");
      console.log("[NOC Chart] Switched to 5-minute timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "3",
    () => {
      setTimeframe("15m");
      console.log("[NOC Chart] Switched to 15-minute timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "h",
    () => {
      setTimeframe("1h");
      console.log("[NOC Chart] Switched to 1-hour timeframe");
    },
    [setTimeframe]
  );

  useShortcut(
    "d",
    () => {
      setTimeframe("1d");
      console.log("[NOC Chart] Switched to 1-day timeframe");
    },
    [setTimeframe]
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
          const html2canvas = (
            window as unknown as Window & { html2canvas: Function }
          ).html2canvas;
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
    <Card className="flex flex-col h-full" ref={chartContainerRef}>
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
              variant={timeframe === "1m" ? "default" : "outline"}
              onClick={() => setTimeframe("1m")}
              title="1-minute bars (press 1)"
            >
              1m
            </CardActionButton>
            <CardActionButton
              variant={timeframe === "5m" ? "default" : "outline"}
              onClick={() => setTimeframe("5m")}
              title="5-minute bars (press 5)"
            >
              5m
            </CardActionButton>
            <CardActionButton
              variant={timeframe === "15m" ? "default" : "outline"}
              onClick={() => setTimeframe("15m")}
              title="15-minute bars (press 3)"
            >
              15m
            </CardActionButton>
            <CardActionButton
              variant={timeframe === "1h" ? "default" : "outline"}
              onClick={() => setTimeframe("1h")}
              title="1-hour bars (press H)"
            >
              1h
            </CardActionButton>
            <CardActionButton
              variant={timeframe === "1d" ? "default" : "outline"}
              onClick={() => setTimeframe("1d")}
              title="1-day bars (press D)"
            >
              1d
            </CardActionButton>
          </div>
          <div className="flex gap-1">
            <CardActionButton
              variant={lookbackPeriod === "1hr" ? "default" : "outline"}
              onClick={() => setLookbackPeriod("1hr")}
              title="Last 1 hour"
            >
              1hr
            </CardActionButton>
            <CardActionButton
              variant={lookbackPeriod === "4hr" ? "default" : "outline"}
              onClick={() => setLookbackPeriod("4hr")}
              title="Last 4 hours"
            >
              4hr
            </CardActionButton>
            <CardActionButton
              variant={lookbackPeriod === "1d" ? "default" : "outline"}
              onClick={() => setLookbackPeriod("1d")}
              title="Last 1 day"
            >
              1d
            </CardActionButton>
            <CardActionButton
              variant={lookbackPeriod === "1w" ? "default" : "outline"}
              onClick={() => setLookbackPeriod("1w")}
              title="Last 1 week"
            >
              1w
            </CardActionButton>
            <CardActionButton
              variant={lookbackPeriod === "1m" ? "default" : "outline"}
              onClick={() => setLookbackPeriod("1m")}
              title="Last 1 month"
            >
              1m
            </CardActionButton>
          </div>
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
              viewMode="default"
              showEMA12={true}
              showEMA26={true}
              showVWAP={true}
              showVolume={true}
              showMACD={true}
              showLegend={true}
              barIntervalSeconds={
                timeframe === "1m"
                  ? 60
                  : timeframe === "5m"
                  ? 300
                  : timeframe === "15m"
                  ? 900
                  : timeframe === "1h"
                  ? 3600
                  : 86400 // 1d
              }
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
