"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useWebSocket } from "@/lib/hooks/use-websocket";
import type { 
  WebSocketMessage, 
  WebSocketContextValue, 
  ConnectionStatus,
  StockIndicators,
  TradingActivityEvent
} from "@/lib/types/websocket";
import type { ScreenedStockPreview } from "@/lib/types/market";
import { log } from "@/lib/utils/logger";
import { diagnoseWebSocketConnection } from "@/lib/utils/websocket-diagnostics";

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  // Data state
  const [nocData, setNocData] = useState<StockIndicators[] | null>(null);
  const [screenerData, setScreenerData] = useState<ScreenedStockPreview[] | null>(null);
  const [marketData, setMarketData] = useState<Map<string, unknown>>(new Map());
  const [tradingActivity, setTradingActivity] = useState<TradingActivityEvent[]>([]);
  
  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    noc: false,
    screener: false,
    market: false,
  });
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Market subscriptions
  const [subscribedSymbols, setSubscribedSymbols] = useState<Set<string>>(new Set());
  const pendingSubscriptions = useRef<Set<string>>(new Set());
  const pendingUnsubscriptions = useRef<Set<string>>(new Set());
  
  // Extract symbol from market data message
  const extractSymbolFromMarketData = (data: unknown): string | null => {
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      return (obj.sym || obj.symbol || obj.T) as string || null;
    }
    return null;
  };
  
  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setLastUpdate(message.timestamp);
    
    switch (message.type) {
      case "noc_update":
        setNocData(message.data as StockIndicators[]);
        setConnectionStatus(prev => ({ ...prev, noc: true }));
        log.debug("[WebSocket] NOC data updated", { count: Array.isArray(message.data) ? message.data.length : 0 });
        break;
        
      case "screener_update":
        setScreenerData(message.data as ScreenedStockPreview[]);
        setConnectionStatus(prev => ({ ...prev, screener: true }));
        log.debug("[WebSocket] Screener data updated", { count: Array.isArray(message.data) ? message.data.length : 0 });
        break;
        
      case "market_data":
        const symbol = message.symbol || extractSymbolFromMarketData(message.data);
        if (symbol) {
          setMarketData(prev => {
            const newMap = new Map(prev);
            newMap.set(symbol, message.data);
            return newMap;
          });
          setConnectionStatus(prev => ({ ...prev, market: true }));
          log.debug("[WebSocket] Market data updated", { symbol });
        }
        break;
        
      case "connection_status":
        setConnectionStatus(message.data as ConnectionStatus);
        log.debug("[WebSocket] Connection status updated", message.data);
        break;
        
      case "trading_activity":
        setTradingActivity(prev => [message.data as TradingActivityEvent, ...prev].slice(0, 100)); // Keep last 100 events
        log.debug("[WebSocket] Trading activity received", message.data);
        break;
        
      default:
        log.warn("[WebSocket] Unknown message type", { type: message.type });
    }
  }, []);
  
  // WebSocket connection with aggressive reconnection
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
  const { isConnected, sendJson, error: wsError, lastMessage, connect } = useWebSocket<WebSocketMessage>(
    `${wsUrl}/realtime`,
    {
      autoReconnect: true,
      reconnectIntervalMs: 2000, // Faster reconnection
      maxReconnectAttempts: Infinity, // Never stop trying
      debug: true,
      heartbeatIntervalMs: 20000, // Ping every 20 seconds (more frequent)
      heartbeatTimeoutMs: 45000, // 45 second timeout before considering dead
    }
  );
  
  // Update error state when WebSocket error changes
  useEffect(() => {
    setError(wsError);
  }, [wsError]);
  
  // Log connection state changes for debugging
  useEffect(() => {
    if (isConnected) {
      log.info("[WebSocket] ✅ CONNECTED to", wsUrl + "/realtime");
      console.log(`%c[WebSocket] ✅ CONNECTED`, 'color: green; font-weight: bold', wsUrl + "/realtime");
    } else {
      log.warn("[WebSocket] ❌ DISCONNECTED from", wsUrl + "/realtime");
      console.log(`%c[WebSocket] ❌ DISCONNECTED`, 'color: red; font-weight: bold', wsUrl + "/realtime");
      console.log('%cTip: Run diagnoseWebSocket() in console to troubleshoot', 'color: blue; font-style: italic');
    }
  }, [isConnected, wsUrl]);
  
  // Run diagnostics on mount if connection fails
  useEffect(() => {
    if (!isConnected && wsError) {
      // Run diagnostics after 5 seconds of being disconnected with error
      const timer = setTimeout(() => {
        if (!isConnected) {
          log.warn("[WebSocket] Connection issues detected, running diagnostics...");
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
  const subscribeToSymbol = useCallback((symbol: string) => {
    if (subscribedSymbols.has(symbol)) return;
    
    pendingSubscriptions.current.add(symbol);
    setSubscribedSymbols(prev => new Set([...prev, symbol]));
    
    // Send subscription request
    sendJson({
      action: "subscribe_market",
      symbols: [symbol]
    });
    
    log.debug("[WebSocket] Subscribed to symbol", { symbol });
  }, [subscribedSymbols, sendJson]);
  
  // Unsubscribe from market symbol
  const unsubscribeFromSymbol = useCallback((symbol: string) => {
    if (!subscribedSymbols.has(symbol)) return;
    
    pendingUnsubscriptions.current.add(symbol);
    setSubscribedSymbols(prev => {
      const newSet = new Set(prev);
      newSet.delete(symbol);
      return newSet;
    });
    
    // Send unsubscription request
    sendJson({
      action: "unsubscribe_market",
      symbols: [symbol]
    });
    
    log.debug("[WebSocket] Unsubscribed from symbol", { symbol });
  }, [subscribedSymbols, sendJson]);
  
  // Send ping messages for connection health and monitor connection state
  useEffect(() => {
    if (!isConnected) return;
    
    const pingInterval = setInterval(() => {
      sendJson({
        type: "ping",
        timestamp: Date.now()
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
        log.warn("[WebSocket] Connection lost for 10+ seconds, forcing reconnection");
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
    
    if (pendingSubs.length > 0) {
      sendJson({
        action: "subscribe_market",
        symbols: pendingSubs
      });
      pendingSubscriptions.current.clear();
    }
    
    if (pendingUnsubs.length > 0) {
      sendJson({
        action: "unsubscribe_market",
        symbols: pendingUnsubs
      });
      pendingUnsubscriptions.current.clear();
    }
  }, [isConnected, sendJson]);
  
  const contextValue: WebSocketContextValue = {
    // Data
    nocData,
    screenerData,
    marketData,
    tradingActivity,
    
    // Connection state
    isConnected,
    connectionStatus,
    lastUpdate,
    error,
    
    // Market subscriptions
    subscribeToSymbol,
    unsubscribeFromSymbol,
    subscribedSymbols,
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
    throw new Error("useWebSocketContext must be used within a WebSocketProvider");
  }
  return context;
}

