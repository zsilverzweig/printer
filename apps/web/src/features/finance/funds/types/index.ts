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
