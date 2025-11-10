/**
 * FundPositions Component
 *
 * Displays current positions for a fund from the database with real-time updates.
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
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

import {
  FundPositionDetail,
  useFundPositions,
} from "../hooks/use-fund-positions";
import { fundService } from "../services/fund-service";

interface FundPositionsProps {
  fundId: string;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function FundPositions({ fundId }: FundPositionsProps) {
  const { positions, syncIssues, loading, error, refresh } =
    useFundPositions(fundId);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "symbol", desc: false },
  ]);
  const [liquidatingSymbol, setLiquidatingSymbol] = useState<string | null>(
    null
  );

  const hasSyncIssues =
    !!syncIssues &&
    (syncIssues.in_alpaca_not_db.length > 0 ||
      syncIssues.in_db_not_alpaca.length > 0);

  const handleLiquidate = useCallback(
    async (position: FundPositionDetail) => {
      if (position.source === "alpaca_only") {
        toast.error(
          "Position exists only in Alpaca. Reconcile before liquidating."
        );
        return;
      }
      if (position.quantity <= 0) {
        toast.error("Nothing to liquidate for this position.");
        return;
      }

      setLiquidatingSymbol(position.symbol);
      try {
        const result = await fundService.liquidatePosition(
          fundId,
          position.symbol
        );

        toast.success(`Liquidation order submitted for ${position.symbol}`, {
          description: result.order
            ? `${result.order.side.toUpperCase()} ${numberFormatter.format(
                result.order.quantity
              )} shares`
            : undefined,
        });

        await refresh();
      } catch (liquidationError) {
        const message =
          liquidationError instanceof Error
            ? liquidationError.message
            : "Failed to liquidate position";
        toast.error("Failed to liquidate position", {
          description: message,
        });
      } finally {
        setLiquidatingSymbol(null);
      }
    },
    [fundId, refresh]
  );

  const columns = useMemo<ColumnDef<FundPositionDetail>[]>(
    () => [
      {
        accessorKey: "symbol",
        header: ({ column }) => (
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
        ),
        cell: ({ row }) => {
          const position = row.original;
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{position.symbol}</span>
                {position.source === "alpaca_only" && (
                  <Badge variant="outline" className="text-xs">
                    Alpaca only
                  </Badge>
                )}
              </div>
              {position.tradeId ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Trade{" "}
                  <span className="font-mono">
                    {position.tradeId.slice(0, 8)}...
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(position.tradeId ?? "");
                      toast.success("Trade ID copied to clipboard");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Link
                    href={`/funds/${fundId}?tab=trades`}
                    className="inline-flex items-center gap-1 text-blue-600"
                  >
                    View
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  No trade linked
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "quantity",
        accessorFn: (row) => row.quantity,
        header: ({ column }) => (
          <div className="text-right">
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Quantity
              {column.getIsSorted() === "asc" ? (
                <ArrowUp className="ml-2 h-4 w-4" />
              ) : column.getIsSorted() === "desc" ? (
                <ArrowDown className="ml-2 h-4 w-4" />
              ) : (
                <ArrowUpDown className="ml-2 h-4 w-4" />
              )}
            </Button>
          </div>
        ),
        cell: ({ row }) => {
          const position = row.original;
          const mismatch =
            position.alpacaQuantity !== null &&
            Math.abs(position.quantity - position.alpacaQuantity) > 0.0001;
          return (
            <div className="text-right text-sm">
              {numberFormatter.format(position.quantity)}
              {position.alpacaQuantity !== null && (
                <span
                  className={cn(
                    "ml-2 text-xs",
                    mismatch ? "text-amber-600" : "text-muted-foreground"
                  )}
                >
                  Alpaca: {numberFormatter.format(position.alpacaQuantity)}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "avgEntryPrice",
        header: () => <div className="text-right">Avg Entry</div>,
        cell: ({ row }) => {
          const value = row.original.avgEntryPrice;
          return (
            <div className="text-right text-sm text-muted-foreground">
              {value !== null ? currencyFormatter.format(value) : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "currentPrice",
        header: () => <div className="text-right">Current Price</div>,
        cell: ({ row }) => {
          const value = row.original.currentPrice;
          return (
            <div className="text-right text-sm text-muted-foreground">
              {value !== null ? currencyFormatter.format(value) : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "marketValue",
        header: () => <div className="text-right">Market Value</div>,
        cell: ({ row }) => {
          const value = row.original.marketValue;
          return (
            <div className="text-right text-sm font-medium">
              {value !== null ? currencyFormatter.format(value) : "—"}
            </div>
          );
        },
      },
      {
        accessorKey: "unrealizedPl",
        header: () => <div className="text-right">Unrealized P&amp;L</div>,
        cell: ({ row }) => {
          const position = row.original;
          const { unrealizedPl, unrealizedPlPercent } = position;
          const positive = (unrealizedPl ?? 0) > 0;
          const negative = (unrealizedPl ?? 0) < 0;

          if (unrealizedPl === null && unrealizedPlPercent === null) {
            return (
              <div className="text-right text-sm text-muted-foreground">—</div>
            );
          }

          return (
            <div className="text-right text-sm font-semibold">
              <span
                className={cn(
                  positive && "text-emerald-600",
                  negative && "text-red-600"
                )}
              >
                {unrealizedPl !== null
                  ? currencyFormatter.format(unrealizedPl)
                  : "—"}
              </span>
              {unrealizedPlPercent !== null && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({numberFormatter.format(unrealizedPlPercent)}%)
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "orders",
        header: () => <div>Recent Orders</div>,
        cell: ({ row }) => {
          const orders = row.original.orders.slice(0, 3);
          if (orders.length === 0) {
            return <div className="text-xs text-muted-foreground">None</div>;
          }
          return (
            <div className="flex flex-wrap gap-2">
              {orders.map((order) => (
                <Badge
                  key={order.id}
                  variant="outline"
                  className="flex items-center gap-1 text-xs"
                >
                  <span className="font-mono">
                    {order.id.slice(0, 6)}…
                  </span>
                  <span>{order.side.toUpperCase()}</span>
                  <span
                    className={cn(
                      "rounded px-1",
                      order.status === "filled"
                        ? "bg-emerald-100 text-emerald-700"
                        : order.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {order.status}
                  </span>
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const position = row.original;
          const isDisabled =
            position.source === "alpaca_only" || position.quantity <= 0;
          const busy = liquidatingSymbol === position.symbol;

          return (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="destructive"
                disabled={isDisabled || busy}
                onClick={() => handleLiquidate(position)}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Liquidate
              </Button>
            </div>
          );
        },
      },
    ],
    [fundId, handleLiquidate, liquidatingSymbol]
  );

  const table = useReactTable({
    data: positions,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading positions...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Positions</p>
            <p className="text-sm">{error}</p>
            <Button onClick={refresh} variant="outline" className="mt-4">
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
            <CardTitle>Positions</CardTitle>
            <CardDescription>
              Complete view of tracked and Alpaca positions. Liquidate to send a
              market order that closes the holding.
            </CardDescription>
            {hasSyncIssues && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  {syncIssues?.in_db_not_alpaca.length
                    ? `${syncIssues.in_db_not_alpaca.length} DB position(s) missing on Alpaca. `
                    : ""}
                  {syncIssues?.in_alpaca_not_db.length
                    ? `${syncIssues.in_alpaca_not_db.length} Alpaca position(s) missing in database.`
                    : ""}
                </span>
              </div>
            )}
          </div>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No positions found
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
                      className="text-center text-muted-foreground py-8"
                    >
                      No positions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/50">
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
  );
}
