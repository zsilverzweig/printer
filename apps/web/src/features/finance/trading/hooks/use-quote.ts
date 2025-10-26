"use client";

import { useCallback, useRef, useState } from "react";

import { useAuth } from "@/lib/hooks/use-auth";
import { toast } from "@/lib/utils/toast";

import { useTradingContext } from "../contexts/trading-context";

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  bid_size: number;
  ask_size: number;
  timestamp: string;
}

export function useQuote() {
  const { user } = useAuth();
  const { environment } = useTradingContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { quote: Quote; timestamp: number }>>(
    new Map()
  );
  const pendingRequestsRef = useRef<Set<string>>(new Set());

  const fetchQuote = useCallback(
    async (symbol: string): Promise<Quote | null> => {
      if (!user?.uid || !symbol) {
        return null;
      }

      const cacheKey = `${symbol}-${environment}`;
      const now = Date.now();
      const CACHE_DURATION = 30000; // 30 seconds cache

      // Check cache first
      const cached = cacheRef.current.get(cacheKey);
      if (cached && now - cached.timestamp < CACHE_DURATION) {
        return cached.quote;
      }

      // Prevent duplicate requests for the same symbol
      if (pendingRequestsRef.current.has(cacheKey)) {
        return null;
      }

      pendingRequestsRef.current.add(cacheKey);
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/trading/quote?userId=${user.uid}&symbol=${symbol}&environment=${environment}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch quote");
        }

        const data = await response.json();

        // Cache the result
        cacheRef.current.set(cacheKey, {
          quote: data.quote,
          timestamp: now,
        });

        return data.quote;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to fetch quote";
        setError(errorMessage);

        // Show toast notification for specific error types
        if (errorMessage.includes("Market Data API subscription required")) {
          toast.error(
            "Real-time pricing requires an Alpaca Market Data subscription. Please upgrade your account or use estimated pricing."
          );
        } else if (errorMessage.includes("Invalid stock symbol")) {
          toast.error(
            "Please enter a valid stock symbol (e.g., AAPL, MSFT, GOOGL)."
          );
        } else if (errorMessage.includes("Rate limit exceeded")) {
          toast.error(
            "Too many requests. Please wait a moment before trying again."
          );
        } else if (errorMessage.includes("Market data service error")) {
          toast.error(
            "Unable to fetch current market data. Please try again later."
          );
        } else {
          toast.error(
            "Unable to fetch current price. Please check your connection and try again."
          );
        }

        return null;
      } finally {
        setLoading(false);
        pendingRequestsRef.current.delete(cacheKey);
      }
    },
    [user?.uid, environment]
  );

  return {
    fetchQuote,
    loading,
    error,
  };
}
