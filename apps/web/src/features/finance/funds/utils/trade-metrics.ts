/**
 * Trade Metrics Utilities
 *
 * Calculates aggregated trade performance metrics from Trade records.
 * Uses pre-calculated realized_pnl from the Trade model instead of
 * rebuilding from transaction ledger.
 */

import { FundTrade } from "@printer/shared";

export interface TradeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  standardDeviation: number;
  totalPnl: number;
}

/**
 * Calculate trade metrics from Trade records.
 * Only includes closed trades (status='closed') with realized P&L.
 */
export function calculateTradeMetrics(trades: FundTrade[]): TradeMetrics {
  // Filter to only closed trades with realized P&L
  const closedTrades = trades.filter(
    (trade) => trade.status === "closed" && trade.realizedPnl !== null && trade.realizedPnl !== undefined
  );

  if (closedTrades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      standardDeviation: 0,
      totalPnl: 0,
    };
  }

  // Extract P&L values (net of commissions)
  const pnlValues = closedTrades.map((trade) => {
    // realized_pnl already includes commission fees, so use it directly
    return trade.realizedPnl ?? 0;
  });

  const winningTrades = pnlValues.filter((pnl) => pnl > 0).length;
  const losingTrades = pnlValues.filter((pnl) => pnl < 0).length;
  const totalTrades = pnlValues.length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const averageWin =
    winningTrades > 0
      ? pnlValues.filter((pnl) => pnl > 0).reduce((sum, pnl) => sum + pnl, 0) /
        winningTrades
      : 0;

  const averageLoss =
    losingTrades > 0
      ? pnlValues.filter((pnl) => pnl < 0).reduce((sum, pnl) => sum + pnl, 0) /
        losingTrades
      : 0;

  const standardDeviation = calculateStandardDeviation(pnlValues);
  const totalPnl = pnlValues.reduce((sum, pnl) => sum + pnl, 0);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    averageWin,
    averageLoss,
    standardDeviation,
    totalPnl,
  };
}

function calculateStandardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}
