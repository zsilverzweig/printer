/**
 * useFundDetails Hook
 *
 * Hook for loading a fund with its strategy and setup.
 */

import { useCallback, useEffect, useState } from "react";

import { fundService } from "../services/fund-service";
import { strategyService } from "../services/strategy-service";
import { Fund, Setup, Strategy } from "../types";

export interface FundDetails {
  fund: Fund;
  strategy: Strategy | null;
  setup: Setup | null;
}

export function useFundDetails(fundId: string | null) {
  const [details, setDetails] = useState<FundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!fundId) {
      setDetails(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load fund, strategy, and setup in parallel
      const [fund, strategy] = await Promise.all([
        fundService.getFund(fundId),
        strategyService.getStrategyByFundId(fundId),
      ]);

      if (!fund) {
        throw new Error("Fund not found");
      }

      // If strategy exists and has a setup, load it
      // Note: In the current design, we'll need to link strategy to setup
      // For now, we'll just return null for setup
      const setup = null;

      setDetails({ fund, strategy, setup });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load fund details"
      );
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  return {
    details,
    loading,
    error,
    refresh: loadDetails,
  };
}
