/**
 * Hook to get fund positions with real-time WebSocket refresh triggers.
 */

import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

interface PositionOrderSummary {
  id: string;
  symbol: string;
  side: string;
  status: string;
  quantity: number;
  filledQty: number | null;
  submittedAt: string | null;
  filledAt: string | null;
}

interface PositionTradeSummary {
  id: string;
  status: string;
  entryOrderId: string | null;
  exitOrderId: string | null;
  entryTime: string | null;
  exitTime: string | null;
}

export interface FundPositionDetail {
  symbol: string;
  source: "database" | "alpaca_only";
  quantity: number;
  avgEntryPrice: number | null;
  costBasis: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPercent: number | null;
  tradeId: string | null;
  trade: PositionTradeSummary | null;
  orders: PositionOrderSummary[];
  alpacaQuantity: number | null;
  alpacaAvgEntryPrice: number | null;
}

interface SyncIssues {
  in_alpaca_not_db: string[];
  in_db_not_alpaca: string[];
}

interface UseFundPositionsReturn {
  positions: FundPositionDetail[];
  syncIssues: SyncIssues | null;
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

  const [positions, setPositions] = useState<FundPositionDetail[]>([]);
  const [syncIssues, setSyncIssues] = useState<SyncIssues | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapPositionDetails = useCallback((response: any): FundPositionDetail[] => {
    if (Array.isArray(response?.position_details)) {
      return response.position_details.map((position: any) => {
        const orders: PositionOrderSummary[] = Array.isArray(position.orders)
          ? position.orders.map((order: any) => ({
              id: order.id,
              symbol: order.symbol,
              side: order.side,
              status: order.status,
              quantity: Number(order.quantity ?? 0),
              filledQty: order.filled_qty ?? order.filledQty ?? null,
              submittedAt: order.submitted_at ?? order.submittedAt ?? null,
              filledAt: order.filled_at ?? order.filledAt ?? null,
            }))
          : [];

        const tradeData = position.trade ?? null;
        const trade: PositionTradeSummary | null = tradeData
          ? {
              id: tradeData.id,
              status: tradeData.status,
              entryOrderId: tradeData.entry_order_id ?? tradeData.entryOrderId ?? null,
              exitOrderId: tradeData.exit_order_id ?? tradeData.exitOrderId ?? null,
              entryTime: tradeData.entry_time ?? tradeData.entryTime ?? null,
              exitTime: tradeData.exit_time ?? tradeData.exitTime ?? null,
            }
          : null;

        const alpacaSnapshot = position.alpaca_snapshot ?? null;

        const quantity = toNumber(position.quantity ?? position.qty) ?? 0;
        const avgEntryPrice = toNumber(
          position.avg_entry_price ?? position.avgEntryPrice
        );
        const costBasis = toNumber(
          position.cost_basis ?? position.costBasis
        );
        const currentPrice = toNumber(
          position.current_price ?? position.currentPrice
        );
        const marketValue = toNumber(
          position.market_value ?? position.marketValue
        );
        const unrealizedPl = toNumber(
          position.unrealized_pl ?? position.unrealizedPl
        );
        const unrealizedPlPercent = toNumber(
          position.unrealized_plpc ?? position.unrealizedPlpc
        );
        const alpacaQuantity = toNumber(
          alpacaSnapshot?.qty ?? position.alpacaQuantity
        );
        const alpacaAvgEntryPrice = toNumber(
          alpacaSnapshot?.avg_entry_price ?? position.alpacaAvgEntryPrice
        );

        return {
          symbol: position.symbol,
          source: position.source === "alpaca_only" ? "alpaca_only" : "database",
          quantity,
          avgEntryPrice,
          costBasis,
          currentPrice,
          marketValue,
          unrealizedPl,
          unrealizedPlPercent,
          tradeId: position.trade_id ?? position.tradeId ?? null,
          trade,
          orders,
          alpacaQuantity,
          alpacaAvgEntryPrice,
        };
      });
    }

    // Backward compatibility fallback for older API responses.
    return Array.isArray(response?.database_positions)
      ? response.database_positions.map((pos: any) => ({
          symbol: pos.symbol,
          source: "database" as const,
          quantity: toNumber(pos.qty ?? pos.quantity) ?? 0,
          avgEntryPrice: toNumber(pos.avg_entry_price),
          costBasis: toNumber(pos.cost_basis),
          currentPrice: null,
          marketValue: null,
          unrealizedPl: null,
          unrealizedPlPercent: null,
          tradeId: pos.trade_id ?? null,
          trade: null,
          orders: [],
          alpacaQuantity: null,
          alpacaAvgEntryPrice: null,
        }))
      : [];
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!fundId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_BASE}/api/funds/${fundId}/positions`);
      if (!response.ok) throw new Error("Failed to fetch positions");
      const result = await response.json();

      setPositions(mapPositionDetails(result));
      setSyncIssues(result.sync_issues ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch positions"
      );
    } finally {
      setLoading(false);
    }
  }, [fundId, mapPositionDetails]);

  // Subscribe to fund updates
  useEffect(() => {
    if (!fundId) return;
    subscribeToFund(fundId);
    return () => {
      unsubscribeFromFund(fundId);
    };
  }, [fundId, subscribeToFund, unsubscribeFromFund]);

  // Fetch initial data on mount
  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  // Refresh when we receive WebSocket updates for this fund (throttled by lastUpdate)
  useEffect(() => {
    if (!fundId || !isConnected) return;
    const realtime = fundData.get(fundId);
    if (realtime?.positions) {
      void fetchPositions();
    }
  }, [fundId, fundData, fetchPositions, isConnected, lastUpdate]);

  return {
    positions,
    syncIssues,
    loading,
    error,
    refresh: fetchPositions,
  };
}
