// Shared market data types for Polygon-backed FastAPI

export type Timespan =
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "year";

// Polygon aggregate bar shape (jsonable_encoder of polygon Agg)
export interface AggregateBar {
  t: number; // epoch millis
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v?: number; // volume (optional depending on source)
}

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
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  transactions: number;
  window_start: number; // unix milliseconds since epoch
  rv?: number; // relative volume (provided by backend)
}
