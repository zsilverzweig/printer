/**
 * FundLedger Component
 *
 * Displays the complete ledger for a fund with sorting, filtering, and pagination.
 * Uses TanStack Table for powerful table features.
 */

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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import { useUrlTabs } from "@/lib/hooks/use-url-tabs";

import { FundTransaction, FundTransfer } from "../types";
import { StrategyEngineEventsModal } from "./strategy-engine-events-modal";

interface FundLedgerProps {
  fundId: string;
  transactions: FundTransaction[];
  transfers: FundTransfer[];
  loading: boolean;
}

type LedgerRow = {
  id: string;
  timestamp: Date;
  type: "transfer" | "transaction";
  symbol: string;
  action: string;
  quantity: number | null;
  price: number | null;
  cashImpact: number;
  pnl: number | null;
  isWinner: boolean;
  // Store original data for rendering
  _data: FundTransfer | FundTransaction;
};

export function FundLedger({
  fundId,
  transactions,
  transfers,
  loading,
}: FundLedgerProps) {
  const [selectedTicker, setSelectedTicker] = useState<string>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "timestamp", desc: true },
  ]);
  const [activeTab, setActiveTab] = useUrlTabs({
    defaultTab: "all",
    paramName: "ledgerTab",
  });
  const [eventsModalOpen, setEventsModalOpen] = useState(false);
  const [eventsModalSymbol, setEventsModalSymbol] = useState<
    string | undefined
  >();
  const [isReconciling, setIsReconciling] = useState(false);

  // Extract unique tickers from transactions
  const uniqueTickers = useMemo(() => {
    const tickers = new Set(transactions.map((t) => t.symbol));
    return Array.from(tickers).sort();
  }, [transactions]);

  // Calculate average entry price per symbol for P&L calculation
  const calculatePnL = useMemo(() => {
    const positionTracker: Record<
      string,
      { totalQty: number; totalCost: number; avgPrice: number }
    > = {};
    const pnlMap: Record<string, number | null> = {};

    // Sort transactions by timestamp to process in order
    const sortedTxns = [...transactions].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedTxns.forEach((txn) => {
      if (!positionTracker[txn.symbol]) {
        positionTracker[txn.symbol] = {
          totalQty: 0,
          totalCost: 0,
          avgPrice: 0,
        };
      }

      const position = positionTracker[txn.symbol];

      if (txn.side === "buy") {
        // Add to position
        position.totalCost += txn.totalValue;
        position.totalQty += txn.quantity;
        position.avgPrice = position.totalCost / position.totalQty;
      } else if (txn.side === "sell") {
        // Calculate P&L for this sell
        const costBasis = position.avgPrice * txn.quantity;
        const proceeds = txn.totalValue;
        const pnl = proceeds - costBasis;
        pnlMap[txn.id] = pnl;

        // Reduce position
        position.totalQty -= txn.quantity;
        if (position.totalQty > 0) {
          position.totalCost = position.avgPrice * position.totalQty;
        } else {
          // Position closed
          position.totalCost = 0;
          position.avgPrice = 0;
        }
      }
    });

    return pnlMap;
  }, [transactions]);

  // Transform data into table rows
  const tableData = useMemo(() => {
    const rows: LedgerRow[] = [];

    // Add transfers
    transfers.forEach((transfer) => {
      const isDeposit = transfer.transferType === "deposit";
      rows.push({
        id: transfer.id,
        timestamp: new Date(transfer.timestamp),
        type: "transfer",
        symbol: "—",
        action: isDeposit ? "Deposit" : "Withdrawal",
        quantity: null,
        price: null,
        cashImpact: isDeposit ? transfer.amount : -transfer.amount,
        pnl: null,
        isWinner: false,
        _data: transfer,
      });
    });

    // Add transactions
    transactions.forEach((txn) => {
      const isBuy = txn.side === "buy";
      const pnl = calculatePnL[txn.id] ?? null;
      const isWinner = pnl !== null && pnl > 0;

      rows.push({
        id: txn.id,
        timestamp: new Date(txn.timestamp),
        type: "transaction",
        symbol: txn.symbol,
        action: isBuy ? "BUY" : "SELL",
        quantity: txn.quantity,
        price: txn.price,
        cashImpact: isBuy ? -txn.totalValue : txn.totalValue,
        pnl,
        isWinner,
        _data: txn,
      });
    });

    return rows;
  }, [transfers, transactions, calculatePnL]);

  // Filter data based on active tab and ticker
  const filteredData = useMemo(() => {
    let filtered = tableData;

    // Apply tab filter
    if (activeTab === "transfers") {
      filtered = filtered.filter((row) => row.type === "transfer");
    } else if (activeTab === "transactions") {
      filtered = filtered.filter((row) => row.type === "transaction");
    }

    // Apply ticker filter (only for transactions)
    if (selectedTicker !== "all") {
      filtered = filtered.filter(
        (row) => row.type === "transfer" || row.symbol === selectedTicker
      );
    }

    return filtered;
  }, [tableData, activeTab, selectedTicker]);

  // Calculate cash impact sum for filtered data
  const cashImpactSum = useMemo(() => {
    return filteredData.reduce((sum, row) => sum + row.cashImpact, 0);
  }, [filteredData]);

  // Column definitions
  const columns = useMemo<ColumnDef<LedgerRow>[]>(
    () => [
      {
        accessorKey: "timestamp",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4"
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
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.timestamp.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => {
          const handleCopy = () => {
            navigator.clipboard.writeText(row.original.id);
            toast.success("Ledger entry ID copied to clipboard");
          };

          return (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground font-mono">
                {row.original.id.slice(0, 8)}...
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-6 w-6 p-0 hover:bg-muted"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.type === "transfer" ? "Transfer" : "Transaction"}
          </Badge>
        ),
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
              className="-ml-4"
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
          <span className="font-medium">{row.original.symbol}</span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant="outline" className="text-xs">
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: "quantity",
        header: () => <div className="text-right">Quantity</div>,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.quantity !== null ? row.original.quantity : "—"}
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => {
          return (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-mr-4"
              >
                Price
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
            {row.original.price !== null
              ? `$${row.original.price.toFixed(2)}`
              : "—"}
          </div>
        ),
      },
      {
        accessorKey: "cashImpact",
        header: ({ column }) => {
          return (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-mr-4"
              >
                Cash Impact
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
            <span className="font-medium">
              {row.original.cashImpact >= 0 ? "+" : ""}$
              {Math.abs(row.original.cashImpact).toFixed(2)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "pnl",
        header: ({ column }) => {
          return (
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                onClick={() =>
                  column.toggleSorting(column.getIsSorted() === "asc")
                }
                className="-mr-4"
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
          const pnl = row.original.pnl;
          const isWinner = row.original.isWinner;
          const isLoser = pnl !== null && pnl < 0;

          return (
            <div className="text-right">
              {pnl !== null ? (
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={`font-semibold ${
                      isWinner
                        ? "text-green-600"
                        : isLoser
                        ? "text-red-600"
                        : ""
                    }`}
                  >
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </span>
                  {isWinner && (
                    <span className="text-xs text-green-600">✓</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          );
        },
      },
    ],
    []
  );

  // Initialize table
  const table = useReactTable({
    data: filteredData,
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
        pageSize: 20,
      },
    },
  });

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Loading ledger data...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Ledger</CardTitle>
              <CardDescription>
                Complete history of money movements - transfers and transactions
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsReconciling(true);
                  try {
                    const response = await fetch(
                      `/api/funds/${fundId}/reconcile-positions`,
                      {
                        method: "POST",
                      }
                    );

                    if (!response.ok) {
                      throw new Error("Reconciliation failed");
                    }

                    const result = await response.json();

                    if (result.status === "in_sync") {
                      toast.success("✓ All positions in sync");
                    } else {
                      toast.success(
                        `✓ Reconciliation complete: ${result.corrections_applied} corrections applied`,
                        {
                          description: `Found ${result.total_discrepancies} discrepancies`,
                        }
                      );

                      // Open events modal filtered to position_sync
                      setEventsModalSymbol(undefined);
                      setEventsModalOpen(true);
                    }
                  } catch (error) {
                    console.error("Reconciliation error:", error);
                    toast.error("Reconciliation failed", {
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                    });
                  } finally {
                    setIsReconciling(false);
                  }
                }}
                disabled={isReconciling}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${
                    isReconciling ? "animate-spin" : ""
                  }`}
                />
                {isReconciling ? "Reconciling..." : "Reconcile Positions"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEventsModalSymbol(undefined);
                  setEventsModalOpen(true);
                }}
              >
                <Activity className="h-4 w-4 mr-2" />
                Engine Events
              </Button>
            </div>
          </div>

          {/* Filter and Summary Section */}
          <div className="flex flex-col sm:flex-row gap-4 mt-4 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label className="text-sm font-medium">Ticker:</label>
              <Select value={selectedTicker} onValueChange={setSelectedTicker}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All tickers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tickers</SelectItem>
                  {uniqueTickers.map((ticker) => (
                    <SelectItem key={ticker} value={ticker}>
                      {ticker}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cash Impact Sum */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-muted/50">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <span className="text-muted-foreground font-medium">
                  Net Cash Impact:{" "}
                </span>
                <span
                  className={`font-bold ${
                    cashImpactSum >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {cashImpactSum >= 0 ? "+" : ""}${cashImpactSum.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All ({tableData.length})</TabsTrigger>
              <TabsTrigger value="transfers">
                Transfers ({transfers.length})
              </TabsTrigger>
              <TabsTrigger value="transactions">
                Transactions ({transactions.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="space-y-4">
              {filteredData.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {activeTab === "all"
                    ? "No ledger entries yet"
                    : activeTab === "transfers"
                    ? "No transfers yet"
                    : selectedTicker === "all"
                    ? "No transactions yet"
                    : `No transactions for ${selectedTicker}`}
                </div>
              ) : (
                <>
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
                          <TableRow key={row.id}>
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id}>
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext()
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Controls */}
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
                        filteredData.length
                      )}{" "}
                      of {filteredData.length} entries
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
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Strategy Engine Events Modal */}
      <StrategyEngineEventsModal
        fundId={fundId}
        open={eventsModalOpen}
        onOpenChange={setEventsModalOpen}
        initialSymbol={eventsModalSymbol}
      />
    </>
  );
}
