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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Group,
  RefreshCw,
  Trash2,
} from "lucide-react";
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

export function TickerLifecycleView({ fundId }: TickerLifecycleViewProps) {
  const router = useRouter();
  const [states, setStates] = useState<TickerStateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [stateFilter, setStateFilter] = useState<TickerState | "all">("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [fundStatus, setFundStatus] = useState<"active" | "paused" | null>(
    null
  );
  const [groupByState, setGroupByState] = useState(true);

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
      await loadStates(); // Refresh the states list
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
  }, [fundId, stateFilter]);

  useEffect(() => {
    void loadFundStatus();
  }, [fundId]);

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
        accessorKey: "entryLevelId",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Entry Level
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
            {row.original.entryLevelId || "—"}
          </div>
        ),
      },
      {
        accessorKey: "tradeId",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Trade ID
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
            {row.original.tradeId || "—"}
          </div>
        ),
      },
      {
        id: "latestTransition",
        header: "Latest Transition",
        cell: ({ row }) => {
          const transitions = row.original.stateTransitions || [];
          const latest =
            transitions.length > 0 ? transitions[transitions.length - 1] : null;
          if (!latest)
            return <div className="text-xs text-muted-foreground">—</div>;

          return (
            <div className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs">
                  {latest.transitionCode}
                </Badge>
                <span className="text-muted-foreground">
                  {formatDateTime(latest.timestamp)}
                </span>
              </div>
              {latest.description && (
                <div className="text-muted-foreground truncate max-w-[200px]">
                  {latest.description}
                </div>
              )}
            </div>
          );
        },
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

  // Group states by currentState when grouping is enabled
  const groupedStates = useMemo(() => {
    if (!groupByState) return null;

    const grouped = states.reduce((acc, state) => {
      const stateKey = state.currentState;
      if (!acc[stateKey]) {
        acc[stateKey] = [];
      }
      acc[stateKey].push(state);
      return acc;
    }, {} as Record<TickerState, TickerStateRecord[]>);

    // Order states in a logical flow
    const stateOrder: TickerState[] = [
      "screened",
      "setup",
      "entered",
      "filled",
      "exited",
      "removed",
    ];

    return stateOrder
      .filter((state) => grouped[state] && grouped[state].length > 0)
      .map((state) => ({
        state,
        records: grouped[state],
      }));
  }, [states, groupByState]);

  // Create a table instance for grouped records to properly render cells
  const groupedData = useMemo(() => {
    if (!groupByState || !groupedStates) return [];
    return groupedStates.flatMap((g) => g.records);
  }, [groupByState, groupedStates]);

  const groupedTable = useReactTable({
    data: groupedData,
    columns,
    getCoreRowModel: getCoreRowModel(),
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
              <Button
                variant={groupByState ? "default" : "outline"}
                size="sm"
                onClick={() => setGroupByState(!groupByState)}
              >
                <Group className="h-4 w-4 mr-2" />
                {groupByState ? "Ungroup" : "Group by State"}
              </Button>
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
                        <li>
                          All lifecycle transition history will be cleared
                        </li>
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
              No ticker states found. Execute the strategy to see ticker
              lifecycle tracking.
            </div>
          ) : groupByState && groupedStates ? (
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
                  {groupedStates.map((group) => (
                    <>
                      <TableRow
                        key={`group-${group.state}`}
                        className="bg-muted/50"
                      >
                        <TableCell
                          colSpan={columns.length}
                          className="font-semibold py-3"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                stateColors[group.state] ||
                                "bg-gray-100 text-gray-800"
                              }
                            >
                              {group.state.charAt(0).toUpperCase() +
                                group.state.slice(1)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              ({group.records.length} ticker
                              {group.records.length !== 1 ? "s" : ""})
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.records.map((stateRecord) => {
                        const row = groupedTable
                          .getRowModel()
                          .rows.find((r) => r.original.id === stateRecord.id);
                        if (!row) return null;

                        return (
                          <>
                            <TableRow
                              key={stateRecord.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                router.push(
                                  `/ticker?ticker=${stateRecord.ticker}`
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
                            {expandedRows.has(stateRecord.id) && (
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
                                      {stateRecord.stateTransitions.length ===
                                      0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          No transitions yet
                                        </p>
                                      ) : (
                                        stateRecord.stateTransitions.map(
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
                        );
                      })}
                    </>
                  ))}
                  {groupedStates.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No tickers found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
