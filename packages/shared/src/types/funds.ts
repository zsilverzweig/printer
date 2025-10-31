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

  // Risk parameters (optional - null/undefined means no limit)
  maxLossPercent?: number | null; // Max loss % per day
  maxLossDollars?: number | null; // Max loss $ per day
  maxGivebackPercent?: number | null; // Max loss from high water mark

  // Position sizing
  sizePerTrade: number; // Default position size (required)
  minBetPercent?: number | null; // Min % of fund per trade
  maxBetPercent?: number | null; // Max % of fund per trade
  maxTotalExposure?: number | null; // Max total $ in positions

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

  // Risk parameters
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;

  // Position sizing
  sizePerTrade?: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;
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

  // Risk parameters
  maxLossPercent?: number | null;
  maxLossDollars?: number | null;
  maxGivebackPercent?: number | null;

  // Position sizing
  sizePerTrade?: number;
  minBetPercent?: number | null;
  maxBetPercent?: number | null;
  maxTotalExposure?: number | null;
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
