"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Edit2, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import React from "react";

import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/lib/components/ui/dialog";
import { Input } from "@/lib/components/ui/input";
import { Label } from "@/lib/components/ui/label";
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
import { toast } from "sonner";

import { ScreenerControls } from "@/features/screener/components/screener-controls";
import {
  useScreeners,
  type ScreeningCriteria,
} from "@/features/screener/hooks/use-screeners";
import { useScreenerData } from "@/lib/hooks/use-screener-data";

// Stock data type
type StockData = {
  ticker: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  today_vol?: number;
  rv14?: number;
  rv?: number;
  change_close_pct?: number;
  change_close?: number;
  change_1m?: number;
  change_5m?: number;
  change_1h?: number;
};

function formatNumber(n: number | undefined) {
  if (typeof n !== "number") return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMultiple(n: number | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  return `${n.toFixed(2)}x`;
}

function formatPercent(n: number | null | undefined) {
  if (typeof n !== "number" || !isFinite(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function ScreenerPage() {
  const {
    screeners,
    loading: screenersLoading,
    runScreener,
    saveScreener,
    deleteScreener,
  } = useScreeners();
  const { data: liveData, isConnected } = useScreenerData();

  // State
  const [selectedScreenerId, setSelectedScreenerId] =
    React.useState<string>("");
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editedName, setEditedName] = React.useState("");
  const [editedDescription, setEditedDescription] = React.useState("");
  const [currentFilters, setCurrentFilters] = React.useState<
    ScreeningCriteria["criteria"]
  >({
    limit: 200,
    exclude_etfs: true,
  });
  const [mode, setMode] = React.useState<"live" | "historical">("live");
  const [historicalTimestamp, setHistoricalTimestamp] = React.useState<
    Date | undefined
  >(undefined);
  const [historicalResults, setHistoricalResults] = React.useState<
    any[] | null
  >(null);
  const [runningScreener, setRunningScreener] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "rv14", desc: true },
  ]);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [tempName, setTempName] = React.useState("");
  const [tempDescription, setTempDescription] = React.useState("");

  const selectedScreener = React.useMemo(
    () => screeners.find((s) => s.id === selectedScreenerId) || null,
    [screeners, selectedScreenerId]
  );

  const isNewScreener = selectedScreenerId === "new";

  // Track saved filters for comparison
  const [savedFilters, setSavedFilters] = React.useState<
    ScreeningCriteria["criteria"] | null
  >(null);

  // Check if filters have been modified
  const filtersModified = React.useMemo(() => {
    if (!selectedScreener || isEditMode) return false;
    if (!savedFilters) return false;

    // Deep compare filters
    return JSON.stringify(currentFilters) !== JSON.stringify(savedFilters);
  }, [currentFilters, savedFilters, selectedScreener, isEditMode]);

  // Load screener data when selected
  React.useEffect(() => {
    if (selectedScreener) {
      const filters = {
        ...selectedScreener.criteria,
        exclude_etfs: selectedScreener.criteria.exclude_etfs !== false,
      };
      setCurrentFilters(filters);
      setSavedFilters(filters);
      setEditedName(selectedScreener.name);
      setEditedDescription(selectedScreener.description || "");
      setIsEditMode(false);
    } else if (isNewScreener) {
      const defaultFilters = { limit: 200, exclude_etfs: true };
      setCurrentFilters(defaultFilters);
      setSavedFilters(null);
      setEditedName("");
      setEditedDescription("");
      setIsEditMode(true);
    }
  }, [selectedScreener, isNewScreener]);

  // Compute display data
  const displayData: StockData[] = React.useMemo(() => {
    const rawData = mode === "historical" ? historicalResults : liveData;
    if (!rawData) return [];

    // Apply client-side limit
    const limit = currentFilters?.limit;
    if (limit && typeof limit === "number" && limit > 0) {
      return rawData.slice(0, limit);
    }

    return rawData;
  }, [mode, liveData, historicalResults, currentFilters?.limit]);

  // Define columns
  const columns = React.useMemo<ColumnDef<StockData>[]>(
    () => [
      {
        accessorKey: "ticker",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Ticker
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <Link
            href={`/?ticker=${row.original.ticker}`}
            className="text-blue-600 hover:underline font-medium"
          >
            {row.original.ticker}
          </Link>
        ),
      },
      {
        accessorKey: "price",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Price
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right">${formatNumber(row.original.price)}</div>
        ),
      },
      {
        accessorKey: "open",
        header: "Open",
        cell: ({ row }) => (
          <div className="text-right">${formatNumber(row.original.open)}</div>
        ),
      },
      {
        accessorKey: "high",
        header: "High",
        cell: ({ row }) => (
          <div className="text-right">${formatNumber(row.original.high)}</div>
        ),
      },
      {
        accessorKey: "low",
        header: "Low",
        cell: ({ row }) => (
          <div className="text-right">${formatNumber(row.original.low)}</div>
        ),
      },
      {
        accessorKey: "close",
        header: "Close",
        cell: ({ row }) => (
          <div className="text-right">${formatNumber(row.original.close)}</div>
        ),
      },
      {
        accessorKey: "volume",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Volume
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {formatNumber(row.original.today_vol || row.original.volume)}
          </div>
        ),
      },
      {
        accessorKey: "rv14",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            RV14
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-right">
            {formatMultiple(row.original.rv14 || row.original.rv)}
          </div>
        ),
      },
      {
        accessorKey: "change_close_pct",
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Change (Close)
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const change =
            row.original.change_close_pct || row.original.change_close;
          return (
            <div
              className={`text-right ${
                change && change > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPercent(change)}
            </div>
          );
        },
      },
      {
        accessorKey: "change_1m",
        header: "Change (1m)",
        cell: ({ row }) => (
          <div className="text-right">
            {formatPercent(row.original.change_1m)}
          </div>
        ),
      },
      {
        accessorKey: "change_5m",
        header: "Change (5m)",
        cell: ({ row }) => (
          <div className="text-right">
            {formatPercent(row.original.change_5m)}
          </div>
        ),
      },
      {
        accessorKey: "change_1h",
        header: "Change (1h)",
        cell: ({ row }) => (
          <div className="text-right">
            {formatPercent(row.original.change_1h)}
          </div>
        ),
      },
    ],
    []
  );

  // Create table instance
  const table = useReactTable({
    data: displayData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Handle screener selection
  const handleScreenerSelect = (value: string) => {
    setSelectedScreenerId(value);
    setHistoricalResults(null);
    setMode("live");
  };

  // Handle save (for new screeners or dialog)
  const handleSave = async (name?: string, description?: string) => {
    const nameToUse = name || editedName;
    const descToUse =
      description !== undefined ? description : editedDescription;

    if (!nameToUse.trim()) {
      toast.error("Please enter a screener name");
      return;
    }

    const screenerData = {
      ...(selectedScreener && !isNewScreener ? selectedScreener : {}),
      name: nameToUse,
      description: descToUse,
      criteria: currentFilters,
    };

    const saved = await saveScreener(screenerData as any);
    if (saved) {
      toast.success(
        `Screener ${isNewScreener ? "created" : "updated"} successfully`
      );
      setSelectedScreenerId(saved.id);
      setIsEditMode(false);
      setEditDialogOpen(false);
    } else {
      toast.error("Failed to save screener");
    }
  };

  // Open edit dialog
  const handleOpenEditDialog = () => {
    if (selectedScreener) {
      setTempName(selectedScreener.name);
      setTempDescription(selectedScreener.description || "");
      setEditDialogOpen(true);
    }
  };

  // Save from dialog
  const handleSaveFromDialog = async () => {
    await handleSave(tempName, tempDescription);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedScreener) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedScreener.name}"?`
    );
    if (!confirmed) return;

    const success = await deleteScreener(selectedScreener.id);
    if (success) {
      toast.success("Screener deleted successfully");
      setSelectedScreenerId("");
    } else {
      toast.error("Failed to delete screener");
    }
  };

  // Handle run
  const handleRun = async () => {
    if (!selectedScreener && !isNewScreener) {
      toast.error("Please select or create a screener first");
      return;
    }

    setRunningScreener(true);
    try {
      if (mode === "historical") {
        if (!historicalTimestamp) {
          toast.error("Please select a historical timestamp");
          return;
        }

        if (isNewScreener || !selectedScreener) {
          toast.info(
            "Please save the screener first to run in historical mode"
          );
          return;
        }

        const result = await runScreener(
          selectedScreener.id,
          historicalTimestamp
        );
        if (result?.results) {
          setHistoricalResults(result.results);
          toast.success(`Found ${result.results.length} stocks`);
        } else {
          setHistoricalResults([]);
          toast.info("No results found");
        }
      } else {
        if (selectedScreener) {
          const result = await runScreener(selectedScreener.id);
          if (result) {
            toast.success(`Found ${result.ticker_count} stocks`);
          }
        }
      }
    } catch (err) {
      toast.error("Failed to run screener");
    } finally {
      setRunningScreener(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-card border-b shrink-0">
        <div className="container mx-auto p-3">
          <div className="flex items-center gap-3 mb-3">
            <h1 className="text-xl font-bold">Screener</h1>

            {/* Screener Selector */}
            <Select
              value={selectedScreenerId}
              onValueChange={handleScreenerSelect}
              disabled={screenersLoading}
            >
              <SelectTrigger className="w-64 h-8 text-sm">
                <SelectValue placeholder="Select or create screener..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new" className="text-blue-600 font-medium">
                  + Create New Screener
                </SelectItem>
                {screeners.length > 0 && <div className="border-t my-1" />}
                {screeners.map((screener) => (
                  <SelectItem key={screener.id} value={screener.id}>
                    {screener.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Edit Mode UI */}
            {(selectedScreener || isNewScreener) && (
              <>
                {isEditMode ? (
                  <>
                    <Input
                      placeholder="Screener name..."
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-48 h-8 text-sm"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSave}
                      className="h-8"
                      disabled={!editedName.trim()}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (isNewScreener) {
                          setSelectedScreenerId("");
                        } else {
                          setIsEditMode(false);
                          if (selectedScreener && savedFilters) {
                            setEditedName(selectedScreener.name);
                            setEditedDescription(
                              selectedScreener.description || ""
                            );
                            setCurrentFilters(savedFilters);
                          }
                        }
                      }}
                      className="h-8"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium">
                      {selectedScreener?.name}
                    </span>
                    {filtersModified && (
                      <span className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 px-2 py-1 rounded border border-yellow-200 dark:border-yellow-800">
                        Filters modified
                      </span>
                    )}
                    {!isNewScreener && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleOpenEditDialog}
                          className="h-8 w-8 p-0"
                          title="Edit screener name"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {filtersModified && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={async () => {
                              const screenerData = {
                                ...selectedScreener!,
                                criteria: currentFilters,
                              };
                              const saved = await saveScreener(
                                screenerData as any
                              );
                              if (saved) {
                                toast.success(
                                  "Screener updated with new filters"
                                );
                                setSavedFilters(currentFilters);
                              }
                            }}
                            className="h-8"
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save Filters
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDelete}
                          className="h-8"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* Live indicator */}
            {mode === "live" && !isNewScreener && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span>{isConnected ? "Live Data" : "Disconnected"}</span>
              </div>
            )}
          </div>

          {/* Filters Row */}
          <div className="space-y-2">
            {!isEditMode && selectedScreener && (
              <div className="text-xs text-muted-foreground px-1">
                {filtersModified ? (
                  <span className="text-yellow-600 dark:text-yellow-400">
                    ⚠️ Filters are temporarily overridden. Changes apply to
                    screening but won't save unless you click "Save Filters".
                  </span>
                ) : (
                  <span>
                    Using saved filters from "{selectedScreener.name}". Adjust
                    below to override temporarily.
                  </span>
                )}
              </div>
            )}
            <ScreenerControls
              screener={selectedScreener}
              mode={mode}
              filters={currentFilters}
              timestamp={historicalTimestamp}
              onModeChange={setMode}
              onTimestampChange={setHistoricalTimestamp}
              onFilterChange={(updates) => {
                setCurrentFilters({ ...currentFilters, ...updates });
              }}
              onRun={handleRun}
              loading={runningScreener}
            />
          </div>
        </div>
      </div>

      {/* Edit Name Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Screener</DialogTitle>
            <DialogDescription>
              Update the name and description for this screener.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="screener-name">Name *</Label>
              <Input
                id="screener-name"
                placeholder="Screener name..."
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="screener-description">Description</Label>
              <Input
                id="screener-description"
                placeholder="Optional description..."
                value={tempDescription}
                onChange={(e) => setTempDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFromDialog} disabled={!tempName.trim()}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Table */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-4">
          <Card>
            <div className="overflow-auto">
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
                        {!selectedScreener && !isNewScreener
                          ? "Select a screener to view results"
                          : mode === "historical"
                          ? !historicalTimestamp
                            ? "Select a historical date and click Run"
                            : runningScreener
                            ? "Loading historical data..."
                            : "No results found for the selected time"
                          : !isConnected
                          ? "Connecting to live data feed..."
                          : liveData === null
                          ? "Waiting for market data..."
                          : "No stocks match the criteria"}
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
          </Card>

          {displayData && displayData.length > 0 && (
            <div className="mt-2 text-sm text-muted-foreground">
              Showing {displayData.length} results
              {mode === "live" && " (live updates)"}
              {mode === "historical" &&
                historicalTimestamp &&
                ` at ${historicalTimestamp.toLocaleString()}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
