/**
 * Real-time WebSocket hook for fund updates
 *
 * Uses the unified WebSocket connection to receive real-time updates for a specific fund.
 * No longer creates individual WebSocket connections - leverages the shared connection
 * from WebSocketProvider.
 */

import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { useEffect } from "react";
import type { Fund, Order, Transaction, Transfer } from "../types";

export interface FundPerformance {
  cashBalance: number;
  positionValue: number;
  aum: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  unrealizedPl: number;
}

interface FundPosition {
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  costBasis: number;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlpc: number | null;
}

interface PositionsSummary {
  positionCount: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
}

interface FundRealtimeData {
  fund: Fund | null;
  orders: Order[];
  transactions: Transaction[];
  transfers: Transfer[];
  positions: FundPosition[];
  positionsSummary: PositionsSummary;
  performance: FundPerformance | null;
}

interface UseFundRealtimeResult {
  data: FundRealtimeData;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
}

const EMPTY_FUND_DATA: FundRealtimeData = {
  fund: null,
  orders: [],
  transactions: [],
  transfers: [],
  positions: [],
  positionsSummary: {
    positionCount: 0,
    totalMarketValue: 0,
    totalUnrealizedPl: 0,
  },
  performance: null,
};

export function useFundRealtime(fundId: string | null): UseFundRealtimeResult {
  const { fundData, subscribeToFund, unsubscribeFromFund, isConnected, error } =
    useWebSocketContext();

  // Subscribe to fund updates on mount, unsubscribe on unmount
  // Note: We intentionally omit subscribeToFund/unsubscribeFromFund from deps
  // to avoid re-subscribing when the callback reference changes
  useEffect(() => {
    if (fundId) {
      subscribeToFund(fundId);

      return () => {
        unsubscribeFromFund(fundId);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundId]);

  // Get the data for this specific fund
  const data = fundId ? fundData.get(fundId) : null;

  return {
    data: data || EMPTY_FUND_DATA,
    isConnected,
    isConnecting: !data && isConnected, // Connecting if we're connected but don't have data yet
    error,
    reconnect: () => {
      // Reconnection is handled by WebSocketProvider
      // This is here for API compatibility
    },
  };
}
