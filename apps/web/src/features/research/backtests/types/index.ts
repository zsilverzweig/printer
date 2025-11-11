/**
 * Backtest Types
 *
 * Type definitions for backtest management.
 */

export interface Backtest {
  id: string;
  fundId: string;
  fundName?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  status: "running" | "completed" | "failed" | "cancelled";
  strategyId?: string;
  strategyConfig?: Record<string, unknown>;
  screeningCriteriaId?: string;
  screeningCriteriaName?: string;

  // Results
  startingBalance: number;
  endingBalance?: number;
  totalPnl?: number;
  totalPnlPercent?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalOrders: number;
  filledOrders: number;
  cancelledOrders: number;

  // Timing
  startedAt: string; // ISO datetime
  completedAt?: string; // ISO datetime

  // Error tracking
  errorMessage?: string;

  // Live data for running backtests
  liveOrders?: number;
  liveFilled?: number;
  liveTransactions?: number;
}

export interface RunBacktestRequest {
  fundId: string;
  date: string; // YYYY-MM-DD format
  monitoringIntervalMinutes?: number;
  durationMinutes?: number;
}

export interface BacktestMetrics {
  totalMinutes?: number;
  strategyIterations?: number;
  elapsedMs?: number;
  avgIterationMs?: number;
  monitoringIntervalMinutes?: number;
  durationMinutes?: number | null;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  totalOrders?: number;
  filledOrders?: number;
  cancelledOrders?: number;
  totalPnl?: number;
  totalPnlPercent?: number;
  winRate?: number;
  fillRate?: number;
}

export interface BacktestMetricsResponse {
  backtestId: string;
  metrics: BacktestMetrics;
}

export interface BacktestOrder {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  status: string;
  orderType: string;
  submittedAt: string;
  filledAt?: string;
  filledQty?: number;
  filledAvgPrice?: number;
}

export interface BacktestTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  entryTime: string;
  exitPrice?: number;
  exitTime?: string;
  quantity: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  status: string;
}

export interface BacktestListResponse {
  backtests: Backtest[];
  total: number;
  limit: number;
  offset: number;
}

export interface BacktestOrdersResponse {
  backtestId: string;
  orders: BacktestOrder[];
  total: number;
}

export interface BacktestTradesResponse {
  backtestId: string;
  trades: BacktestTrade[];
  total: number;
}

export interface BacktestEvent {
  id: string;
  backtestId: string;
  fundId: string;
  eventType: string;
  simulatedTime?: string | null;
  sequence: number;
  message?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface BacktestEventsResponse {
  backtestId: string;
  events: BacktestEvent[];
}

export interface StrategyScreenerCombo {
  strategyId: string;
  strategyConfig?: Record<string, unknown>;
  screeningCriteriaId?: string | null;
}

export interface MultiStrategyBacktestRequest {
  fundTemplateId: string;
  date: string; // YYYY-MM-DD format
  combinations: StrategyScreenerCombo[];
}

export interface MultiStrategyBacktestResult {
  backtestId?: string | null;
  fundId?: string | null;
  strategyId: string;
  screeningCriteriaId?: string | null;
  status: string;
  startingBalance?: number;
  endingBalance?: number;
  totalPnl?: number;
  totalPnlPercent?: number;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  error?: string;
}

export interface MultiStrategyBacktestSummary {
  totalCombinations: number;
  successful: number;
  failed: number;
  totalPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

export interface MultiStrategyBacktestResponse {
  parentRunId: string;
  backtests: MultiStrategyBacktestResult[];
  summary: MultiStrategyBacktestSummary;
}

export interface ScreenerBacktestRunRequest {
  date: string; // YYYY-MM-DD format
  intervalMinutes?: number;
  fundIds?: string[];
}

export interface ScreenerBacktestPoint {
  timestampUtc: string;
  timestampLocal: string;
  count: number;
  tickers: string[];
}

export interface ScreenerBacktestSeries {
  criteriaId: string;
  criteriaName: string;
  description?: string | null;
  totalHits: number;
  uniqueTickerCount: number;
  points: ScreenerBacktestPoint[];
}

export interface ScreenerBacktestResponse {
  date: string;
  startUtc: string;
  endUtc: string;
  intervalMinutes: number;
  criteriaCount: number;
  series: ScreenerBacktestSeries[];
}
