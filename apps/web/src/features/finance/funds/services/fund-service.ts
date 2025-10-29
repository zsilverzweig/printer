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
 * Parse date strings from API responses
 */
function parseFundDates(data: any): Fund {
  return {
    ...data,
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
    // Note: Update endpoint not yet implemented in backend
    // This is a placeholder for future implementation
    throw new Error("Update fund not yet implemented");
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
};
