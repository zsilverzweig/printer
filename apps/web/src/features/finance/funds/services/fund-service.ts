/**
 * Fund Service
 *
 * Service for fund CRUD operations.
 * Currently uses mock data - will be replaced with API calls.
 */

import { CreateFundInput, Fund, UpdateFundInput } from "../types";

// Mock data storage
let mockFunds: Fund[] = [
  {
    id: "1",
    name: "Momentum Breakout Fund",
    description:
      "Focused on high-momentum breakout opportunities with tight risk management",
    mode: "sim",
    balance: 50000,
    createdAt: new Date("2024-01-15"),
    updatedAt: new Date("2024-01-15"),
  },
  {
    id: "2",
    name: "Real Money Conservative",
    description: "Conservative real money trading with strict risk limits",
    mode: "real",
    balance: 25000,
    createdAt: new Date("2024-02-01"),
    updatedAt: new Date("2024-02-01"),
  },
];

let nextId = 3;

export const fundService = {
  /**
   * Get all funds
   */
  async getFunds(): Promise<Fund[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...mockFunds];
  },

  /**
   * Get a single fund by ID
   */
  async getFund(id: string): Promise<Fund | null> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return mockFunds.find((f) => f.id === id) || null;
  },

  /**
   * Create a new fund
   */
  async createFund(input: CreateFundInput): Promise<Fund> {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const newFund: Fund = {
      id: String(nextId++),
      name: input.name,
      description: input.description,
      mode: input.mode,
      balance: input.initialBalance,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockFunds.push(newFund);
    return newFund;
  },

  /**
   * Update an existing fund
   */
  async updateFund(id: string, input: UpdateFundInput): Promise<Fund> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const fundIndex = mockFunds.findIndex((f) => f.id === id);
    if (fundIndex === -1) {
      throw new Error("Fund not found");
    }

    mockFunds[fundIndex] = {
      ...mockFunds[fundIndex],
      ...input,
      updatedAt: new Date(),
    };

    return mockFunds[fundIndex];
  },

  /**
   * Delete a fund
   */
  async deleteFund(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const fundIndex = mockFunds.findIndex((f) => f.id === id);
    if (fundIndex === -1) {
      throw new Error("Fund not found");
    }

    mockFunds.splice(fundIndex, 1);
  },
};
