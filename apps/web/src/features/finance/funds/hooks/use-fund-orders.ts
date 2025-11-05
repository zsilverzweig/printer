/**
 * Hook to get fund orders with real-time WebSocket updates
 */

import { useWebSocketContext } from "@/lib/providers/websocket-provider";
import { useCallback, useEffect, useState } from "react";

interface Order {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  order_type: string;
  submitted_at: string;
  filled_at: string | null;
  filled_qty: number | null;
  filled_avg_price: number | null;
  alpaca_order_id: string;
}

interface UseFundOrdersReturn {
  orders: Order[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useFundOrders(fundId: string): UseFundOrdersReturn {
  const {
    subscribeToFund,
    unsubscribeFromFund,
    fundData,
    isConnected,
    lastUpdate,
  } = useWebSocketContext();
  const [orders, setOrders] = useState<Order[]>([]);
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

  // Fetch initial orders
  const fetchOrders = useCallback(async () => {
    if (!fundId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/orders?limit=100`
      );
      if (!response.ok) throw new Error("Failed to fetch orders");
      const data = await response.json();

      // Transform snake_case to camelCase
      const transformedOrders: Order[] = (Array.isArray(data) ? data : []).map(
        (order: any) => ({
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          status: order.status,
          order_type: order.order_type,
          submitted_at: order.submitted_at,
          filled_at: order.filled_at,
          filled_qty: order.filled_qty,
          filled_avg_price: order.filled_avg_price,
          alpaca_order_id: order.alpaca_order_id,
        })
      );
      setOrders(transformedOrders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  // Fetch initial data on mount
  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Subscribe to real-time updates from WebSocket
  useEffect(() => {
    if (!fundId || !isConnected) return;

    const fundRealtimeData = fundData.get(fundId);
    if (fundRealtimeData?.orders) {
      // Transform WebSocket orders to match our format
      const transformedOrders: Order[] = fundRealtimeData.orders.map(
        (order: any) => ({
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          status: order.status,
          order_type: order.order_type || order.orderType,
          submitted_at: order.submitted_at || order.submittedAt,
          filled_at: order.filled_at || order.filledAt || null,
          filled_qty: order.filled_qty || order.filledQty || null,
          filled_avg_price:
            order.filled_avg_price || order.filledAvgPrice || null,
          alpaca_order_id: order.alpaca_order_id || order.alpacaOrderId || "",
        })
      );
      setOrders(transformedOrders);
      setLoading(false);
    }
  }, [fundId, isConnected, fundData, lastUpdate]);

  return {
    orders,
    loading,
    error,
    refresh: fetchOrders,
  };
}
