/**
 * Hook to fetch fund summary data for display in cards
 *
 * Fetches minimal data needed for fund cards:
 * - Positions summary for AUM calculation
 * - Recent transactions for performance calculation
 */

import { useCallback, useEffect, useState } from "react";
import { FundTransaction, FundTransfer } from "../types";

export interface FundPositionSummary {
  positionCount: number;
  totalMarketValue: number;
  totalUnrealizedPl: number;
}

export interface FundSummaryData {
  aum: number; // Assets Under Management (cash + positions)
  cashBalance: number;
  positionValue: number;
  dayChange: number;
  dayChangePercent: number;
  loading: boolean;
  error: string | null;
}

export function useFundSummary(fundId: string): FundSummaryData {
  const [positionsSummary, setPositionsSummary] = useState<FundPositionSummary>(
    {
      positionCount: 0,
      totalMarketValue: 0,
      totalUnrealizedPl: 0,
    }
  );
  const [transfers, setTransfers] = useState<FundTransfer[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    if (!fundId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch positions summary, transfers, and transactions in parallel
      const [positionsRes, transfersRes, transactionsRes] = await Promise.all([
        fetch(`http://localhost:8000/api/funds/${fundId}/positions/summary`),
        fetch(`http://localhost:8000/api/funds/${fundId}/transfers`),
        fetch(
          `http://localhost:8000/api/funds/${fundId}/transactions?limit=100`
        ),
      ]);

      if (!positionsRes.ok || !transfersRes.ok || !transactionsRes.ok) {
        throw new Error("Failed to fetch fund summary data");
      }

      const positionsData = await positionsRes.json();
      const transfersData = await transfersRes.json();
      const transactionsData = await transactionsRes.json();

      // Transform transfers
      const transformedTransfers = transfersData.map((transfer: any) => ({
        id: transfer.id,
        fundId: transfer.fund_id,
        amount: transfer.amount,
        transferType: transfer.transfer_type,
        timestamp: new Date(transfer.timestamp),
        notes: transfer.notes,
      }));

      // Transform transactions
      const transformedTransactions = transactionsData.map((txn: any) => ({
        id: txn.id,
        symbol: txn.symbol,
        side: txn.side,
        quantity: txn.quantity,
        price: txn.price,
        totalValue: txn.total_value,
        timestamp: txn.timestamp,
      }));

      setPositionsSummary({
        positionCount: positionsData.summary.position_count,
        totalMarketValue: positionsData.summary.total_market_value,
        totalUnrealizedPl: positionsData.summary.total_unrealized_pl,
      });
      setTransfers(transformedTransfers);
      setTransactions(transformedTransactions);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch fund summary";
      setError(message);
      console.error("Error fetching fund summary:", err);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // Calculate AUM and performance
  const cashBalance = calculateCashBalance(transfers, transactions);
  const positionValue = positionsSummary.totalMarketValue;
  const aum = cashBalance + positionValue;

  // Calculate day performance (last 24 hours)
  const { dayChange, dayChangePercent } = calculateDayPerformance(
    transfers,
    transactions,
    positionsSummary,
    aum
  );

  return {
    aum,
    cashBalance,
    positionValue,
    dayChange,
    dayChangePercent,
    loading,
    error,
  };
}

/**
 * Calculate cash balance from transfers and transactions
 */
function calculateCashBalance(
  transfers: FundTransfer[],
  transactions: FundTransaction[]
): number {
  const totalDeposits = transfers
    .filter((t) => t.transferType === "deposit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalWithdrawals = transfers
    .filter((t) => t.transferType === "withdrawal")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBuys = transactions
    .filter((t) => t.side === "buy")
    .reduce((sum, t) => sum + t.totalValue, 0);

  const totalSells = transactions
    .filter((t) => t.side === "sell")
    .reduce((sum, t) => sum + t.totalValue, 0);

  return totalDeposits - totalWithdrawals - totalBuys + totalSells;
}

/**
 * Calculate performance for the last day
 */
function calculateDayPerformance(
  transfers: FundTransfer[],
  transactions: FundTransaction[],
  positionsSummary: FundPositionSummary,
  currentAum: number
): { dayChange: number; dayChangePercent: number } {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get transfers and transactions from before 24 hours ago
  const beforeTransfers = transfers.filter(
    (t) => new Date(t.timestamp) < oneDayAgo
  );
  const beforeTransactions = transactions.filter(
    (t) => new Date(t.timestamp) < oneDayAgo
  );

  // Get transfers and transactions from the last 24 hours
  const dayTransfers = transfers.filter(
    (t) => new Date(t.timestamp) >= oneDayAgo
  );

  // Calculate starting AUM (24 hours ago)
  // Note: We can't include position values from 24 hours ago since we don't have historical prices
  // So we calculate cash balance only for the start
  const startCash = calculateCashBalance(beforeTransfers, beforeTransactions);

  // Calculate net transfers in the last 24 hours
  const netTransfers =
    dayTransfers
      .filter((t) => t.transferType === "deposit")
      .reduce((sum, t) => sum + t.amount, 0) -
    dayTransfers
      .filter((t) => t.transferType === "withdrawal")
      .reduce((sum, t) => sum + t.amount, 0);

  // Day change = Current AUM - Start Cash - Net Transfers
  // This includes: realized gains from day trades + current unrealized P&L
  const dayChange = currentAum - startCash - netTransfers;

  // Calculate percentage based on the starting balance
  const totalNetDeposits =
    transfers
      .filter((t) => t.transferType === "deposit")
      .reduce((sum, t) => sum + t.amount, 0) -
    transfers
      .filter((t) => t.transferType === "withdrawal")
      .reduce((sum, t) => sum + t.amount, 0);

  const dayChangePercent =
    totalNetDeposits > 0 ? (dayChange / totalNetDeposits) * 100 : 0;

  return {
    dayChange,
    dayChangePercent,
  };
}
