/**
 * Fund Management Types
 *
 * Shared types for the fund management system including funds, strategies,
 * screening criteria, execution strategies, and fund transfers.
 *
 * Used by both frontend (web) and backend (server).
 */

// ============================================================================
// Enums and Literal Types
// ============================================================================

export type FundMode = "sim" | "real";
export type FundStatus = "active" | "paused";
export type TransferType = "deposit" | "withdrawal";
export type StrategyType = "math-based" | "ai-based" | "hybrid";

// ============================================================================
// Core Entities
// ============================================================================

/**
 * Trading Fund/Account
 *
 * Represents a trading account with balance, mode (sim/real), strategy configuration,
 * risk parameters, position sizing, and trading windows.
 */
export interface Fund {
  id: string;
  name: string;
  description?: string;
  mode: FundMode;
  balance: number; // Current fund balance (also serves as AUM)
  status: FundStatus; // Trading status: active or paused
  archived?: boolean; // Hidden from main list

  // UI customization
  icon?: string; // Lucide icon name (e.g., "Wallet", "TrendingUp")
  iconColor?: string; // Tailwind color class (e.g., "blue", "green", "purple")

  // Strategy configuration
  strategyId?: string | null; // References ExecutionStrategy (e.g., "monkey_darts")
  strategyConfig: Record<string, any>; // Plugin-specific params
  screeningCriteriaId?: string | null; // References ScreeningCriteria

  // Risk parameters (optional - null/undefined means no limit)
  maxLossPercent?: number | null; // Max loss % per day
  maxLossDollars?: number | null; // Max loss $ per day
  maxGivebackPercent?: number | null; // Max loss from high water mark
  maxOrderAgeSeconds?: number | null; // Cancel pending orders after this many seconds (override to default)

  // Position sizing
  sizePerTrade?: number | null; // Default position size (override to default)
  minBetPercent?: number | null; // Min % of fund per trade
  maxBetPercent?: number | null; // Max % of fund per trade
  maxTotalExposure?: number | null; // Max total $ in positions

  // Trading time windows
  tradingStartTime?: string; // e.g., "09:30" (market open)
  tradingEndTime?: string; // e.g., "16:00" (market close)
  timezone?: string; // e.g., "America/New_York" (default: ET)

  // AI cost tracking
  totalAiCost?: number; // Total AI costs incurred by this fund
  aiCostMtd?: number; // Month-to-date AI costs
  aiCostYtd?: number; // Year-to-date AI costs
  lastAiCostReset?: Date | string | null; // Last time periodic costs were reset

  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Execution Strategy Plugin
 *
 * Metadata for a code-driven trading strategy plugin (e.g., "bull_flag", "monkey_darts").
 * The actual implementation lives in Python on the backend.
 */
export interface ExecutionStrategy {
  id: string; // e.g., "bull_flag"
  name: string; // e.g., "Bull Flag Pattern"
  description: string;
  strategyType: StrategyType;
  expectedTimeframe: string; // e.g., "1-3 minutes"
}

/**
 * Screening Criteria Parameters
 *
 * Configuration object for both database and real-time filtering.
 */
export interface ScreeningCriteriaParams {
  // Database filters (asset metadata)
  asset_types?: string[]; // e.g., ["CS", "ETF"]
  market_cap_min?: number; // Min market cap in dollars
  market_cap_max?: number; // Max market cap in dollars
  float_min?: number; // Min public float in dollars
  float_max?: number; // Max public float in dollars
  sic_codes?: string[]; // Industry SIC codes

  // Real-time screener filters (price/volume dynamics)
  min_price?: number; // Min yesterday's close price
  max_price?: number; // Max yesterday's close price
  min_volume?: number; // Min volume for liquidity
  min_change_percent?: number; // Min % change from yesterday's close
  max_change_percent?: number; // Max % change from yesterday's close
  min_relative_volume?: number; // Minimum RV14 filter
  exclude_etfs?: boolean; // Whether to exclude ETFs (default true)
  order_by?: string; // Sort field: "rv14" | "rv30" | "rv60" | "avg_volume"
  limit?: number; // Max results to return

  // Technical analysis filters
  technical_filters?: {
    near_resistance?: boolean;
    near_support?: boolean;
    has_equal_highs?: boolean;
    has_equal_lows?: boolean;
    above_90day_high?: boolean;
    below_90day_low?: boolean;
    relative_volume_min?: number;
  };
}

/**
 * Screening Criteria
 *
 * Reusable screening configuration for filtering market candidates.
 * Previously called "Setup" - renamed to better reflect its purpose.
 */
export interface ScreeningCriteria {
  id: string;
  name: string;
  description?: string;
  criteria: ScreeningCriteriaParams;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Backward compatibility alias
export type Setup = ScreeningCriteria;

/**
 * @deprecated Strategy configuration has been moved to the Fund model.
 * Use Fund interface instead. This is kept for backward compatibility only.
 */
export interface Strategy {
  id: string;
  fundId: string;
  executionStrategyId: string;
  screeningCriteriaId?: string;
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;
  maxOrderAgeSeconds?: number | null;
  sizePerTrade: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;
  tradingStartTime?: string;
  tradingEndTime?: string;
  timezone?: string;
  tradingDays?: string[];
  executionConfig: Record<string, any>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Fund Transfer Record
 *
 * Tracks deposits and withdrawals to/from a fund.
 */
export interface FundTransfer {
  id: string;
  fundId: string;
  amount: number;
  transferType: TransferType;
  timestamp: Date | string;
  notes?: string;
}

/**
 * Trade Record
 *
 * Master record for a complete trade (open to close).
 * Tracks the lifecycle of a position from entry through exit,
 * with comprehensive performance metrics and strategy context.
 */
export interface FundTrade {
  id: string;
  fundId: string;
  symbol: string;
  entryTime: Date | string;
  exitTime?: Date | string | null;
  entryPrice: number;
  exitPrice?: number | null;
  entryQuantity: number;
  exitQuantity?: number | null;
  realizedPnl?: number | null;
  realizedPnlPercent?: number | null;
  holdDurationSeconds?: number | null;
  status: string; // 'open', 'closed', 'partial'
  strategyId?: string | null;
  screeningCriteriaId?: string | null;
  aiConfidence?: number | null;
  commissionFees: number;
  maxAdverseExcursion?: number | null;
  maxFavorableExcursion?: number | null;
}

// ============================================================================
// Composite Types
// ============================================================================

/**
 * Fund with Associated Data
 *
 * Extended fund view including related screening and execution data.
 * @deprecated Fund now contains all configuration inline. Use Fund interface instead.
 */
export interface FundWithStrategy extends Fund {
  screeningCriteria?: ScreeningCriteria;
  executionStrategy?: ExecutionStrategy;
}

// ============================================================================
// Input Types (for API requests)
// ============================================================================

export interface CreateFundInput {
  name: string;
  description?: string;
  mode: FundMode;
  initialBalance?: number; // Optional, defaults to 0 if not provided

  // UI customization
  icon?: string;
  iconColor?: string;

  // Strategy configuration
  strategyId?: string | null;
  strategyConfig?: Record<string, any>;
  screeningCriteriaId?: string | null;

  // Risk parameters
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;
  maxOrderAgeSeconds?: number | null;

  // Position sizing
  sizePerTrade?: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;

  // Trading time windows
  tradingStartTime?: string;
  tradingEndTime?: string;
  timezone?: string;
}

export interface UpdateFundInput {
  name?: string;
  description?: string;
  balance?: number;

  // UI customization
  icon?: string;
  iconColor?: string;

  // Strategy configuration
  strategyId?: string | null;
  strategyConfig?: Record<string, any>;
  screeningCriteriaId?: string | null;

  // Risk parameters
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;
  maxOrderAgeSeconds?: number | null;

  // Position sizing
  sizePerTrade?: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;

  // Trading time windows
  tradingStartTime?: string;
  tradingEndTime?: string;
  timezone?: string;
}

/**
 * @deprecated Use UpdateFundInput instead. Strategy configuration is now part of Fund.
 */
export interface CreateStrategyInput {
  fundId: string;
  executionStrategyId: string;
  screeningCriteriaId?: string;
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;
  maxOrderAgeSeconds?: number | null;
  sizePerTrade: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;
  tradingStartTime?: string;
  tradingEndTime?: string;
  timezone?: string;
  tradingDays?: string[];
  executionConfig: Record<string, any>;
}

/**
 * @deprecated Use UpdateFundInput instead. Strategy configuration is now part of Fund.
 */
export interface UpdateStrategyInput
  extends Partial<Omit<CreateStrategyInput, "fundId">> {}

export interface CreateScreeningCriteriaInput {
  name: string;
  description?: string;
  criteria: ScreeningCriteriaParams;
}

export interface UpdateScreeningCriteriaInput
  extends Partial<CreateScreeningCriteriaInput> {}

// Backward compatibility aliases
export type CreateSetupInput = CreateScreeningCriteriaInput;
export type UpdateSetupInput = UpdateScreeningCriteriaInput;

export interface CreateTransferInput {
  fundId: string;
  amount: number;
  transferType: TransferType;
  notes?: string;
}

// ============================================================================
// Trading Control Types
// ============================================================================

/**
 * Active Position Status
 *
 * Real-time status of an open trading position.
 */
export interface PositionStatus {
  symbol: string;
  entryPrice: number;
  currentPrice?: number;
  quantity: number;
  pnl?: number;
  pnlPercent?: number;
  entryTime: string;
}

/**
 * Fund Trading Status
 *
 * Real-time trading status for a fund, including active positions.
 */
export interface FundTradingStatus {
  status: FundStatus;
  trading: boolean;
  activePositions: number;
  monitoredSymbols: number;
  positions: PositionStatus[];
}

/**
 * Running Fund Summary
 *
 * Summary info for funds that are currently trading.
 */
export interface RunningFundSummary {
  id: string;
  name: string;
  mode: FundMode;
  status: FundStatus;
  activePositions: number;
  monitoredSymbols: number;
}

/**
 * Fund Order
 *
 * Represents an order submitted to the broker for a fund.
 */
export interface FundOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  status: string; // pending, filled, partially_filled, canceled, failed
  orderType: string; // market, limit, stop
  submittedAt: string;
  filledAt?: string | null;
  filledQty?: number | null;
  filledAvgPrice?: number | null;
  alpacaOrderId?: string | null;
}

/**
 * Fund Transaction
 *
 * Represents a completed trade (filled order) in the ledger.
 */
export interface FundTransaction {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  totalValue: number;
  timestamp: string;
}
