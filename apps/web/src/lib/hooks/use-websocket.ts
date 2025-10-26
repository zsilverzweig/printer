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
  heartbeatIntervalMs?: number; // interval to send ping messages
  heartbeatTimeoutMs?: number; // timeout to detect stale connection
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
    maxReconnectAttempts = Infinity, // Never stop reconnecting for local dev
    debug = false,
    heartbeatIntervalMs = 30000, // ping every 30 seconds
    heartbeatTimeoutMs = 60000, // expect pong within 60 seconds (increased from 10s)
  }: UseWebSocketOptions = {}
): UseWebSocketReturn<TIncoming> {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<TIncoming | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manuallyClosedRef = useRef(false);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const heartbeatTimeoutRef = useRef<number | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());
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

      // Only reuse if socket is CONNECTING or OPEN (not CLOSING or CLOSED)
      if (existing) {
        const state = existing.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
          return existing;
        }
        // Socket is CLOSING or CLOSED, remove from cache and create new one
        SOCKET_CACHE.delete(key);
      }

      const created = new WebSocket(u, p);
      SOCKET_CACHE.set(key, created);
      return created;
    },
    [getSocketKey]
  );

  const clearHeartbeatTimers = useCallback(() => {
    if (heartbeatIntervalRef.current !== null) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current !== null) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeatTimers();

    const sendPing = () => {
      const s = socketRef.current;
      if (!s || s.readyState !== WebSocket.OPEN) {
        clearHeartbeatTimers();
        return;
      }

      // Check if connection is stale (no messages received recently)
      const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;

      if (debug) {
        log.debug("[WS] heartbeat ping", {
          url: resolvedUrl,
          timeSinceLastMessage,
        });
      }

      try {
        // Send ping message
        s.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));

        // Set timeout to detect if server doesn't respond (lenient for local dev)
        heartbeatTimeoutRef.current = window.setTimeout(() => {
          if (debug) {
            log.warn("[WS] heartbeat timeout - connection appears stale", {
              url: resolvedUrl,
              timeSinceLastMessage: Date.now() - lastMessageTimeRef.current,
            });
          }

          // Connection is stale, trigger reconnect
          // For local dev, be more forgiving - only reconnect if truly dead
          if (!manuallyClosedRef.current && s.readyState !== WebSocket.OPEN) {
            setError("Connection timeout - reconnecting...");
            s.close();
          } else if (debug) {
            log.info("[WS] heartbeat timeout but socket still open, continuing");
          }
        }, heartbeatTimeoutMs);
      } catch (err) {
        if (debug) {
          log.error("[WS] heartbeat ping failed", {
            url: resolvedUrl,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        clearHeartbeatTimers();
      }
    };

    // Start sending pings at regular intervals
    heartbeatIntervalRef.current = window.setInterval(
      sendPing,
      heartbeatIntervalMs
    );
  }, [
    clearHeartbeatTimers,
    debug,
    resolvedUrl,
    heartbeatIntervalMs,
    heartbeatTimeoutMs,
  ]);

  const cleanup = useCallback(
    (forceImmediate = false) => {
      const performClose = () => {
        const s = socketRef.current;
        const key = getSocketKey(resolvedUrl, protocols);

        // Clear heartbeat timers
        clearHeartbeatTimers();

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

        // Decrement refcount but DON'T close shared socket for local dev
        // We want to keep connections alive indefinitely
        const currentCount = (SOCKET_REFCOUNTS.get(key) || 1) - 1;
        if (currentCount <= 0) {
          SOCKET_REFCOUNTS.delete(key);
          const existingTimer = SOCKET_IDLE_TIMERS.get(key);
          if (existingTimer) {
            clearTimeout(existingTimer);
            SOCKET_IDLE_TIMERS.delete(key);
          }
          // For local dev, don't close the socket automatically
          // Only close if forced (manual disconnect)
          if (forceImmediate) {
            const shared = SOCKET_CACHE.get(key);
            if (shared) {
              try {
                if (debug) {
                  log.debug("[WS] closing shared socket (manual)", {
                    url: resolvedUrl,
                  });
                }
                shared.close();
              } catch {}
              SOCKET_CACHE.delete(key);
            }
          }
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
    [debug, resolvedUrl, getSocketKey, protocols, clearHeartbeatTimers]
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
          hasProtocol: /^wss?:\/\//i.test(resolvedUrl),
          origin: typeof window !== "undefined" ? window.location.origin : "",
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
          url: socket.url,
          protocol: socket.protocol,
          binaryType: socket.binaryType,
        });
      }

      // Check if socket immediately failed
      if (socket.readyState === WebSocket.CLOSED) {
        if (debug) {
          log.error("[WS] socket immediately closed", {
            url: resolvedUrl,
          });
        }
        // Remove from cache so it's not reused
        SOCKET_CACHE.delete(key);
        SOCKET_REFCOUNTS.delete(key);
        socketRef.current = null;
        setError("WebSocket immediately closed - check URL and server");
        setIsConnecting(false);
        return;
      }

      // Add a timeout to detect hung connections (very generous for local dev)
      const connectionTimeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          if (debug) {
            log.warn("[WS] connection timeout - still CONNECTING after 120s", {
              url: resolvedUrl,
              readyState: socket.readyState,
            });
          }
          // Close and remove stuck socket from cache
          try {
            socket.close();
          } catch {}
          SOCKET_CACHE.delete(key);
          SOCKET_REFCOUNTS.delete(key);
          socketRef.current = null;
          setError("Connection timeout - server not responding");
          setIsConnecting(false);
        }
      }, 120000); // 2 minutes instead of 30s

      const handleOpen = () => {
        clearTimeout(connectionTimeout);
        reconnectAttemptsRef.current = 0;
        lastMessageTimeRef.current = Date.now();
        setIsConnecting(false);
        setIsConnected(true);

        // Start heartbeat mechanism
        startHeartbeat();

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
        // Update last message time for heartbeat tracking
        lastMessageTimeRef.current = Date.now();

        // Clear heartbeat timeout since we got a message
        if (heartbeatTimeoutRef.current !== null) {
          clearTimeout(heartbeatTimeoutRef.current);
          heartbeatTimeoutRef.current = null;
        }

        try {
          const data =
            typeof event.data === "string"
              ? JSON.parse(event.data)
              : event.data;

          // Don't propagate ping/pong messages to the app
          if (
            data &&
            typeof data === "object" &&
            (data.type === "ping" || data.type === "pong")
          ) {
            if (debug) {
              log.debug("[WS] received heartbeat", {
                type: data.type,
                url: resolvedUrl,
              });
            }
            return;
          }

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
        clearHeartbeatTimers();
        const key = getSocketKey(resolvedUrl, protocols);

        if (debug) {
          log.info("[WS] close", {
            url: resolvedUrl,
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            readyState: socket.readyState,
          });
        }

        // Remove closed socket from cache immediately so reconnection creates fresh socket
        SOCKET_CACHE.delete(key);

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
    startHeartbeat,
    clearHeartbeatTimers,
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
