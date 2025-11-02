/**
 * Hook to fetch complete fund ledger data
 *
 * Fetches orders, transactions, transfers, and positions for a fund.
 * Position prices are now updated via WebSocket, not polling!
 */

import { useCallback, useEffect, useState } from "react";

import { FundOrder, FundTransaction, FundTransfer } from "../types";

export interface FundPosition {
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  costBasis: number;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlpc: number | null;
}

export interface PositionsSummary {
  positionCount: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
}

export interface UseFundLedgerReturn {
  orders: FundOrder[];
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  positions: FundPosition[];
  positionsSummary: PositionsSummary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFundLedger(fundId: string): UseFundLedgerReturn {
  const [orders, setOrders] = useState<FundOrder[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [positions, setPositions] = useState<FundPosition[]>([]);
  const [positionsSummary, setPositionsSummary] = useState<PositionsSummary>({
    positionCount: 0,
    totalMarketValue: 0,
    totalUnrealizedPl: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedgerData = useCallback(async () => {
    if (!fundId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all four types in parallel
      const [ordersRes, transactionsRes, transfersRes, positionsRes] =
        await Promise.all([
          fetch(`http://localhost:8000/api/funds/${fundId}/orders`),
          fetch(`http://localhost:8000/api/funds/${fundId}/transactions`),
          fetch(`http://localhost:8000/api/funds/${fundId}/transfers`),
          fetch(`http://localhost:8000/api/funds/${fundId}/positions/summary`),
        ]);

      if (!ordersRes.ok) {
        throw new Error("Failed to fetch orders");
      }
      if (!transactionsRes.ok) {
        throw new Error("Failed to fetch transactions");
      }
      if (!transfersRes.ok) {
        throw new Error("Failed to fetch transfers");
      }
      if (!positionsRes.ok) {
        throw new Error("Failed to fetch positions");
      }

      const ordersData = await ordersRes.json();
      const transactionsData = await transactionsRes.json();
      const transfersData = await transfersRes.json();
      const positionsData = await positionsRes.json();

      // Transform snake_case to camelCase
      const transformedOrders = ordersData.map((order: any) => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        status: order.status,
        orderType: order.order_type,
        submittedAt: order.submitted_at,
        filledAt: order.filled_at,
        filledQty: order.filled_qty,
        filledAvgPrice: order.filled_avg_price,
        alpacaOrderId: order.alpaca_order_id,
      }));

      const transformedTransactions = transactionsData.map((txn: any) => ({
        id: txn.id,
        symbol: txn.symbol,
        side: txn.side,
        quantity: txn.quantity,
        price: txn.price,
        totalValue: txn.total_value,
        timestamp: txn.timestamp,
      }));

      const transformedTransfers = transfersData.map((transfer: any) => ({
        id: transfer.id,
        fundId: transfer.fund_id,
        amount: transfer.amount,
        transferType: transfer.transfer_type,
        timestamp: new Date(transfer.timestamp),
        notes: transfer.notes,
      }));

      const transformedPositions = positionsData.positions.map((pos: any) => ({
        symbol: pos.symbol,
        quantity: pos.quantity,
        avgEntryPrice: pos.avg_entry_price,
        currentPrice: pos.current_price,
        costBasis: pos.cost_basis,
        marketValue: pos.market_value,
        unrealizedPl: pos.unrealized_pl,
        unrealizedPlpc: pos.unrealized_plpc,
      }));

      setOrders(transformedOrders);
      setTransactions(transformedTransactions);
      setTransfers(transformedTransfers);
      setPositions(transformedPositions);
      setPositionsSummary({
        positionCount: positionsData.summary.position_count,
        totalMarketValue: positionsData.summary.total_market_value,
        totalUnrealizedPl: positionsData.summary.total_unrealized_pl,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch ledger data";
      setError(message);
      // eslint-disable-next-line no-console
      console.error("Error fetching ledger data:", err);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void fetchLedgerData();

    // Position prices are now updated via WebSocket in real-time!
    // No more polling needed - the WebSocket connection handles it automatically.
  }, [fetchLedgerData]);

  return {
    orders,
    transactions,
    transfers,
    positions,
    positionsSummary,
    loading,
    error,
    refresh: fetchLedgerData,
  };
}
