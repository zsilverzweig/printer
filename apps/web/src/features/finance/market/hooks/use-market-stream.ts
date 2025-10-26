"use client";

import { useEffect, useMemo } from "react";

import { useWebSocket } from "@/lib/hooks/use-websocket";
import { log } from "@/lib/utils/logger";

export interface UseMarketStreamOptions {
  endpoint?: string; // default uses NEXT_PUBLIC_MARKET_WS_URL
  subs: string; // e.g., "AM.*" or comma-separated list
  onMessage?: (msg: unknown) => void;
  subscribeOnOpen?: boolean; // send a subscribe message when connected
  buildSubscribeMessage?: (subs: string) => unknown; // defaults to { action: "subscribe", params: subs }
  debug?: boolean; // enable verbose WS logging
}

export function useMarketStream({
  endpoint = process.env.NEXT_PUBLIC_MARKET_WS_URL as string,
  subs,
  onMessage,
  subscribeOnOpen = false,
  buildSubscribeMessage,
  debug = false,
}: UseMarketStreamOptions) {
  // Build URL with optional query param for server implementations that accept subs in query
  const url = useMemo(() => {
    try {
      if (!endpoint) {
        log.error("[MarketStream] No endpoint configured", {
          NEXT_PUBLIC_MARKET_WS_URL: process.env.NEXT_PUBLIC_MARKET_WS_URL,
        });
        return "";
      }
      const hasQuery = endpoint.includes("?");
      const separator = hasQuery ? "&" : "?";
      const finalUrl = `${endpoint}${
        subs ? `${separator}subs=${encodeURIComponent(subs)}` : ""
      }`;
      if (debug) {
        log.debug("[MarketStream] Building WebSocket URL", {
          endpoint,
          subs,
          finalUrl,
          envVarSet: !!process.env.NEXT_PUBLIC_MARKET_WS_URL,
        });
      }
      return finalUrl;
    } catch (err) {
      log.error("[MarketStream] Error building URL", { err, endpoint });
      return endpoint || "";
    }
  }, [endpoint, subs, debug]);

  const { isConnected, isConnecting, lastMessage, error, sendJson } =
    useWebSocket<unknown>(url, { debug });

  useEffect(() => {
    if (lastMessage != null && onMessage) {
      if (debug) {
        try {
          const preview = Array.isArray(lastMessage)
            ? (lastMessage as unknown[])[0]
            : lastMessage;
          log.debug("[MarketStream] onMessage", {
            type: typeof lastMessage,
            preview,
          });
        } catch {}
      }
      onMessage(lastMessage);
    }
  }, [lastMessage, onMessage]);

  useEffect(() => {
    if (!subscribeOnOpen) return;
    if (!isConnected) return;
    const payload = buildSubscribeMessage
      ? buildSubscribeMessage(subs)
      : { action: "subscribe", params: subs };
    try {
      if (debug) {
        log.info("[MarketStream] sending subscribe", { payload });
      }
      sendJson(payload);
    } catch {}
    // run on connect only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, subscribeOnOpen, subs]);

  useEffect(() => {
    if (!debug) return;
    log.debug("[MarketStream] status", { url, isConnecting, isConnected });
  }, [debug, url, isConnecting, isConnected]);

  return { isConnected, isConnecting, error, sendJson };
}
