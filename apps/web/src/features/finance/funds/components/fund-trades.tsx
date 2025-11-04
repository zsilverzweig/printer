/**
 * FundTrades Component
 *
 * Displays trades for a fund using TanStack table with sorting and filtering.
 */

"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  RefreshCw,
  TrendingDown,
  TrendingUp,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

import { analyticsService, TradeRecord } from "../services/analytics-service";

interface FundTradesProps {
  fundId: string;
}

export function FundTrades({ fundId }: FundTradesProps) {
  const router = useRouter();
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const loadTrades = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await analyticsService.getTrades({
        fund_id: fundId,
        status: "closed",
        limit: 500,
      });

      setTrades(result.trades);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trades");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTrades();
  }, [fundId]);

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 3600) return `${(seconds / 60).toFixed(0)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  const columns = useMemo<ColumnDef<TradeRecord>[]>(
    () => [
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
        cell: ({ row }) => (
          <div className="font-medium">{row.original.symbol}</div>
        ),
      },
      {
        accessorKey: "entry_time",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Entry
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
            {formatDateTime(row.original.entry_time)}
          </div>
        ),
      },
      {
        accessorKey: "exit_time",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Exit
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
            {row.original.exit_time
              ? formatDateTime(row.original.exit_time)
              : "—"}
          </div>
        ),
      },
      {
        id: "duration",
        accessorFn: (row) => row.hold_duration_seconds || 0,
        header: ({ column }) => {
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-ml-4 h-8"
              >
                Duration
                {column.getIsSorted() === "asc" ? (
                  <ArrowUp className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <ArrowDown className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="text-right text-xs">
            {formatDuration(row.original.hold_duration_seconds)}
          </div>
        ),
      },
      {
        id: "entry_price",
        accessorFn: (row) => row.entry_price,
        header: ({ column }) => {
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-ml-4 h-8"
              >
                Entry Price
                {column.getIsSorted() === "asc" ? (
                  <ArrowUp className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <ArrowDown className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="text-right">
            {formatCurrency(row.original.entry_price)}
          </div>
        ),
      },
      {
        id: "exit_price",
        accessorFn: (row) => row.exit_price || 0,
        header: ({ column }) => {
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-ml-4 h-8"
              >
                Exit Price
                {column.getIsSorted() === "asc" ? (
                  <ArrowUp className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <ArrowDown className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.exit_price
              ? formatCurrency(row.original.exit_price)
              : "—"}
          </div>
        ),
      },
      {
        id: "quantity",
        accessorFn: (row) => row.entry_quantity,
        header: ({ column }) => {
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-ml-4 h-8"
              >
                Qty
                {column.getIsSorted() === "asc" ? (
                  <ArrowUp className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <ArrowDown className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.entry_quantity.toFixed(2)}
          </div>
        ),
      },
      {
        id: "realized_pnl",
        accessorFn: (row) => row.realized_pnl || 0,
        header: ({ column }) => {
          return (
            <div className="text-right">
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
            </div>
          );
        },
        cell: ({ row }) => {
          const pnl = row.original.realized_pnl;
          const isWin = pnl !== null && pnl > 0;
          return (
            <div
              className={`text-right font-semibold ${
                isWin ? "text-green-600" : pnl === null ? "" : "text-red-600"
              }`}
            >
              {pnl !== null ? (
                <>
                  {isWin ? (
                    <TrendingUp className="inline h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="inline h-3 w-3 mr-1" />
                  )}
                  {formatCurrency(pnl)}
                </>
              ) : (
                "—"
              )}
            </div>
          );
        },
      },
      {
        id: "realized_pnl_percent",
        accessorFn: (row) => row.realized_pnl_percent || 0,
        header: ({ column }) => {
          return (
            <div className="text-right">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-ml-4 h-8"
              >
                P&L %
                {column.getIsSorted() === "asc" ? (
                  <ArrowUp className="ml-2 h-4 w-4" />
                ) : column.getIsSorted() === "desc" ? (
                  <ArrowDown className="ml-2 h-4 w-4" />
                ) : (
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
        cell: ({ row }) => {
          const pnlPercent = row.original.realized_pnl_percent;
          const isWin = pnlPercent !== null && pnlPercent > 0;
          return (
            <div
              className={`text-right font-medium ${
                isWin
                  ? "text-green-600"
                  : pnlPercent === null
                  ? ""
                  : "text-red-600"
              }`}
            >
              {pnlPercent !== null
                ? `${pnlPercent > 0 ? "+" : ""}${pnlPercent.toFixed(2)}%`
                : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "strategy_id",
        header: "Strategy",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.strategy_id || "N/A"}
          </Badge>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: trades,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
          <p className="text-muted-foreground">Loading trades...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Trades</p>
            <p className="text-sm">{error}</p>
            <Button onClick={loadTrades} variant="outline" className="mt-4">
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
              <CardTitle>Trades</CardTitle>
              <CardDescription>
                {trades.length} closed trade{trades.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadTrades}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No closed trades yet. Execute trades to see them here.
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
                        No trades found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          router.push(`/ticker?ticker=${row.original.symbol}`);
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
