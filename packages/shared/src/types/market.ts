// Market Data Types for Real-time Streaming

/**
 * Polygon aggregate bar structure (simplified, used by UI components)
 */
export interface AggregateBar {
  t: number; // Timestamp in epoch milliseconds
  o: number; // Open price
  h: number; // High price
  l: number; // Low price
  c: number; // Close price
  v?: number; // Volume (optional)
  vw?: number; // Volume-weighted average price (optional)
  n?: number; // Number of transactions (optional)
}

/**
 * Polygon WebSocket aggregate bar (full format from real-time feed)
 */
export interface PolygonAggregateBar {
  ev: string; // Event type (e.g., "A" for second bars, "AM" for minute bars)
  sym: string; // Symbol
  v: number; // Volume
  av: number; // Accumulated volume
  op: number; // Open price
  vw: number; // Volume weighted average price
  o: number; // Open
  c: number; // Close
  h: number; // High
  l: number; // Low
  a: number; // Average/VWAP
  z: number; // Average trade size
  s: number; // Start timestamp (milliseconds)
  e: number; // End timestamp (milliseconds)
  t: number; // Timestamp (milliseconds)
  n: number; // Number of transactions
}

/**
 * Market stream WebSocket options
 */
export interface UseMarketStreamOptions {
  endpoint?: string; // WebSocket endpoint URL
  subs: string; // Subscription string (e.g., "AM.AAPL" or "A.AAPL,AM.AAPL")
  onMessage?: (msg: unknown) => void;
  subscribeOnOpen?: boolean; // Send subscribe message when connected
  buildSubscribeMessage?: (subs: string) => unknown;
  debug?: boolean; // Enable verbose logging
}

/**
 * Market stream hook return type
 */
export interface UseMarketStreamReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  sendJson: (data: unknown) => void;
}

