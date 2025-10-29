/**
 * Fund Management Types
 *
 * Types for the fund management system including funds, strategies,
 * screening criteria, execution strategies, and fund transfers.
 */

export type FundMode = "sim" | "real";
export type TransferType = "deposit" | "withdrawal";
export type StrategyType = "math-based" | "ai-based" | "hybrid";

export interface Fund {
  id: string;
  name: string;
  description?: string;
  mode: FundMode;
  balance: number; // Current fund balance (also serves as AUM)
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionStrategy {
  id: string; // e.g., "bull_flag"
  name: string; // e.g., "Bull Flag Pattern"
  description: string;
  strategyType: StrategyType;
  expectedTimeframe: string; // e.g., "1-3 minutes"
  requiredIndicators: string[]; // e.g., ["MACD", "RSI"]
  configSchema: Record<string, any>; // JSON schema for configuration
}

export interface ScreeningCriteria {
  id: string;
  name: string;
  description?: string;
  criteria: Record<string, any>; // Flexible JSON for screener params
  createdAt: Date;
  updatedAt: Date;
}

// Backward compatibility alias
export type Setup = ScreeningCriteria;

export interface Strategy {
  id: string;
  fundId: string;
  // References to execution components
  executionStrategyId: string; // References ExecutionStrategy (e.g., "bull_flag")
  screeningCriteriaId?: string; // References ScreeningCriteria
  // Risk parameters
  maxLossPercent: number; // Max loss % per day
  maxLossDollars: number; // Max loss $ per day
  maxGivebackPercent: number; // Max loss from high water mark
  // Position sizing
  sizePerTrade: number; // Default position size
  minBetPercent: number; // Min % of fund per trade
  maxBetPercent: number; // Max % of fund per trade
  maxTotalExposure: number; // Max total $ in positions
  // Trading rules
  riskRewardRatio: number; // Default 2.0 for 2:1
  // Trading time windows
  tradingStartTime?: string; // e.g., "09:30" (market open)
  tradingEndTime?: string; // e.g., "16:00" (market close)
  timezone?: string; // e.g., "America/New_York" (default: ET)
  tradingDays?: string[]; // e.g., ["monday", "tuesday", "wednesday", "thursday", "friday"]
  // Strategy-specific configuration
  executionConfig: Record<string, any>; // Plugin-specific params
  createdAt: Date;
  updatedAt: Date;
}

export interface FundTransfer {
  id: string;
  fundId: string;
  amount: number;
  transferType: TransferType;
  timestamp: Date;
  notes?: string;
}

export interface FundWithStrategy extends Fund {
  strategy?: Strategy;
  screeningCriteria?: ScreeningCriteria;
  executionStrategy?: ExecutionStrategy;
}

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
  maxLossPercent: number;
  maxLossDollars: number;
  maxGivebackPercent: number;
  sizePerTrade: number;
  minBetPercent: number;
  maxBetPercent: number;
  maxTotalExposure: number;
  riskRewardRatio: number;
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
  criteria: Record<string, any>;
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
