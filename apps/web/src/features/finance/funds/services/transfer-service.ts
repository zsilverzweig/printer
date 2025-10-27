/**
 * Transfer Service
 *
 * Service for fund transfer operations.
 * Currently uses mock data - will be replaced with API calls.
 */

import { CreateTransferInput, FundTransfer } from "../types";

// Mock data storage
let mockTransfers: FundTransfer[] = [
  {
    id: "1",
    fundId: "1",
    amount: 50000,
    transferType: "deposit",
    timestamp: new Date("2024-01-15T10:00:00"),
    notes: "Initial deposit",
  },
  {
    id: "2",
    fundId: "2",
    amount: 25000,
    transferType: "deposit",
    timestamp: new Date("2024-02-01T09:30:00"),
    notes: "Initial deposit",
  },
];

let nextId = 3;

export const transferService = {
  /**
   * Get transfers for a fund
   */
  async getTransfersByFundId(fundId: string): Promise<FundTransfer[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return mockTransfers
      .filter((t) => t.fundId === fundId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  },

  /**
   * Create a new transfer
   */
  async createTransfer(input: CreateTransferInput): Promise<FundTransfer> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const newTransfer: FundTransfer = {
      id: String(nextId++),
      ...input,
      timestamp: new Date(),
    };

    mockTransfers.push(newTransfer);
    return newTransfer;
  },
};
