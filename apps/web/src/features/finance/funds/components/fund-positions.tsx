/**
 * FundPositions Component
 *
 * Displays current positions for a fund with Alpaca validation.
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
  CheckCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

interface DatabasePosition {
  symbol: string;
  qty: number;
  source: string;
}

interface PositionsData {
  fund_id: string;
  database_positions: DatabasePosition[];
}

interface FundPositionsProps {
  fundId: string;
}


export function FundPositions({ fundId }: FundPositionsProps) {
  const [data, setData] = useState<PositionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [closeAllError, setCloseAllError] = useState<string | null>(null);
  const [showCloseAllDialog, setShowCloseAllDialog] = useState(false);
  const [alpacaSorting, setAlpacaSorting] = useState<SortingState>([
    { id: "symbol", desc: false },
  ]);
  const [databaseSorting, setDatabaseSorting] = useState<SortingState>([
    { id: "symbol", desc: false },
  ]);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/positions`
      );
      if (!response.ok) throw new Error("Failed to fetch positions");
      const result: PositionsData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch positions"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCloseAll = async () => {
    try {
      setIsClosingAll(true);
      setCloseAllError(null);

      const response = await fetch(
        `http://localhost:8000/api/funds/${fundId}/positions/close-all-orphaned`,
        { method: "POST" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to close all positions");
      }

      const result = await response.json();
      console.log("All positions closed:", result);

      // Close dialog and refresh positions
      setShowCloseAllDialog(false);
      await fetchPositions();
    } catch (err) {
      setCloseAllError(
        err instanceof Error ? err.message : "Failed to close all positions"
      );
      console.error("Error closing all positions:", err);
    } finally {
      setIsClosingAll(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    // Auto-refresh disabled to prevent losing user's place while editing
    // const interval = setInterval(fetchPositions, 10000);
    // return () => clearInterval(interval);
  }, [fundId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const alpacaColumns = useMemo<ColumnDef<AlpacaPosition>[]>(
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
        id: "quantity",
        accessorFn: (row) => row.qty,
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
        cell: ({ row }) => <div className="text-right">{row.original.qty}</div>,
      },
      {
        id: "avg_entry_price",
        accessorFn: (row) => row.avg_entry_price,
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
                Avg Entry
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
            {formatCurrency(row.original.avg_entry_price)}
          </div>
        ),
      },
      {
        id: "current_price",
        accessorFn: (row) => row.current_price,
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
                Current Price
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
            {formatCurrency(row.original.current_price)}
          </div>
        ),
      },
      {
        id: "market_value",
        accessorFn: (row) => row.market_value,
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
        cell: ({ row }) => (
          <div className="text-right">
            {formatCurrency(row.original.market_value)}
          </div>
        ),
      },
      {
        id: "unrealized_pl",
        accessorFn: (row) => row.unrealized_pl,
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
                Unrealized P&L
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
          <div
            className={`text-right font-medium ${
              row.original.unrealized_pl >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {formatCurrency(row.original.unrealized_pl)}
          </div>
        ),
      },
      {
        id: "unrealized_plpc",
        accessorFn: (row) => row.unrealized_plpc,
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
        cell: ({ row }) => (
          <div
            className={`text-right font-medium ${
              row.original.unrealized_plpc >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {formatPercent(row.original.unrealized_plpc)}
          </div>
        ),
      },
      {
        id: "sync",
        header: "Sync",
        cell: ({ row }) => {
          if (!data) return null;
          const inDb = data.database_positions.some(
            (p) => p.symbol === row.original.symbol
          );
          return inDb ? (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs">Synced</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Not in DB</span>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [data]
  );

  const databaseColumns = useMemo<ColumnDef<DatabasePosition>[]>(
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
        id: "quantity",
        accessorFn: (row) => row.qty,
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
        cell: ({ row }) => <div className="text-right">{row.original.qty}</div>,
      },
      {
        id: "sync",
        header: "Sync",
        cell: ({ row }) => {
          if (!data) return null;
          const inAlpaca = data.alpaca_positions.some(
            (p) => p.symbol === row.original.symbol
          );
          return inAlpaca ? (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span className="text-xs">Synced</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-600">
              <XCircle className="h-4 w-4" />
              <span className="text-xs">Not in Alpaca</span>
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          if (!data) return null;
          const inAlpaca = data.alpaca_positions.some(
            (p) => p.symbol === row.original.symbol
          );
          return (
            <div className="text-right">
              {!inAlpaca && (
                <CloseOrphanedPositionButton
                  fundId={fundId}
                  symbol={row.original.symbol}
                  onSuccess={fetchPositions}
                />
              )}
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [data, fundId]
  );

  const alpacaTable = useReactTable({
    data: data?.alpaca_positions || [],
    columns: alpacaColumns,
    state: {
      sorting: alpacaSorting,
    },
    onSortingChange: setAlpacaSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const databaseTable = useReactTable({
    data: data?.database_positions || [],
    columns: databaseColumns,
    state: {
      sorting: databaseSorting,
    },
    onSortingChange: setDatabaseSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Early returns after all hooks have been called
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

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="font-semibold mb-2">Error Loading Positions</p>
            <p className="text-sm">{error}</p>
            <Button onClick={fetchPositions} variant="outline" className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sync Issues Alert */}
      {data.has_sync_issues && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sync Issues Detected</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 mt-2">
              {data.sync_issues.in_alpaca_not_db.length > 0 && (
                <div>
                  <p className="font-semibold">
                    In Alpaca but not in Database:
                  </p>
                  <p className="text-sm">
                    {data.sync_issues.in_alpaca_not_db.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions exist in Alpaca but have no transaction
                    history. They may belong to a different fund.
                  </p>
                </div>
              )}
              {data.sync_issues.in_db_not_alpaca.length > 0 && (
                <div className="mt-2">
                  <p className="font-semibold">
                    In Database but not in Alpaca:
                  </p>
                  <p className="text-sm">
                    {data.sync_issues.in_db_not_alpaca.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    These positions show as open in the database but don't exist
                    in Alpaca. This indicates a sync problem.
                  </p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Fund Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fund Status</CardTitle>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Mode:</span>
                <Badge
                  variant={data.fund_mode === "sim" ? "secondary" : "default"}
                >
                  {data.fund_mode.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={data.is_running ? "default" : "outline"}>
                  {data.is_running ? "Running" : "Stopped"}
                </Badge>
              </div>
              <Button onClick={fetchPositions} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Alpaca Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Alpaca Positions</CardTitle>
          <CardDescription>
            Current positions from Alpaca{" "}
            {data.fund_mode === "sim" ? "(Paper Trading)" : "(Live Trading)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.alpaca_positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions in Alpaca
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {alpacaTable.getHeaderGroups().map((headerGroup) => (
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
                  {alpacaTable.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={alpacaColumns.length}
                        className="text-center text-muted-foreground py-8"
                      >
                        No positions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    alpacaTable.getRowModel().rows.map((row) => (
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

      {/* Database Positions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Database Positions</CardTitle>
              <CardDescription>
                Positions calculated from transaction history
              </CardDescription>
            </div>
            {data.sync_issues.in_db_not_alpaca.length > 0 && (
              <AlertDialog
                open={showCloseAllDialog}
                onOpenChange={setShowCloseAllDialog}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Close All Orphaned
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                      Close All Orphaned Positions?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-3">
                      <p>
                        This will create closing transactions for{" "}
                        <strong>
                          {data.sync_issues.in_db_not_alpaca.length} orphaned
                          position(s)
                        </strong>{" "}
                        to zero them out in the database.
                      </p>
                      <div className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-3 text-sm">
                        <p className="font-semibold text-orange-900 dark:text-orange-200 mb-2">
                          Positions to close:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-orange-800 dark:text-orange-300">
                          {data.sync_issues.in_db_not_alpaca.map((symbol) => (
                            <li key={symbol}>{symbol}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 text-sm space-y-2">
                        <p className="font-semibold text-blue-900 dark:text-blue-200">
                          What this does:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-300">
                          <li>
                            Creates matching sell transactions for each position
                          </li>
                          <li>
                            Tries to find matching Alpaca orders for actual exit
                            prices
                          </li>
                          <li>
                            Falls back to breakeven pricing if orders not found
                          </li>
                          <li>Returns sale proceeds to your fund balance</li>
                          <li>Creates a complete audit trail</li>
                        </ul>
                      </div>
                      {closeAllError && (
                        <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-800 dark:text-red-300">
                          <p className="font-semibold mb-1">Error:</p>
                          <p>{closeAllError}</p>
                        </div>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClosingAll}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleCloseAll();
                      }}
                      disabled={isClosingAll}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                    >
                      {isClosingAll
                        ? "Closing..."
                        : `Close ${data.sync_issues.in_db_not_alpaca.length} Position(s)`}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {data.database_positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No positions in database
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {databaseTable.getHeaderGroups().map((headerGroup) => (
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
                  {databaseTable.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={databaseColumns.length}
                        className="text-center text-muted-foreground py-8"
                      >
                        No positions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    databaseTable.getRowModel().rows.map((row) => (
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
    </div>
  );
}
