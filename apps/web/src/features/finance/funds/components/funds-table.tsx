/**
 * FundsTable Component
 *
 * Displays funds in a table format with real-time updates and trading controls.
 */

"use client";

import { Play, Square, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useFundRealtime } from "../hooks/use-fund-realtime";
import { fundService } from "../services/fund-service";
import { Fund, FundLifecycleSummary } from "../types";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Checkbox } from "@/lib/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import { toastError, toastSuccess } from "@/lib/utils/toast";

interface FundsTableProps {
  funds: Fund[];
  onRefresh?: () => void;
  lifecycleSummaries?: Record<string, FundLifecycleSummary>;
}

interface FundRowProps {
  fund: Fund;
  onStartStop: (fundId: string, isTrading: boolean) => Promise<void>;
  selected: boolean;
  onSelect: (fundId: string, selected: boolean) => void;
  lifecycleSummary?: FundLifecycleSummary;
}

export function buildLifecycleSummaries(
  funds: Fund[]
): Record<string, FundLifecycleSummary> {
  const summaries: Record<string, FundLifecycleSummary> = {};
  for (const fund of funds) {
    summaries[fund.id] = {
      totalTracked: Object.values(fund.tickerLifecycleSummary ?? {}).reduce(
        (acc, count) => acc + (typeof count === "number" ? count : 0),
        0
      ),
      perState: fund.tickerLifecycleSummary ?? {},
      tradingWindow:
        fund.tradingStartTime && fund.tradingEndTime
          ? {
              start: fund.tradingStartTime,
              end: fund.tradingEndTime,
              timezone: fund.timezone ?? undefined,
            }
          : undefined,
    };
  }
  return summaries;
}

function FundRow({
  fund,
  onStartStop,
  selected,
  onSelect,
  lifecycleSummary,
}: FundRowProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";

  // Check if this is a backtest fund (name contains "_backtest_")
  const isBacktestFund = fund.name.includes("_backtest_");

  // Connect to real-time WebSocket for fund data
  const { data, isConnecting, error } = useFundRealtime(fund.id);
  const performance = data.performance;

  // Calculate display values
  const loading = isConnecting || !performance;
  const hasError = !!error;
  const aum = performance?.aum ?? 0;
  const cashBalance = performance?.cashBalance ?? 0;
  const positionValue = performance?.positionValue ?? 0;
  const dayChange = performance?.dayChange ?? 0;
  const dayChangePercent = performance?.dayChangePercent ?? 0;
  const isPositive = dayChange >= 0;
  // Use fund.status from database (active/paused) instead of WebSocket trading status
  const isActive = fund.status === "active";
  const tradingWindow = lifecycleSummary?.tradingWindow
    ? `${lifecycleSummary.tradingWindow.start} – ${
        lifecycleSummary.tradingWindow.end
      }${
        lifecycleSummary.tradingWindow.timezone
          ? ` ${lifecycleSummary.tradingWindow.timezone}`
          : ""
      }`
    : "Not configured";
  const lifecycleOrder = [
    "screened",
    "setup",
    "ordered",
    "filled",
    "exited",
    "removed",
  ];
  const lifecycleItems = lifecycleSummary
    ? lifecycleOrder
        .map((state) => ({
          state,
          count: lifecycleSummary.perState?.[state] ?? 0,
        }))
        .filter((item) => item.count > 0)
    : [];

  const handleStartStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionLoading(true);
    try {
      await onStartStop(fund.id, isActive);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    onSelect(fund.id, checked);
  };

  return (
    <TableRow className="cursor-pointer hover:bg-muted/50">
      <TableCell className="w-12">
        <Checkbox
          checked={selected}
          onCheckedChange={handleCheckboxChange}
          onClick={(e) => e.stopPropagation()}
        />
      </TableCell>
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
      <TableCell className="align-top">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Trading Hours
          </div>
          <div className="text-sm font-medium">{tradingWindow}</div>
          {lifecycleSummary && lifecycleSummary.totalTracked > 0 && (
            <div className="text-xs text-muted-foreground">
              Total tracked: {lifecycleSummary.totalTracked}
            </div>
          )}
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Lifecycle States
          </div>
          {lifecycleSummary && lifecycleSummary.totalTracked > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {lifecycleItems.map(({ state, count }) => (
                <Badge
                  key={state}
                  variant="outline"
                  className="text-xs capitalize"
                >
                  {state}
                  <span className="ml-1 text-muted-foreground">{count}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No tickers tracked
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span
          className={`font-semibold ${
            isActive ? "text-green-600" : "text-gray-600"
          }`}
        >
          {isActive ? "Active" : "Paused"}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Button
          size="sm"
          variant={isActive ? "destructive" : "default"}
          onClick={handleStartStop}
          disabled={actionLoading}
          className="min-w-[80px]"
        >
          {actionLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : isActive ? (
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

export function FundsTable({
  funds,
  onRefresh,
  lifecycleSummaries,
}: FundsTableProps) {
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [selectedFundIds, setSelectedFundIds] = useState<Set<string>>(
    new Set()
  );
  const [filterType, setFilterType] = useState<"all" | "backtest" | "regular">(
    "all"
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  const computedLifecycleSummaries = useMemo(
    () => lifecycleSummaries ?? buildLifecycleSummaries(funds),
    [funds, lifecycleSummaries]
  );

  // Filter funds based on type
  const filteredFunds = useMemo(() => {
    if (filterType === "all") return funds;
    if (filterType === "backtest") {
      return funds.filter((f) => f.name.includes("_backtest_"));
    }
    // regular
    return funds.filter((f) => !f.name.includes("_backtest_"));
  }, [funds, filterType]);

  const handleSelectFund = (fundId: string, selected: boolean) => {
    setSelectedFundIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fundId);
      } else {
        next.delete(fundId);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFundIds(new Set(filteredFunds.map((f) => f.id)));
    } else {
      setSelectedFundIds(new Set());
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFundIds.size === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedFundIds.size} fund(s)? This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;

    setDeleteLoading(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      const results = await Promise.allSettled(
        Array.from(selectedFundIds).map((fundId) =>
          fundService.deleteFund(fundId)
        )
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
          const fundId = Array.from(selectedFundIds)[index];
          const fund = funds.find((f) => f.id === fundId);
          toastError("Delete Failed", {
            description: `Failed to delete ${fund?.name || fundId}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "Unknown error"
            }`,
          });
        }
      });

      if (successCount > 0) {
        toastSuccess("Funds Deleted", {
          description: `${successCount} fund(s) deleted successfully${
            errorCount > 0 ? `, ${errorCount} failed` : ""
          }`,
        });
        setSelectedFundIds(new Set());
        onRefresh?.();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

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

  const allSelected =
    filteredFunds.length > 0 && selectedFundIds.size === filteredFunds.length;
  const someSelected =
    selectedFundIds.size > 0 && selectedFundIds.size < filteredFunds.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Select
            value={filterType}
            onValueChange={(value) => setFilterType(value as typeof filterType)}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Funds</SelectItem>
              <SelectItem value="regular">Regular Funds</SelectItem>
              <SelectItem value="backtest">Backtest Funds</SelectItem>
            </SelectContent>
          </Select>
          {selectedFundIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Selected ({selectedFundIds.size})
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={handleStartAll}
            disabled={bulkActionLoading || filteredFunds.length === 0}
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
            disabled={bulkActionLoading || filteredFunds.length === 0}
          >
            {bulkActionLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
            ) : (
              <Square className="h-4 w-4 mr-2" />
            )}
            Stop All
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-[40%]">Fund</TableHead>
              <TableHead className="text-right w-[20%]">
                Assets Under Management
              </TableHead>
              <TableHead className="text-right w-[15%]">Today</TableHead>
              <TableHead className="w-[20%]">Lifecycle</TableHead>
              <TableHead className="text-center w-[10%]">Status</TableHead>
              <TableHead className="text-center w-[10%]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFunds.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No funds match the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              filteredFunds.map((fund) => (
                <FundRow
                  key={fund.id}
                  fund={fund}
                  onStartStop={handleStartStop}
                  selected={selectedFundIds.has(fund.id)}
                  onSelect={handleSelectFund}
                  lifecycleSummary={computedLifecycleSummaries[fund.id]}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
