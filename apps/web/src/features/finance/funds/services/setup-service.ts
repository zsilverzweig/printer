/**
 * Setup Service
 *
 * Service for setup CRUD operations.
 * Currently uses mock data - will be replaced with API calls.
 */

import { CreateSetupInput, Setup, UpdateSetupInput } from "../types";

// Mock data storage
let mockSetups: Setup[] = [
  {
    id: "1",
    name: "High Volume Breakout",
    description: "Stocks breaking out with >2x average volume",
    screeningCriteria: {
      minPrice: 5,
      maxPrice: 100,
      minVolume: 1000000,
      relativeVolume: 2.0,
      priceChangePercent: 5,
    },
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-10"),
  },
  {
    id: "2",
    name: "Gappers",
    description: "Stocks gapping up pre-market with news",
    screeningCriteria: {
      minPrice: 10,
      maxPrice: 50,
      gapPercent: 3,
      hasNews: true,
    },
    createdAt: new Date("2024-01-12"),
    updatedAt: new Date("2024-01-12"),
  },
];

let nextId = 3;

export const setupService = {
  /**
   * Get all setups
   */
  async getSetups(): Promise<Setup[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [...mockSetups];
  },

  /**
   * Get a single setup by ID
   */
  async getSetup(id: string): Promise<Setup | null> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return mockSetups.find((s) => s.id === id) || null;
  },

  /**
   * Create a new setup
   */
  async createSetup(input: CreateSetupInput): Promise<Setup> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newSetup: Setup = {
      id: String(nextId++),
      ...input,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSetups.push(newSetup);
    return newSetup;
  },

  /**
   * Update an existing setup
   */
  async updateSetup(id: string, input: UpdateSetupInput): Promise<Setup> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const setupIndex = mockSetups.findIndex((s) => s.id === id);
    if (setupIndex === -1) {
      throw new Error("Setup not found");
    }

    mockSetups[setupIndex] = {
      ...mockSetups[setupIndex],
      ...input,
      updatedAt: new Date(),
    };

    return mockSetups[setupIndex];
  },

  /**
   * Delete a setup
   */
  async deleteSetup(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const setupIndex = mockSetups.findIndex((s) => s.id === id);
    if (setupIndex === -1) {
      throw new Error("Setup not found");
    }

    mockSetups.splice(setupIndex, 1);
  },
};
