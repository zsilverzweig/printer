/**
 * Trade Metrics Utilities
 *
 * Calculates aggregated trade performance metrics for a set of transactions.
 */

import { FundTransaction } from "../types";

export interface TradeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  standardDeviation: number;
}

interface TradeResult {
  pnl: number;
}

/**
 * Calculate trade metrics using FIFO matching of buys and sells per symbol.
 */
export function calculateTradeMetrics(
  transactions: FundTransaction[]
): TradeMetrics {
  if (transactions.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      standardDeviation: 0,
    };
  }

  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const lots: Record<string, { quantity: number; price: number }[]> = {};
  const tradeResults: TradeResult[] = [];

  sortedTransactions.forEach((txn) => {
    if (txn.side === "buy") {
      if (!lots[txn.symbol]) {
        lots[txn.symbol] = [];
      }
      lots[txn.symbol].push({ quantity: txn.quantity, price: txn.price });
      return;
    }

    // Process sell transactions using FIFO lots
    const symbolLots = lots[txn.symbol] ?? (lots[txn.symbol] = []);
    let remainingQuantity = txn.quantity;
    let tradePnl = 0;
    const initialQuantity = txn.quantity;

    while (remainingQuantity > 0 && symbolLots.length > 0) {
      const lot = symbolLots[0];
      const matchedQuantity = Math.min(remainingQuantity, lot.quantity);
      tradePnl += (txn.price - lot.price) * matchedQuantity;

      lot.quantity -= matchedQuantity;
      remainingQuantity -= matchedQuantity;

      if (lot.quantity <= 0) {
        symbolLots.shift();
      }
    }

    // Only record trades that actually matched some buy lots
    const quantityMatched = initialQuantity - remainingQuantity;
    if (quantityMatched > 0) {
      tradeResults.push({ pnl: tradePnl });
    }
  });

  const pnlValues = tradeResults.map((result) => result.pnl);
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

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    averageWin,
    averageLoss,
    standardDeviation,
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
