/**
 * Execution Strategy Service
 *
 * Service for fetching available execution strategies from the API.
 */

import { ExecutionStrategy } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const executionStrategyService = {
  /**
   * Get all available execution strategies
   */
  async getExecutionStrategies(): Promise<ExecutionStrategy[]> {
    const response = await fetch(`${API_BASE}/api/strategies`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch execution strategies: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  },

  /**
   * Get detailed metadata for a specific execution strategy
   */
  async getExecutionStrategy(strategyId: string): Promise<ExecutionStrategy> {
    const response = await fetch(`${API_BASE}/api/strategies/${strategyId}`);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch execution strategy ${strategyId}: ${response.statusText}`
      );
    }

    const data = await response.json();
    return data;
  },

  /**
   * Validate strategy configuration
   */
  async validateConfig(
    strategyId: string,
    config: Record<string, any>
  ): Promise<{
    valid: boolean;
    message: string;
  }> {
    const response = await fetch(
      `${API_BASE}/api/strategies/${strategyId}/validate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      }
    );

    const data = await response.json();
    return data;
  },
};

