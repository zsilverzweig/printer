/**
 * BacktestsTable Component
 *
 * Displays backtests in a table format with TanStack Table.
 */

"use client";

import { useRouter } from "next/navigation";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Eye,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import { Input } from "@/lib/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/components/ui/tooltip";
import { toastSuccess } from "@/lib/utils/toast";

import { Backtest } from "../types";

interface BacktestsTableProps {
  backtests: Backtest[];
  onViewDetails?: (backtest: Backtest) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

function getStatusVariant(status: Backtest["status"]) {
  switch (status) {
    case "completed":
      return "default";
    case "running":
      return "secondary";
    case "failed":
      return "destructive";
    case "cancelled":
      return "outline";
    default:
      return "outline";
  }
}

function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatDateTime(dateString: string | undefined | null): string {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return "Invalid date";
    }
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

export function BacktestsTable({
  backtests,
  onViewDetails,
  onRefresh,
  loading = false,
}: BacktestsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "date", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Extract unique values for filters
  const uniqueStatuses = useMemo(
    () => Array.from(new Set(backtests.map((bt) => bt.status))),
    [backtests]
  );
  const uniqueStrategies = useMemo(
    () =>
      Array.from(
        new Set(backtests.map((bt) => bt.strategyId).filter(Boolean))
      ).sort(),
    [backtests]
  );
  const uniqueScreeners = useMemo(
    () =>
      Array.from(
        new Set(
          backtests
            .map((bt) => bt.screeningCriteriaName || bt.screeningCriteriaId)
            .filter(Boolean)
        )
      ).sort(),
    [backtests]
  );

  const columns = useMemo<ColumnDef<Backtest>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Date
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <div className="font-medium">{formatDate(row.original.date)}</div>
        ),
      },
      {
        accessorKey: "fundName",
        header: "Fund",
        filterFn: (row, id, value) => {
          const fundName = row.original.fundName || "";
          const fundId = row.original.fundId || "";
          const searchValue = value.toLowerCase();
          return (
            fundName.toLowerCase().includes(searchValue) ||
            fundId.toLowerCase().includes(searchValue)
          );
        },
        cell: ({ row }) => {
          const backtest = row.original;
          const fundName =
            backtest.fundName || backtest.fundId.slice(0, 8) + "...";
          const fundId = backtest.fundId;

          const handleCopy = async (e: React.MouseEvent) => {
            e.stopPropagation();
            try {
              await navigator.clipboard.writeText(fundId);
              toastSuccess("Fund ID copied to clipboard");
            } catch (err) {
              console.error("Failed to copy:", err);
            }
          };

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="group h-auto p-1.5 hover:bg-muted text-sm cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="hover:text-foreground transition-colors">
                        {fundName}
                      </span>
                      <Copy className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-semibold">{backtest.fundName || "Fund"}</p>
                  <p className="font-mono text-xs mt-1">ID: {fundId}</p>
                  <p className="text-xs mt-1">Click to copy ID</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: "strategyId",
        header: "Strategy",
        cell: ({ row }) => {
          const strategyId = row.original.strategyId;
          return (
            <div className="font-mono text-xs text-muted-foreground">
              {strategyId || "—"}
            </div>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value === "all") return true;
          return row.original.strategyId === value;
        },
      },
      {
        accessorKey: "screeningCriteriaName",
        header: "Screener",
        cell: ({ row }) => {
          const screenerName =
            row.original.screeningCriteriaName ||
            row.original.screeningCriteriaId ||
            "—";
          return <div className="text-sm">{screenerName}</div>;
        },
        filterFn: (row, id, value) => {
          if (!value || value === "all") return true;
          const screenerName = row.original.screeningCriteriaName || "";
          const screenerId = row.original.screeningCriteriaId || "";
          return (
            screenerName === value ||
            screenerId === value ||
            screenerName.toLowerCase().includes(value.toLowerCase())
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Status
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <Badge variant={getStatusVariant(status)}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
              {status === "running" && (
                <span className="ml-1 animate-pulse">●</span>
              )}
            </Badge>
          );
        },
        filterFn: (row, id, value) => {
          if (!value || value === "all") return true;
          return row.original.status === value;
        },
      },
      {
        accessorKey: "totalPnl",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              P&L
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const pnl = row.original.totalPnl;
          const pnlPercent = row.original.totalPnlPercent;
          const isPositive = pnl !== undefined && pnl !== null && pnl >= 0;

          return (
            <div className="text-right">
              <div
                className={`font-semibold ${
                  pnl !== undefined && pnl !== null
                    ? isPositive
                      ? "text-green-600"
                      : "text-red-600"
                    : ""
                }`}
              >
                {formatCurrency(pnl)}
              </div>
              {pnlPercent !== undefined && pnlPercent !== null && (
                <div
                  className={`text-xs ${
                    isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatPercent(pnlPercent)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "startingBalance",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Starting Balance
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <div className="text-right">
            {formatCurrency(row.original.startingBalance)}
          </div>
        ),
      },
      {
        accessorKey: "endingBalance",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Ending Balance
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <div className="text-right">
            {formatCurrency(row.original.endingBalance)}
          </div>
        ),
      },
      {
        accessorKey: "totalTrades",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Trades
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => {
          const backtest = row.original;
          const winRate =
            backtest.totalTrades > 0
              ? (backtest.winningTrades / backtest.totalTrades) * 100
              : 0;

          return (
            <div className="text-right">
              <div className="font-medium">{backtest.totalTrades}</div>
              {backtest.totalTrades > 0 && (
                <div className="text-xs text-muted-foreground">
                  {backtest.winningTrades}W / {backtest.losingTrades}L (
                  {winRate.toFixed(1)}%)
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "startedAt",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Started At
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          );
        },
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatDateTime(row.original.startedAt)}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => (
          <div className="text-right">
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            )}
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {onViewDetails && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onViewDetails(row.original);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [onViewDetails, onRefresh, loading]
  );

  const table = useReactTable({
    data: backtests,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const statusFilter = table.getColumn("status")?.getFilterValue() as
    | string
    | undefined;
  const strategyFilter = table.getColumn("strategyId")?.getFilterValue() as
    | string
    | undefined;
  const screenerFilter = table
    .getColumn("screeningCriteriaName")
    ?.getFilterValue() as string | undefined;

  const hasActiveFilters =
    statusFilter ||
    strategyFilter ||
    screenerFilter ||
    globalFilter ||
    columnFilters.length > 0;

  const clearFilters = () => {
    setGlobalFilter("");
    setColumnFilters([]);
    table.resetColumnFilters();
  };

  if (backtests.length === 0 && !loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No backtests found. Create your first backtest to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border rounded-md bg-muted/30">
        {/* Global Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search funds, strategies..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Select
          value={(statusFilter as string) || "all"}
          onValueChange={(value) =>
            table
              .getColumn("status")
              ?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Strategy Filter */}
        {uniqueStrategies.length > 0 && (
          <Select
            value={(strategyFilter as string) || "all"}
            onValueChange={(value) =>
              table
                .getColumn("strategyId")
                ?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Strategies</SelectItem>
              {uniqueStrategies.map((strategy) => (
                <SelectItem key={strategy} value={strategy}>
                  {strategy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Screener Filter */}
        {uniqueScreeners.length > 0 && (
          <Select
            value={(screenerFilter as string) || "all"}
            onValueChange={(value) =>
              table
                .getColumn("screeningCriteriaName")
                ?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Screener" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Screeners</SelectItem>
              {uniqueScreeners.map((screener) => (
                <SelectItem key={screener} value={screener}>
                  {screener}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}

        {/* Results Count */}
        <div className="ml-auto text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} of {backtests.length}{" "}
          backtests
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && backtests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Loading backtests...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() =>
                    router.push(
                      `/backtests/${encodeURIComponent(row.original.id)}`
                    )
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
