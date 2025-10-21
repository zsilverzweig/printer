"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useMarketStream } from "@/features/finance/market/hooks/use-market-stream";
import { Card } from "@/lib/components/ui/card";
import type { ScreenedStockPreview } from "@/lib/types/market";
import { log } from "@/lib/utils/logger";

// Global cache for screener data (persists across navigation)
type ScreenerGlobals = {
  __PR_SCREENER_CACHE__?: ScreenedStockPreview[] | null;
};
const __SCREENER_GLOBAL__ = globalThis as unknown as ScreenerGlobals;
if (!__SCREENER_GLOBAL__.__PR_SCREENER_CACHE__)
  __SCREENER_GLOBAL__.__PR_SCREENER_CACHE__ = null;

function formatNumber(n: number | undefined) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMultiple(n: number | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return `${n.toFixed(2)}x`;
}

export default function ScreenerPage() {
  // Initialize from global cache
  const [data, setData] = React.useState<ScreenedStockPreview[] | null>(
    () => __SCREENER_GLOBAL__.__PR_SCREENER_CACHE__ ?? null
  );
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const avgVolume = React.useMemo(() => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce(
      (acc, d) => acc + (typeof d.volume === "number" ? d.volume : 0),
      0
    );
    return sum / data.length;
  }, [data]);
  const mapIncomingToPreview = React.useCallback(
    (raw: unknown): ScreenedStockPreview | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const toNum = (v: unknown, fallback = 0): number =>
        typeof v === "number" ? v : Number(v ?? fallback) || fallback;
      const toStr = (v: unknown, fallback = ""): string =>
        typeof v === "string" ? v : String(v ?? fallback);

      return {
        ticker: toStr(r["T"] ?? r["ticker"] ?? ""),
        open: toNum(r["o"] ?? r["open"]),
        high: toNum(r["h"] ?? r["high"] ?? r["c"]),
        low: toNum(r["l"] ?? r["low"] ?? r["c"]),
        close: toNum(r["c"] ?? r["close"]),
        price: toNum(r["p"] ?? r["price"]),
        volume: toNum(r["v"] ?? r["volume"]),
        transactions: toNum(r["n"] ?? r["transactions"]),
        window_start: toNum(r["t"] ?? r["window_start"]),
        rv: toNum(r["rv"]),
        rv30: toNum(r["rv30"]),
        rv60: toNum(r["rv60"]),
      };
    },
    []
  );

  const onMessage = React.useCallback(
    (msg: unknown) => {
      try {
        let payload: unknown = msg;
        if (typeof msg === "string") {
          try {
            payload = JSON.parse(msg);
          } catch {
            // pass-through
          }
        }

        if (Array.isArray(payload)) {
          const items = (payload as unknown[])
            .map(mapIncomingToPreview)
            .filter(Boolean) as ScreenedStockPreview[];
          try {
            log.info("[Screener] received batch", {
              count: items.length,
              sample: items[0],
            });
          } catch {}
          // Update both local state and global cache
          __SCREENER_GLOBAL__.__PR_SCREENER_CACHE__ = items;
          setData(items);
          return;
        }

        if (payload && typeof payload === "object") {
          const maybe = payload as Record<string, unknown>;
          const maybeItems = (maybe["items"] || maybe["data"]) as unknown;
          if (Array.isArray(maybeItems)) {
            const items = (maybeItems as unknown[])
              .map(mapIncomingToPreview)
              .filter(Boolean) as ScreenedStockPreview[];
            try {
              log.info("[Screener] received envelope batch", {
                count: items.length,
                sample: items[0],
              });
            } catch {}
            // Update both local state and global cache
            __SCREENER_GLOBAL__.__PR_SCREENER_CACHE__ = items;
            setData(items);
            return;
          }

          // Single update - upsert into current list
          const one = mapIncomingToPreview(payload);
          if (one) {
            try {
              log.debug("[Screener] received single update", {
                ticker: one.ticker,
              });
            } catch {}
            setData((prev) => {
              const list = Array.isArray(prev) ? [...prev] : [];
              const idx = list.findIndex(
                (d) =>
                  d.ticker === one.ticker && d.window_start === one.window_start
              );
              if (idx >= 0) list[idx] = one;
              else list.push(one);
              // Update global cache
              __SCREENER_GLOBAL__.__PR_SCREENER_CACHE__ = list;
              return list;
            });
            return;
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "WS message error");
      }
    },
    [mapIncomingToPreview]
  );

  const {
    isConnected,
    isConnecting,
    error: wsError,
  } = useMarketStream({
    subs: "SCREENER",
    onMessage,
    subscribeOnOpen: true,
    debug: true,
  });

  React.useEffect(() => {
    setError(wsError || null);
  }, [wsError]);

  React.useEffect(() => {
    try {
      log.debug("[Screener] WS status", {
        isConnected,
        isConnecting,
        hasError: !!wsError,
      });
    } catch {}
  }, [isConnected, isConnecting, wsError]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Screener</h1>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="p-4 overflow-x-auto space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {isConnecting && <span>Connecting…</span>}
            {isConnected && <span>Live</span>}
            {!isConnecting && !isConnected && <span>Disconnected</span>}
          </div>
          {avgVolume > 0 && <div>Avg Volume: {formatNumber(avgVolume)}</div>}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-2 text-left">Ticker</th>
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
                  <td className="py-2 text-right">
                    {formatNumber(row.price)}
                  </td>
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
            {(!data || data.length === 0) && (
              <tr>
                <td
                  className="py-6 text-center text-muted-foreground"
                  colSpan={12}
                >
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
