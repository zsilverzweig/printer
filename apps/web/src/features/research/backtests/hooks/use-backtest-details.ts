"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { backtestService } from "../services/backtest-service";
import type {
  Backtest,
  BacktestEvent,
  BacktestMetrics,
  BacktestOrder,
  BacktestTrade,
} from "../types";

interface BacktestProgressStats {
  minuteIndex: number;
  elapsedMs: number;
  iterationMs: number;
  simulatedTime?: string | null;
  activePositions: number;
  pendingOrders: number;
  filledOrders: number;
  rawTickerCount: number;
  tickersAfterSetup: number;
  canTrade: boolean;
  restrictionReason?: string | null;
}

interface UseBacktestDetailsResult {
  backtest: Backtest | null;
  events: BacktestEvent[];
  orders: BacktestOrder[];
  trades: BacktestTrade[];
  loading: boolean;
  error: string | null;
  progressPercent: number;
  progressStats: BacktestProgressStats | null;
  metrics: BacktestMetrics | null;
  refresh: () => Promise<void>;
}

function coerceNumber(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function extractProgress(event: BacktestEvent | undefined): BacktestProgressStats | null {
  if (!event) return null;
  const metadata = event.details ?? {};
  const minuteIndex =
    coerceNumber((metadata as Record<string, unknown>).minute_index) ||
    coerceNumber((metadata as Record<string, unknown>).minuteIndex);
  const elapsedMs =
    coerceNumber((metadata as Record<string, unknown>).elapsed_ms) ||
    coerceNumber((metadata as Record<string, unknown>).elapsedMs);
  const iterationMs =
    coerceNumber((metadata as Record<string, unknown>).iteration_ms) ||
    coerceNumber((metadata as Record<string, unknown>).iterationMs);
  const activePositions =
    coerceNumber((metadata as Record<string, unknown>).active_positions) ||
    coerceNumber((metadata as Record<string, unknown>).activePositions);
  const pendingOrders =
    coerceNumber((metadata as Record<string, unknown>).pending_orders) ||
    coerceNumber((metadata as Record<string, unknown>).pendingOrders);
  const filledOrders =
    coerceNumber((metadata as Record<string, unknown>).filled_orders) ||
    coerceNumber((metadata as Record<string, unknown>).filledOrders);
  const rawTickerCount =
    coerceNumber((metadata as Record<string, unknown>).raw_ticker_count) ||
    coerceNumber((metadata as Record<string, unknown>).rawTickerCount);
  const tickersAfterSetup =
    coerceNumber((metadata as Record<string, unknown>).tickers_after_setup) ||
    coerceNumber((metadata as Record<string, unknown>).tickersAfterSetup);

  const canTradeRaw =
    (metadata as Record<string, unknown>).can_trade ??
    (metadata as Record<string, unknown>).canTrade;
  const restrictionReason =
    ((metadata as Record<string, unknown>).restriction_reason ??
      (metadata as Record<string, unknown>).restrictionReason) as
      | string
      | null
      | undefined;

  const canTrade =
    typeof canTradeRaw === "boolean"
      ? canTradeRaw
      : typeof canTradeRaw === "string"
      ? canTradeRaw.toLowerCase() !== "false"
      : true;

  return {
    minuteIndex,
    elapsedMs,
    iterationMs,
    simulatedTime: event.simulatedTime,
    activePositions,
    pendingOrders,
    filledOrders,
    rawTickerCount,
    tickersAfterSetup,
    canTrade,
    restrictionReason: restrictionReason ?? null,
  };
}

export function useBacktestDetails(backtestId: string): UseBacktestDetailsResult {
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [events, setEvents] = useState<BacktestEvent[]>([]);
  const [orders, setOrders] = useState<BacktestOrder[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const websocketCleanupRef = useRef<(() => void) | null>(null);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [backtestData, eventsData, ordersData, tradesData, metricsData] = await Promise.all([
        backtestService.getBacktest(backtestId),
        backtestService.getBacktestEvents(backtestId),
        backtestService.getBacktestOrders(backtestId),
        backtestService.getBacktestTrades(backtestId),
        backtestService.getBacktestMetrics(backtestId),
      ]);

      setBacktest(backtestData);
      setEvents(eventsData.events);
      setOrders(ordersData.orders);
      setTrades(tradesData.trades);
      setMetrics(metricsData.metrics);
    } catch (err) {
      console.error("Failed to load backtest details:", err);
      setError(err instanceof Error ? err.message : "Unexpected error");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [backtestId]);

  const refresh = useCallback(async () => {
    await loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (websocketCleanupRef.current) {
      websocketCleanupRef.current();
      websocketCleanupRef.current = null;
    }

    websocketCleanupRef.current = backtestService.openBacktestWebSocket(
      backtestId,
      (event) => {
        setEvents((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === event.id);
          if (existingIndex !== -1) {
            const copy = [...prev];
            copy[existingIndex] = event;
            return copy;
          }
          return [...prev, event].sort((a, b) => a.sequence - b.sequence);
        });

        if (event.eventType === "complete" || event.eventType === "error") {
          setBacktest((prev) =>
            prev
              ? {
                  ...prev,
                  status: event.eventType === "complete" ? "completed" : "failed",
                  completedAt:
                    event.details?.completed_at ??
                    event.details?.completedAt ??
                    prev.completedAt,
                }
              : prev
          );
        }
      },
      (wsError) => {
        console.warn("Backtest websocket error:", wsError);
      }
    );

    return () => {
      if (websocketCleanupRef.current) {
        websocketCleanupRef.current();
        websocketCleanupRef.current = null;
      }
    };
  }, [backtestId]);

  const latestIterationEvent = useMemo(() => {
    const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (ordered[i].eventType === "iteration") {
        return ordered[i];
      }
    }
    return undefined;
  }, [events]);

  const progressStats = useMemo(
    () => extractProgress(latestIterationEvent),
    [latestIterationEvent]
  );

  const progressPercent = useMemo(() => {
    if (!progressStats) return 0;
    const pct = (progressStats.minuteIndex / 391) * 100;
    return Math.min(100, Math.max(0, Number(pct.toFixed(2))));
  }, [progressStats]);

  return {
    backtest,
    events,
    orders,
    trades,
    loading,
    error,
    progressPercent,
    progressStats,
    metrics,
    refresh,
  };
}


