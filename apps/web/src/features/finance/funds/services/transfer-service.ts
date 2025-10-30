/**
 * Transfer Service
 *
 * Service for fund transfer operations.
 */

import { CreateTransferInput, FundTransfer } from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const transferService = {
  /**
   * Get transfers for a fund
   */
  async getTransfersByFundId(fundId: string): Promise<FundTransfer[]> {
    const response = await fetch(
      `${API_BASE_URL}/api/funds/${fundId}/transfers?limit=100`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch transfers: ${response.statusText}`);
    }

    const data = await response.json();

    return data.map((t: any) => ({
      id: t.id,
      fundId: t.fund_id,
      amount: t.amount,
      transferType: t.transfer_type,
      timestamp: new Date(t.timestamp),
      notes: t.notes,
    }));
  },

  /**
   * Create a new transfer
   */
  async createTransfer(input: CreateTransferInput): Promise<FundTransfer> {
    const response = await fetch(
      `${API_BASE_URL}/api/funds/${input.fundId}/transfers`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: input.amount,
          transfer_type: input.transferType,
          notes: input.notes,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create transfer");
    }

    const data = await response.json();

    return {
      id: data.id,
      fundId: data.fund_id,
      amount: data.amount,
      transferType: data.transfer_type,
      timestamp: new Date(data.timestamp),
      notes: data.notes,
    };
  },
};
