/**
 * useBacktests Hook
 *
 * Hook for managing backtests CRUD operations.
 */

import { useCallback, useEffect, useState } from "react";

import { backtestService } from "../services/backtest-service";
import { Backtest, RunBacktestRequest } from "../types";

export function useBacktests(fundId?: string, status?: string) {
  const [backtests, setBacktests] = useState<Backtest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBacktests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await backtestService.listBacktests(fundId, status);
      setBacktests(data.backtests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backtests");
    } finally {
      setLoading(false);
    }
  }, [fundId, status]);

  useEffect(() => {
    loadBacktests();
  }, [loadBacktests]);

  const runBacktest = useCallback(
    async (request: RunBacktestRequest): Promise<Backtest> => {
      try {
        setError(null);
        const newBacktest = await backtestService.runBacktest(request);
        setBacktests((prev) => [newBacktest, ...prev]);
        return newBacktest;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to run backtest";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    },
    []
  );

  const refresh = useCallback(() => {
    loadBacktests();
  }, [loadBacktests]);

  return {
    backtests,
    loading,
    error,
    runBacktest,
    refresh,
  };
}
