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

import { useTradingContext } from "../contexts/trading-context";

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
    let details: string | undefined;

    if (typeof payload === "string") {
      message = payload;
    } else if (payload && typeof payload === "object") {
      const payloadObj = payload as Record<string, unknown>;
      if ("error" in payloadObj) {
        message = String(payloadObj.error);
      }
      if ("details" in payloadObj) {
        details = String(payloadObj.details);
      }
    }

    const errorMessage = message || response.statusText || "Request failed";
    const fullError = details ? `${errorMessage} (${details})` : errorMessage;

    log.error(
      "API request failed",
      {
        url: input.toString(),
        status: response.status,
        statusText: response.statusText,
        responseText: text.substring(0, 500),
        payload,
        method: init?.method || "GET",
      },
      "fetchJson"
    );

    throw new Error(fullError);
  }

  if (typeof payload === "string" || payload === null) {
    throw new Error("Unexpected response format");
  }

  return payload as T;
}

export function useTrading(): UseTradingReturn {
  const { user } = useAuthContext();
  const { environment } = useTradingContext();
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
            `/api/trading/account?userId=${user.uid}&environment=${environment}`
          ),
          fetchJson<{ positions: AlpacaPosition[] }>(
            `/api/trading/positions?userId=${user.uid}&environment=${environment}`
          ),
          fetchJson<{ orders: AlpacaOrder[] }>(
            `/api/trading/orders?userId=${user.uid}&environment=${environment}&status=all&limit=25`
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
        const error = "User not authenticated";
        setError(error);
        throw new Error(error);
      }

      if (!isConnected) {
        const error = "Trading account not connected";
        setError(error);
        throw new Error(error);
      }

      try {
        setIsPlacingOrder(true);
        setError(null);

        log.debug(
          "Submitting order via API",
          {
            userId: user.uid,
            order: {
              symbol: order.symbol,
              side: order.side,
              type: order.type,
              qty: order.qty,
              notional: order.notional,
              time_in_force: order.time_in_force,
            },
          },
          "useTrading"
        );

        const response = await fetchJson<{ order: AlpacaOrder }>(
          `/api/trading/orders?userId=${user.uid}&environment=${environment}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(order),
          }
        );

        log.success(
          "Order submitted successfully",
          {
            userId: user.uid,
            orderId: response.order.id,
            symbol: order.symbol,
            status: response.order.status,
          },
          "useTrading"
        );

        await loadTradingData();
        return response.order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit order";

        log.failure(
          "Failed to submit order",
          {
            error: message,
            userId: user.uid,
            order: {
              symbol: order.symbol,
              side: order.side,
              type: order.type,
              qty: order.qty,
            },
            errorStack: err instanceof Error ? err.stack : undefined,
          },
          "useTrading"
        );

        setError(message);
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
