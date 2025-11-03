import type { ScreenedStockPreview } from "@/lib/types/market";

// Re-export StockIndicators from shared package
export type { StockIndicators } from "@printer/shared";

export type WebSocketMessageType =
  | "noc_update"
  | "screener_update"
  | "market_data"
  | "connection_status"
  | "trading_activity"
  | "fund_snapshot"
  | "fund_update";

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  data: T;
  timestamp: number;
  symbol?: string; // for market_data type
  fund_id?: string; // for fund_snapshot and fund_update types
  category?: string; // for fund_update type
  event_type?: string; // for fund_update type
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
  order_type?: string; // "market" or "limit"
  limit_price?: number; // Limit price for limit orders
}

export interface FundRealtimeData {
  fund: any | null;
  orders: any[];
  transactions: any[];
  transfers: any[];
  positions: any[];
  positionsSummary: {
    positionCount: number;
    totalMarketValue: number;
    totalUnrealizedPl: number;
  };
  performance: {
    cashBalance: number;
    positionValue: number;
    aum: number;
    dayChange: number;
    dayChangePercent: number;
    totalReturn: number;
    totalReturnPercent: number;
    unrealizedPl: number;
  } | null;
}

export interface WebSocketContextValue {
  // Data
  nocData: import("@printer/shared").StockIndicators[] | null;
  screenerData: ScreenedStockPreview[] | null;
  marketData: Map<string, unknown>;
  tradingActivity: TradingActivityEvent[];
  fundData: Map<string, FundRealtimeData>;

  // Connection state
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  lastUpdate: number | null;
  error: string | null;

  // Market subscriptions
  subscribeToSymbol: (symbol: string) => void;
  unsubscribeFromSymbol: (symbol: string) => void;
  subscribedSymbols: Set<string>;

  // Fund subscriptions
  subscribeToFund: (fundId: string) => void;
  unsubscribeFromFund: (fundId: string) => void;
}
