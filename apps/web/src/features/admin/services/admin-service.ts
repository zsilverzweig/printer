// Admin service for managing system configuration
import type { AdminConfig } from "../types";

import { log } from "@/lib/utils/logger";

// Default admin configuration
const DEFAULT_ADMIN_CONFIG: Omit<
  AdminConfig,
  "id" | "createdAt" | "updatedAt" | "updatedBy"
> = {};

export class AdminService {
  private static instance: AdminService;

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  // Market Data Methods

  /**
   * Start loading historical market data
   */
  async startMarketDataLoad(
    days: number,
    symbols?: string[]
  ): Promise<{ status_id: number; message: string }> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const response = await fetch(`${apiUrl}/api/market/historical/load`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          days,
          symbols: symbols || null,
          start_date: null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to start market data load");
      }

      const result = await response.json();
      log.success("Started market data load", "AdminService");
      return result;
    } catch (error) {
      log.failure("Failed to start market data load", error, "AdminService");
      throw error;
    }
  }

  /**
   * Cancel the running market data load
   */
  async cancelMarketDataLoad(): Promise<void> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const response = await fetch(`${apiUrl}/api/market/historical/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to cancel market data load");
      }

      log.success("Cancelled market data load", "AdminService");
    } catch (error) {
      log.failure("Failed to cancel market data load", error, "AdminService");
      throw error;
    }
  }

  /**
   * Get status of a market data load task
   */
  async getMarketDataLoadStatus(statusId: number): Promise<{
    status_id: number;
    status: "running" | "completed" | "failed" | "cancelled";
    progress_pct: number;
    tickers_processed: number;
    tickers_succeeded: number;
    tickers_failed: number;
    started_at: string | null;
    completed_at: string | null;
    last_updated: string | null;
    error_message: string | null;
  }> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const response = await fetch(
        `${apiUrl}/api/market/historical/status/${statusId}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to get load status");
      }

      return await response.json();
    } catch (error) {
      log.failure(
        "Failed to get market data load status",
        error,
        "AdminService"
      );
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getMarketDataStats(): Promise<{
    total_bars: number;
    min_date: string | null;
    max_date: string | null;
    symbol_count: number;
    total_size: string;
    table_size: string;
    error?: string;
  }> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

      const response = await fetch(`${apiUrl}/api/market/historical/stats`);

      if (!response.ok) {
        throw new Error("Failed to get database stats");
      }

      const result = await response.json();
      return result;
    } catch (error) {
      log.failure("Failed to get market data stats", error, "AdminService");
      // Return empty stats instead of throwing
      return {
        total_bars: 0,
        min_date: null,
        max_date: null,
        symbol_count: 0,
        total_size: "unknown",
        table_size: "unknown",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// Export singleton instance
export const adminService = AdminService.getInstance();
