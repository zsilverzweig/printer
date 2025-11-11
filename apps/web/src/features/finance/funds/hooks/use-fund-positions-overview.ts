/**
 * useFundPositionsOverview Hook
 *
 * Fetches grouped fund positions for the funds index positions tab.
 */

import { useCallback, useEffect, useState } from "react";

import { fundService } from "../services/fund-service";
import { FundPositionsGroup } from "../types";

export function useFundPositionsOverview(active: boolean) {
  const [positions, setPositions] = useState<FundPositionsGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fundService.getPositions();
      setPositions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load fund positions"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) {
      loadPositions();
    }
  }, [active, loadPositions]);

  return {
    positions,
    loading,
    error,
    refresh: loadPositions,
  };
}


