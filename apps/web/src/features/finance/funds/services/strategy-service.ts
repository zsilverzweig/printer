/**
 * Strategy Service
 *
 * Service for strategy CRUD operations.
 * Currently uses mock data - will be replaced with API calls.
 */

import { CreateStrategyInput, Strategy, UpdateStrategyInput } from "../types";

// Mock data storage
let mockStrategies: Strategy[] = [
  {
    id: "1",
    fundId: "1",
    maxLossPercent: 2,
    maxLossDollars: 1000,
    maxGivebackPercent: 1.5,
    sizePerTrade: 5000,
    minBetPercent: 2,
    maxBetPercent: 10,
    maxTotalExposure: 40000,
    riskRewardRatio: 2.0,
    aiTradingPrompt:
      "Focus on momentum breakouts with volume confirmation. Look for stocks breaking key resistance levels with strong volume.",
    chartTimeHorizon: "5d",
    chartGranularity: "5min",
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  },
];

let nextId = 2;

export const strategyService = {
  /**
   * Get strategy for a fund
   */
  async getStrategyByFundId(fundId: string): Promise<Strategy | null> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return mockStrategies.find((s) => s.fundId === fundId) || null;
  },

  /**
   * Create a new strategy
   */
  async createStrategy(input: CreateStrategyInput): Promise<Strategy> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newStrategy: Strategy = {
      id: String(nextId++),
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockStrategies.push(newStrategy);
    return newStrategy;
  },

  /**
   * Update an existing strategy
   */
  async updateStrategy(
    id: string,
    input: UpdateStrategyInput
  ): Promise<Strategy> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const strategyIndex = mockStrategies.findIndex((s) => s.id === id);
    if (strategyIndex === -1) {
      throw new Error("Strategy not found");
    }

    mockStrategies[strategyIndex] = {
      ...mockStrategies[strategyIndex],
      ...input,
      updatedAt: new Date(),
    };

    return mockStrategies[strategyIndex];
  },

  /**
   * Delete a strategy
   */
  async deleteStrategy(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const strategyIndex = mockStrategies.findIndex((s) => s.id === id);
    if (strategyIndex === -1) {
      throw new Error("Strategy not found");
    }

    mockStrategies.splice(strategyIndex, 1);
  },
};
