/**
 * FundOverview Component
 *
 * Overview tab showing fund stats, status, and transfer form.
 */

import { AlertTriangle, Filter, Play, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/lib/components/ui/alert-dialog";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { useFundPerformance } from "../hooks/use-fund-performance";
import { useFundTransfers } from "../hooks/use-fund-transfers";
import { fundService } from "../services/fund-service";
import { screeningCriteriaService } from "../services/screening-criteria-service";
import { Fund, FundOrder, FundTransaction, FundTransfer } from "../types";

import { FundPerformanceCard } from "./fund-performance-card";
import { FundTransferForm } from "./fund-transfer-form";

interface FundOverviewProps {
  fund: Fund;
  orders: FundOrder[];
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  onFundUpdate: () => void;
}

export function FundOverview({
  fund,
  orders,
  transactions,
  transfers,
  onFundUpdate,
}: FundOverviewProps) {
  const { createTransfer } = useFundTransfers(fund.id);
  const { balance, performance } = useFundPerformance(transfers, transactions);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isRunningScreener, setIsRunningScreener] = useState(false);
  const [screenerResults, setScreenerResults] = useState<{
    tickerCount: number;
    tickers: string[];
  } | null>(null);
  const [screenerError, setScreenerError] = useState<string | null>(null);

  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";
  const statusColor = fund.status === "active" ? "bg-green-500" : "bg-gray-500";
  const statusLabel = fund.status === "active" ? "Active" : "Paused";

  const handleTransfer = async (
    amount: number,
    type: "deposit" | "withdrawal",
    notes?: string
  ) => {
    await createTransfer({
      fundId: fund.id,
      amount,
      transferType: type,
      notes,
    });

    // Update the fund balance
    const newBalance =
      type === "deposit" ? fund.balance + amount : fund.balance - amount;

    await fundService.updateFund(fund.id, { balance: newBalance });
    onFundUpdate();
  };

  const handleStartTrading = async () => {
    try {
      setIsStarting(true);
      await fundService.startTrading(fund.id);
      onFundUpdate();
    } catch (err) {
      console.error("Error starting trading:", err);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopTrading = async () => {
    try {
      setIsStopping(true);
      await fundService.stopTrading(fund.id);
      onFundUpdate();
    } catch (err) {
      console.error("Error stopping trading:", err);
    } finally {
      setIsStopping(false);
    }
  };

  const handleRunScreener = async () => {
    if (!fund.screeningCriteriaId) {
      setScreenerError("No screening criteria configured for this fund");
      return;
    }

    try {
      setIsRunningScreener(true);
      setScreenerError(null);
      const results = await screeningCriteriaService.runScreener(
        fund.screeningCriteriaId
      );
      setScreenerResults(results);
    } catch (err) {
      console.error("Error running screener:", err);
      setScreenerError(
        err instanceof Error ? err.message : "Failed to run screener"
      );
    } finally {
      setIsRunningScreener(false);
    }
  };

  const handleResetFund = async () => {
    try {
      setIsResetting(true);
      const result = await fundService.resetFund(fund.id);
      console.log("Fund reset:", result);
      setShowResetDialog(false);
      onFundUpdate();
    } catch (err) {
      console.error("Error resetting fund:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to reset fund. Make sure the fund is stopped first."
      );
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Performance Metrics */}
      <FundPerformanceCard balance={balance} performance={performance} />

      {/* Fund Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${modeColor} text-white`}>{modeLabel}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge className={`${statusColor} text-white`}>{statusLabel}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              $
              {fund.balance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Created
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg">{fund.createdAt.toLocaleDateString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Trading Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Trading Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={handleStartTrading}
            disabled={fund.status === "active" || isStarting}
            variant={fund.status === "active" ? "outline" : "default"}
          >
            <Play className="h-4 w-4 mr-2" />
            {isStarting ? "Starting..." : "Start Trading"}
          </Button>
          <Button
            onClick={handleStopTrading}
            disabled={fund.status === "paused" || isStopping}
            variant={fund.status === "paused" ? "outline" : "destructive"}
          >
            <Square className="h-4 w-4 mr-2" />
            {isStopping ? "Stopping..." : "Stop Trading"}
          </Button>

          {/* Reset Fund Button with Confirmation Dialog */}
          <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={fund.status === "active" || isResetting}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isResetting ? "Resetting..." : "Reset Fund"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Reset Fund to Zero?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    This will permanently delete all data for this fund and set
                    the balance to $0.00:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>All order history will be cleared</li>
                    <li>All transaction records will be deleted</li>
                    <li>All transfer history will be removed</li>
                    <li>Balance will be reset to $0.00</li>
                  </ul>
                  <p className="font-semibold text-red-600 dark:text-red-400 pt-2">
                    This action cannot be undone!
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isResetting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleResetFund}
                  disabled={isResetting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isResetting ? "Resetting..." : "Reset Fund"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Screener */}
      <Card>
        <CardHeader>
          <CardTitle>Screener</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRunScreener}
              disabled={!fund.screeningCriteriaId || isRunningScreener}
              variant="outline"
            >
              <Filter className="h-4 w-4 mr-2" />
              {isRunningScreener ? "Running..." : "Run Screener"}
            </Button>
            {screenerResults && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {screenerResults.tickerCount} tickers
                </Badge>
              </div>
            )}
          </div>

          {!fund.screeningCriteriaId && (
            <p className="text-sm text-muted-foreground">
              Configure screening criteria in the Screener tab to use this
              feature.
            </p>
          )}

          {screenerError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-200">
              {screenerError}
            </div>
          )}

          {screenerResults && screenerResults.tickerCount > 0 && (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-2">Matching Tickers:</p>
              <div className="flex flex-wrap gap-1">
                {screenerResults.tickers.slice(0, 20).map((ticker) => (
                  <Link
                    key={ticker}
                    href={`/?ticker=${ticker}`}
                    className="inline-block"
                  >
                    <Badge
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {ticker}
                    </Badge>
                  </Link>
                ))}
                {screenerResults.tickerCount > 20 && (
                  <Badge variant="outline" className="text-xs">
                    +{screenerResults.tickerCount - 20} more
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Form */}
      <FundTransferForm
        fundId={fund.id}
        currentBalance={fund.balance}
        onTransfer={handleTransfer}
      />
    </div>
  );
}
