/**
 * FundPerformanceCard Component
 *
 * Displays fund performance metrics across different time windows
 */

import {
  Activity,
  ArrowDownUp,
  Brain,
  DollarSign,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/lib/components/ui/dialog";

import { useFundTransfers } from "../hooks/use-fund-transfers";
import {
  FundBalanceCalculation,
  PerformanceMetrics,
  formatCurrency,
  formatPercent,
} from "../utils/ledger-calculations";

import { FundTransferForm } from "./fund-transfer-form";

interface FundPerformanceCardProps {
  fundId: string;
  balance: FundBalanceCalculation;
  performance: PerformanceMetrics;
  aiCosts?: { totalAiCost?: number; aiCostMtd?: number; aiCostYtd?: number };
  onUpdate: () => void;
}

export function FundPerformanceCard({
  fundId,
  balance,
  performance,
  aiCosts = {},
  onUpdate,
}: FundPerformanceCardProps) {
  const { createTransfer } = useFundTransfers(fundId);
  const [showTransferDialog, setShowTransferDialog] = useState(false);

  const handleTransfer = async (
    amount: number,
    type: "deposit" | "withdrawal",
    notes?: string
  ) => {
    await createTransfer({
      fundId,
      amount,
      transferType: type,
      notes,
    });

    setShowTransferDialog(false);
    onUpdate();
  };
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Assets Under Management
              </CardTitle>
              <CardDescription>Total account value</CardDescription>
            </div>
            <Dialog
              open={showTransferDialog}
              onOpenChange={setShowTransferDialog}
            >
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowDownUp className="h-4 w-4 mr-2" />
                  Transfer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Fund Transfer</DialogTitle>
                  <DialogDescription>
                    Deposit or withdraw funds from this account
                  </DialogDescription>
                </DialogHeader>
                <FundTransferForm
                  fundId={fundId}
                  currentBalance={balance.aum}
                  onTransfer={handleTransfer}
                />
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-3xl font-bold">
                {formatCurrency(balance.aum)}
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                Cash + Positions (at market price)
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <div className="text-xs text-muted-foreground">Cash</div>
                <div className="text-sm font-semibold">
                  {formatCurrency(balance.cashBalance)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Positions</div>
                <div className="text-sm font-semibold">
                  {formatCurrency(balance.positionValue)}
                </div>
              </div>
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
            </div>

            {/* AI Cost Section */}
            {(aiCosts.totalAiCost || 0) > 0 && (
              <div className="pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="h-4 w-4 text-purple-600" />
                  <span className="text-xs font-medium text-muted-foreground">
                    AI Costs
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      All Time
                    </div>
                    <div className="text-xs font-semibold text-purple-600">
                      {formatCurrency(aiCosts.totalAiCost || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">MTD</div>
                    <div className="text-xs font-semibold text-purple-600">
                      {formatCurrency(aiCosts.aiCostMtd || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">YTD</div>
                    <div className="text-xs font-semibold text-purple-600">
                      {formatCurrency(aiCosts.aiCostYtd || 0)}
                    </div>
                  </div>
                </div>
                {aiCosts.totalAiCost && balance.realizedPnL !== 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {(
                      (aiCosts.totalAiCost / Math.abs(balance.realizedPnL)) *
                      100
                    ).toFixed(2)}
                    % of realized P&L
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Realized P&L</span>
                <span
                  className={`text-sm font-bold ${
                    balance.realizedPnL >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {balance.realizedPnL >= 0 ? "+" : ""}
                  {formatCurrency(balance.realizedPnL)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Unrealized P&L
                </span>
                <span
                  className={`text-sm ${
                    balance.unrealizedPnL >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {balance.unrealizedPnL >= 0 ? "+" : ""}
                  {formatCurrency(balance.unrealizedPnL)}
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
