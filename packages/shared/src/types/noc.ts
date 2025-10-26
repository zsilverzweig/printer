// NOC (Network Operations Center) / Trading Command Center Types

/**
 * Signal status for various stock indicators
 */
export type SignalStatus = "green" | "yellow" | "red";

/**
 * NOC stock data with all trading signals
 * This matches the Python NocStockData type from the server
 */
export interface NocStockData {
  ticker: string;
  price: number;
  priceSignal: SignalStatus;
  changePercent: number;
  changeSignal: SignalStatus;
  relativeVolume: number;
  rvSignal: SignalStatus;
  newsSentiment: string;
  newsSignal: SignalStatus;
  float: string;
  floatSignal: SignalStatus;
  bullFlag: boolean;
  flagSignal: SignalStatus;
}

/**
 * Stock indicators used in NOC table
 */
export interface StockIndicators {
  ticker: string;
  price: number;
  changePercent: number;
  relativeVolume: number;
  newsSentiment: string;
  float: string;
  bullFlag: boolean;
  // Signal statuses
  priceSignal?: SignalStatus;
  changeSignal?: SignalStatus;
  rvSignal?: SignalStatus;
  newsSignal?: SignalStatus;
  floatSignal?: SignalStatus;
  flagSignal?: SignalStatus;
}

/**
 * Screener result from the server
 */
export interface ScreenerResult {
  ticker: string;
  open: number;
  high: number;
  low: number;
  close: number;
  price: number;
  today_vol: number;
  rv14: number;
  rv30: number;
  rv60: number;
}

/**
 * Polygon aggregate bar from grouped daily API
 */
export interface PolygonAggBar {
  T: string; // Ticker symbol
  v: number; // Volume
  vw: number; // Volume weighted average price
  o: number; // Open price
  c: number; // Close price
  h: number; // High price
  l: number; // Low price
  t: number; // Timestamp (milliseconds since epoch)
  n: number; // Number of transactions
}

