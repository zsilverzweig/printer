// Re-export Alpaca types from shared package
// This maintains backward compatibility while using monorepo shared types

export type {
  AlpacaAPIError,
  AlpacaAccount,
  AlpacaError,
  AlpacaMarketDataResponse,
  AlpacaOAuthTokens,
  AlpacaOrder,
  AlpacaOrderRequest,
  AlpacaOrderSide,
  AlpacaPosition,
  AlpacaPositionSide,
  AlpacaQuote,
  AlpacaQuoteData,
  AlpacaServiceConfig,
  AlpacaTimeInForce,
  AlpacaUserInfo,
} from "@printer/shared";

// Legacy type for backward compatibility
export type AlpacaOrderType =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit"
  | "trailing_stop";
