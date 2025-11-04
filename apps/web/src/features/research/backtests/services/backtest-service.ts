/**
 * Backtest Service
 *
 * Service for backtest CRUD operations using the backend API.
 */

import type {
  Backtest,
  BacktestListResponse,
  BacktestOrdersResponse,
  BacktestTradesResponse,
  RunBacktestRequest,
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Parse date strings and convert snake_case to camelCase from API responses
 */
function parseBacktest(data: any): Backtest {
  return {
    id: data.id,
    fundId: data.fund_id ?? data.fundId,
    fundName: data.fund_name ?? data.fundName,
    date: data.date,
    status: data.status,
    strategyId: data.strategy_id ?? data.strategyId,
    strategyConfig: data.strategy_config ?? data.strategyConfig,
    screeningCriteriaId: data.screening_criteria_id ?? data.screeningCriteriaId,
    screeningCriteriaName: data.screening_criteria_name ?? data.screeningCriteriaName,
    startingBalance: Number(data.starting_balance ?? data.startingBalance ?? 0),
    endingBalance: data.ending_balance ?? data.endingBalance,
    totalPnl: data.total_pnl ?? data.totalPnl,
    totalPnlPercent: data.total_pnl_percent ?? data.totalPnlPercent,
    totalTrades: Number(data.total_trades ?? data.totalTrades ?? 0),
    winningTrades: Number(data.winning_trades ?? data.winningTrades ?? 0),
    losingTrades: Number(data.losing_trades ?? data.losingTrades ?? 0),
    totalOrders: Number(data.total_orders ?? data.totalOrders ?? 0),
    filledOrders: Number(data.filled_orders ?? data.filledOrders ?? 0),
    cancelledOrders: Number(data.cancelled_orders ?? data.cancelledOrders ?? 0),
    startedAt: data.started_at ?? data.startedAt,
    completedAt: data.completed_at ?? data.completedAt,
    errorMessage: data.error_message ?? data.errorMessage,
    liveOrders: data.live_orders ?? data.liveOrders,
    liveFilled: data.live_filled ?? data.liveFilled,
    liveTransactions: data.live_transactions ?? data.liveTransactions,
  };
}

export const backtestService = {
  /**
   * List backtests with optional filters
   */
  async listBacktests(
    fundId?: string,
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<BacktestListResponse> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    });

    if (fundId) {
      params.append("fund_id", fundId);
    }

    if (status) {
      params.append("status", status);
    }

    const response = await fetch(`${API_BASE}/api/backtests?${params}`);
    if (!response.ok) {
      throw new Error("Failed to fetch backtests");
    }

    const data = await response.json();
    return {
      backtests: data.backtests.map(parseBacktest),
      total: data.total ?? data.backtests.length,
      limit: data.limit ?? limit,
      offset: data.offset ?? offset,
    };
  },

  /**
   * Get a single backtest by ID
   */
  async getBacktest(backtestId: string): Promise<Backtest> {
    const response = await fetch(`${API_BASE}/api/backtests/${backtestId}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Backtest ${backtestId} not found`);
      }
      throw new Error("Failed to fetch backtest");
    }

    const data = await response.json();
    return parseBacktest(data);
  },

  /**
   * Run a new backtest
   */
  async runBacktest(request: RunBacktestRequest): Promise<Backtest> {
    const response = await fetch(`${API_BASE}/api/backtests/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fund_id: request.fundId,
        date: request.date,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to run backtest");
    }

    const data = await response.json();
    return parseBacktest(data);
  },

  /**
   * Get orders for a backtest
   */
  async getBacktestOrders(
    backtestId: string,
    limit: number = 100
  ): Promise<BacktestOrdersResponse> {
    const response = await fetch(
      `${API_BASE}/api/backtests/${backtestId}/orders?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch backtest orders");
    }

    const data = await response.json();
    return {
      backtestId: data.backtest_id ?? data.backtestId,
      orders: data.orders.map((o: any) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        quantity: Number(o.quantity),
        status: o.status,
        orderType: o.order_type ?? o.orderType,
        submittedAt: o.submitted_at ?? o.submittedAt,
        filledAt: o.filled_at ?? o.filledAt,
        filledQty: o.filled_qty ?? o.filledQty,
        filledAvgPrice: o.filled_avg_price ?? o.filledAvgPrice,
      })),
      total: data.total ?? data.orders.length,
    };
  },

  /**
   * Get trades for a backtest
   */
  async getBacktestTrades(
    backtestId: string,
    limit: number = 100
  ): Promise<BacktestTradesResponse> {
    const response = await fetch(
      `${API_BASE}/api/backtests/${backtestId}/trades?limit=${limit}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch backtest trades");
    }

    const data = await response.json();
    return {
      backtestId: data.backtest_id ?? data.backtestId,
      trades: data.trades.map((t: any) => ({
        id: t.id,
        symbol: t.symbol,
        entryPrice: Number(t.entry_price ?? t.entryPrice),
        entryTime: t.entry_time ?? t.entryTime,
        exitPrice: t.exit_price ?? t.exitPrice,
        exitTime: t.exit_time ?? t.exitTime,
        quantity: Number(t.quantity),
        realizedPnl: t.realized_pnl ?? t.realizedPnl,
        realizedPnlPercent: t.realized_pnl_percent ?? t.realizedPnlPercent,
        status: t.status,
      })),
      total: data.total ?? data.trades.length,
    };
  },
};
