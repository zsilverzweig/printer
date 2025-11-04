/**
 * Backtests Feature
 *
 * Exports for backtest management feature.
 */

export { BacktestDetailsDialog } from "./components/backtest-details-dialog";
export { BacktestManagement } from "./components/backtest-management";
export { BacktestsTable } from "./components/backtests-table";
export { RunBacktestDialog } from "./components/run-backtest-dialog";

export { useBacktests } from "./hooks/use-backtests";

export { backtestService } from "./services/backtest-service";

export type {
  Backtest,
  BacktestListResponse,
  BacktestOrder,
  BacktestOrdersResponse,
  BacktestTrade,
  BacktestTradesResponse,
  RunBacktestRequest,
} from "./types";
