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
  FundStatus,
  FundTradingStatus,
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
