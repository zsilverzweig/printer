/**
 * Backtest Service
 *
 * Service for backtest CRUD operations using the backend API.
 */

import type {
  Backtest,
  BacktestEvent,
  BacktestEventsResponse,
  BacktestListResponse,
  BacktestMetrics,
  BacktestMetricsResponse,
  BacktestOrdersResponse,
  BacktestTradesResponse,
  MultiStrategyBacktestRequest,
  MultiStrategyBacktestResponse,
  RunBacktestRequest,
  ScreenerBacktestResponse,
  ScreenerBacktestRunRequest,
} from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function resolveBacktestWebSocketUrl(backtestId: string): string {
  const wsUrl = new URL(`/api/backtests/ws/${backtestId}`, API_BASE);
  wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
  return wsUrl.toString();
}

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
    screeningCriteriaName:
      data.screening_criteria_name ?? data.screeningCriteriaName,
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

function parseScreenerBacktest(data: any): ScreenerBacktestResponse {
  const rawSeries = Array.isArray(data.series) ? data.series : [];

  return {
    date: data.date,
    startUtc: data.start_utc ?? data.startUtc,
    endUtc: data.end_utc ?? data.endUtc,
    intervalMinutes: Number(
      data.interval_minutes ?? data.intervalMinutes ?? 60
    ),
    criteriaCount: Number(
      data.criteria_count ?? data.criteriaCount ?? rawSeries.length
    ),
    series: rawSeries.map((series: any) => {
      const rawPoints = Array.isArray(series.points) ? series.points : [];

      return {
        criteriaId: series.criteria_id ?? series.criteriaId,
        criteriaName: series.criteria_name ?? series.criteriaName,
        description: series.description ?? null,
        totalHits: Number(series.total_hits ?? series.totalHits ?? 0),
        uniqueTickerCount: Number(
          series.unique_ticker_count ?? series.uniqueTickerCount ?? 0
        ),
        points: rawPoints.map((point: any) => ({
          timestampUtc: point.timestamp_utc ?? point.timestampUtc,
          timestampLocal: point.timestamp_local ?? point.timestampLocal,
          count: Number(point.count ?? 0),
          tickers: Array.isArray(point.tickers) ? point.tickers : [],
        })),
      };
    }),
  };
}

export function parseBacktestEvent(data: any): BacktestEvent {
  return {
    id: data.id,
    backtestId: data.backtest_id ?? data.backtestId,
    fundId: data.fund_id ?? data.fundId,
    eventType: data.event_type ?? data.eventType,
    simulatedTime: data.simulated_time ?? data.simulatedTime ?? null,
    sequence: Number(data.sequence ?? 0),
    message: data.message ?? null,
    details:
      typeof data.details === "object" && data.details !== null
        ? data.details
        : typeof data.metadata === "object" && data.metadata !== null
        ? data.metadata
        : {},
    createdAt: data.created_at ?? data.createdAt,
  };
}

function parseBacktestMetrics(data: any): BacktestMetrics {
  const numberOrUndefined = (value: any): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    totalMinutes: numberOrUndefined(data.total_minutes ?? data.totalMinutes),
    strategyIterations: numberOrUndefined(
      data.strategy_iterations ?? data.strategyIterations
    ),
    elapsedMs: numberOrUndefined(data.elapsed_ms ?? data.elapsedMs),
    avgIterationMs: numberOrUndefined(
      data.avg_iteration_ms ?? data.avgIterationMs
    ),
    monitoringIntervalMinutes: numberOrUndefined(
      data.monitoring_interval_minutes ?? data.monitoringIntervalMinutes
    ),
    durationMinutes:
      numberOrUndefined(data.duration_minutes ?? data.durationMinutes) ?? null,
    totalTrades: numberOrUndefined(data.total_trades ?? data.totalTrades),
    winningTrades: numberOrUndefined(data.winning_trades ?? data.winningTrades),
    losingTrades: numberOrUndefined(data.losing_trades ?? data.losingTrades),
    totalOrders: numberOrUndefined(data.total_orders ?? data.totalOrders),
    filledOrders: numberOrUndefined(data.filled_orders ?? data.filledOrders),
    cancelledOrders: numberOrUndefined(
      data.cancelled_orders ?? data.cancelledOrders
    ),
    totalPnl: numberOrUndefined(data.total_pnl ?? data.totalPnl),
    totalPnlPercent: numberOrUndefined(
      data.total_pnl_percent ?? data.totalPnlPercent
    ),
    winRate: numberOrUndefined(data.win_rate ?? data.winRate),
    fillRate: numberOrUndefined(data.fill_rate ?? data.fillRate),
  };
}

export const backtestService = {
  /**
   * List backtests with optional filters
   */
  async listBacktests(
    fundId?: string,
    status?: string,
    limit = 50,
    offset = 0
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
   * Get aggregate metrics for a backtest
   */
  async getBacktestMetrics(
    backtestId: string
  ): Promise<BacktestMetricsResponse> {
    const response = await fetch(
      `${API_BASE}/api/backtests/${backtestId}/metrics`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch backtest metrics");
    }
    const data = await response.json();
    const metrics = parseBacktestMetrics(data.metrics ?? {});
    return {
      backtestId: data.backtest_id ?? data.backtestId ?? backtestId,
      metrics,
    };
  },

  /**
   * Fetch persisted backtest events for initial hydration
   */
  async getBacktestEvents(
    backtestId: string,
    limit = 1000
  ): Promise<BacktestEventsResponse> {
    const response = await fetch(
      `${API_BASE}/api/backtests/${backtestId}/events?limit=${limit}`
    );
    if (!response.ok) {
      throw new Error("Failed to fetch backtest events");
    }
    const data = await response.json();
    const rawEvents = Array.isArray(data.events) ? data.events : [];
    return {
      backtestId: data.backtest_id ?? data.backtestId ?? backtestId,
      events: rawEvents.map(parseBacktestEvent),
    };
  },

  /**
   * Subscribe to backtest websocket for live updates
   */
  openBacktestWebSocket(
    backtestId: string,
    onEvent: (event: BacktestEvent) => void,
    onError?: (error: Event) => void
  ): () => void {
    const socket = new WebSocket(resolveBacktestWebSocketUrl(backtestId));

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        onEvent(parseBacktestEvent(payload));
      } catch (error) {
        console.error("Failed to parse backtest event message:", error);
      }
    };

    if (onError) {
      socket.onerror = onError;
    }

    return () => {
      socket.close();
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
    const payload: Record<string, unknown> = {
      fund_id: request.fundId,
      date: request.date,
    };

    if (typeof request.monitoringIntervalMinutes === "number") {
      payload.monitoring_interval_minutes = request.monitoringIntervalMinutes;
    }

    if (typeof request.durationMinutes === "number") {
      payload.duration_minutes = request.durationMinutes;
    }

    const response = await fetch(`${API_BASE}/api/backtests/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
    limit = 100
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
    limit = 100
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

  /**
   * Run multi-strategy backtest
   */
  async runMultiStrategyBacktest(
    request: MultiStrategyBacktestRequest
  ): Promise<MultiStrategyBacktestResponse> {
    const response = await fetch(`${API_BASE}/api/backtests/run-multi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fund_template_id: request.fundTemplateId,
        date: request.date,
        combinations: request.combinations.map((c) => ({
          strategy_id: c.strategyId,
          strategy_config: c.strategyConfig || {},
          screening_criteria_id: c.screeningCriteriaId || null,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to run multi-strategy backtest");
    }

    const data = await response.json();
    return {
      parentRunId: data.parent_run_id ?? data.parentRunId,
      backtests: data.backtests || [],
      summary: data.summary || {},
    };
  },

  /**
   * Run screener backtest across all criteria for a given date.
   */
  async runScreenerBacktest(
    request: ScreenerBacktestRunRequest
  ): Promise<ScreenerBacktestResponse> {
    const payload: Record<string, unknown> = {
      date: request.date,
      interval_minutes: request.intervalMinutes ?? 60,
    };

    if (request.fundIds && request.fundIds.length > 0) {
      payload.fund_ids = request.fundIds;
    }

    const response = await fetch(`${API_BASE}/api/backtests/screener/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      const detail =
        (data && (data.detail ?? data.message)) ||
        "Failed to run screener backtest";
      throw new Error(detail);
    }

    return parseScreenerBacktest(data);
  },
};

export const getBacktestWebSocketUrl = resolveBacktestWebSocketUrl;
