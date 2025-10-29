/**
 * Strategy Service
 *
 * Service for strategy CRUD operations using the backend API.
 */

import type {
  CreateStrategyInput,
  Strategy,
  UpdateStrategyInput,
} from "@printer/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Parse date strings from API responses
 */
function parseStrategyDates(data: any): Strategy {
  return {
    ...data,
    // Convert snake_case to camelCase
    fundId: data.fund_id || data.fundId,
    executionStrategyId: data.execution_strategy_id || data.executionStrategyId,
    screeningCriteriaId: data.screening_criteria_id || data.screeningCriteriaId,
    maxLossPercent: data.max_loss_percent || data.maxLossPercent,
    maxLossDollars: data.max_loss_dollars || data.maxLossDollars,
    maxGivebackPercent: data.max_giveback_percent || data.maxGivebackPercent,
    sizePerTrade: data.size_per_trade || data.sizePerTrade,
    minBetPercent: data.min_bet_percent || data.minBetPercent,
    maxBetPercent: data.max_bet_percent || data.maxBetPercent,
    maxTotalExposure: data.max_total_exposure || data.maxTotalExposure,
    tradingStartTime: data.trading_start_time || data.tradingStartTime,
    tradingEndTime: data.trading_end_time || data.tradingEndTime,
    timezone: data.timezone,
    tradingDays: data.trading_days || data.tradingDays,
    executionConfig: data.execution_config || data.executionConfig,
    createdAt: new Date(data.created_at || data.createdAt),
    updatedAt: new Date(data.updated_at || data.updatedAt),
  };
}

/**
 * Convert camelCase to snake_case for API requests
 */
function toSnakeCase(input: CreateStrategyInput): any {
  return {
    fund_id: input.fundId,
    execution_strategy_id: input.executionStrategyId,
    screening_criteria_id: input.screeningCriteriaId,
    max_loss_percent: input.maxLossPercent,
    max_loss_dollars: input.maxLossDollars,
    max_giveback_percent: input.maxGivebackPercent,
    size_per_trade: input.sizePerTrade,
    min_bet_percent: input.minBetPercent,
    max_bet_percent: input.maxBetPercent,
    max_total_exposure: input.maxTotalExposure,
    trading_start_time: input.tradingStartTime,
    trading_end_time: input.tradingEndTime,
    timezone: input.timezone,
    trading_days: input.tradingDays,
    execution_config: input.executionConfig,
  };
}

export const strategyService = {
  /**
   * Get strategy for a fund
   */
  async getStrategyByFundId(fundId: string): Promise<Strategy | null> {
    try {
      const response = await fetch(`${API_BASE}/api/funds/${fundId}/strategy`);

      if (response.status === 404) {
        // No strategy configured yet - this is OK
        return null;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch strategy");
      }

      const data = await response.json();
      return parseStrategyDates(data);
    } catch (error) {
      console.error("Error fetching strategy:", error);
      // Return null if strategy doesn't exist yet (graceful degradation)
      return null;
    }
  },

  /**
   * Create or update a strategy for a fund
   */
  async createOrUpdateStrategy(input: CreateStrategyInput): Promise<Strategy> {
    const response = await fetch(
      `${API_BASE}/api/funds/${input.fundId}/strategy`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toSnakeCase(input)),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create/update strategy");
    }

    const data = await response.json();
    return parseStrategyDates(data);
  },

  /**
   * Update an existing strategy
   */
  async updateStrategy(
    fundId: string,
    input: UpdateStrategyInput
  ): Promise<Strategy> {
    // Use the same endpoint as create (backend handles upsert)
    return this.createOrUpdateStrategy({
      fundId,
      ...input,
    } as CreateStrategyInput);
  },

  /**
   * Delete a strategy
   */
  async deleteStrategy(fundId: string): Promise<void> {
    // Note: Delete endpoint not yet implemented in backend
    throw new Error("deleteStrategy not yet implemented");
  },
};
