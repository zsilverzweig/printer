/**
 * Ledger Calculation Utilities
 *
 * Calculate fund balances and performance metrics from ledger data.
 * The ledger tracks actual money movements: transfers and trades.
 */

import { FundTransaction, FundTransfer } from "../types";

export interface PositionsSummary {
  positionCount: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
}

export interface FundBalanceCalculation {
  // Total Account Value (AUM - Assets Under Management)
  aum: number; // cashBalance + positionValue

  // Components
  cashBalance: number; // deposits - withdrawals - buys + sells
  positionValue: number; // current market value of holdings

  // P&L Breakdown
  realizedPnL: number; // sells - buys (profit from closed trades)
  unrealizedPnL: number; // current position value - cost basis

  // Details
  totalDeposits: number;
  totalWithdrawals: number;
  totalBuys: number;
  totalSells: number;
}

export interface PerformanceMetrics {
  day: PerformanceWindow;
  week: PerformanceWindow;
  month: PerformanceWindow;
  year: PerformanceWindow;
  allTime: PerformanceWindow;
}

export interface PerformanceWindow {
  startBalance: number;
  endBalance: number;
  pnl: number;
  pnlPercent: number;
  trades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
}

/**
 * Calculate current fund balance from ledger including positions
 *
 * Formula:
 * Cash Balance = Total Deposits - Total Withdrawals - Total Buys + Total Sells
 * AUM (Assets Under Management) = Cash Balance + Position Market Value
 */
export function calculateFundBalance(
  transfers: FundTransfer[],
  transactions: FundTransaction[],
  positionsSummary: PositionsSummary
): FundBalanceCalculation {
  // Sum all deposits
  const totalDeposits = transfers
    .filter((t) => t.transferType === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);

  // Sum all withdrawals
  const totalWithdrawals = transfers
    .filter((t) => t.transferType === "withdrawal")
    .reduce((sum, t) => sum + t.amount, 0);

  // Sum all buys (cash out)
  const totalBuys = transactions
    .filter((t) => t.side === "buy")
    .reduce((sum, t) => sum + t.totalValue, 0);

  // Sum all sells (cash in)
  const totalSells = transactions
    .filter((t) => t.side === "sell")
    .reduce((sum, t) => sum + t.totalValue, 0);

  // Calculate realized P&L from closed trades only
  const realizedPnL = totalSells - totalBuys;

  // Calculate cash position
  const cashBalance = totalDeposits - totalWithdrawals - totalBuys + totalSells;

  // Get position values from summary (current market value)
  const positionValue = positionsSummary.totalMarketValue;
  const unrealizedPnL = positionsSummary.totalUnrealizedPl;

  // Calculate AUM (Assets Under Management) = cash + current position values
  const aum = cashBalance + positionValue;

  return {
    aum,
    cashBalance,
    positionValue,
    realizedPnL,
    unrealizedPnL,
    totalDeposits,
    totalWithdrawals,
    totalBuys,
    totalSells,
  };
}

/**
 * Calculate performance metrics over different time windows
 */
export function calculatePerformanceMetrics(
  transfers: FundTransfer[],
  transactions: FundTransaction[],
  positionsSummary: PositionsSummary
): PerformanceMetrics {
  const now = new Date();

  // Calculate performance for each window
  return {
    day: calculateWindowPerformance(
      transfers,
      transactions,
      positionsSummary,
      getDateDaysAgo(1),
      now
    ),
    week: calculateWindowPerformance(
      transfers,
      transactions,
      positionsSummary,
      getDateDaysAgo(7),
      now
    ),
    month: calculateWindowPerformance(
      transfers,
      transactions,
      positionsSummary,
      getDateDaysAgo(30),
      now
    ),
    year: calculateWindowPerformance(
      transfers,
      transactions,
      positionsSummary,
      getDateDaysAgo(365),
      now
    ),
    allTime: calculateWindowPerformance(
      transfers,
      transactions,
      positionsSummary,
      new Date(0),
      now
    ),
  };
}

/**
 * Calculate performance for a specific time window
 */
function calculateWindowPerformance(
  transfers: FundTransfer[],
  transactions: FundTransaction[],
  positionsSummary: PositionsSummary,
  startDate: Date,
  endDate: Date
): PerformanceWindow {
  // Filter items within the window
  const windowTransfers = transfers.filter((t) => {
    const date = new Date(t.timestamp);
    return date >= startDate && date <= endDate;
  });

  const windowTransactions = transactions.filter((t) => {
    const date = new Date(t.timestamp);
    return date >= startDate && date <= endDate;
  });

  // Get transfers and transactions before the window starts
  const beforeTransfers = transfers.filter((t) => {
    const date = new Date(t.timestamp);
    return date < startDate;
  });

  const beforeTransactions = transactions.filter((t) => {
    const date = new Date(t.timestamp);
    return date < startDate;
  });

  // Calculate position cost basis at the start of the window
  // This represents the value of positions held at the start date
  const startPositionCostBasis = calculatePositionCostBasis(beforeTransactions);

  const startPositions: PositionsSummary = {
    positionCount: 0,
    totalMarketValue: startPositionCostBasis,
    totalUnrealizedPl: 0,
  };

  // Calculate start AUM (cash + cost basis of positions held at start)
  const startAUM = calculateFundBalance(
    beforeTransfers,
    beforeTransactions,
    startPositions
  ).aum;

  // Calculate end AUM including current positions at market value
  const endAUM = calculateFundBalance(
    [...beforeTransfers, ...windowTransfers],
    [...beforeTransactions, ...windowTransactions],
    positionsSummary
  ).aum;

  // Calculate window-specific metrics
  const emptyPositions: PositionsSummary = {
    positionCount: 0,
    totalMarketValue: 0,
    totalUnrealizedPl: 0,
  };

  const windowBalance = calculateFundBalance(
    windowTransfers,
    windowTransactions,
    emptyPositions
  );

  // Net transfers in this window
  const netTransfers =
    windowBalance.totalDeposits - windowBalance.totalWithdrawals;

  // P&L = Change in AUM - New Deposits
  // This includes: realized gains from trades + current position values
  const pnl = endAUM - startAUM - netTransfers;

  // Calculate total net deposits up to the end of the window
  const allTransfersUpToEnd = transfers.filter((t) => {
    const date = new Date(t.timestamp);
    return date <= endDate;
  });

  const totalNetDeposits =
    allTransfersUpToEnd
      .filter((t) => t.transferType === "deposit")
      .reduce((sum, t) => sum + t.amount, 0) -
    allTransfersUpToEnd
      .filter((t) => t.transferType === "withdrawal")
      .reduce((sum, t) => sum + t.amount, 0);

  // Calculate return % based on total invested capital
  const pnlPercent = totalNetDeposits > 0 ? (pnl / totalNetDeposits) * 100 : 0;

  // End balance for display
  const endBalance = endAUM;

  // Count trades using proper FIFO lot matching
  // This ensures we only count completed round-trip trades (buy -> sell)
  const { winningTrades, losingTrades, totalTrades } =
    calculateTradeResults(windowTransactions);

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    startBalance: startAUM,
    endBalance: endAUM,
    pnl,
    pnlPercent,
    trades: totalTrades, // Count only completed round-trip trades
    winningTrades,
    losingTrades,
    winRate,
  };
}

/**
 * Calculate the total cost basis of open positions based on transaction history
 * This gives us the amount invested in positions at a given point in time
 */
function calculatePositionCostBasis(transactions: FundTransaction[]): number {
  // Track positions by symbol
  const positions: Record<string, { quantity: number; costBasis: number }> = {};

  // Process all transactions chronologically (they should already be ordered)
  transactions.forEach((txn) => {
    if (!positions[txn.symbol]) {
      positions[txn.symbol] = { quantity: 0, costBasis: 0 };
    }

    if (txn.side === "buy") {
      // Add to position
      positions[txn.symbol].costBasis += txn.totalValue;
      positions[txn.symbol].quantity += txn.quantity;
    } else if (txn.side === "sell") {
      // Reduce position (FIFO)
      const pos = positions[txn.symbol];
      if (pos.quantity > 0) {
        const avgCost = pos.costBasis / pos.quantity;
        const soldCost = avgCost * txn.quantity;

        pos.quantity -= txn.quantity;
        pos.costBasis -= soldCost;

        // Clean up if position is fully closed
        if (pos.quantity <= 0) {
          pos.quantity = 0;
          pos.costBasis = 0;
        }
      }
    }
  });

  // Sum up total cost basis of all open positions
  return Object.values(positions).reduce(
    (total, pos) => total + pos.costBasis,
    0
  );
}

/**
 * Calculate winning and losing trades using proper FIFO lot matching
 * Only counts completed round-trip trades (buy -> sell)
 */
function calculateTradeResults(transactions: FundTransaction[]): {
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
} {
  if (transactions.length === 0) {
    return { winningTrades: 0, losingTrades: 0, totalTrades: 0 };
  }

  // Sort by timestamp to ensure chronological processing
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Track lots by symbol using FIFO
  const lots: Record<string, { quantity: number; price: number }[]> = {};
  const tradeResults: number[] = [];

  sortedTransactions.forEach((txn) => {
    if (txn.side === "buy") {
      // Add to lots
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

    // Only record trades that actually matched buy lots
    const quantityMatched = initialQuantity - remainingQuantity;
    if (quantityMatched > 0) {
      tradeResults.push(tradePnl);
    }
  });

  const winningTrades = tradeResults.filter((pnl) => pnl > 0).length;
  const losingTrades = tradeResults.filter((pnl) => pnl < 0).length;
  const totalTrades = tradeResults.length;

  return { winningTrades, losingTrades, totalTrades };
}

/**
 * Get date N days ago
 */
function getDateDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Format currency
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
