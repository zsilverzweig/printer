/**
 * ActivityFeed Component
 *
 * Displays strategy engine events for a fund in a table format with filtering.
 */

"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

interface StrategyEngineEvent {
  id: number;
  type: "strategy_engine";
  timestamp: string;
  fund_id: string;
  event_category: string;
  symbol: string | null;
  severity: "info" | "warning" | "error";
  message: string;
  event_data: Record<string, any> | null;
}

interface ActivityFeedProps {
  fundId: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY_LABELS: Record<string, string> = {
  position_sync: "Position Sync",
  fill_tracking: "Fill Tracking",
  order_decision: "Order Decision",
  validation: "Validation",
  error: "Error",
};

const SEVERITY_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const SEVERITY_COLORS = {
  info: "text-blue-600",
  warning: "text-yellow-600",
  error: "text-red-600",
};

const SEVERITY_BG_COLORS = {
  info: "bg-blue-50 dark:bg-blue-950/20",
  warning: "bg-yellow-50 dark:bg-yellow-950/20",
  error: "bg-red-50 dark:bg-red-950/20",
};

export function ActivityFeed({ fundId }: ActivityFeedProps) {
  const [events, setEvents] = useState<StrategyEngineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [symbol, setSymbol] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(
    async (signal?: AbortSignal) => {
      if (!fundId) return;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          fund_id: fundId,
          limit: "200", // Increase limit for table view
        });

        if (category && category !== "all") params.append("category", category);
        if (severity && severity !== "all") params.append("severity", severity);
        if (symbol && symbol !== "all") params.append("symbol", symbol);

        const response = await fetch(
          `${API_BASE}/api/events/strategy-engine?${params}`,
          { signal }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch events: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        // Only update if not aborted
        if (!signal?.aborted) {
          setEvents(data.events || []);
        }
      } catch (error) {
        // Don't log abort errors
        if (error instanceof Error && error.name !== "AbortError") {
          console.error("Failed to fetch strategy engine events:", error);
          setEvents([]); // Clear events on error
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [fundId, category, severity, symbol]
  );

  useEffect(() => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    fetchEvents(abortController.signal);

    return () => {
      abortController.abort();
      abortControllerRef.current = null;
    };
  }, [fetchEvents]);

  const handleRefresh = useCallback(() => {
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    fetchEvents(abortController.signal);
  }, [fetchEvents]);

  // Extract unique symbols from events
  const uniqueSymbols = useMemo(() => {
    const symbols = new Set(
      events.map((e) => e.symbol).filter((s): s is string => !!s)
    );
    return Array.from(symbols).sort();
  }, [events]);

  const toggleRowExpansion = (eventId: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const columns = useMemo<ColumnDef<StrategyEngineEvent>[]>(
    () => [
      {
        id: "expand",
        header: "",
        cell: ({ row }) => {
          const hasData =
            row.original.event_data &&
            Object.keys(row.original.event_data).length > 0;
          if (!hasData) return null;

          const isExpanded = expandedRows.has(row.original.id);
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => toggleRowExpansion(row.original.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          );
        },
        size: 30,
      },
      {
        accessorKey: "timestamp",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Timestamp
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
          const date = new Date(row.original.timestamp);
          return (
            <div className="text-sm">
              <div className="font-medium">{date.toLocaleDateString()}</div>
              <div className="text-xs text-muted-foreground">
                {date.toLocaleTimeString()}
              </div>
            </div>
          );
        },
        size: 140,
      },
      {
        accessorKey: "severity",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Severity
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
          const Icon = SEVERITY_ICONS[row.original.severity];
          return (
            <div className="flex items-center gap-2">
              <Icon
                className={`h-4 w-4 ${SEVERITY_COLORS[row.original.severity]}`}
              />
              <span className="capitalize text-sm">
                {row.original.severity}
              </span>
            </div>
          );
        },
        size: 100,
      },
      {
        accessorKey: "event_category",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Category
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
          return (
            <Badge variant="outline" className="text-xs">
              {CATEGORY_LABELS[row.original.event_category] ||
                row.original.event_category}
            </Badge>
          );
        },
        size: 130,
      },
      {
        accessorKey: "symbol",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Symbol
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
          return row.original.symbol ? (
            <span className="font-semibold text-sm">{row.original.symbol}</span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          );
        },
        size: 100,
      },
      {
        accessorKey: "message",
        header: "Message",
        cell: ({ row }) => {
          return (
            <div className="max-w-[500px]">
              <p className="text-sm">{row.original.message}</p>
            </div>
          );
        },
        minSize: 300,
      },
    ],
    [expandedRows]
  );

  const table = useReactTable({
    data: events,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Feed
            </CardTitle>
            <CardDescription>
              Strategy engine events and trading activity ({events.length}{" "}
              events)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Select value={symbol} onValueChange={setSymbol}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Symbol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Symbols</SelectItem>
              {uniqueSymbols.map((sym) => (
                <SelectItem key={sym} value={sym}>
                  {sym}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No events found. Strategy events will appear here as the fund
            trades.
          </div>
        ) : (
          <div className="space-y-4">
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
                  {table.getRowModel().rows.map((row) => (
                    <>
                      <TableRow
                        key={row.id}
                        className={`${
                          SEVERITY_BG_COLORS[row.original.severity]
                        } hover:opacity-80`}
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
                      {expandedRows.has(row.original.id) &&
                        row.original.event_data &&
                        Object.keys(row.original.event_data).length > 0 && (
                          <TableRow key={`${row.id}-expanded`}>
                            <TableCell
                              colSpan={columns.length}
                              className="bg-muted/50"
                            >
                              <div className="p-4">
                                <h4 className="text-sm font-semibold mb-2">
                                  Event Details
                                </h4>
                                <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-64">
                                  {JSON.stringify(
                                    row.original.event_data,
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing{" "}
                {table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                  1}{" "}
                to{" "}
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  events.length
                )}{" "}
                of {events.length} events
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <div className="text-sm text-muted-foreground">
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {table.getPageCount()}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
