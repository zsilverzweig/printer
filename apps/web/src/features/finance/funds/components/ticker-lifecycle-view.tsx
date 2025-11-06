/**
 * TickerLifecycleView Component
 *
 * Displays ticker lifecycle states for a fund with counts by group and clickable ticker list.
 */

"use client";

import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { fundService } from "../services/fund-service";
import { tickerStateService } from "../services/ticker-state-service";
import type { TickerState, TickerStateRecord } from "../types";

interface TickerLifecycleViewProps {
  fundId: string;
}

const stateColors: Record<TickerState, string> = {
  screened: "bg-blue-100 text-blue-800 border-blue-200",
  setup: "bg-yellow-100 text-yellow-800 border-yellow-200",
  entered: "bg-purple-100 text-purple-800 border-purple-200",
  filled: "bg-green-100 text-green-800 border-green-200",
  exited: "bg-gray-100 text-gray-800 border-gray-200",
  removed: "bg-red-100 text-red-800 border-red-200",
};

const stateOrder: TickerState[] = [
  "screened",
  "setup",
  "entered",
  "filled",
  "exited",
  "removed",
];

export function TickerLifecycleView({ fundId }: TickerLifecycleViewProps) {
  const router = useRouter();
  const [states, setStates] = useState<TickerStateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [fundStatus, setFundStatus] = useState<"active" | "paused" | null>(
    null
  );

  const loadStates = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await tickerStateService.getTickerStates(fundId);
      setStates(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load ticker states"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadFundStatus = async () => {
    try {
      const fund = await fundService.getFund(fundId);
      setFundStatus(fund?.status || null);
    } catch (err) {
      console.error("Error loading fund status:", err);
    }
  };

  const handleClearLifecycle = async () => {
    try {
      setIsClearing(true);
      await fundService.clearLifecycleStages(fundId);
      setShowClearDialog(false);
      await loadStates();
    } catch (err) {
      console.error("Error clearing lifecycle stages:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Failed to clear lifecycle stages. Make sure the fund is paused first."
      );
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    void loadStates();
  }, [fundId]);

  useEffect(() => {
    void loadFundStatus();
  }, [fundId]);

  // Group states by currentState
  const groupedStates = useMemo(() => {
    const grouped = states.reduce((acc, state) => {
      const stateKey = state.currentState;
      if (!acc[stateKey]) {
        acc[stateKey] = [];
      }
      acc[stateKey].push(state);
      return acc;
    }, {} as Record<TickerState, TickerStateRecord[]>);

    return stateOrder
      .filter((state) => grouped[state] && grouped[state].length > 0)
      .map((state) => ({
        state,
        records: grouped[state],
      }));
  }, [states]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading ticker states...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Ticker States</p>
            <p className="text-sm">{error}</p>
            <Button onClick={loadStates} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Ticker Lifecycle</CardTitle>
            <CardDescription>
              {states.length} ticker{states.length !== 1 ? "s" : ""} tracked
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadStates}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <AlertDialog
              open={showClearDialog}
              onOpenChange={setShowClearDialog}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={fundStatus === "active" || isClearing}
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isClearing ? "Clearing..." : "Clear Lifecycle"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Clear Lifecycle Stages?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      This will permanently delete all ticker lifecycle stages
                      for this fund:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>All ticker state records will be deleted</li>
                      <li>All lifecycle transition history will be cleared</li>
                    </ul>
                    <p className="font-semibold text-red-600 dark:text-red-400 pt-2">
                      This action cannot be undone!
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isClearing}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearLifecycle}
                    disabled={isClearing}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isClearing ? "Clearing..." : "Clear Lifecycle"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {states.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No ticker states found. Execute the strategy to see ticker lifecycle
            tracking.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Counts by group */}
            <div className="flex flex-wrap gap-3">
              {groupedStates.map((group) => (
                <div
                  key={group.state}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border"
                >
                  <Badge
                    variant="outline"
                    className={
                      stateColors[group.state] || "bg-gray-100 text-gray-800"
                    }
                  >
                    {group.state.charAt(0).toUpperCase() + group.state.slice(1)}
                  </Badge>
                  <span className="text-sm font-medium">
                    {group.records.length}
                  </span>
                </div>
              ))}
            </div>

            {/* Ticker list grouped by state */}
            <div className="space-y-4">
              {groupedStates.map((group) => (
                <div key={group.state}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        stateColors[group.state] || "bg-gray-100 text-gray-800"
                      }
                    >
                      {group.state.charAt(0).toUpperCase() +
                        group.state.slice(1)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {group.records.length} ticker
                      {group.records.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.records.map((stateRecord) => (
                      <button
                        key={stateRecord.id}
                        onClick={() => {
                          router.push(`/ticker?ticker=${stateRecord.ticker}`);
                        }}
                        className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        {stateRecord.ticker}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
