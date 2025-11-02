/**
 * Comprehensive tests for ledger calculations
 *
 * Testing:
 * - Balance calculations
 * - Performance metrics over time windows
 * - Timezone handling (EST)
 * - Position valuation over time
 */

import { describe, expect, it } from "@jest/globals";
import { FundTransaction, FundTransfer } from "../../types";
import {
  calculateFundBalance,
  calculatePerformanceMetrics,
} from "../ledger-calculations";

describe("Ledger Calculations", () => {
  describe("calculateFundBalance", () => {
    it("should calculate correct cash balance with no positions", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"), // EST
          notes: "Initial deposit",
        },
      ];

      const transactions: FundTransaction[] = [];
      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculateFundBalance(
        transfers,
        transactions,
        positionsSummary
      );

      expect(result.totalDeposits).toBe(10000);
      expect(result.totalWithdrawals).toBe(0);
      expect(result.cashBalance).toBe(10000);
      expect(result.positionValue).toBe(0);
      expect(result.aum).toBe(10000);
      expect(result.realizedPnL).toBe(0);
      expect(result.unrealizedPnL).toBe(0);
    });

    it("should correctly calculate cash after buy and sell", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
          notes: "Initial deposit",
        },
      ];

      const transactions: FundTransaction[] = [
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          totalValue: 1000,
          timestamp: "2025-01-01T11:00:00-05:00",
        },
        {
          id: "2",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 110,
          totalValue: 1100,
          timestamp: "2025-01-01T12:00:00-05:00",
        },
      ];

      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculateFundBalance(
        transfers,
        transactions,
        positionsSummary
      );

      expect(result.totalBuys).toBe(1000);
      expect(result.totalSells).toBe(1100);
      expect(result.cashBalance).toBe(10100); // 10000 - 1000 + 1100
      expect(result.realizedPnL).toBe(100); // 1100 - 1000
      expect(result.aum).toBe(10100);
    });

    it("should include position value in AUM", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          totalValue: 1000,
          timestamp: "2025-01-01T11:00:00-05:00",
        },
      ];

      // Position now worth $1200 (current price $120/share)
      const positionsSummary = {
        positionCount: 1,
        totalMarketValue: 1200,
        totalUnrealizedPl: 200,
      };

      const result = calculateFundBalance(
        transfers,
        transactions,
        positionsSummary
      );

      expect(result.cashBalance).toBe(9000); // 10000 - 1000
      expect(result.positionValue).toBe(1200);
      expect(result.unrealizedPnL).toBe(200);
      expect(result.aum).toBe(10200); // 9000 cash + 1200 positions
    });

    it("should handle withdrawals correctly", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
        {
          id: "2",
          fundId: "test-fund",
          amount: 2000,
          transferType: "withdrawal",
          timestamp: new Date("2025-01-02T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [];
      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculateFundBalance(
        transfers,
        transactions,
        positionsSummary
      );

      expect(result.totalDeposits).toBe(10000);
      expect(result.totalWithdrawals).toBe(2000);
      expect(result.cashBalance).toBe(8000);
      expect(result.aum).toBe(8000);
    });
  });

  describe("calculatePerformanceMetrics - Timezone Handling", () => {
    it("should correctly handle EST timezone for day window", () => {
      // Test transactions within the same day in EST
      const now = new Date("2025-01-02T15:00:00-05:00"); // 3 PM EST
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          totalValue: 1000,
          timestamp: "2025-01-02T10:00:00-05:00", // Today in EST
        },
        {
          id: "2",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 110,
          totalValue: 1100,
          timestamp: "2025-01-02T14:00:00-05:00", // Today in EST
        },
      ];

      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      // Mock Date.now to return our test time
      const originalDate = global.Date;
      global.Date = class extends originalDate {
        constructor() {
          super();
          return now;
        }
        static now() {
          return now.getTime();
        }
      } as any;

      const result = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );

      global.Date = originalDate;

      // Day performance should include today's trade
      expect(result.day.trades).toBe(1); // One completed round trip
      expect(result.day.pnl).toBe(100); // $100 profit
    });

    it("should exclude transactions outside time window", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      // Old transactions (more than 7 days ago)
      const transactions: FundTransaction[] = [
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          totalValue: 1000,
          timestamp: "2025-01-01T10:00:00-05:00",
        },
        {
          id: "2",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 110,
          totalValue: 1100,
          timestamp: "2025-01-01T14:00:00-05:00",
        },
      ];

      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );

      // Week should not include transactions from 1 week+ ago
      expect(result.week.trades).toBe(0);
      // All time should include them
      expect(result.allTime.trades).toBe(1);
      expect(result.allTime.pnl).toBe(100);
    });
  });

  describe("Performance Metrics - Position Value Over Time", () => {
    it("should account for unrealized gains in open positions", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 10,
          price: 100,
          totalValue: 1000,
          timestamp: "2025-01-01T11:00:00-05:00",
        },
      ];

      // Position gained value: bought at $1000, now worth $1500
      const positionsSummary = {
        positionCount: 1,
        totalMarketValue: 1500,
        totalUnrealizedPl: 500,
      };

      const result = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );

      // All time P&L should include unrealized gains
      expect(result.allTime.pnl).toBeGreaterThanOrEqual(500);
      // End balance should reflect current position value
      expect(result.allTime.endBalance).toBe(10500); // 9000 cash + 1500 position value
    });

    it("should correctly calculate P&L when positions close at different prices", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [
        // Buy 20 shares at $100
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 20,
          price: 100,
          totalValue: 2000,
          timestamp: "2025-01-01T11:00:00-05:00",
        },
        // Sell 10 at $110 (profit)
        {
          id: "2",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 110,
          totalValue: 1100,
          timestamp: "2025-01-01T12:00:00-05:00",
        },
        // Sell remaining 10 at $90 (loss)
        {
          id: "3",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 90,
          totalValue: 900,
          timestamp: "2025-01-01T13:00:00-05:00",
        },
      ];

      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );

      // Net P&L: +$100 on first 10, -$100 on second 10 = $0
      expect(result.allTime.pnl).toBe(0);
      expect(result.allTime.trades).toBe(2); // Two separate sells
      expect(result.allTime.winningTrades).toBe(1);
      expect(result.allTime.losingTrades).toBe(1);
      expect(result.allTime.winRate).toBe(50);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty data gracefully", () => {
      const transfers: FundTransfer[] = [];
      const transactions: FundTransaction[] = [];
      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const balance = calculateFundBalance(
        transfers,
        transactions,
        positionsSummary
      );
      expect(balance.aum).toBe(0);
      expect(balance.cashBalance).toBe(0);

      const performance = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );
      expect(performance.allTime.pnl).toBe(0);
      expect(performance.allTime.trades).toBe(0);
    });

    it("should handle partial fills correctly", () => {
      const transfers: FundTransfer[] = [
        {
          id: "1",
          fundId: "test-fund",
          amount: 10000,
          transferType: "deposit",
          timestamp: new Date("2025-01-01T10:00:00-05:00"),
        },
      ];

      const transactions: FundTransaction[] = [
        // Buy in two partial fills
        {
          id: "1",
          symbol: "AAPL",
          side: "buy",
          quantity: 5,
          price: 100,
          totalValue: 500,
          timestamp: "2025-01-01T11:00:00-05:00",
        },
        {
          id: "2",
          symbol: "AAPL",
          side: "buy",
          quantity: 5,
          price: 101,
          totalValue: 505,
          timestamp: "2025-01-01T11:01:00-05:00",
        },
        // Sell all at once
        {
          id: "3",
          symbol: "AAPL",
          side: "sell",
          quantity: 10,
          price: 110,
          totalValue: 1100,
          timestamp: "2025-01-01T12:00:00-05:00",
        },
      ];

      const positionsSummary = {
        positionCount: 0,
        totalMarketValue: 0,
        totalUnrealizedPl: 0,
      };

      const result = calculatePerformanceMetrics(
        transfers,
        transactions,
        positionsSummary
      );

      // Should handle FIFO correctly with partial fills
      const expectedPnL = 1100 - (500 + 505);
      expect(result.allTime.pnl).toBe(expectedPnL);
      expect(result.allTime.trades).toBeGreaterThan(0);
    });
  });
});
