/**
 * Hook to fetch complete fund ledger data
 * 
 * Fetches orders, transactions, and transfers for a fund
 */

import { useCallback, useEffect, useState } from "react";
import { FundOrder, FundTransaction, FundTransfer } from "../types";

export interface UseFundLedgerReturn {
  orders: FundOrder[];
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFundLedger(fundId: string): UseFundLedgerReturn {
  const [orders, setOrders] = useState<FundOrder[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedgerData = useCallback(async () => {
    if (!fundId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch all three types in parallel
      const [ordersRes, transactionsRes, transfersRes] = await Promise.all([
        fetch(`http://localhost:8000/api/funds/${fundId}/orders`),
        fetch(`http://localhost:8000/api/funds/${fundId}/transactions`),
        fetch(`http://localhost:8000/api/funds/${fundId}/transfers`),
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

      const ordersData = await ordersRes.json();
      const transactionsData = await transactionsRes.json();
      const transfersData = await transfersRes.json();

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

      setOrders(transformedOrders);
      setTransactions(transformedTransactions);
      setTransfers(transformedTransfers);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch ledger data";
      setError(message);
      console.error("Error fetching ledger data:", err);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void fetchLedgerData();
  }, [fetchLedgerData]);

  return {
    orders,
    transactions,
    transfers,
    loading,
    error,
    refresh: fetchLedgerData,
  };
}

