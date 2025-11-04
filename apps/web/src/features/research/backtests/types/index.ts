/**
 * Backtest Types
 *
 * Type definitions for backtest management.
 */

export interface Backtest {
  id: string;
  fundId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  status: "running" | "completed" | "failed" | "cancelled";
  strategyId?: string;
  strategyConfig?: Record<string, any>;
  screeningCriteriaId?: string;

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
