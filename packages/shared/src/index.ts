// Shared types for Printer monorepo
// Focus: Trading Command Center (TCC) types

// Re-export all Alpaca trading types
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
  NocStockData,
  PolygonAggBar,
  ScreenerResult,
  SignalStatus,
  StockIndicators,
} from "./types/noc";

// Re-export all fund management types
export type {
  // Input types
  CreateFundInput,
  CreateScreeningCriteriaInput,
  CreateSetupInput,
  CreateStrategyInput, // Backward compatibility
  CreateTransferInput,
  ExecutionStrategy,
  // Core entities
  Fund,
  // Enums and literal types
  FundMode,
  FundOrder,
  FundStatus,
  FundTrade,
  FundTradingStatus,
  FundTransaction,
  FundTransfer,
  // Composite types
  FundWithStrategy,
  // Trading control types
  PositionStatus,
  RunningFundSummary,
  ScreeningCriteria,
  ScreeningCriteriaParams,
  ScreenerFilterBreakdownStep,
  ScreenerResultRow,
  ScreenerRunResult,
  Setup, // Backward compatibility
  Strategy,
  StrategyType,
  TransferType,
  UpdateFundInput,
  UpdateScreeningCriteriaInput, // Backward compatibility
  UpdateSetupInput,
  UpdateStrategyInput,
} from "./types/funds";
