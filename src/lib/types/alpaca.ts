// Shared Alpaca API types for trading and portfolio management

export type AlpacaOrderSide = "buy" | "sell";
export type AlpacaOrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop" | "take_profit";
export type AlpacaTimeInForce = "day" | "gtc" | "opg" | "cls" | "ioc" | "fok";
export type AlpacaPositionSide = "long" | "short";

export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  multiplier: string;
  shorting_enabled: boolean;
  trading_blocked: boolean;
  pattern_day_trader: boolean;
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

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: AlpacaOrderSide;
  type: AlpacaOrderType;
  time_in_force: AlpacaTimeInForce;
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
  position_side?: AlpacaPositionSide;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional?: string;
  qty?: string;
  filled_qty: string;
  type: AlpacaOrderType;
  side: AlpacaOrderSide;
  time_in_force: AlpacaTimeInForce;
  limit_price?: string;
  stop_price?: string;
  status: string;
  extended_hours: boolean;
  legs?: AlpacaOrder[] | null;
  trail_price?: string | null;
  trail_percent?: string | null;
  hwm?: string | null;
  order_class?: string;
  position_side?: AlpacaPositionSide;
}

export interface AlpacaListOrdersParams {
  status?: "open" | "closed" | "all";
  limit?: number;
  direction?: "asc" | "desc";
  after?: string;
  until?: string;
  nested?: boolean;
}
