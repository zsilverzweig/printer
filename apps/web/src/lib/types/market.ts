// Shared market data types for Polygon-backed FastAPI

// Re-export shared types
export type { AggregateBar, PolygonAggregateBar } from "@printer/shared";

export type Timespan =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

// Polygon last trade minimal fields (shape produced by polygon SDK encoder)
export interface LastTrade {
  price: number;
  size?: number;
  exchange?: number;
  conditions?: number[];
  timestamp?: number; // epoch nanos or millis (SDK dependent)
  participant_timestamp?: number;
  trf_timestamp?: number;
  sip_timestamp?: number;
  symbol?: string;
}

export interface GetAggsParams {
  multiplier: number;
  timespan: Timespan;
  from: string; // ISO date (YYYY-MM-DD) or datetime supported by API
  to: string; // ISO date (YYYY-MM-DD) or datetime supported by API
  limit?: number;
  paginate?: boolean;
}

// Polygon News article (normalized)
export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  imageUrl?: string;
  publishedUtc: string; // ISO datetime
  tickers: string[];
}

// Screener item returned by FastAPI (Polygon aggregate-like fields)
export interface ScreenedStockPreview {
  ticker: string;
  price: number; // current/latest price
  last_trade_price?: number | null;
  prev_open: number;
  prev_high: number;
  prev_low: number;
  prev_close: number;
  prev_volume: number;
  today_vol?: number | null;
  rv14?: number | null;
  rv_lw?: number | null;
  change_close?: number | null;
  change_close_pct?: number | null;
  type?: string | null;
  primary_exchange?: string | null;
  sic_description?: string | null;
  market_cap?: number | null;
  public_float?: number | null;
}
