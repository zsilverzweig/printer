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

  // Calculate start AUM (at beginning of window, cash only since no historical position values)
  const emptyPositions: PositionsSummary = {
    positionCount: 0,
    totalMarketValue: 0,
    totalUnrealizedPl: 0,
  };
  
  const startAUM = calculateFundBalance(
    beforeTransfers,
    beforeTransactions,
    emptyPositions
  ).cashBalance;

  // Calculate end AUM including current positions at market value
  const endAUM = calculateFundBalance(
    [...beforeTransfers, ...windowTransfers],
    [...beforeTransactions, ...windowTransactions],
    positionsSummary
  ).aum;

  // Calculate window-specific metrics
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

  // Count trades
  const buys = windowTransactions.filter((t) => t.side === "buy");
  const sells = windowTransactions.filter((t) => t.side === "sell");

  // Match buys with sells to calculate winning/losing trades
  const { winningTrades, losingTrades } = calculateTradeResults(buys, sells);

  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  return {
    startBalance: startAUM,
    endBalance: endAUM,
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
