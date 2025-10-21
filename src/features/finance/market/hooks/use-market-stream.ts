"use client";

import { useEffect, useMemo } from "react";

import { useWebSocket } from "@/lib/hooks/use-websocket";

export interface UseMarketStreamOptions {
  endpoint?: string; // default uses NEXT_PUBLIC_MARKET_WS_URL
  subs: string; // e.g., "AM.*" or comma-separated list
  onMessage?: (msg: unknown) => void;
}

export function useMarketStream({
  endpoint = process.env.NEXT_PUBLIC_MARKET_WS_URL as string,
  subs,
  onMessage,
}: UseMarketStreamOptions) {
  // Build URL with optional query param for server implementations that accept subs in query
  const url = useMemo(() => {
    try {
      const hasQuery = endpoint.includes("?");
      const separator = hasQuery ? "&" : "?";
      return `${endpoint}${
        subs ? `${separator}subs=${encodeURIComponent(subs)}` : ""
      }`;
    } catch {
      return endpoint;
    }
  }, [endpoint, subs]);

  const { isConnected, isConnecting, lastMessage, error } =
    useWebSocket<unknown>(url);

  useEffect(() => {
    if (lastMessage != null && onMessage) {
      onMessage(lastMessage);
    }
  }, [lastMessage, onMessage]);

  return { isConnected, isConnecting, error };
}
