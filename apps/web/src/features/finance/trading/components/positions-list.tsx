"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { useMemo, useState } from "react";

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
import { AlpacaPosition } from "@/lib/types/alpaca";

interface PositionsListProps {
  positions: AlpacaPosition[];
  loading: boolean;
  accountCurrency: string;
  onClosePosition?: (symbol: string, qty: number) => void;
  isClosingPosition?: boolean;
}

export function PositionsList({
  positions,
  loading,
  accountCurrency,
  onClosePosition,
  isClosingPosition = false,
}: PositionsListProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "unrealized_pl", desc: true },
  ]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const columns = useMemo<ColumnDef<AlpacaPosition>[]>(
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
        accessorKey: "qty",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Side
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
          const qty = Number(row.original.qty) || 0;
          const side = qty > 0 ? "Long" : "Short";
          return <div className="text-sm text-muted-foreground">{side}</div>;
        },
        sortingFn: (rowA, rowB) => {
          const qtyA = Number(rowA.original.qty) || 0;
          const qtyB = Number(rowB.original.qty) || 0;
          return qtyA - qtyB;
        },
      },
      {
        id: "quantity",
        accessorFn: (row) => Number(row.qty) || 0,
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
          );
        },
        cell: ({ row }) => {
          const qty = Number(row.original.qty) || 0;
          return (
            <div className="text-right text-sm text-muted-foreground">
              {formatNumber(Math.abs(qty), 4)}
            </div>
          );
        },
      },
      {
        id: "market_value",
        accessorFn: (row) => Number(row.market_value) || 0,
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
                Market Value
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
          const marketValue = Number(row.original.market_value) || 0;
          return (
            <div className="text-right font-medium">
              {formatCurrency(marketValue, accountCurrency)}
            </div>
          );
        },
      },
      {
        id: "unrealized_pl",
        accessorFn: (row) => Number(row.unrealized_pl) || 0,
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
                Unrealized P/L
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
          const unrealizedPL = Number(row.original.unrealized_pl) || 0;
          return (
            <div
              className={`text-right font-medium ${
                unrealizedPL >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {unrealizedPL >= 0 ? "+" : ""}
              {formatCurrency(unrealizedPL, accountCurrency)}
            </div>
          );
        },
      },
      {
        id: "unrealized_plpc",
        accessorFn: (row) => Number(row.unrealized_plpc) || 0,
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
                P/L %
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
          const unrealizedPLPercent = Number(row.original.unrealized_plpc) || 0;
          return (
            <div
              className={`text-right font-medium ${
                unrealizedPLPercent >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {unrealizedPLPercent >= 0 ? "+" : ""}
              {formatNumber(unrealizedPLPercent * 100, 2)}%
            </div>
          );
        },
      },
      ...(onClosePosition
        ? [
            {
              id: "action",
              header: () => <div className="text-center">Action</div>,
              cell: ({ row }) => {
                const qty = Number(row.original.qty) || 0;
                return (
                  <div className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onClosePosition(row.original.symbol, Math.abs(qty))
                      }
                      disabled={isClosingPosition}
                      className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              },
              enableSorting: false,
            },
          ]
        : []),
    ],
    [accountCurrency, onClosePosition, isClosingPosition]
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
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
          <CardDescription>
            Your current holdings and their performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
          <CardDescription>
            Your current holdings and their performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              No open positions found.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Positions</CardTitle>
        <CardDescription>
          Current holdings across long and short positions.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    No open positions found.
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
      </CardContent>
    </Card>
  );
}
