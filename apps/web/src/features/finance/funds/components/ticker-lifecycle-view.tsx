/**
 * TickerLifecycleView Component
 *
 * Displays ticker lifecycle states for a fund with filtering and transition history.
 */

"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

export function TickerLifecycleView({ fundId }: TickerLifecycleViewProps) {
  const router = useRouter();
  const [states, setStates] = useState<TickerStateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [stateFilter, setStateFilter] = useState<TickerState | "all">("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const loadStates = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await tickerStateService.getTickerStates(
        fundId,
        stateFilter === "all" ? undefined : stateFilter
      );

      setStates(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load ticker states"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStates();
  }, [fundId, stateFilter]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const toggleRowExpansion = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const columns = useMemo<ColumnDef<TickerStateRecord>[]>(
    () => [
      {
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleRowExpansion(row.original.id)}
            className="h-6 w-6 p-0"
          >
            {expandedRows.has(row.original.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ),
      },
      {
        accessorKey: "ticker",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Ticker
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
          <div className="font-medium">{row.original.ticker}</div>
        ),
      },
      {
        accessorKey: "currentState",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              State
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
          const state = row.original.currentState;
          return (
            <Badge
              variant="outline"
              className={stateColors[state] || "bg-gray-100 text-gray-800"}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </Badge>
          );
        },
      },
      {
        accessorKey: "lastScreenedAt",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Last Screened
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
          <div className="text-xs text-muted-foreground">
            {formatDateTime(row.original.lastScreenedAt)}
          </div>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Updated
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
          <div className="text-xs text-muted-foreground">
            {formatDateTime(row.original.updatedAt)}
          </div>
        ),
      },
    ],
    [expandedRows]
  );

  const table = useReactTable({
    data: states,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

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
    <>
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
              <Select
                value={stateFilter}
                onValueChange={(value) =>
                  setStateFilter(value as TickerState | "all")
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  <SelectItem value="screened">Screened</SelectItem>
                  <SelectItem value="setup">Setup</SelectItem>
                  <SelectItem value="entered">Entered</SelectItem>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="exited">Exited</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadStates}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {states.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No ticker states found. Execute the strategy to see ticker
              lifecycle tracking.
            </div>
          ) : (
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
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No tickers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <>
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            router.push(
                              `/ticker?ticker=${row.original.ticker}`
                            );
                          }}
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
                        {expandedRows.has(row.original.id) && (
                          <TableRow>
                            <TableCell
                              colSpan={columns.length}
                              className="bg-muted/30"
                            >
                              <div className="py-4 px-4">
                                <h4 className="font-semibold mb-2">
                                  Transition History
                                </h4>
                                <div className="space-y-2">
                                  {row.original.stateTransitions.length ===
                                  0 ? (
                                    <p className="text-sm text-muted-foreground">
                                      No transitions yet
                                    </p>
                                  ) : (
                                    row.original.stateTransitions.map(
                                      (transition, idx) => (
                                        <div
                                          key={idx}
                                          className="text-sm border-l-2 border-gray-300 pl-3 py-1"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Badge
                                              variant="outline"
                                              className="text-xs"
                                            >
                                              {transition.transitionCode}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                              {formatDateTime(
                                                transition.timestamp
                                              )}
                                            </span>
                                          </div>
                                          <div className="mt-1">
                                            {transition.fromState ? (
                                              <span className="text-muted-foreground">
                                                {transition.fromState} →{" "}
                                              </span>
                                            ) : null}
                                            <span className="font-medium">
                                              {transition.toState}
                                            </span>
                                          </div>
                                          <div className="mt-1 text-muted-foreground">
                                            {transition.description}
                                          </div>
                                        </div>
                                      )
                                    )
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
