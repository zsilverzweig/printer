/**
 * Analytics API Service
 *
 * Client for trade analytics and performance management endpoints.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface TradeRecord {
  id: string;
  fund_id: string;
  symbol: string;
  entry_time: string;
  exit_time: string | null;
  entry_price: number;
  exit_price: number | null;
  entry_quantity: number;
  exit_quantity: number | null;
  realized_pnl: number | null;
  realized_pnl_percent: number | null;
  hold_duration_seconds: number | null;
  status: "open" | "closed" | "partial" | "pending";
  strategy_id: string | null;
  screening_criteria_id: string | null;
  ai_confidence: number | null;
}

export interface TradeDetail extends TradeRecord {
  ai_reasoning: string | null;
  max_adverse_excursion: number | null;
  max_favorable_excursion: number | null;
  commission_fees: number;
  trade_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PerformanceMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number;
  average_win: number;
  average_loss: number;
  profit_factor: number | null;
  expectancy: number;
  total_pnl: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  calmar_ratio: number;
  max_drawdown: number;
  max_drawdown_duration_seconds: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
  current_streak: number;
  current_streak_type: string;
  best_trade: number;
  worst_trade: number;
  median_trade: number;
  average_hold_duration_seconds: number;
  hourly_performance?: Record<
    string,
    { avg_pnl: number; total_pnl: number; count: number }
  >;
  daily_performance?: Record<
    string,
    { avg_pnl: number; total_pnl: number; count: number }
  >;
  best_hour?: number | null;
  best_day?: string | null;
}

export interface PatternPerformance {
  criteria_id: string;
  criteria_name: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  average_pnl: number;
  average_win: number;
  average_loss: number;
  profit_factor: number | null;
  best_trade: number;
  worst_trade: number;
  average_hold_duration_seconds: number;
  sample_size: number;
  statistically_significant: boolean;
}

export interface EquityPoint {
  timestamp: string;
  trade_id: string;
  symbol: string;
  trade_pnl: number;
  cumulative_pnl: number;
  peak: number;
  drawdown: number;
  drawdown_percent: number;
}

class AnalyticsService {
  async getTrades(
    params: {
      fund_id?: string;
      symbol?: string;
      status?: string;
      screening_criteria_id?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ trades: TradeRecord[]; total: number }> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });

    const response = await fetch(
      `${API_BASE}/api/analytics/trades?${queryParams}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch trades: ${response.statusText}`);
    }

    return response.json();
  }

  async getTradeDetail(tradeId: string): Promise<TradeDetail> {
    const response = await fetch(`${API_BASE}/api/analytics/trades/${tradeId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch trade detail: ${response.statusText}`);
    }

    return response.json();
  }

  async getFundMetrics(
    fundId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    fund_id: string;
    fund_name: string;
    metrics: PerformanceMetrics;
  }> {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append("start_date", startDate);
    if (endDate) queryParams.append("end_date", endDate);

    const response = await fetch(
      `${API_BASE}/api/analytics/metrics/${fundId}?${queryParams}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch metrics: ${response.statusText}`);
    }

    return response.json();
  }

  async getPatterns(
    fundId?: string,
    minSampleSize: number = 5
  ): Promise<{ patterns: PatternPerformance[]; total_patterns: number }> {
    const queryParams = new URLSearchParams();
    if (fundId) queryParams.append("fund_id", fundId);
    queryParams.append("min_sample_size", String(minSampleSize));

    const response = await fetch(
      `${API_BASE}/api/analytics/patterns?${queryParams}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch patterns: ${response.statusText}`);
    }

    return response.json();
  }

  async getEquityCurve(
    fundId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    fund_id: string;
    equity_curve: EquityPoint[];
    total_trades: number;
    final_pnl: number;
  }> {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append("start_date", startDate);
    if (endDate) queryParams.append("end_date", endDate);

    const response = await fetch(
      `${API_BASE}/api/analytics/equity-curve/${fundId}?${queryParams}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch equity curve: ${response.statusText}`);
    }

    return response.json();
  }

  async getHeatmap(fundId: string): Promise<{
    fund_id: string;
    hourly_performance: Record<
      string,
      { avg_pnl: number; total_pnl: number; count: number }
    >;
    daily_performance: Record<
      string,
      { avg_pnl: number; total_pnl: number; count: number }
    >;
    best_hour: number | null;
    best_day: string | null;
  }> {
    const response = await fetch(`${API_BASE}/api/analytics/heatmap/${fundId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch heatmap: ${response.statusText}`);
    }

    return response.json();
  }

  async getComparative(fundIds?: string[]): Promise<{
    funds: Array<{
      fund_id: string;
      fund_name: string;
      metrics: PerformanceMetrics;
    }>;
    total_funds: number;
  }> {
    const queryParams = new URLSearchParams();
    if (fundIds && fundIds.length > 0) {
      queryParams.append("fund_ids", fundIds.join(","));
    }

    const response = await fetch(
      `${API_BASE}/api/analytics/comparative?${queryParams}`
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch comparative analysis: ${response.statusText}`
      );
    }

    return response.json();
  }

  async rebuildTrades(
    fundId: string
  ): Promise<{ message: string; stats: any }> {
    const response = await fetch(
      `${API_BASE}/api/analytics/rebuild-trades/${fundId}`,
      { method: "POST" }
    );

    if (!response.ok) {
      throw new Error(`Failed to rebuild trades: ${response.statusText}`);
    }

    return response.json();
  }
}

export const analyticsService = new AnalyticsService();
