/**
 * FundsTable Component
 *
 * Displays funds in a table format with real-time updates and trading controls.
 */

"use client";

import { Play, Square, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import { toastError, toastSuccess } from "@/lib/utils/toast";

import { useFundRealtime } from "../hooks/use-fund-realtime";
import { fundService } from "../services/fund-service";
import { Fund } from "../types";

interface FundsTableProps {
  funds: Fund[];
  onRefresh?: () => void;
}

interface FundRowProps {
  fund: Fund;
  onStartStop: (fundId: string, isTrading: boolean) => Promise<void>;
}

function FundRow({ fund, onStartStop }: FundRowProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";

  // Connect to real-time WebSocket for fund data
  const { data, isConnecting, error } = useFundRealtime(fund.id);
  const performance = data.performance;
  const tradingStatus = data.tradingStatus;

  // Calculate display values
  const loading = isConnecting || !performance;
  const hasError = !!error;
  const aum = performance?.aum ?? 0;
  const cashBalance = performance?.cashBalance ?? 0;
  const positionValue = performance?.positionValue ?? 0;
  const dayChange = performance?.dayChange ?? 0;
  const dayChangePercent = performance?.dayChangePercent ?? 0;
  const isPositive = dayChange >= 0;
  const isTrading = tradingStatus?.trading ?? false;

  const handleStartStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(true);
    try {
      await onStartStop(fund.id, isTrading);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50">
      <TableCell className="max-w-md">
        <Link
          href={`/funds/${fund.id}`}
          className="flex items-start gap-3 hover:underline"
        >
          <Badge className={`${modeColor} text-white shrink-0 mt-0.5`}>
            {modeLabel}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base mb-1">{fund.name}</div>
            {fund.description && (
              <div
                className="text-sm text-muted-foreground line-clamp-2"
                title={fund.description}
              >
                {fund.description}
              </div>
            )}
          </div>
        </Link>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {loading ? (
          <span className="text-muted-foreground text-sm">Loading...</span>
        ) : hasError ? (
          <span className="text-red-600 text-sm">Error</span>
        ) : (
          <div className="space-y-1">
            <div className="font-semibold text-base">
              $
              {aum.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
              <span>
                Cash $
                {cashBalance.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
              <span>
                Positions $
                {positionValue.toLocaleString("en-US", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </span>
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {!loading && !hasError && (
          <div
            className={`flex items-center justify-end gap-2 ${
              isPositive ? "text-green-600" : "text-red-600"
            }`}
          >
            {isPositive ? (
              <TrendingUp className="h-4 w-4 shrink-0" />
            ) : (
              <TrendingDown className="h-4 w-4 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-base">
                {isPositive ? "+" : "-"}${Math.abs(dayChange).toFixed(2)}
              </div>
              <div className="text-xs">
                {isPositive ? "+" : ""}
                {dayChangePercent.toFixed(2)}%
              </div>
            </div>
          </div>
        )}
      </TableCell>
      <TableCell className="text-center">
        {loading ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : (
          <span
            className={`font-semibold ${
              isTrading ? "text-green-600" : "text-red-600"
            }`}
          >
            {isTrading ? "Trading" : "Stopped"}
          </span>
        )}
      </TableCell>
      <TableCell className="text-center">
        <Button
          size="sm"
          variant={isTrading ? "destructive" : "default"}
          onClick={handleStartStop}
          disabled={actionLoading || loading}
          className="min-w-[80px]"
        >
          {actionLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : isTrading ? (
            <>
              <Square className="h-4 w-4 mr-1.5" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-1.5" />
              Start
            </>
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function FundsTable({ funds, onRefresh }: FundsTableProps) {
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const handleStartStop = async (fundId: string, isTrading: boolean) => {
    try {
      if (isTrading) {
        await fundService.stopTrading(fundId);
        toastSuccess("Trading Stopped", {
          description: "Fund trading has been stopped",
        });
      } else {
        await fundService.startTrading(fundId);
        toastSuccess("Trading Started", {
          description: "Fund trading has been started",
        });
      }
      onRefresh?.();
    } catch (err) {
      toastError("Error", {
        description:
          err instanceof Error
            ? err.message
            : "Failed to update trading status",
      });
    }
  };

  const handleStartAll = async () => {
    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Start all funds in parallel
      const results = await Promise.allSettled(
        funds.map((fund) => fundService.startTrading(fund.id))
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        toastSuccess("Funds Started", {
          description: `${successCount} fund(s) started successfully${
            errorCount > 0 ? `, ${errorCount} failed` : ""
          }`,
        });
      }

      if (errorCount === funds.length) {
        toastError("Error", {
          description: "Failed to start any funds",
        });
      }

      onRefresh?.();
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleStopAll = async () => {
    setBulkActionLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      // Stop all funds in parallel
      const results = await Promise.allSettled(
        funds.map((fund) => fundService.stopTrading(fund.id))
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        toastSuccess("Funds Stopped", {
          description: `${successCount} fund(s) stopped successfully${
            errorCount > 0 ? `, ${errorCount} failed` : ""
          }`,
        });
      }

      if (errorCount === funds.length) {
        toastError("Error", {
          description: "Failed to stop any funds",
        });
      }

      onRefresh?.();
    } finally {
      setBulkActionLoading(false);
    }
  };

  if (funds.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No funds yet. Create your first fund to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleStartAll}
          disabled={bulkActionLoading || funds.length === 0}
        >
          {bulkActionLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Start All
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleStopAll}
          disabled={bulkActionLoading || funds.length === 0}
        >
          {bulkActionLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
          ) : (
            <Square className="h-4 w-4 mr-2" />
          )}
          Stop All
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Fund</TableHead>
              <TableHead className="text-right w-[20%]">
                Assets Under Management
              </TableHead>
              <TableHead className="text-right w-[15%]">Today</TableHead>
              <TableHead className="text-center w-[10%]">Status</TableHead>
              <TableHead className="text-center w-[10%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funds.map((fund) => (
              <FundRow
                key={fund.id}
                fund={fund}
                onStartStop={handleStartStop}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
