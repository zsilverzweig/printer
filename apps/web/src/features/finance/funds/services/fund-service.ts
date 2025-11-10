/**
 * Fund Service
 *
 * Service for fund CRUD operations using the backend API.
 */

import type {
  CreateFundInput,
  Fund,
  FundOrder,
  FundTrade,
  FundTradingStatus,
  FundTransaction,
  UpdateFundInput,
} from "@printer/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Parse date strings and convert snake_case to camelCase from API responses
 */
function parseFundDates(data: any): Fund {
  return {
    ...data,
    // Core fields
    status: data.status ?? "paused", // Ensure status is preserved
    archived: data.archived ?? false,
    // Convert snake_case to camelCase
    icon: data.icon,
    iconColor: data.icon_color ?? data.iconColor,
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
    // AI cost tracking
    totalAiCost: data.total_ai_cost ?? data.totalAiCost ?? 0,
    aiCostMtd: data.ai_cost_mtd ?? data.aiCostMtd ?? 0,
    aiCostYtd: data.ai_cost_ytd ?? data.aiCostYtd ?? 0,
    lastAiCostReset: data.last_ai_cost_reset
      ? new Date(data.last_ai_cost_reset)
      : data.lastAiCostReset ?? null,
    // Dates
    createdAt: new Date(data.created_at || data.createdAt),
    updatedAt: new Date(data.updated_at || data.updatedAt),
  };
}

export interface ManualOrderInput {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  estimatedPrice?: number | null;
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
   * Get transactions for a fund
   */
  async getFundTransactions(fundId: string): Promise<FundTransaction[]> {
    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/transactions`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch fund transactions");
    }

    const data = await response.json();
    return data.map((txn: any) => ({
      id: txn.id,
      symbol: txn.symbol,
      side: txn.side,
      quantity: Number(txn.quantity),
      price: Number(txn.price),
      totalValue: Number(txn.total_value ?? txn.totalValue),
      timestamp: txn.timestamp,
    }));
  },

  /**
   * Get trades for a fund
   */
  async getFundTrades(
    fundId: string,
    status?: "open" | "closed"
  ): Promise<FundTrade[]> {
    const params = new URLSearchParams();
    if (status) {
      params.append("status", status);
    }
    const url = `${API_BASE}/api/funds/${fundId}/trades${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Failed to fetch fund trades");
    }

    const data = await response.json();
    return data.map((trade: any) => ({
      id: trade.id,
      fundId: trade.fund_id ?? trade.fundId,
      symbol: trade.symbol,
      entryTime: trade.entry_time ?? trade.entryTime,
      exitTime: trade.exit_time ?? trade.exitTime,
      entryPrice: Number(trade.entry_price ?? trade.entryPrice),
      exitPrice:
        trade.exit_price ?? trade.exitPrice
          ? Number(trade.exit_price ?? trade.exitPrice)
          : null,
      entryQuantity: Number(trade.entry_quantity ?? trade.entryQuantity),
      exitQuantity:
        trade.exit_quantity ?? trade.exitQuantity
          ? Number(trade.exit_quantity ?? trade.exitQuantity)
          : null,
      realizedPnl:
        trade.realized_pnl ?? trade.realizedPnl
          ? Number(trade.realized_pnl ?? trade.realizedPnl)
          : null,
      realizedPnlPercent:
        trade.realized_pnl_percent ?? trade.realizedPnlPercent
          ? Number(trade.realized_pnl_percent ?? trade.realizedPnlPercent)
          : null,
      holdDurationSeconds:
        trade.hold_duration_seconds ?? trade.holdDurationSeconds,
      status: trade.status,
      strategyId: trade.strategy_id ?? trade.strategyId,
      screeningCriteriaId:
        trade.screening_criteria_id ?? trade.screeningCriteriaId,
      aiConfidence: trade.ai_confidence ?? trade.aiConfidence,
      commissionFees: Number(
        trade.commission_fees ?? trade.commissionFees ?? 0
      ),
      maxAdverseExcursion:
        trade.max_adverse_excursion ?? trade.maxAdverseExcursion,
      maxFavorableExcursion:
        trade.max_favorable_excursion ?? trade.maxFavorableExcursion,
    }));
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
        initial_balance: input.initialBalance ?? 0,
        // UI customization
        icon: input.icon,
        icon_color: input.iconColor,
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
        // UI customization
        icon: input.icon,
        icon_color: input.iconColor,
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
    const response = await fetch(`${API_BASE}/api/funds/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to delete fund");
    }
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

  async placeManualOrder(
    fundId: string,
    input: ManualOrderInput
  ): Promise<FundOrder> {
    const payload = {
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      time_in_force: input.timeInForce ?? "day",
      estimated_price:
        typeof input.estimatedPrice === "number"
          ? input.estimatedPrice
          : undefined,
    };

    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/manual-orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || "Failed to place manual order");
    }

    const data = await response.json();
    const order = data.order;

    return {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      status: order.status,
      orderType: order.order_type,
      submittedAt: order.submitted_at,
      filledAt: order.filled_at,
      filledQty: order.filled_qty,
      filledAvgPrice: order.filled_avg_price,
      alpacaOrderId: order.alpaca_order_id,
    };
  },

  /**
   * Emergency stop: Cancel all orders, liquidate all positions, and pause the fund
   */
  async stopAndLiquidate(fundId: string): Promise<{
    success: boolean;
    fundId: string;
    fundName: string;
    fundStatus: string;
    cancelledOrders: Array<{
      symbol: string;
      side: string;
      quantity: number;
      orderId: string;
      alpacaOrderId: string;
    }>;
    liquidatedPositions: Array<{
      symbol: string;
      quantity: number;
      orderId: string;
      alpacaOrderId: string;
    }>;
    errors: string[];
    message: string;
  }> {
    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/stop-and-liquidate`,
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to stop and liquidate");
    }

    const data = await response.json();
    return {
      success: data.success,
      fundId: data.fund_id,
      fundName: data.fund_name,
      fundStatus: data.fund_status,
      cancelledOrders: data.cancelled_orders || [],
      liquidatedPositions: data.liquidated_positions || [],
      errors: data.errors || [],
      message: data.message,
    };
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

  async liquidatePosition(
    fundId: string,
    symbol: string,
    options?: {
      quantity?: number;
      timeInForce?: "day" | "gtc" | "ioc" | "fok";
    }
  ): Promise<{
    order: FundOrder | null;
    position: {
      symbol: string;
      quantityBefore: number | null;
      quantityLiquidated: number | null;
      quantityRemaining: number | null;
    };
  }> {
    const payload: Record<string, unknown> = {};

    if (typeof options?.quantity === "number") {
      payload.quantity = options.quantity;
    }
    if (options?.timeInForce) {
      payload.time_in_force = options.timeInForce;
    }

    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/positions/${symbol}/liquidate`,
      {
        method: "POST",
        headers:
          Object.keys(payload).length > 0
            ? {
                "Content-Type": "application/json",
              }
            : undefined,
        body:
          Object.keys(payload).length > 0
            ? JSON.stringify(payload)
            : undefined,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.detail || "Failed to liquidate position");
    }

    const data = await response.json();
    const order = data.order;

    const parsedOrder: FundOrder | null = order
      ? {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          quantity: Number(order.quantity ?? 0),
          status: order.status,
          orderType: order.order_type,
          submittedAt: order.submitted_at,
          filledAt: order.filled_at,
          filledQty: order.filled_qty,
          filledAvgPrice: order.filled_avg_price,
          alpacaOrderId: order.alpaca_order_id,
        }
      : null;

    return {
      order: parsedOrder,
      position: {
        symbol: data.position?.symbol ?? symbol,
        quantityBefore:
          typeof data.position?.quantity_before === "number"
            ? data.position.quantity_before
            : null,
        quantityLiquidated:
          typeof data.position?.quantity_liquidated === "number"
            ? data.position.quantity_liquidated
            : null,
        quantityRemaining:
          typeof data.position?.quantity_remaining === "number"
            ? data.position.quantity_remaining
            : null,
      },
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

  /**
   * Clear all ticker lifecycle stages for a fund
   * Fund must be paused (not trading) to clear lifecycle stages
   */
  async clearLifecycleStages(fundId: string): Promise<{
    success: boolean;
    fundId: string;
    fundName: string;
    deleted: {
      tickerStates: number;
    };
  }> {
    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/clear-lifecycle`,
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to clear lifecycle stages");
    }

    const data = await response.json();
    return {
      success: data.success,
      fundId: data.fund_id,
      fundName: data.fund_name,
      deleted: {
        tickerStates: data.deleted.ticker_states,
      },
    };
  },
};
