/**
 * useFundDetails Hook
 *
 * Hook for loading a fund with its configuration.
 * Strategy configuration is now part of the Fund object.
 */

import { useCallback, useEffect, useState } from "react";

import { fundService } from "../services/fund-service";
import { Fund, Setup } from "../types";

export interface FundDetails {
  fund: Fund;
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

      // Load fund (strategy configuration is now inline)
      const fund = await fundService.getFund(fundId);

      if (!fund) {
        throw new Error("Fund not found");
      }

      // Setup is always null for now (we may load it later if needed)
      const setup = null;

      setDetails({ fund, setup });
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
