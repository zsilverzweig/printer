// Shared types for Printer monorepo
// Focus: Trading Command Center (TCC) types

// Re-export all Alpaca trading types
export type {
  AlpacaAccount,
  AlpacaPosition,
  AlpacaPositionSide,
  AlpacaOrder,
  AlpacaOrderSide,
  AlpacaTimeInForce,
  AlpacaOrderRequest,
  AlpacaQuote,
  AlpacaQuoteData,
  AlpacaMarketDataResponse,
  AlpacaOAuthTokens,
  AlpacaUserInfo,
  AlpacaServiceConfig,
  AlpacaError,
  AlpacaAPIError,
} from "./types/alpaca";

// Re-export all market data types
export type {
  AggregateBar,
  PolygonAggregateBar,
  UseMarketStreamOptions,
  UseMarketStreamReturn,
} from "./types/market";

// Re-export all NOC/TCC types
export type {
  SignalStatus,
  NocStockData,
  StockIndicators,
  ScreenerResult,
  PolygonAggBar,
} from "./types/noc";

