/**
 * Hook to calculate fund performance metrics
 *
 * Calculates balance and performance from ledger data
 */

import { useMemo } from "react";
import {
  calculateFundBalance,
  calculatePerformanceMetrics,
  FundBalanceCalculation,
  PerformanceMetrics,
} from "../utils/ledger-calculations";
import { FundTransaction, FundTransfer } from "../types";

export interface UseFundPerformanceReturn {
  balance: FundBalanceCalculation;
  performance: PerformanceMetrics;
}

export function useFundPerformance(
  transfers: FundTransfer[],
  transactions: FundTransaction[]
): UseFundPerformanceReturn {
  const balance = useMemo(
    () => calculateFundBalance(transfers, transactions),
    [transfers, transactions]
  );

  const performance = useMemo(
    () => calculatePerformanceMetrics(transfers, transactions),
    [transfers, transactions]
  );

  return {
    balance,
    performance,
  };
}

