"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthContext } from "@/lib/providers/auth-provider";
import {
  AlpacaAccount,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaPosition,
} from "@/lib/types";
import { log } from "@/lib/utils/logger";

export interface UseTradingReturn {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  loading: boolean;
  isPlacingOrder: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  refresh: () => Promise<void>;
  placeOrder: (order: AlpacaOrderRequest) => Promise<AlpacaOrder>;
}

async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init);
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    let message: string | undefined;
    if (typeof payload === "string") {
      message = payload;
    } else if (payload && typeof payload === "object" && "error" in payload) {
      message = String((payload as Record<string, unknown>).error);
    }

    throw new Error(message || response.statusText || "Request failed");
  }

  if (typeof payload === "string" || payload === null) {
    throw new Error("Unexpected response format");
  }

  return payload as T;
}

export function useTrading(): UseTradingReturn {
  const { user } = useAuthContext();
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const resetState = useCallback(() => {
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setLastUpdated(null);
    setIsConnected(false);
  }, []);

  const checkConnectionStatus = useCallback(async () => {
    if (!user?.uid) {
      resetState();
      return;
    }

    try {
      // Check if user has connected their trading account
      const response = await fetchJson<{ connected: boolean }>(
        `/api/trading/status?userId=${user.uid}`
      );

      setIsConnected(response.connected);

      if (!response.connected) {
        resetState();
      }
    } catch (err) {
      log.error("Failed to check trading connection status", err, "useTrading");
      setIsConnected(false);
      resetState();
    }
  }, [user?.uid, resetState]);

  const loadTradingData = useCallback(async () => {
    if (!user?.uid || !isConnected) {
      resetState();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [accountResponse, positionsResponse, ordersResponse] =
        await Promise.all([
          fetchJson<{ account: AlpacaAccount }>(
            `/api/trading/account?userId=${user.uid}`
          ),
          fetchJson<{ positions: AlpacaPosition[] }>(
            `/api/trading/positions?userId=${user.uid}`
          ),
          fetchJson<{ orders: AlpacaOrder[] }>(
            `/api/trading/orders?userId=${user.uid}&status=all&limit=25`
          ),
        ]);

      setAccount(accountResponse.account);
      setPositions(positionsResponse.positions);
      setOrders(ordersResponse.orders);
      setLastUpdated(new Date());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load trading data";
      setError(message);

      // If it's an authentication error, mark as disconnected
      if (
        message.includes("authentication") ||
        message.includes("unauthorized")
      ) {
        setIsConnected(false);
        resetState();
      }

      log.error("Failed to load trading data", err, "useTrading");
    } finally {
      setLoading(false);
    }
  }, [user?.uid, isConnected, resetState]);

  useEffect(() => {
    void checkConnectionStatus();
  }, [checkConnectionStatus]);

  useEffect(() => {
    if (isConnected) {
      void loadTradingData();
    }
  }, [loadTradingData, isConnected]);

  const placeOrder = useCallback(
    async (order: AlpacaOrderRequest): Promise<AlpacaOrder> => {
      if (!user?.uid) {
        throw new Error("User not authenticated");
      }

      if (!isConnected) {
        throw new Error("Trading account not connected");
      }

      try {
        setIsPlacingOrder(true);
        setError(null);

        const response = await fetchJson<{ order: AlpacaOrder }>(
          `/api/trading/orders?userId=${user.uid}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order),
          }
        );

        await loadTradingData();
        return response.order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit order";
        setError(message);
        log.error("Failed to submit order", err, "useTrading");
        throw err;
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [user?.uid, isConnected, loadTradingData]
  );

  const value: UseTradingReturn = useMemo(
    () => ({
      account,
      positions,
      orders,
      loading,
      isPlacingOrder,
      error,
      lastUpdated,
      isConnected,
      refresh: loadTradingData,
      placeOrder,
    }),
    [
      account,
      positions,
      orders,
      loading,
      isPlacingOrder,
      error,
      lastUpdated,
      isConnected,
      loadTradingData,
      placeOrder,
    ]
  );

  return value;
}
