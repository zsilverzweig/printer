// Alpaca API Types
// These types correspond to the Alpaca Trading API and Market Data API responses

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  equity: string;
  portfolio_value: string;
  shorting_enabled: boolean;
  pattern_day_trader: boolean;
  multiplier: string;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  trading_suspended_by_user: boolean;
  daytrading_buying_power?: string;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  asset_marginable: boolean;
  avg_entry_price: string;
  qty: string;
  side: AlpacaPositionSide;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export type AlpacaPositionSide = "long" | "short";

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at?: string;
  expired_at?: string;
  canceled_at?: string;
  failed_at?: string;
  replaced_at?: string;
  replaced_by?: string;
  replaces?: string;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional?: string;
  qty: string;
  filled_qty: string;
  filled_avg_price?: string;
  order_class: string;
  order_type: string;
  type: string;
  side: AlpacaOrderSide;
  time_in_force: AlpacaTimeInForce;
  limit_price?: string;
  stop_price?: string;
  status: string;
  extended_hours: boolean;
  legs?: AlpacaOrder[];
  trail_percent?: string;
  trail_price?: string;
  hwm?: string;
  subtag?: string;
  source?: string;
}

export type AlpacaOrderSide = "buy" | "sell";
export type AlpacaTimeInForce = "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: AlpacaOrderSide;
  type: "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
  time_in_force: AlpacaTimeInForce;
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
  client_order_id?: string;
  order_class?: string;
  take_profit?: {
    limit_price: number;
  };
  stop_loss?: {
    stop_price: number;
    limit_price?: number;
  };
  trail_price?: number;
  trail_percent?: number;
  position_side?: "long" | "short";
}

// Market Data API Types
export interface AlpacaQuote {
  symbol: string;
  bid: number;
  ask: number;
  bid_size: number;
  ask_size: number;
  timestamp: string;
}

export interface AlpacaQuoteData {
  bp?: number; // bid price
  bs?: number; // bid size
  ap?: number; // ask price
  as?: number; // ask size
  t?: string; // timestamp
  S?: string; // symbol
  symbol?: string;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

export interface AlpacaMarketDataResponse {
  symbol?: string;
  quote?: AlpacaQuoteData;
  quotes?: AlpacaQuoteData[] | Record<string, AlpacaQuoteData>;
  timestamp?: string;
}

// OAuth Types
export interface AlpacaOAuthTokens {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
}

export interface AlpacaUserInfo {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
}

// Service Configuration Types
export interface AlpacaServiceConfig {
  paperBaseUrl: string;
  liveBaseUrl: string;
  marketDataBaseUrl: string;
}

// Error Types
export interface AlpacaError {
  code: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface AlpacaAPIError extends Error {
  status?: number;
  code?: number;
  details?: Record<string, unknown>;
}
