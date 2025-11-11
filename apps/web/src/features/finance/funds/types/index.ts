/**
 * Fund Management Types
 *
 * Re-exports types from @printer/shared for convenience.
 * All types are now defined in the shared package for consistency across the monorepo.
 */

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
  FundTradingStatus,
  FundTransaction,
  FundTransfer,
  // Composite types
  FundWithStrategy,
  // Trading control types
  PositionStatus,
  RunningFundSummary,
  ScreeningCriteria,
  Setup, // Backward compatibility
  Strategy,
  StrategyType,
  TransferType,
  UpdateFundInput,
  UpdateScreeningCriteriaInput, // Backward compatibility
  UpdateSetupInput,
  UpdateStrategyInput,
} from "@printer/shared";

// Ticker Lifecycle State Types
export type TickerState =
  | "screened"
  | "setup"
  | "ordered"
  | "filled"
  | "exited"
  | "removed";

export interface StateTransition {
  fromState: TickerState | null;
  toState: TickerState;
  transitionCode: string;
  description: string;
  timestamp: string;
}

export interface TickerStateRecord {
  id: string;
  fundId: string;
  ticker: string;
  currentState: TickerState;
  stateTransitions: StateTransition[];
  lastScreenedAt: string | null;
  entryLevelId: string | null;
  tradeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FundLifecycleSummary {
  totalTracked: number;
  perState: Record<string, number>;
  tradingWindow?: {
    start: string;
    end: string;
    timezone?: string;
  };
}

export interface FundPositionsFund {
  fundId: string;
  fundName: string;
  fundMode: string;
  fundStatus: string;
  icon?: string | null;
  iconColor?: string | null;
  ticker?: string | null;
  quantity: number;
  avgEntryPrice: number;
  costBasis: number;
  marketValue: number | null;
  unrealizedPl: number | null;
  unrealizedPlPercent: number | null;
  updatedAt: string | null;
}

export interface FundPositionsGroup {
  symbol: string;
  latestPrice: number | null;
  totalQuantity: number;
  totalCostBasis: number;
  totalMarketValue: number | null;
  totalUnrealizedPl: number | null;
  funds: FundPositionsFund[];
}
