/**
 * Fund Service
 *
 * Service for fund CRUD operations using the backend API.
 */

import type {
  CreateFundInput,
  Fund,
  FundTradingStatus,
  UpdateFundInput,
} from "@printer/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Parse date strings and convert snake_case to camelCase from API responses
 */
function parseFundDates(data: any): Fund {
  return {
    ...data,
    // Convert snake_case to camelCase
    strategyId: data.strategy_id ?? data.strategyId,
    strategyConfig: data.strategy_config || data.strategyConfig || {},
    screeningCriteriaId: data.screening_criteria_id ?? data.screeningCriteriaId,
    maxLossPercent: data.max_loss_percent ?? data.maxLossPercent,
    maxLossDollars: data.max_loss_dollars ?? data.maxLossDollars,
    maxGivebackPercent: data.max_giveback_percent ?? data.maxGivebackPercent,
    maxOrderAgeSeconds: data.max_order_age_seconds ?? data.maxOrderAgeSeconds,
    sizePerTrade: data.size_per_trade ?? data.sizePerTrade ?? 1000.0,
    minBetPercent: data.min_bet_percent ?? data.minBetPercent,
    maxBetPercent: data.max_bet_percent ?? data.maxBetPercent,
    maxTotalExposure: data.max_total_exposure ?? data.maxTotalExposure,
    tradingStartTime: data.trading_start_time ?? data.tradingStartTime,
    tradingEndTime: data.trading_end_time ?? data.tradingEndTime,
    timezone: data.timezone,
    createdAt: new Date(data.created_at || data.createdAt),
    updatedAt: new Date(data.updated_at || data.updatedAt),
  };
}

export const fundService = {
  /**
   * Get all funds
   */
  async getFunds(): Promise<Fund[]> {
    const response = await fetch(`${API_BASE}/api/funds`);
    if (!response.ok) {
      throw new Error("Failed to fetch funds");
    }
    const data = await response.json();
    return data.map(parseFundDates);
  },

  /**
   * Get a single fund by ID
   */
  async getFund(id: string): Promise<Fund | null> {
    const response = await fetch(`${API_BASE}/api/funds/${id}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error("Failed to fetch fund");
    }
    const data = await response.json();
    return parseFundDates(data);
  },

  /**
   * Create a new fund
   */
  async createFund(input: CreateFundInput): Promise<Fund> {
    const response = await fetch(`${API_BASE}/api/funds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        mode: input.mode,
        initial_balance: input.initialBalance,
        // Strategy configuration
        strategy_id: input.strategyId,
        strategy_config: input.strategyConfig || {},
        screening_criteria_id: input.screeningCriteriaId,
        // Risk parameters
        max_loss_percent: input.maxLossPercent,
        max_loss_dollars: input.maxLossDollars,
        max_giveback_percent: input.maxGivebackPercent,
        max_order_age_seconds: input.maxOrderAgeSeconds,
        // Position sizing
        size_per_trade: input.sizePerTrade,
        min_bet_percent: input.minBetPercent,
        max_bet_percent: input.maxBetPercent,
        max_total_exposure: input.maxTotalExposure,
        // Trading time windows
        trading_start_time: input.tradingStartTime,
        trading_end_time: input.tradingEndTime,
        timezone: input.timezone,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create fund");
    }

    const data = await response.json();
    return parseFundDates(data);
  },

  /**
   * Update an existing fund
   */
  async updateFund(id: string, input: UpdateFundInput): Promise<Fund> {
    const response = await fetch(`${API_BASE}/api/funds/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        balance: input.balance,
        // Strategy configuration
        strategy_id: input.strategyId,
        strategy_config: input.strategyConfig,
        screening_criteria_id: input.screeningCriteriaId,
        // Risk parameters
        max_loss_percent: input.maxLossPercent,
        max_loss_dollars: input.maxLossDollars,
        max_giveback_percent: input.maxGivebackPercent,
        max_order_age_seconds: input.maxOrderAgeSeconds,
        // Position sizing
        size_per_trade: input.sizePerTrade,
        min_bet_percent: input.minBetPercent,
        max_bet_percent: input.maxBetPercent,
        max_total_exposure: input.maxTotalExposure,
        // Trading time windows
        trading_start_time: input.tradingStartTime,
        trading_end_time: input.tradingEndTime,
        timezone: input.timezone,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to update fund");
    }

    const data = await response.json();
    return parseFundDates(data);
  },

  /**
   * Delete a fund
   */
  async deleteFund(id: string): Promise<void> {
    // Note: Delete endpoint not yet implemented in backend
    // This is a placeholder for future implementation
    throw new Error("Delete fund not yet implemented");
  },

  /**
   * Start trading for a fund
   */
  async startTrading(fundId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/start`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to start trading");
    }
  },

  /**
   * Stop trading for a fund
   */
  async stopTrading(fundId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/stop`, {
      method: "POST",
    });

    if (!response.ok) {
      // If fund is not trading (404), treat as success since the goal is achieved
      if (response.status === 404) {
        return;
      }
      const error = await response.json();
      throw new Error(error.detail || "Failed to stop trading");
    }
  },

  /**
   * Get trading status and active positions for a fund
   */
  async getTradingStatus(fundId: string): Promise<FundTradingStatus> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/status`);

    if (!response.ok) {
      throw new Error("Failed to fetch trading status");
    }

    const data = await response.json();
    return {
      status: data.status,
      trading: data.trading,
      activePositions: data.active_positions,
      monitoredSymbols: data.monitored_symbols,
      positions: data.positions || [],
    };
  },

  /**
   * Get list of running funds
   */
  async getRunningFunds(): Promise<any[]> {
    const response = await fetch(`${API_BASE}/api/funds/running/list`);

    if (!response.ok) {
      throw new Error("Failed to fetch running funds");
    }

    const data = await response.json();
    return data.funds || [];
  },

  /**
   * Archive a fund (hide from main list)
   * Fund must be stopped (not trading) to archive
   */
  async archiveFund(fundId: string): Promise<{
    success: boolean;
    fundId: string;
    fundName: string;
    archived: boolean;
  }> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/archive`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to archive fund");
    }

    const data = await response.json();
    return {
      success: data.success,
      fundId: data.fund_id,
      fundName: data.fund_name,
      archived: data.archived,
    };
  },

  /**
   * Unarchive a fund (show in main list)
   */
  async unarchiveFund(fundId: string): Promise<{
    success: boolean;
    fundId: string;
    fundName: string;
    archived: boolean;
  }> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/unarchive`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to unarchive fund");
    }

    const data = await response.json();
    return {
      success: data.success,
      fundId: data.fund_id,
      fundName: data.fund_name,
      archived: data.archived,
    };
  },

  /**
   * Reset a fund to zero balance by clearing all history
   * Fund must be stopped (not trading) to reset
   */
  async resetFund(fundId: string): Promise<{
    success: boolean;
    fundId: string;
    fundName: string;
    deleted: {
      orders: number;
      transactions: number;
      transfers: number;
    };
    oldBalance: number;
    newBalance: number;
  }> {
    const response = await fetch(`${API_BASE}/api/funds/${fundId}/reset`, {
      method: "POST",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to reset fund");
    }

    const data = await response.json();
    return {
      success: data.success,
      fundId: data.fund_id,
      fundName: data.fund_name,
      deleted: {
        orders: data.deleted.orders,
        transactions: data.deleted.transactions,
        transfers: data.deleted.transfers,
      },
      oldBalance: data.old_balance,
      newBalance: data.new_balance,
    };
  },
};
