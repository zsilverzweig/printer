// Re-export Alpaca types from the finance feature
// This maintains backward compatibility while centralizing types

export {
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
} from "@/features/finance/lib/types/alpaca";

// Legacy type for backward compatibility
export type AlpacaOrderType =
  | "market"
  | "limit"
  | "stop"
  | "stop_limit"
  | "trailing_stop"
  | "take_profit";
