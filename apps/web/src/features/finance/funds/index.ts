/**
 * Fund Management Feature Exports
 *
 * Public API for the fund management feature.
 */

// Types
export * from "./types";

// Components
export { AlpacaAccountsCard } from "./components/alpaca-accounts-card";
export { AlpacaBalanceSummary } from "./components/alpaca-balance-summary";
export { CreateFundDialog } from "./components/create-fund-dialog";
export { FundCard } from "./components/fund-card";
export { FundDetailView } from "./components/fund-detail-view";
export { FundLedger } from "./components/fund-ledger";
export { FundList } from "./components/fund-list";
export { FundManagement } from "./components/fund-management";
export { FundOverview } from "./components/fund-overview";
export { FundPerformanceCard } from "./components/fund-performance-card";
export { FundPerformanceOverview } from "./components/fund-performance-overview";
export { FundTransferForm } from "./components/fund-transfer-form";
export { RiskManagement } from "./components/risk-management";
export { SetupEditor } from "./components/setup-editor";
export { SetupSelector } from "./components/setup-selector";
export { StrategySelection } from "./components/strategy-selection";
export { TimeWindows } from "./components/time-windows";
export { TradingActivityFeed } from "./components/trading-activity-feed";

// Hooks
export { useFundDetails } from "./hooks/use-fund-details";
export { useFundLedger } from "./hooks/use-fund-ledger";
export { useFundPerformance } from "./hooks/use-fund-performance";
export { useFundTransfers } from "./hooks/use-fund-transfers";
export { useFunds } from "./hooks/use-funds";

// Services
export { fundService } from "./services/fund-service";
export { setupService } from "./services/setup-service";
export { transferService } from "./services/transfer-service";

// Utilities
export {
  calculateFundBalance,
  calculatePerformanceMetrics,
  formatCurrency,
  formatPercent,
} from "./utils/ledger-calculations";
export type {
  FundBalanceCalculation,
  PerformanceMetrics,
  PerformanceWindow,
} from "./utils/ledger-calculations";
