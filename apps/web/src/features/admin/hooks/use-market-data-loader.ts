// React hook for market data loading management
"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthContext } from "@/lib/providers/auth-provider";
import { log } from "@/lib/utils/logger";

import { adminService } from "../services/admin-service";

export interface LoadStatus {
  status_id: number;
  status: "running" | "completed" | "failed" | "cancelled";
  progress_pct: number;
  tickers_processed: number;
  tickers_succeeded: number;
  tickers_failed: number;
  started_at: string | null;
  completed_at: string | null;
  last_updated: string | null;
  error_message: string | null;
}

export interface SymbolDetail {
  symbol: string;
  bar_count: number;
  first_date: string | null;
  last_date: string | null;
  unique_days: number;
}

export interface DateCoverage {
  date: string;
  symbol_count: number;
  bar_count: number;
}

export interface BarDistribution {
  range: string;
  count: number;
}

export interface TimescaleStats {
  timescale: string;
  bar_count: number;
  symbol_count: number;
  min_time: string | null;
  max_time: string | null;
  unique_days: number;
}

export interface DatabaseStats {
  total_bars: number;
  min_date: string | null;
  max_date: string | null;
  symbol_count: number;
  total_size: string;
  table_size: string;
  index_size?: string;
  toast_size?: string;
  total_bytes_raw?: number;
  timescale_stats?: TimescaleStats[];
  symbol_details?: SymbolDetail[];
  date_coverage?: DateCoverage[];
  bar_distribution?: BarDistribution[];
  total_symbols_analyzed?: number;
  error?: string;
}

export interface UseMarketDataLoaderReturn {
  loadStatus: LoadStatus | null;
  dbStats: DatabaseStats | null;
  loading: boolean;
  error: string | null;
  startLoad: (days: number, symbols?: string[]) => Promise<void>;
  cancelLoad: () => Promise<void>;
  refreshStats: () => Promise<void>;
  refreshStatus: (statusId: number) => Promise<void>;
}

export function useMarketDataLoader(): UseMarketDataLoaderReturn {
  const { user, isAdmin } = useAuthContext();
  const [loadStatus, setLoadStatus] = useState<LoadStatus | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  // Load database stats on mount and check for active tasks
  useEffect(() => {
    if (!isAdmin || !user) {
      setDbStats(null);
      setLoadStatus(null);
      return;
    }

    const initializeData = async () => {
      await refreshStats();

      // Check if there's an active load task and resume tracking
      try {
        const response = await fetch(
          "http://localhost:8000/api/market/historical/status/latest"
        );
        if (response.ok) {
          const status = await response.json();
          if (status && status.status === "running") {
            // Resume tracking active task
            await refreshStatus(status.status_id);
          }
        }
      } catch (err) {
        // Silently fail if no active task exists
        log.debug("No active load task found", "useMarketDataLoader");
      }
    };

    initializeData();
  }, [isAdmin, user]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const refreshStats = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const stats = await adminService.getMarketDataStats();
      setDbStats(stats);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to load database stats";
      setError(errorMessage);
      log.error("Failed to load database stats", err, "useMarketDataLoader");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshStatus = useCallback(
    async (statusId: number) => {
      if (!user) return;

      try {
        const status = await adminService.getMarketDataLoadStatus(statusId);
        setLoadStatus(status);

        // If task is still running, start polling
        if (status.status === "running" && !pollingInterval) {
          const interval = setInterval(async () => {
            try {
              const updatedStatus = await adminService.getMarketDataLoadStatus(
                statusId
              );
              setLoadStatus(updatedStatus);

              // Stop polling if task completed
              if (updatedStatus.status !== "running") {
                clearInterval(interval);
                setPollingInterval(null);
                // Refresh stats after completion
                await refreshStats();
              }
            } catch (err) {
              log.error(
                "Failed to poll load status",
                err,
                "useMarketDataLoader"
              );
            }
          }, 2000); // Poll every 2 seconds

          setPollingInterval(interval);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get load status";
        setError(errorMessage);
        log.error("Failed to get load status", err, "useMarketDataLoader");
      }
    },
    [user, pollingInterval, refreshStats]
  );

  const startLoad = useCallback(
    async (days: number, symbols?: string[]) => {
      if (!user) {
        throw new Error("User must be authenticated to start load");
      }

      try {
        setLoading(true);
        setError(null);

        const result = await adminService.startMarketDataLoad(days, symbols);

        // Start monitoring the load status
        await refreshStatus(result.status_id);

        log.info(
          `Started market data load: ${result.message}`,
          "useMarketDataLoader"
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to start load";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user, refreshStatus]
  );

  const cancelLoad = useCallback(async () => {
    if (!user) {
      throw new Error("User must be authenticated to cancel load");
    }

    try {
      setLoading(true);
      setError(null);

      await adminService.cancelMarketDataLoad();

      // Stop polling
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }

      // Update status
      if (loadStatus) {
        setLoadStatus({
          ...loadStatus,
          status: "cancelled",
        });
      }

      log.info("Cancelled market data load", "useMarketDataLoader");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to cancel load";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, loadStatus, pollingInterval]);

  return {
    loadStatus,
    dbStats,
    loading,
    error,
    startLoad,
    cancelLoad,
    refreshStats,
    refreshStatus,
  };
}
