/**
 * FundOverview Component
 *
 * Overview tab showing fund stats, status, and transfer form.
 */

import { AlertTriangle, Archive, Play, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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

import { useFundLedger } from "../hooks/use-fund-ledger";
import { useFundPerformance } from "../hooks/use-fund-performance";
import { fundService } from "../services/fund-service";
import { Fund, FundOrder, FundTransaction, FundTransfer } from "../types";

import { FundPerformanceCard } from "./fund-performance-card";

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
  // Get positions from ledger hook
  const { positions, positionsSummary } = useFundLedger(fund.id);
  const { balance, performance } = useFundPerformance(
    transfers,
    transactions,
    positions,
    positionsSummary
  );
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isLiquidating, setIsLiquidating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showLiquidateDialog, setShowLiquidateDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";
  const statusColor = fund.status === "active" ? "bg-green-500" : "bg-gray-500";
  const statusLabel = fund.status === "active" ? "Active" : "Paused";

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

  const handleStopAndLiquidate = async () => {
    try {
      setIsLiquidating(true);
      await fundService.stopAndLiquidate(fund.id);
      setShowLiquidateDialog(false);
      onFundUpdate();
    } catch (err) {
      console.error("Error stopping and liquidating:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to stop and liquidate. Please try again."
      );
    } finally {
      setIsLiquidating(false);
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

  const handleArchiveFund = async () => {
    try {
      setIsArchiving(true);
      const result = await fundService.archiveFund(fund.id);
      console.log("Fund archived:", result);
      setShowArchiveDialog(false);
      // Navigate back to funds list
      router.push("/funds");
    } catch (err) {
      console.error("Error archiving fund:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to archive fund. Make sure the fund is stopped first."
      );
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Performance Metrics */}
      <FundPerformanceCard
        fundId={fund.id}
        balance={balance}
        performance={performance}
        onUpdate={onFundUpdate}
      />

      {/* Fund Stats */}
      <div className="grid gap-4 md:grid-cols-3">
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

          {/* Stop & Liquidate Button with Confirmation Dialog */}
          <AlertDialog
            open={showLiquidateDialog}
            onOpenChange={setShowLiquidateDialog}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={isLiquidating}
                className="bg-red-600 hover:bg-red-700"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {isLiquidating ? "Liquidating..." : "Stop & Liquidate"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  Emergency Stop & Liquidate?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <p>
                    This will immediately stop trading and liquidate all
                    positions:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Cancel all pending orders</li>
                    <li>Place market sell orders for all open positions</li>
                    <li>Pause the fund</li>
                  </ul>
                  <p className="font-semibold text-red-600 dark:text-red-400 pt-2">
                    This action will close all positions at market prices
                    immediately!
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLiquidating}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleStopAndLiquidate();
                  }}
                  disabled={isLiquidating}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isLiquidating ? "Liquidating..." : "Stop & Liquidate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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

          {/* Archive Fund Button with Confirmation Dialog */}
          <AlertDialog
            open={showArchiveDialog}
            onOpenChange={setShowArchiveDialog}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={fund.status === "active" || isArchiving}
              >
                <Archive className="h-4 w-4 mr-2" />
                {isArchiving ? "Archiving..." : "Archive Fund"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <Archive className="h-5 w-5" />
                  Archive This Fund?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will hide the fund from the main funds list. The fund and
                  all its data will be preserved and can be unarchived later if
                  needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isArchiving}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleArchiveFund}
                  disabled={isArchiving}
                >
                  {isArchiving ? "Archiving..." : "Archive Fund"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
