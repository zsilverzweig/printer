/**
 * Ledger Calculation Utilities
 *
 * Calculate fund balances and performance metrics from ledger data
 */

import { FundOrder, FundTransaction, FundTransfer } from "../types";

export interface FundBalanceCalculation {
  currentBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBuys: number;
  totalSells: number;
  realizedPnL: number;
  netCash: number; // deposits - withdrawals - buys + sells
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
 * Calculate current fund balance from ledger
 *
 * Formula:
 * Balance = Total Deposits - Total Withdrawals - Total Buys + Total Sells
 */
export function calculateFundBalance(
  transfers: FundTransfer[],
  transactions: FundTransaction[]
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

  // Calculate realized P&L from trading
  const realizedPnL = totalSells - totalBuys;

  // Calculate net cash position
  const netCash = totalDeposits - totalWithdrawals - totalBuys + totalSells;

  // Current balance is net cash
  const currentBalance = netCash;

  return {
    currentBalance,
    totalDeposits,
    totalWithdrawals,
    totalBuys,
    totalSells,
    realizedPnL,
    netCash,
  };
}

/**
 * Calculate performance metrics over different time windows
 */
export function calculatePerformanceMetrics(
  transfers: FundTransfer[],
  transactions: FundTransaction[]
): PerformanceMetrics {
  const now = new Date();

  // Calculate performance for each window
  return {
    day: calculateWindowPerformance(transfers, transactions, getDateDaysAgo(1), now),
    week: calculateWindowPerformance(
      transfers,
      transactions,
      getDateDaysAgo(7),
      now
    ),
    month: calculateWindowPerformance(
      transfers,
      transactions,
      getDateDaysAgo(30),
      now
    ),
    year: calculateWindowPerformance(
      transfers,
      transactions,
      getDateDaysAgo(365),
      now
    ),
    allTime: calculateWindowPerformance(
      transfers,
      transactions,
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

  // Calculate start balance (balance at beginning of window)
  const startBalance = calculateFundBalance(
    beforeTransfers,
    beforeTransactions
  ).currentBalance;

  // Calculate end balance (balance at end of window = start balance + changes in window)
  const windowBalance = calculateFundBalance(
    windowTransfers,
    windowTransactions
  );

  // Account for net transfers in the window (deposits - withdrawals)
  const netTransfers =
    windowBalance.totalDeposits - windowBalance.totalWithdrawals;

  // P&L is the change in balance minus net transfers
  const pnl = windowBalance.realizedPnL;

  // End balance is start balance + pnl + net transfers
  const endBalance = startBalance + pnl + netTransfers;

  // Calculate return % based on start balance (excluding new deposits)
  const pnlPercent =
    startBalance > 0 ? (pnl / startBalance) * 100 : netTransfers > 0 ? 0 : 0;

  // Count trades
  const buys = windowTransactions.filter((t) => t.side === "buy");
  const sells = windowTransactions.filter((t) => t.side === "sell");

  // Match buys with sells to calculate winning/losing trades
  const { winningTrades, losingTrades } = calculateTradeResults(buys, sells);

  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    startBalance,
    endBalance,
    pnl,
    pnlPercent,
    trades: sells.length, // Count completed round trips (sells)
    winningTrades,
    losingTrades,
    winRate,
  };
}

/**
 * Calculate winning and losing trades by matching buys and sells
 */
function calculateTradeResults(
  buys: FundTransaction[],
  sells: FundTransaction[]
): { winningTrades: number; losingTrades: number } {
  let winningTrades = 0;
  let losingTrades = 0;

  // Group buys by symbol to calculate average cost basis
  const costBasis: Record<string, { totalCost: number; totalQty: number }> = {};

  buys.forEach((buy) => {
    if (!costBasis[buy.symbol]) {
      costBasis[buy.symbol] = { totalCost: 0, totalQty: 0 };
    }
    costBasis[buy.symbol].totalCost += buy.totalValue;
    costBasis[buy.symbol].totalQty += buy.quantity;
  });

  // Check each sell against cost basis
  sells.forEach((sell) => {
    const basis = costBasis[sell.symbol];
    if (basis && basis.totalQty > 0) {
      const avgCost = basis.totalCost / basis.totalQty;
      const pnl = (sell.price - avgCost) * sell.quantity;

      if (pnl > 0) {
        winningTrades++;
      } else if (pnl < 0) {
        losingTrades++;
      }

      // Update cost basis (FIFO)
      basis.totalQty -= sell.quantity;
      basis.totalCost -= avgCost * sell.quantity;
    }
  });

  return { winningTrades, losingTrades };
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

