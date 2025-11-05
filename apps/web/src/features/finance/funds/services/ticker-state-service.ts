/**
 * Ticker State Service
 *
 * Service for fetching ticker lifecycle state data from the backend API.
 */

import type { StateTransition, TickerState, TickerStateRecord } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Convert snake_case API response to camelCase
 */
function parseTickerState(data: any): TickerStateRecord {
  return {
    id: data.id,
    fundId: data.fund_id || data.fundId,
    ticker: data.ticker,
    currentState: data.current_state || data.currentState,
    stateTransitions: (
      data.state_transitions ||
      data.stateTransitions ||
      []
    ).map((t: any) => ({
      fromState: t.from_state || t.fromState,
      toState: t.to_state || t.toState,
      transitionCode: t.transition_code || t.transitionCode,
      description: t.description,
      timestamp: t.timestamp,
    })),
    lastScreenedAt: data.last_screened_at || data.lastScreenedAt || null,
    entryLevelId: data.entry_level_id || data.entryLevelId || null,
    tradeId: data.trade_id || data.tradeId || null,
    createdAt: data.created_at || data.createdAt,
    updatedAt: data.updated_at || data.updatedAt,
  };
}

export const tickerStateService = {
  /**
   * Get all ticker states for a fund, optionally filtered by state
   */
  async getTickerStates(
    fundId: string,
    state?: TickerState
  ): Promise<TickerStateRecord[]> {
    const url = new URL(`${API_BASE}/api/funds/${fundId}/ticker-states`);
    if (state) {
      url.searchParams.set("state", state);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Failed to fetch ticker states: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data.map(parseTickerState) : [];
  },

  /**
   * Get current state for a specific ticker
   */
  async getTickerState(
    fundId: string,
    ticker: string
  ): Promise<TickerStateRecord | null> {
    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/ticker-states/${ticker}`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch ticker state: ${response.statusText}`);
    }

    const data = await response.json();
    return parseTickerState(data);
  },

  /**
   * Get transition history for a specific ticker
   */
  async getTickerHistory(
    fundId: string,
    ticker: string
  ): Promise<{
    ticker: string;
    currentState: TickerState;
    transitions: StateTransition[];
    lastScreenedAt: string | null;
  } | null> {
    const response = await fetch(
      `${API_BASE}/api/funds/${fundId}/ticker-states/${ticker}/history`
    );
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch ticker history: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      ticker: data.ticker,
      currentState: data.current_state || data.currentState,
      transitions: (data.transitions || []).map((t: any) => ({
        fromState: t.from_state || t.fromState,
        toState: t.to_state || t.toState,
        transitionCode: t.transition_code || t.transitionCode,
        description: t.description,
        timestamp: t.timestamp,
      })),
      lastScreenedAt: data.last_screened_at || data.lastScreenedAt || null,
    };
  },
};
