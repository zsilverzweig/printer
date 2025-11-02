import { log } from "@/lib/utils/logger";
import { useCallback, useEffect, useState } from "react";

export interface ScreeningCriteria {
  id: string;
  name: string;
  description?: string;
  criteria: {
    min_price?: number;
    max_price?: number;
    min_volume?: number;
    min_change_percent?: number;
    max_change_percent?: number;
    exclude_etfs?: boolean;
    asset_types?: string[];
    order_by?: string;
    limit?: number;
    technical_filters?: {
      near_resistance?: boolean;
      near_support?: boolean;
      has_equal_highs?: boolean;
      has_equal_lows?: boolean;
      above_90day_high?: boolean;
      below_90day_low?: boolean;
      relative_volume_min?: number;
    };
  };
  created_at: string;
  updated_at: string;
}

export interface ScreenerRunResult {
  ticker_count: number;
  tickers: string[];
  results?: any[]; // Full screener result data
}

const API_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace("ws://", "http://").replace(
    "wss://",
    "https://"
  ) || "http://localhost:8000";

export function useScreeners() {
  const [screeners, setScreeners] = useState<ScreeningCriteria[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScreeners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/api/screening-criteria`);

      if (!response.ok) {
        throw new Error(`Failed to load screeners: ${response.statusText}`);
      }

      const data = await response.json();
      setScreeners(data);
      log.debug("Loaded screeners", { count: data.length });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load screeners";
      setError(message);
      log.error("Error loading screeners", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScreeners();
  }, [loadScreeners]);

  const runScreenerWithCriteria = useCallback(
    async (
      criteria: ScreeningCriteria["criteria"],
      timestamp?: Date
    ): Promise<ScreenerRunResult | null> => {
      try {
        // Don't set loading state - this is for auto-runs and shouldn't block UI
        setError(null);

        const url = new URL(`${API_BASE}/api/screening-criteria/run`);
        if (timestamp) {
          const isoString = timestamp.toISOString();
          url.searchParams.set("timestamp", isoString);
        }

        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(criteria),
        });

        if (!response.ok) {
          const errorText = await response.text();
          log.error("[useScreeners] Inline screener API error", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
          throw new Error(`Failed to run screener: ${response.statusText}`);
        }

        const result = await response.json();
        log.debug("[useScreeners] Inline screener run result", {
          ticker_count: result.ticker_count,
          results_length: result.results?.length || 0,
          has_results: !!result.results,
        });
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to run screener";
        setError(message);
        log.error("[useScreeners] Error running inline screener", err);
        return null;
      }
    },
    []
  );

  const runScreener = useCallback(
    async (
      screenerId: string,
      timestamp?: Date
    ): Promise<ScreenerRunResult | null> => {
      try {
        setLoading(true);
        setError(null);

        const url = new URL(
          `${API_BASE}/api/screening-criteria/${screenerId}/run`
        );
        if (timestamp) {
          const isoString = timestamp.toISOString();
          url.searchParams.set("timestamp", isoString);
          log.debug("[useScreeners] Running historical screener", {
            screenerId,
            timestamp: isoString,
            url: url.toString(),
          });
        } else {
          log.debug("[useScreeners] Running live screener", {
            screenerId,
            url: url.toString(),
          });
        }

        const response = await fetch(url.toString(), {
          method: "POST",
        });

        if (!response.ok) {
          const errorText = await response.text();
          log.error("[useScreeners] Screener API error", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
          throw new Error(`Failed to run screener: ${response.statusText}`);
        }

        const result = await response.json();
        log.debug("[useScreeners] Screener run result", {
          ticker_count: result.ticker_count,
          results_length: result.results?.length || 0,
          has_results: !!result.results,
        });
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to run screener";
        setError(message);
        log.error("[useScreeners] Error running screener", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const saveScreener = useCallback(
    async (
      screener:
        | Omit<ScreeningCriteria, "id" | "created_at" | "updated_at">
        | ScreeningCriteria
    ): Promise<ScreeningCriteria | null> => {
      try {
        setLoading(true);
        setError(null);

        const isUpdate = "id" in screener;
        const url = isUpdate
          ? `${API_BASE}/api/screening-criteria/${screener.id}`
          : `${API_BASE}/api/screening-criteria`;

        const response = await fetch(url, {
          method: isUpdate ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: screener.name,
            description: screener.description,
            criteria: screener.criteria,
          }),
        });

        if (!response.ok) {
          throw new Error(
            `Failed to ${isUpdate ? "update" : "create"} screener: ${
              response.statusText
            }`
          );
        }

        const saved = await response.json();

        // Update local state
        if (isUpdate) {
          setScreeners((prev) =>
            prev.map((s) => (s.id === saved.id ? saved : s))
          );
        } else {
          setScreeners((prev) => [...prev, saved]);
        }

        log.debug(`${isUpdate ? "Updated" : "Created"} screener`, {
          id: saved.id,
        });
        return saved;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : `Failed to ${"id" in screener ? "update" : "create"} screener`;
        setError(message);
        log.error("Error saving screener", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteScreener = useCallback(
    async (screenerId: string): Promise<boolean> => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${API_BASE}/api/screening-criteria/${screenerId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to delete screener: ${response.statusText}`);
        }

        // Update local state
        setScreeners((prev) => prev.filter((s) => s.id !== screenerId));

        log.debug("Deleted screener", { id: screenerId });
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete screener";
        setError(message);
        log.error("Error deleting screener", err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    screeners,
    loading,
    error,
    loadScreeners,
    runScreener,
    runScreenerWithCriteria,
    saveScreener,
    deleteScreener,
  };
}
