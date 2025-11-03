"use client";

import { useWebSocket } from "@/lib/hooks/use-websocket";
import type { ScreenedStockPreview } from "@/lib/types/market";
import type {
  ConnectionStatus,
  FundRealtimeData,
  StockIndicators,
  TradingActivityEvent,
  WebSocketContextValue,
  WebSocketMessage,
} from "@/lib/types/websocket";
import { log } from "@/lib/utils/logger";
import { diagnoseWebSocketConnection } from "@/lib/utils/websocket-diagnostics";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  // Data state
  const [nocData, setNocData] = useState<StockIndicators[] | null>(null);
  const [screenerData, setScreenerData] = useState<
    ScreenedStockPreview[] | null
  >(null);
  const [marketData, setMarketData] = useState<Map<string, unknown>>(new Map());
  const [tradingActivity, setTradingActivity] = useState<
    TradingActivityEvent[]
  >([]);
  const [fundData, setFundData] = useState<Map<string, FundRealtimeData>>(
    new Map()
  );

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    noc: false,
    screener: false,
    market: false,
  });
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Market subscriptions
  const [subscribedSymbols, setSubscribedSymbols] = useState<Set<string>>(
    new Set()
  );
  const pendingSubscriptions = useRef<Set<string>>(new Set());
  const pendingUnsubscriptions = useRef<Set<string>>(new Set());

  // Fund subscriptions
  const [subscribedFundIds, setSubscribedFundIds] = useState<Set<string>>(
    new Set()
  );
  const pendingFundSubscriptions = useRef<Set<string>>(new Set());
  const pendingFundUnsubscriptions = useRef<Set<string>>(new Set());

  // Extract symbol from market data message
  const extractSymbolFromMarketData = (data: unknown): string | null => {
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      return ((obj.sym || obj.symbol || obj.T) as string) || null;
    }
    return null;
  };

  // Transform fund snapshot data from snake_case to camelCase
  const transformFundSnapshot = (snapshot: any): FundRealtimeData => {
    return {
      fund: snapshot.fund || null,
      orders: snapshot.orders || [],
      transactions: snapshot.transactions || [],
      transfers: snapshot.transfers || [],
      positions: snapshot.positions || [],
      positionsSummary: snapshot.positions_summary || {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      },
      performance: snapshot.performance || null,
    };
  };

  // Apply incremental update to fund data
  const applyFundUpdate = (
    existing: FundRealtimeData,
    message: WebSocketMessage
  ): FundRealtimeData => {
    const updated = { ...existing };

    switch (message.category) {
      case "orders":
        // Handle order updates
        if (message.event_type === "order_created") {
          updated.orders = [message.data, ...existing.orders];
        } else if (message.event_type === "order_updated") {
          updated.orders = existing.orders.map((order: any) =>
            order.id === message.data.id ? { ...order, ...message.data } : order
          );
        } else if (message.event_type === "order_deleted") {
          updated.orders = existing.orders.filter(
            (order: any) => order.id !== message.data.id
          );
        }
        break;

      case "transactions":
        // Handle transaction updates
        if (message.event_type === "transaction_created") {
          updated.transactions = [message.data, ...existing.transactions];
        }
        break;

      case "transfers":
        // Handle transfer updates
        if (message.event_type === "transfer_created") {
          updated.transfers = [message.data, ...existing.transfers];
        }
        break;

      case "balance":
        // Handle balance updates
        if (message.event_type === "balance_changed" && existing.fund) {
          updated.fund = { ...existing.fund, balance: message.data.balance };
        }
        break;

      case "positions":
        // Handle position updates
        if (message.event_type === "positions_updated") {
          updated.positions = message.data.positions || [];
          updated.positionsSummary = message.data.summary || {
            positionCount: 0,
            totalMarketValue: 0,
            totalUnrealizedPl: 0,
          };
        }
        break;

      case "performance":
        // Handle performance updates
        if (message.event_type === "performance_updated") {
          updated.performance = message.data;
        }
        break;
    }

    return updated;
  };

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    console.log("[WebSocket] Message received:", {
      type: message.type,
      timestamp: message.timestamp,
      hasData: !!message.data,
      dataType: typeof message.data,
      isArray: Array.isArray(message.data),
      dataLength: Array.isArray(message.data) ? message.data.length : "N/A",
    });

    setLastUpdate(message.timestamp);

    switch (message.type) {
      case "noc_update":
        setNocData(message.data as StockIndicators[]);
        setConnectionStatus((prev) => ({ ...prev, noc: true }));
        log.debug("[WebSocket] NOC data updated", {
          count: Array.isArray(message.data) ? message.data.length : 0,
        });
        break;

      case "screener_update":
        const screenerUpdateData = message.data as ScreenedStockPreview[];
        console.log("[WebSocket] Screener update received:", {
          type: message.type,
          dataLength: Array.isArray(screenerUpdateData)
            ? screenerUpdateData.length
            : 0,
          data: screenerUpdateData,
          firstItem:
            Array.isArray(screenerUpdateData) && screenerUpdateData.length > 0
              ? screenerUpdateData[0]
              : null,
          timestamp: message.timestamp,
        });
        setScreenerData(screenerUpdateData);
        setConnectionStatus((prev) => ({ ...prev, screener: true }));
        log.debug("[WebSocket] Screener data updated", {
          count: Array.isArray(message.data) ? message.data.length : 0,
        });
        break;

      case "market_data":
        const symbol =
          message.symbol || extractSymbolFromMarketData(message.data);
        if (symbol) {
          setMarketData((prev) => {
            const newMap = new Map(prev);
            newMap.set(symbol, message.data);
            return newMap;
          });
          setConnectionStatus((prev) => ({ ...prev, market: true }));
          log.debug("[WebSocket] Market data updated", { symbol });
        }
        break;

      case "connection_status":
        setConnectionStatus(message.data as ConnectionStatus);
        log.debug("[WebSocket] Connection status updated", message.data);
        break;

      case "trading_activity":
        setTradingActivity((prev) =>
          [message.data as TradingActivityEvent, ...prev].slice(0, 100)
        ); // Keep last 100 events
        log.debug("[WebSocket] Trading activity received", message.data);
        break;

      case "fund_snapshot":
        if (message.fund_id) {
          setFundData((prev) => {
            const newMap = new Map(prev);
            newMap.set(message.fund_id!, transformFundSnapshot(message.data));
            return newMap;
          });
          // Snapshot received - no need to log, reduces noise
        }
        break;

      case "fund_update":
        if (message.fund_id) {
          setFundData((prev) => {
            const newMap = new Map(prev);
            const existing = newMap.get(message.fund_id!);
            if (existing) {
              newMap.set(message.fund_id!, applyFundUpdate(existing, message));
            }
            return newMap;
          });
          // Update received - no need to log, reduces noise
        }
        break;

      default:
        log.warn("[WebSocket] Unknown message type", { type: message.type });
    }
  }, []);

  // WebSocket connection with aggressive reconnection
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
  const {
    isConnected,
    sendJson,
    error: wsError,
    lastMessage,
    connect,
  } = useWebSocket<WebSocketMessage>(`${wsUrl}/realtime`, {
    autoReconnect: true,
    reconnectIntervalMs: 2000, // Faster reconnection
    maxReconnectAttempts: Infinity, // Never stop trying
    debug: true,
    heartbeatIntervalMs: 20000, // Ping every 20 seconds (more frequent)
    heartbeatTimeoutMs: 45000, // 45 second timeout before considering dead
  });

  // Update error state when WebSocket error changes
  useEffect(() => {
    setError(wsError);
  }, [wsError]);

  // Log connection state changes for debugging
  useEffect(() => {
    if (isConnected) {
      log.info("[WebSocket] ✅ CONNECTED to", wsUrl + "/realtime");
      console.log(
        `%c[WebSocket] ✅ CONNECTED`,
        "color: green; font-weight: bold",
        wsUrl + "/realtime"
      );
    } else {
      log.warn("[WebSocket] ❌ DISCONNECTED from", wsUrl + "/realtime");
      console.log(
        `%c[WebSocket] ❌ DISCONNECTED`,
        "color: red; font-weight: bold",
        wsUrl + "/realtime"
      );
      console.log(
        "%cTip: Run diagnoseWebSocket() in console to troubleshoot",
        "color: blue; font-style: italic"
      );
    }
  }, [isConnected, wsUrl]);

  // Run diagnostics on mount if connection fails
  useEffect(() => {
    if (!isConnected && wsError) {
      // Run diagnostics after 5 seconds of being disconnected with error
      const timer = setTimeout(() => {
        if (!isConnected) {
          log.warn(
            "[WebSocket] Connection issues detected, running diagnostics..."
          );
          diagnoseWebSocketConnection();
        }
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [isConnected, wsError]);

  // Handle incoming messages when lastMessage changes
  useEffect(() => {
    if (lastMessage) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  // Subscribe to market symbol
  const subscribeToSymbol = useCallback(
    (symbol: string) => {
      if (subscribedSymbols.has(symbol)) return;

      pendingSubscriptions.current.add(symbol);
      setSubscribedSymbols((prev) => new Set([...prev, symbol]));

      // Send subscription request
      sendJson({
        action: "subscribe_market",
        symbols: [symbol],
      });

      log.debug("[WebSocket] Subscribed to symbol", { symbol });
    },
    [subscribedSymbols, sendJson]
  );

  // Unsubscribe from market symbol
  const unsubscribeFromSymbol = useCallback(
    (symbol: string) => {
      if (!subscribedSymbols.has(symbol)) return;

      pendingUnsubscriptions.current.add(symbol);
      setSubscribedSymbols((prev) => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });

      // Send unsubscription request
      sendJson({
        action: "unsubscribe_market",
        symbols: [symbol],
      });

      log.debug("[WebSocket] Unsubscribed from symbol", { symbol });
    },
    [subscribedSymbols, sendJson]
  );

  // Subscribe to fund updates
  const subscribeToFund = useCallback(
    (fundId: string) => {
      if (subscribedFundIds.has(fundId)) return;

      pendingFundSubscriptions.current.add(fundId);
      setSubscribedFundIds((prev) => new Set([...prev, fundId]));

      // Send subscription request
      sendJson({
        action: "subscribe_funds",
        fund_ids: [fundId],
      });

      // Removed verbose log - subscription is tracked server-side
    },
    [subscribedFundIds, sendJson]
  );

  // Unsubscribe from fund updates
  const unsubscribeFromFund = useCallback(
    (fundId: string) => {
      if (!subscribedFundIds.has(fundId)) return;

      pendingFundUnsubscriptions.current.add(fundId);
      setSubscribedFundIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fundId);
        return newSet;
      });

      // Send unsubscription request
      sendJson({
        action: "unsubscribe_funds",
        fund_ids: [fundId],
      });

      // Removed verbose log - unsubscription is tracked server-side
    },
    [subscribedFundIds, sendJson]
  );

  // Send ping messages for connection health and monitor connection state
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      sendJson({
        type: "ping",
        timestamp: Date.now(),
      });
    }, 20000); // Ping every 20 seconds (matches heartbeat)

    return () => clearInterval(pingInterval);
  }, [isConnected, sendJson]);

  // Aggressively monitor connection health and force reconnect if needed
  useEffect(() => {
    if (isConnected) return; // Already connected, no action needed

    // If disconnected for more than 10 seconds, force a reconnection attempt
    const reconnectTimer = setTimeout(() => {
      if (!isConnected) {
        log.warn(
          "[WebSocket] Connection lost for 10+ seconds, forcing reconnection"
        );
        connect();
      }
    }, 10000);

    return () => clearTimeout(reconnectTimer);
  }, [isConnected, connect]);

  // Process pending subscriptions/unsubscriptions
  useEffect(() => {
    if (!isConnected) return;

    const pendingSubs = Array.from(pendingSubscriptions.current);
    const pendingUnsubs = Array.from(pendingUnsubscriptions.current);
    const pendingFundSubs = Array.from(pendingFundSubscriptions.current);
    const pendingFundUnsubs = Array.from(pendingFundUnsubscriptions.current);

    if (pendingSubs.length > 0) {
      sendJson({
        action: "subscribe_market",
        symbols: pendingSubs,
      });
      pendingSubscriptions.current.clear();
    }

    if (pendingUnsubs.length > 0) {
      sendJson({
        action: "unsubscribe_market",
        symbols: pendingUnsubs,
      });
      pendingUnsubscriptions.current.clear();
    }

    if (pendingFundSubs.length > 0) {
      sendJson({
        action: "subscribe_funds",
        fund_ids: pendingFundSubs,
      });
      pendingFundSubscriptions.current.clear();
    }

    if (pendingFundUnsubs.length > 0) {
      sendJson({
        action: "unsubscribe_funds",
        fund_ids: pendingFundUnsubs,
      });
      pendingFundUnsubscriptions.current.clear();
    }
  }, [isConnected, sendJson]);

  const contextValue: WebSocketContextValue = {
    // Data
    nocData,
    screenerData,
    marketData,
    tradingActivity,
    fundData,

    // Connection state
    isConnected,
    connectionStatus,
    lastUpdate,
    error,

    // Market subscriptions
    subscribeToSymbol,
    unsubscribeFromSymbol,
    subscribedSymbols,

    // Fund subscriptions
    subscribeToFund,
    unsubscribeFromFund,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider"
    );
  }
  return context;
}
