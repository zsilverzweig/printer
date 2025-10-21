"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { log } from "@/lib/utils/logger";

// Shared client-side caches to avoid duplicate WS connections across components/HMR
// These live on globalThis to better survive module reloads in dev
type WsGlobals = {
  __PR_WS_CACHE__?: Map<string, WebSocket>;
  __PR_WS_REFCOUNTS__?: Map<string, number>;
  __PR_WS_IDLE_TIMERS__?: Map<string, number>;
};
const __WS_GLOBAL__ = globalThis as unknown as WsGlobals;
if (!__WS_GLOBAL__.__PR_WS_CACHE__)
  __WS_GLOBAL__.__PR_WS_CACHE__ = new Map<string, WebSocket>();
if (!__WS_GLOBAL__.__PR_WS_REFCOUNTS__)
  __WS_GLOBAL__.__PR_WS_REFCOUNTS__ = new Map<string, number>();
if (!__WS_GLOBAL__.__PR_WS_IDLE_TIMERS__)
  __WS_GLOBAL__.__PR_WS_IDLE_TIMERS__ = new Map<string, number>();
const SOCKET_CACHE: Map<string, WebSocket> =
  __WS_GLOBAL__.__PR_WS_CACHE__ || new Map();
const SOCKET_REFCOUNTS: Map<string, number> =
  __WS_GLOBAL__.__PR_WS_REFCOUNTS__ || new Map();
const SOCKET_IDLE_TIMERS: Map<string, number> =
  __WS_GLOBAL__.__PR_WS_IDLE_TIMERS__ || new Map();

export type WebSocketMessage =
  | string
  | ArrayBufferLike
  | Blob
  | ArrayBufferView;

export interface UseWebSocketOptions {
  protocols?: string | string[];
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  debug?: boolean;
}

export interface UseWebSocketReturn<TIncoming = unknown> {
  isConnected: boolean;
  isConnecting: boolean;
  lastMessage: TIncoming | null;
  error: string | null;
  sendJson: (data: unknown) => void;
  sendRaw: (data: WebSocketMessage) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket<TIncoming = unknown>(
  url: string,
  {
    protocols,
    autoReconnect = true,
    reconnectIntervalMs = 2000,
    maxReconnectAttempts = 10,
    debug = false,
  }: UseWebSocketOptions = {}
): UseWebSocketReturn<TIncoming> {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<TIncoming | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manuallyClosedRef = useRef(false);
  const eventHandlersRef = useRef<{
    open?: (ev: Event) => void;
    message?: (event: MessageEvent) => void;
    error?: (event: Event) => void;
    close?: (event: CloseEvent) => void;
  }>({});

  const resolvedUrl = useMemo(() => {
    // Allow relative paths like "/api/ws" to resolve based on current origin
    try {
      const hasProtocol = /^wss?:\/\//i.test(url);
      if (hasProtocol) return url;
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const wsProtocol = origin.startsWith("https") ? "wss" : "ws";
      const httpOrigin = origin.replace(/^https?/, wsProtocol);
      return `${httpOrigin}${url.startsWith("/") ? url : `/${url}`}`;
    } catch {
      return url;
    }
  }, [url]);

  const getSocketKey = useCallback(
    (u: string, p?: string | string[]): string => {
      const proto = Array.isArray(p) ? p.join(",") : p || "";
      return `${u}::${proto}`;
    },
    []
  );

  const getOrCreateSharedSocket = useCallback(
    (u: string, p?: string | string[]): WebSocket => {
      const key = getSocketKey(u, p);
      const existing = SOCKET_CACHE.get(key);
      if (existing && existing.readyState !== WebSocket.CLOSED) {
        return existing;
      }
      const created = new WebSocket(u, p);
      SOCKET_CACHE.set(key, created);
      return created;
    },
    [getSocketKey]
  );

  const cleanup = useCallback(
    (forceImmediate = false) => {
      const performClose = () => {
        const s = socketRef.current;
        const key = getSocketKey(resolvedUrl, protocols);

        // Detach this instance's listeners
        if (s && eventHandlersRef.current) {
          try {
            if (eventHandlersRef.current.open)
              s.removeEventListener("open", eventHandlersRef.current.open);
            if (eventHandlersRef.current.message)
              s.removeEventListener(
                "message",
                eventHandlersRef.current.message
              );
            if (eventHandlersRef.current.error)
              s.removeEventListener("error", eventHandlersRef.current.error);
            if (eventHandlersRef.current.close)
              s.removeEventListener("close", eventHandlersRef.current.close);
          } catch {}
        }
        eventHandlersRef.current = {};

        // Decrement refcount and possibly close shared socket
        const currentCount = (SOCKET_REFCOUNTS.get(key) || 1) - 1;
        if (currentCount <= 0) {
          SOCKET_REFCOUNTS.delete(key);
          const existingTimer = SOCKET_IDLE_TIMERS.get(key);
          if (existingTimer) {
            clearTimeout(existingTimer);
            SOCKET_IDLE_TIMERS.delete(key);
          }
          const delay =
            !forceImmediate && process.env.NODE_ENV === "development"
              ? 1000
              : 0;
          const timerId = window.setTimeout(() => {
            SOCKET_IDLE_TIMERS.delete(key);
            const shared = SOCKET_CACHE.get(key);
            if (shared) {
              try {
                if (debug) {
                  log.debug("[WS] closing shared socket (idle)", {
                    url: resolvedUrl,
                  });
                }
                shared.close();
              } catch {}
              SOCKET_CACHE.delete(key);
            }
          }, delay);
          SOCKET_IDLE_TIMERS.set(key, timerId);
        } else {
          SOCKET_REFCOUNTS.set(key, currentCount);
        }

        socketRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
      };

      // Perform cleanup immediately - the shared socket idle-close timer
      // (with 1s delay in dev) handles StrictMode remounts at the key level
      performClose();
    },
    [debug, resolvedUrl, getSocketKey, protocols]
  );

  const connect = useCallback(() => {
    if (socketRef.current || isConnecting) return;
    manuallyClosedRef.current = false;
    setIsConnecting(true);
    setError(null);

    try {
      if (debug) {
        log.debug("[WS] connect", {
          url: resolvedUrl,
          protocols,
          nodeEnv: process.env.NODE_ENV,
          logLevel: process.env.NEXT_PUBLIC_LOG_LEVEL,
        });
      }
      const key = getSocketKey(resolvedUrl, protocols);

      // Cancel any pending idle close for this shared socket (e.g., from StrictMode unmount)
      const existingTimer = SOCKET_IDLE_TIMERS.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
        SOCKET_IDLE_TIMERS.delete(key);
        if (debug) {
          log.debug("[WS] canceled idle close", { url: resolvedUrl });
        }
      }

      const socket = getOrCreateSharedSocket(resolvedUrl, protocols);
      SOCKET_REFCOUNTS.set(key, (SOCKET_REFCOUNTS.get(key) || 0) + 1);
      socketRef.current = socket;

      // Emit immediate readyState after creation
      if (debug) {
        log.debug("[WS] readyState (on create)", {
          readyState: socket.readyState,
          readyStates: {
            CONNECTING: WebSocket.CONNECTING,
            OPEN: WebSocket.OPEN,
            CLOSING: WebSocket.CLOSING,
            CLOSED: WebSocket.CLOSED,
          },
        });
      }

      // Add a timeout to detect hung connections
      const connectionTimeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          if (debug) {
            log.warn("[WS] connection timeout - still CONNECTING after 10s", {
              url: resolvedUrl,
              readyState: socket.readyState,
            });
          }
          setError("Connection timeout - server not responding");
          setIsConnecting(false);
        }
      }, 10000);

      const handleOpen = () => {
        clearTimeout(connectionTimeout);
        reconnectAttemptsRef.current = 0;
        setIsConnecting(false);
        setIsConnected(true);
        if (debug) {
          log.info("[WS] open", {
            url: resolvedUrl,
            protocol: socket.protocol,
            extensions: (socket as unknown as { extensions?: unknown })
              .extensions,
          });
        }
      };

      const handleMessage = (event: MessageEvent) => {
        try {
          const data =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data;
          setLastMessage(data as TIncoming);
        } catch {
          // if not JSON, pass through
          setLastMessage(event.data as unknown as TIncoming);
        }
      };

      const handleError = (event: Event) => {
        clearTimeout(connectionTimeout);
        const errorDetail = event as unknown as {
          message?: string;
          error?: unknown;
        };
        const errorMsg = errorDetail.message || "WebSocket error";
        setError(errorMsg);
        if (debug) {
          log.warn("[WS] error", {
            url: resolvedUrl,
            eventType: event.type,
            readyState: socket.readyState,
            message: errorDetail.message,
            error: errorDetail.error,
          });
        }
      };

      const handleClose = (event: CloseEvent) => {
        clearTimeout(connectionTimeout);
        if (debug) {
          log.info("[WS] close", {
            url: resolvedUrl,
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            readyState: socket.readyState,
          });
        }
        setIsConnected(false);
        setIsConnecting(false);
        socketRef.current = null;

        if (!manuallyClosedRef.current && autoReconnect) {
          const attempts = reconnectAttemptsRef.current + 1;
          if (attempts <= maxReconnectAttempts) {
            reconnectAttemptsRef.current = attempts;
            if (debug) {
              log.debug("[WS] reconnect scheduled", {
                attempts,
                delayMs: reconnectIntervalMs,
              });
            }
            setTimeout(() => {
              connect();
            }, reconnectIntervalMs);
          } else {
            setError("Max reconnect attempts reached");
            if (debug) {
              log.warn("[WS] max reconnect attempts reached", {
                attempts,
                maxReconnectAttempts,
              });
            }
          }
        }
      };

      // Attach listeners for this instance (non-destructive)
      socket.addEventListener("open", handleOpen);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("error", handleError);
      socket.addEventListener("close", handleClose);
      eventHandlersRef.current = {
        open: handleOpen,
        message: handleMessage,
        error: handleError,
        close: handleClose,
      };
    } catch (err) {
      setIsConnecting(false);
      setError(
        err instanceof Error ? err.message : "Failed to create WebSocket"
      );
      if (debug) {
        log.error("[WS] create failure", {
          message: err instanceof Error ? err.message : String(err),
          url: resolvedUrl,
        });
      }
    }
  }, [
    resolvedUrl,
    protocols,
    autoReconnect,
    reconnectIntervalMs,
    maxReconnectAttempts,
    isConnecting,
    debug,
    getSocketKey,
    getOrCreateSharedSocket,
  ]);

  const disconnect = useCallback(() => {
    manuallyClosedRef.current = true;
    cleanup(true);
  }, [cleanup]);

  const sendRaw = useCallback((data: WebSocketMessage) => {
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(
        data as unknown as string | ArrayBufferLike | Blob | ArrayBufferView
      );
    }
  }, []);

  const sendJson = useCallback(
    (data: unknown) => {
      sendRaw(JSON.stringify(data));
    },
    [sendRaw]
  );

  useEffect(() => {
    connect();
    return () => {
      if (debug) {
        log.debug("[WS] cleanup", { url: resolvedUrl });
      }
      cleanup(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedUrl]);

  return {
    isConnected,
    isConnecting,
    lastMessage,
    error,
    sendJson,
    sendRaw,
    connect,
    disconnect,
  };
}
