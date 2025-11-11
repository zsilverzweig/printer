"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { backtestService } from "../services/backtest-service";
import type {
  Backtest,
  BacktestEvent,
  BacktestOrder,
  BacktestTrade,
} from "../types";

interface BacktestProgressStats {
  minuteIndex: number;
  elapsedMs: number;
  simulatedTime?: string | null;
  activePositions: number;
  pendingOrders: number;
  filledOrders: number;
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
  refresh: () => Promise<void>;
}

function coerceNumber(value: unknown, defaultValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function extractProgress(event: BacktestEvent | undefined): BacktestProgressStats | null {
  if (!event) return null;
  const metadata = event.metadata ?? {};
  const minuteIndex =
    coerceNumber((metadata as Record<string, unknown>).minute_index) ||
    coerceNumber((metadata as Record<string, unknown>).minuteIndex);
  const elapsedMs =
    coerceNumber((metadata as Record<string, unknown>).elapsed_ms) ||
    coerceNumber((metadata as Record<string, unknown>).elapsedMs);
  const activePositions =
    coerceNumber((metadata as Record<string, unknown>).active_positions) ||
    coerceNumber((metadata as Record<string, unknown>).activePositions);
  const pendingOrders =
    coerceNumber((metadata as Record<string, unknown>).pending_orders) ||
    coerceNumber((metadata as Record<string, unknown>).pendingOrders);
  const filledOrders =
    coerceNumber((metadata as Record<string, unknown>).filled_orders) ||
    coerceNumber((metadata as Record<string, unknown>).filledOrders);

  return {
    minuteIndex,
    elapsedMs,
    simulatedTime: event.simulatedTime,
    activePositions,
    pendingOrders,
    filledOrders,
  };
}

export function useBacktestDetails(backtestId: string): UseBacktestDetailsResult {
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [events, setEvents] = useState<BacktestEvent[]>([]);
  const [orders, setOrders] = useState<BacktestOrder[]>([]);
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const websocketCleanupRef = useRef<(() => void) | null>(null);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [backtestData, eventsData, ordersData, tradesData] = await Promise.all([
        backtestService.getBacktest(backtestId),
        backtestService.getBacktestEvents(backtestId),
        backtestService.getBacktestOrders(backtestId),
        backtestService.getBacktestTrades(backtestId),
      ]);

      setBacktest(backtestData);
      setEvents(eventsData.events);
      setOrders(ordersData.orders);
      setTrades(tradesData.trades);
    } catch (err) {
      console.error("Failed to load backtest details:", err);
      setError(err instanceof Error ? err.message : "Unexpected error");
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
                    event.metadata?.completed_at ??
                    event.metadata?.completedAt ??
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
    refresh,
  };
}


