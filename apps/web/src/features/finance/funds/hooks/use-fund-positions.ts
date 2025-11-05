/**
 * Hook to get fund positions with real-time WebSocket updates
 */

import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { useCallback, useEffect, useState } from "react";

interface DatabasePosition {
  symbol: string;
  qty: number;
  source: string;
}

interface UseFundPositionsReturn {
  positions: DatabasePosition[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFundPositions(fundId: string): UseFundPositionsReturn {
  const {
    subscribeToFund,
    unsubscribeFromFund,
    fundData,
    isConnected,
    lastUpdate,
  } = useWebSocketContext();
  const [positions, setPositions] = useState<DatabasePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to fund updates
  useEffect(() => {
    if (!fundId) return;
    subscribeToFund(fundId);
    return () => {
      unsubscribeFromFund(fundId);
    };
  }, [fundId, subscribeToFund, unsubscribeFromFund]);

  // Fetch initial positions
  const fetchPositions = useCallback(async () => {
    if (!fundId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/positions`
      );
      if (!response.ok) throw new Error("Failed to fetch positions");
      const result = await response.json();
      setPositions(result.database_positions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch positions"
      );
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  // Fetch initial data on mount
  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  // Subscribe to real-time updates from WebSocket
  useEffect(() => {
    if (!fundId || !isConnected) return;

    const fundRealtimeData = fundData.get(fundId);
    if (fundRealtimeData?.positions) {
      // Transform WebSocket positions to match our format
      const transformedPositions: DatabasePosition[] =
        fundRealtimeData.positions.map((pos: any) => ({
          symbol: pos.symbol,
          qty: pos.quantity || pos.qty,
          source: "database",
        }));
      setPositions(transformedPositions);
      setLoading(false);
    }
  }, [fundId, isConnected, fundData, lastUpdate]);

  return {
    positions,
    loading,
    error,
    refresh: fetchPositions,
  };
}
