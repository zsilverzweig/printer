/**
 * Fund Management Types
 *
 * Re-exports types from @printer/shared for convenience.
 * All types are now defined in the shared package for consistency across the monorepo.
 */

export type {
  // Input types
  CreateFundInput,
  CreateStrategyInput, // Backward compatibility
  CreateTransferInput,
  ExecutionStrategy,
  // Core entities
  Fund,
  FundOrder,
  FundTransaction,
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
  Strategy,
  StrategyType,
  TransferType,
  UpdateFundInput,
  UpdateStrategyInput,
} from "@printer/shared";

// Local setup types (deprecated legacy UI helpers)
export interface Setup {
  id: string;
  name: string;
  description?: string;
  screeningCriteria: Record<string, any>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CreateSetupInput {
  name: string;
  description?: string;
  screeningCriteria: Record<string, any>;
}

export type UpdateSetupInput = Partial<CreateSetupInput>;
