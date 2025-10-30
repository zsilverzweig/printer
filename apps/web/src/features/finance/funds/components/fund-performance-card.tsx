/**
 * FundPerformanceCard Component
 *
 * Displays fund performance metrics across different time windows
 */

import { TrendingDown, TrendingUp, DollarSign, Activity } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Badge } from "@/lib/components/ui/badge";

import {
  FundBalanceCalculation,
  PerformanceMetrics,
  formatCurrency,
  formatPercent,
} from "../utils/ledger-calculations";

interface FundPerformanceCardProps {
  balance: FundBalanceCalculation;
  performance: PerformanceMetrics;
}

export function FundPerformanceCard({
  balance,
  performance,
}: FundPerformanceCardProps) {
  const renderPerformanceRow = (
    label: string,
    window: { pnl: number; pnlPercent: number; trades: number; winRate: number }
  ) => {
    const isPositive = window.pnl >= 0;

    return (
      <div className="flex items-center justify-between py-3 border-b last:border-b-0">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm w-20">{label}</span>
          <div className="flex items-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span
              className={`font-semibold ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(window.pnl)}
            </span>
            <span
              className={`text-sm ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              ({formatPercent(window.pnlPercent)})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{window.trades} trades</span>
          {window.trades > 0 && (
            <Badge variant="outline" className="text-xs">
              {window.winRate.toFixed(0)}% win rate
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Current Balance
          </CardTitle>
          <CardDescription>Calculated from ledger</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-3xl font-bold">
                {formatCurrency(balance.currentBalance)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Net cash position
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-xs text-muted-foreground">Deposits</div>
                <div className="text-sm font-semibold text-green-600">
                  +{formatCurrency(balance.totalDeposits)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Withdrawals</div>
                <div className="text-sm font-semibold text-red-600">
                  -{formatCurrency(balance.totalWithdrawals)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Buys</div>
                <div className="text-sm font-semibold text-red-600">
                  -{formatCurrency(balance.totalBuys)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Sells</div>
                <div className="text-sm font-semibold text-green-600">
                  +{formatCurrency(balance.totalSells)}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Realized P&L</span>
                <span
                  className={`text-lg font-bold ${
                    balance.realizedPnL >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {balance.realizedPnL >= 0 ? "+" : ""}
                  {formatCurrency(balance.realizedPnL)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Windows */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance
          </CardTitle>
          <CardDescription>Returns by time period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0">
            {renderPerformanceRow("Day", performance.day)}
            {renderPerformanceRow("Week", performance.week)}
            {renderPerformanceRow("Month", performance.month)}
            {renderPerformanceRow("Year", performance.year)}
            {renderPerformanceRow("All Time", performance.allTime)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

