/**
 * Hook to calculate fund performance metrics
 *
 * Calculates balance and performance from ledger data including positions
 */

import { useMemo } from "react";
import { FundTransaction, FundTransfer } from "../types";
import { FundPosition, PositionsSummary } from "./use-fund-ledger";
import {
  calculateFundBalance,
  calculatePerformanceMetrics,
  FundBalanceCalculation,
  PerformanceMetrics,
} from "../utils/ledger-calculations";

export interface UseFundPerformanceReturn {
  balance: FundBalanceCalculation;
  performance: PerformanceMetrics;
}

export function useFundPerformance(
  transfers: FundTransfer[],
  transactions: FundTransaction[],
  positions: FundPosition[],
  positionsSummary: PositionsSummary
): UseFundPerformanceReturn {
  const balance = useMemo(
    () => calculateFundBalance(transfers, transactions, positionsSummary),
    [transfers, transactions, positionsSummary]
  );

  const performance = useMemo(
    () => calculatePerformanceMetrics(transfers, transactions, positionsSummary),
    [transfers, transactions, positionsSummary]
  );

  return {
    balance,
    performance,
  };
}
