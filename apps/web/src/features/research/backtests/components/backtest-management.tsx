/**
 * BacktestManagement Component
 *
 * Main component for backtest management page.
 */

"use client";

import { Layers, Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/lib/components/ui/tabs";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";
import { toastError, toastSuccess } from "@/lib/utils/toast";

import { useBacktests } from "../hooks/use-backtests";
import {
  Backtest,
  MultiStrategyBacktestRequest,
  RunBacktestRequest,
} from "../types";
import { BacktestDetailsDialog } from "./backtest-details-dialog";
import { BacktestsTable } from "./backtests-table";
import { MultiStrategyBacktestDialog } from "./multi-strategy-backtest-dialog";
import { RunBacktestDialog } from "./run-backtest-dialog";
import { ScreenerBacktestTab } from "./screener-backtest-tab";

export function BacktestManagement() {
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [selectedBacktest, setSelectedBacktest] = useState<Backtest | null>(
    null
  );
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showMultiStrategyDialog, setShowMultiStrategyDialog] = useState(false);

  const {
    backtests,
    loading,
    error,
    runBacktest,
    runMultiStrategyBacktest,
    refresh,
  } = useBacktests();

  const [activeTab, setActiveTab] = useUrlTabs({ defaultTab: "strategy" });
  const tabValue = activeTab || "strategy";
  const isStrategyTab = tabValue === "strategy";

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

  const handleRunMultiStrategyBacktest = async (
    request: MultiStrategyBacktestRequest
  ) => {
    try {
      const result = await runMultiStrategyBacktest(request);
      toastSuccess(
        `Multi-strategy backtest started: ${result.summary.totalCombinations} combinations`
      );
      setShowMultiStrategyDialog(false);
      // Refresh after a delay to see the new backtests
      setTimeout(() => {
        refresh();
      }, 2000);
    } catch (err) {
      toastError(
        err instanceof Error
          ? err.message
          : "Failed to run multi-strategy backtest"
      );
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Backtests</h1>
          <p className="mt-1 text-muted-foreground">
            Manage strategy and screener backtests from a single workspace.
          </p>
        </div>
        {isStrategyTab ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setShowRunDialog(true)}>
              <Play className="mr-2 h-4 w-4" />
              Run Backtest
            </Button>
            <Button onClick={() => setShowMultiStrategyDialog(true)}>
              <Layers className="mr-2 h-4 w-4" />
              Multi-Strategy Backtest
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs
        value={tabValue}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList>
          <TabsTrigger value="strategy">Strategy Backtests</TabsTrigger>
          <TabsTrigger value="screener">Screener Backtests</TabsTrigger>
        </TabsList>

        <TabsContent value="strategy" className="space-y-6">
          {error ? (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/50">
              <CardContent className="p-6">
                <div className="text-red-800 dark:text-red-200">{error}</div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Backtests ({backtests.length})</CardTitle>
              <CardDescription>
                View and manage all backtest executions.
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

          <RunBacktestDialog
            open={showRunDialog}
            onOpenChange={setShowRunDialog}
            onSubmit={handleRunBacktest}
          />

          <MultiStrategyBacktestDialog
            open={showMultiStrategyDialog}
            onOpenChange={setShowMultiStrategyDialog}
            onSubmit={handleRunMultiStrategyBacktest}
          />

          <BacktestDetailsDialog
            backtest={selectedBacktest}
            open={showDetailsDialog}
            onOpenChange={setShowDetailsDialog}
          />
        </TabsContent>

        <TabsContent value="screener">
          <ScreenerBacktestTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
