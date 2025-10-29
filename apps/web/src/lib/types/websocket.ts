import type { ScreenedStockPreview } from "@/lib/types/market";

// Re-export StockIndicators from shared package
export type { StockIndicators } from "@printer/shared";

export type WebSocketMessageType = 
  | "noc_update" 
  | "screener_update" 
  | "market_data" 
  | "connection_status"
  | "trading_activity";

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  data: T;
  timestamp: number;
  symbol?: string; // for market_data type
}

export interface ConnectionStatus {
  noc: boolean;
  screener: boolean;
  market: boolean;
}

export interface TradingActivityEvent {
  fund_id: string;
  fund_name: string;
  event_type: "entry" | "exit" | "scale_in" | "scale_out" | "error" | "warning";
  symbol?: string;
  quantity?: number;
  price?: number;
  timestamp: string;
  reason: string;
  message?: string;
  position_size?: number;
  pnl?: number;
  pnl_percent?: number;
  percent?: number;
  multiplier?: number;
}

export interface WebSocketContextValue {
  // Data
  nocData: import("@printer/shared").StockIndicators[] | null;
  screenerData: ScreenedStockPreview[] | null;
  marketData: Map<string, unknown>;
  tradingActivity: TradingActivityEvent[];
  
  // Connection state
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastUpdate: number | null;
  error: string | null;
  
  // Market subscriptions
  subscribeToSymbol: (symbol: string) => void;
  unsubscribeFromSymbol: (symbol: string) => void;
  subscribedSymbols: Set<string>;
}
