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
 * Represents a trading account with its own balance, mode (sim/real),
 * and associated strategy configuration.
 */
export interface Fund {
  id: string;
  name: string;
  description?: string;
  mode: FundMode;
  balance: number; // Current fund balance (also serves as AUM)
  status: FundStatus; // Trading status: active or paused
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
  requiredIndicators: string[]; // e.g., ["MACD", "RSI"]
  configSchema: Record<string, any>; // JSON schema for configuration
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
  sic_codes?: string[]; // Industry SIC codes

  // Real-time screener filters (price/volume dynamics)
  min_price?: number; // Min yesterday's close price
  max_price?: number; // Max yesterday's close price
  min_volume?: number; // Min volume for liquidity
  min_change_percent?: number; // Min % change from yesterday's close
  order_by?: string; // Sort field: "rv14" | "rv30" | "rv60" | "avg_volume"
  limit?: number; // Max results to return
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
 * Trading Strategy Configuration
 *
 * Complete strategy for a fund, linking:
 * - ExecutionStrategy (code plugin like "bull_flag")
 * - ScreeningCriteria (reusable screening config)
 * - Risk parameters, position sizing, and execution configuration
 *
 * Note: Risk parameters are optional. When null/undefined, those risk checks are disabled.
 */
export interface Strategy {
  id: string;
  fundId: string;
  // References to execution components
  executionStrategyId: string; // References ExecutionStrategy (e.g., "bull_flag")
  screeningCriteriaId?: string; // References ScreeningCriteria
  // Risk parameters (optional - null/undefined means no limit)
  maxLossPercent?: number | null; // Max loss % per day
  maxLossDollars?: number | null; // Max loss $ per day
  maxGivebackPercent?: number | null; // Max loss from high water mark
  // Position sizing
  sizePerTrade: number; // Default position size (required)
  minBetPercent?: number | null; // Min % of fund per trade
  maxBetPercent?: number | null; // Max % of fund per trade
  maxTotalExposure?: number | null; // Max total $ in positions
  // Trading time windows
  tradingStartTime?: string; // e.g., "09:30" (market open)
  tradingEndTime?: string; // e.g., "16:00" (market close)
  timezone?: string; // e.g., "America/New_York" (default: ET)
  tradingDays?: string[]; // e.g., ["monday", "tuesday", "wednesday", "thursday", "friday"]
  // Strategy-specific configuration
  executionConfig: Record<string, any>; // Plugin-specific params
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

// ============================================================================
// Composite Types
// ============================================================================

/**
 * Fund with Associated Data
 *
 * Extended fund view including related strategy, screening, and execution data.
 */
export interface FundWithStrategy extends Fund {
  strategy?: Strategy;
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
  initialBalance: number;
}

export interface UpdateFundInput {
  name?: string;
  description?: string;
  balance?: number;
}

export interface CreateStrategyInput {
  fundId: string;
  executionStrategyId: string;
  screeningCriteriaId?: string;
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;
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
