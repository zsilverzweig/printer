/**
 * BacktestManagement Component
 *
 * Main component for backtest management page.
 */

"use client";

import { Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { toastError, toastSuccess } from "@/lib/utils/toast";

import { useBacktests } from "../hooks/use-backtests";
import { Backtest, RunBacktestRequest } from "../types";
import { BacktestDetailsDialog } from "./backtest-details-dialog";
import { BacktestsTable } from "./backtests-table";
import { RunBacktestDialog } from "./run-backtest-dialog";

export function BacktestManagement() {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedFundId, setSelectedFundId] = useState<string>("all");
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(
    null
  );
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { backtests, loading, error, runBacktest, refresh } = useBacktests(
    selectedFundId !== "all" ? selectedFundId : undefined,
    selectedStatus !== "all" ? selectedStatus : undefined
  );

  const handleRunBacktest = async (request: RunBacktestRequest) => {
    try {
      await runBacktest(request);
      toastSuccess("Backtest started successfully");
      setShowRunDialog(false);
      // Refresh after a short delay to see the new backtest
      setTimeout(() => {
        refresh();
      }, 1000);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to run backtest");
      throw err; // Re-throw to let dialog handle it
    }
  };

  const handleViewDetails = (backtest: Backtest) => {
    setSelectedBacktest(backtest);
    setShowDetailsDialog(true);
  };

  // Poll for updates if there are running backtests
  useEffect(() => {
    const hasRunning = backtests.some((bt) => bt.status === "running");
    if (hasRunning) {
      const interval = setInterval(() => {
        refresh();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [backtests, refresh]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backtests</h1>
          <p className="text-muted-foreground mt-1">
            Run and manage backtests for your funds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button onClick={() => setShowRunDialog(true)}>
            <Play className="h-4 w-4 mr-2" />
            Run Backtest
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter backtests by fund or status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Fund ID</label>
              <Select value={selectedFundId} onValueChange={setSelectedFundId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Funds</SelectItem>
                  {/* Fund IDs would be loaded from funds service if needed */}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/50">
          <CardContent className="p-6">
            <div className="text-red-800 dark:text-red-200">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Backtests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Backtests ({backtests.length})</CardTitle>
          <CardDescription>
            View and manage all backtest executions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BacktestsTable
            backtests={backtests}
            onViewDetails={handleViewDetails}
            onRefresh={refresh}
            loading={loading}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <RunBacktestDialog
        open={showRunDialog}
        onOpenChange={setShowRunDialog}
        onSubmit={handleRunBacktest}
      />

      <BacktestDetailsDialog
        backtest={selectedBacktest}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
      />
    </div>
  );
}
