/**
 * Real-time WebSocket hook for fund updates
 *
 * Connects to the fund WebSocket endpoint and streams real-time updates
 * for orders, transactions, transfers, and balance changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Fund, Order, Transaction, Transfer } from "../types";

/**
 * Transform snake_case API response to camelCase Fund object
 */
function transformFundData(data: any): Fund {
  if (!data) return data;

  return {
    ...data,
    iconColor: data.icon_color ?? data.iconColor,
    strategyId: data.strategy_id ?? data.strategyId,
    strategyConfig: data.strategy_config ?? data.strategyConfig ?? {},
    screeningCriteriaId: data.screening_criteria_id ?? data.screeningCriteriaId,
    maxLossPercent: data.max_loss_percent ?? data.maxLossPercent,
    maxLossDollars: data.max_loss_dollars ?? data.maxLossDollars,
    maxGivebackPercent: data.max_giveback_percent ?? data.maxGivebackPercent,
    maxOrderAgeSeconds: data.max_order_age_seconds ?? data.maxOrderAgeSeconds,
    sizePerTrade: data.size_per_trade ?? data.sizePerTrade ?? 1000.0,
    minBetPercent: data.min_bet_percent ?? data.minBetPercent,
    maxBetPercent: data.max_bet_percent ?? data.maxBetPercent,
    maxTotalExposure: data.max_total_exposure ?? data.maxTotalExposure,
    tradingStartTime: data.trading_start_time ?? data.tradingStartTime,
    tradingEndTime: data.trading_end_time ?? data.tradingEndTime,
    createdAt: data.created_at ?? data.createdAt,
    updatedAt: data.updated_at ?? data.updatedAt,
  } as Fund;
}

/**
 * Transform snake_case transaction to camelCase
 */
function transformTransaction(data: any): Transaction {
  if (!data) return data;

  return {
    ...data,
    totalValue: data.total_value ?? data.totalValue,
    fundId: data.fund_id ?? data.fundId,
  } as Transaction;
}

/**
 * Transform snake_case transfer to camelCase
 */
function transformTransfer(data: any): Transfer {
  if (!data) return data;

  return {
    ...data,
    fundId: data.fund_id ?? data.fundId,
    transferType: data.transfer_type ?? data.transferType,
  } as Transfer;
}

interface FundSnapshot {
  fund: Fund;
  orders: Order[];
  transactions: Transaction[];
  transfers: Transfer[];
}

interface FundUpdate {
  type: "update";
  category: "orders" | "transactions" | "transfers" | "balance";
  event_type: string;
  timestamp: string;
  data: any;
}

interface FundRealtimeData {
  fund: Fund | null;
  orders: Order[];
  transactions: Transaction[];
  transfers: Transfer[];
}

interface UseFundRealtimeResult {
  data: FundRealtimeData;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
}

const WS_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace("http://", "ws://").replace(
      "https://",
      "wss://"
    )
  : "ws://localhost:8000/api";

const PING_INTERVAL = 5000; // 5 seconds
const RECONNECT_DELAY = 2000; // 2 seconds

export function useFundRealtime(fundId: string | null): UseFundRealtimeResult {
  const [data, setData] = useState<FundRealtimeData>({
    fund: null,
    orders: [],
    transactions: [],
    transfers: [],
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const cleanup = useCallback(() => {
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (!fundId) return;

    cleanup();
    setIsConnecting(true);
    setError(null);

    try {
      const ws = new WebSocket(`${WS_BASE_URL}/funds/${fundId}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[Fund ${fundId}] WebSocket connected`);
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "ping",
                timestamp: Date.now(),
              })
            );
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === "snapshot") {
            // Initial snapshot - transform all snake_case to camelCase
            const snapshot: FundSnapshot = message.snapshot;
            setData({
              fund: transformFundData(snapshot.fund),
              orders: snapshot.orders.map((o: any) => o), // Orders are already handled elsewhere
              transactions: snapshot.transactions.map(transformTransaction),
              transfers: snapshot.transfers.map(transformTransfer),
            });
            console.log(`[Fund ${fundId}] Received snapshot`);
          } else if (message.type === "update") {
            // Real-time update
            const update: FundUpdate = message;
            handleUpdate(update);
          } else if (message.type === "pong") {
            // Pong received - connection is alive
            console.debug(`[Fund ${fundId}] Pong received`);
          }
        } catch (err) {
          console.error(`[Fund ${fundId}] Error parsing message:`, err);
        }
      };

      ws.onerror = (event) => {
        console.error(`[Fund ${fundId}] WebSocket error:`, event);
        setError("Connection error occurred");
      };

      ws.onclose = (event) => {
        console.log(`[Fund ${fundId}] WebSocket closed (code: ${event.code})`);
        setIsConnected(false);
        setIsConnecting(false);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Auto-reconnect if should reconnect
        if (shouldReconnectRef.current && fundId) {
          console.log(
            `[Fund ${fundId}] Reconnecting in ${RECONNECT_DELAY}ms...`
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        }
      };
    } catch (err) {
      console.error(`[Fund ${fundId}] Error creating WebSocket:`, err);
      setError("Failed to create connection");
      setIsConnecting(false);
    }
  }, [fundId, cleanup]);

  const handleUpdate = useCallback((update: FundUpdate) => {
    console.log(`[Fund Update] ${update.category}: ${update.event_type}`);

    setData((prevData) => {
      const newData = { ...prevData };

      switch (update.category) {
        case "orders":
          if (update.event_type === "order_created") {
            // Add new order at the beginning
            newData.orders = [update.data, ...prevData.orders];
          } else if (update.event_type === "order_updated") {
            // Update existing order
            newData.orders = prevData.orders.map((order) =>
              order.id === update.data.id ? { ...order, ...update.data } : order
            );
          } else if (update.event_type === "order_deleted") {
            // Remove order
            newData.orders = prevData.orders.filter(
              (order) => order.id !== update.data.id
            );
          }
          break;

        case "transactions":
          if (update.event_type === "transaction_created") {
            // Add new transaction at the beginning (transform snake_case)
            newData.transactions = [
              transformTransaction(update.data),
              ...prevData.transactions,
            ];
          } else if (update.event_type === "transaction_updated") {
            // Update existing transaction
            newData.transactions = prevData.transactions.map((txn) =>
              txn.id === update.data.id
                ? transformTransaction({ ...txn, ...update.data })
                : txn
            );
          } else if (update.event_type === "transaction_deleted") {
            // Remove transaction
            newData.transactions = prevData.transactions.filter(
              (txn) => txn.id !== update.data.id
            );
          }
          break;

        case "transfers":
          if (update.event_type === "transfer_created") {
            // Add new transfer at the beginning (transform snake_case)
            newData.transfers = [
              transformTransfer(update.data),
              ...prevData.transfers,
            ];
          } else if (update.event_type === "transfer_updated") {
            // Update existing transfer
            newData.transfers = prevData.transfers.map((transfer) =>
              transfer.id === update.data.id
                ? transformTransfer({ ...transfer, ...update.data })
                : transfer
            );
          } else if (update.event_type === "transfer_deleted") {
            // Remove transfer
            newData.transfers = prevData.transfers.filter(
              (transfer) => transfer.id !== update.data.id
            );
          }
          break;

        case "balance":
          if (update.event_type === "balance_changed" && prevData.fund) {
            // Update fund balance - transform in case data comes in snake_case
            newData.fund = transformFundData({
              ...prevData.fund,
              balance: update.data.balance,
            });
          }
          break;
      }

      return newData;
    });
  }, []);

  const reconnect = useCallback(() => {
    console.log(`[Fund ${fundId}] Manual reconnect requested`);
    connect();
  }, [fundId, connect]);

  // Connect on mount or when fundId changes
  useEffect(() => {
    if (!fundId) {
      cleanup();
      return;
    }

    shouldReconnectRef.current = true;
    connect();

    // Cleanup on unmount
    return () => {
      shouldReconnectRef.current = false;
      cleanup();
    };
  }, [fundId, connect, cleanup]);

  return {
    data,
    isConnected,
    isConnecting,
    error,
    reconnect,
  };
}
