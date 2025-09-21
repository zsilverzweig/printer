"use client";

import { useAuthContext } from "@/lib/providers/auth-provider";
import {
  AlpacaAccount,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaPosition,
} from "@/lib/types";
import { log } from "@/lib/utils/logger";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseAlpacaTradingReturn {
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  orders: AlpacaOrder[];
  loading: boolean;
  isPlacingOrder: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  placeOrder: (order: AlpacaOrderRequest) => Promise<AlpacaOrder>;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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

export function useAlpacaTrading(): UseAlpacaTradingReturn {
  const { isAdmin } = useAuthContext();
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const resetState = useCallback(() => {
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setLastUpdated(null);
  }, []);

  const loadTradingData = useCallback(async () => {
    if (!isAdmin) {
      resetState();
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [accountResponse, positionsResponse, ordersResponse] =
        await Promise.all([
          fetchJson<{ account: AlpacaAccount }>("/api/alpaca/account"),
          fetchJson<{ positions: AlpacaPosition[] }>("/api/alpaca/positions"),
          fetchJson<{ orders: AlpacaOrder[] }>("/api/alpaca/orders?status=all&limit=25"),
        ]);

      setAccount(accountResponse.account);
      setPositions(positionsResponse.positions);
      setOrders(ordersResponse.orders);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load Alpaca data";
      setError(message);
      log.error("Failed to load Alpaca data", err, "useAlpacaTrading");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, resetState]);

  useEffect(() => {
    void loadTradingData();
  }, [loadTradingData]);

  const placeOrder = useCallback(
    async (order: AlpacaOrderRequest): Promise<AlpacaOrder> => {
      if (!isAdmin) {
        throw new Error("Only administrators can place Alpaca orders");
      }

      try {
        setIsPlacingOrder(true);
        setError(null);

        const response = await fetchJson<{ order: AlpacaOrder }>("/api/alpaca/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(order),
        });

        await loadTradingData();
        return response.order;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit Alpaca order";
        setError(message);
        log.error("Failed to submit Alpaca order", err, "useAlpacaTrading");
        throw err;
      } finally {
        setIsPlacingOrder(false);
      }
    },
    [isAdmin, loadTradingData]
  );

  const value: UseAlpacaTradingReturn = useMemo(
    () => ({
      account,
      positions,
      orders,
      loading,
      isPlacingOrder,
      error,
      lastUpdated,
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
      loadTradingData,
      placeOrder,
    ]
  );

  return value;
}
