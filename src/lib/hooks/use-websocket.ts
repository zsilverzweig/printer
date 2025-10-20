"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WebSocketMessage = string | ArrayBufferLike | Blob | ArrayBufferView;

export interface UseWebSocketOptions {
  protocols?: string | string[];
  autoReconnect?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
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
  }: UseWebSocketOptions = {}
): UseWebSocketReturn<TIncoming> {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<TIncoming | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manuallyClosedRef = useRef(false);

  const resolvedUrl = useMemo(() => {
    // Allow relative paths like "/api/ws" to resolve based on current origin
    try {
      const hasProtocol = /^wss?:\/\//i.test(url);
      if (hasProtocol) return url;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const wsProtocol = origin.startsWith("https") ? "wss" : "ws";
      const httpOrigin = origin.replace(/^https?/, wsProtocol);
      return `${httpOrigin}${url.startsWith("/") ? url : `/${url}`}`;
    } catch {
      return url;
    }
  }, [url]);

  const cleanup = useCallback(() => {
    const s = socketRef.current;
    if (s) {
      try {
        s.onopen = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        s.close();
      } catch {}
    }
    socketRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current || isConnecting) return;
    manuallyClosedRef.current = false;
    setIsConnecting(true);
    setError(null);

    try {
      const socket = new WebSocket(resolvedUrl, protocols);
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setIsConnecting(false);
        setIsConnected(true);
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          setLastMessage(data as TIncoming);
        } catch {
          // if not JSON, pass through
          setLastMessage((event.data as unknown) as TIncoming);
        }
      };

      socket.onerror = () => {
        setError("WebSocket error");
      };

      socket.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        socketRef.current = null;

        if (!manuallyClosedRef.current && autoReconnect) {
          const attempts = reconnectAttemptsRef.current + 1;
          if (attempts <= maxReconnectAttempts) {
            reconnectAttemptsRef.current = attempts;
            setTimeout(() => {
              connect();
            }, reconnectIntervalMs);
          } else {
            setError("Max reconnect attempts reached");
          }
        }
      };
    } catch (err) {
      setIsConnecting(false);
      setError(err instanceof Error ? err.message : "Failed to create WebSocket");
    }
  }, [resolvedUrl, protocols, autoReconnect, reconnectIntervalMs, maxReconnectAttempts, isConnecting]);

  const disconnect = useCallback(() => {
    manuallyClosedRef.current = true;
    cleanup();
  }, [cleanup]);

  const sendRaw = useCallback((data: WebSocketMessage) => {
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) {
      s.send(data as any);
    }
  }, []);

  const sendJson = useCallback((data: unknown) => {
    sendRaw(JSON.stringify(data));
  }, [sendRaw]);

  useEffect(() => {
    connect();
    return () => {
      cleanup();
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


