/**
 * Fund Management Types
 *
 * Types for the fund management system including funds, strategies, setups,
 * and fund transfers.
 */

export type FundMode = "sim" | "real";
export type TransferType = "deposit" | "withdrawal";

export interface Fund {
  id: string;
  name: string;
  description?: string;
  mode: FundMode;
  balance: number; // Current fund balance (also serves as AUM)
  createdAt: Date;
  updatedAt: Date;
}

export interface Strategy {
  id: string;
  fundId: string;
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
  aiTradingPrompt: string; // Text guidance for AI
  chartTimeHorizon: string; // e.g., "5d", "1mo"
  chartGranularity: string; // e.g., "5min", "1hour"
  // Trading time windows
  tradingStartTime?: string; // e.g., "09:30" (market open)
  tradingEndTime?: string; // e.g., "16:00" (market close)
  timezone?: string; // e.g., "America/New_York" (default: ET)
  tradingDays?: string[]; // e.g., ["monday", "tuesday", "wednesday", "thursday", "friday"]
  createdAt: Date;
  updatedAt: Date;
}

export interface Setup {
  id: string;
  name: string;
  description?: string;
  screeningCriteria: Record<string, any>; // Flexible JSON for screener params
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
  setup?: Setup;
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
  maxLossPercent: number;
  maxLossDollars: number;
  maxGivebackPercent: number;
  sizePerTrade: number;
  minBetPercent: number;
  maxBetPercent: number;
  maxTotalExposure: number;
  riskRewardRatio: number;
  aiTradingPrompt: string;
  chartTimeHorizon: string;
  chartGranularity: string;
  tradingStartTime?: string;
  tradingEndTime?: string;
  timezone?: string;
  tradingDays?: string[];
}

export interface UpdateStrategyInput
  extends Partial<Omit<CreateStrategyInput, "fundId">> {}

export interface CreateSetupInput {
  name: string;
  description?: string;
  screeningCriteria: Record<string, any>;
}

export interface UpdateSetupInput extends Partial<CreateSetupInput> {}

export interface CreateTransferInput {
  fundId: string;
  amount: number;
  transferType: TransferType;
  notes?: string;
}
