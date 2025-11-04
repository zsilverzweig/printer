"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import React, { useMemo, useState } from "react";

import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { ConfirmationDialog } from "@/lib/components/ui/confirmation-dialog";
import { Input } from "@/lib/components/ui/input";
import { Modal } from "@/lib/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";
import { log } from "@/lib/utils/logger";

import { Portfolio, PortfolioPosition, UpdatePortfolioRequest } from "../types";

interface PortfolioDetailsDialogProps {
  portfolio: Portfolio | null;
  onClose: () => void;
  onUpdatePortfolio: (
    portfolioId: string,
    updates: UpdatePortfolioRequest
  ) => Promise<void>;
  onDeletePortfolio: (portfolioId: string) => void;
}

export function PortfolioDetailsDialog({
  portfolio,
  onClose,
  onUpdatePortfolio,
  onDeletePortfolio,
}: PortfolioDetailsDialogProps) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<UpdatePortfolioRequest>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "symbol", desc: false },
  ]);

  React.useEffect(() => {
    if (portfolio) {
      setFormData({
        name: portfolio.name,
        description: portfolio.description,
        thesis: portfolio.thesis,
      });
    }
  }, [portfolio]);

  const handleSave = async () => {
    if (!portfolio) return;

    try {
      await onUpdatePortfolio(portfolio.id, formData);
      setEditing(false);
    } catch (error) {
      log.error("Failed to update portfolio", error, "PortfolioDetailsDialog");
    }
  };

  const handleDeleteClick = () => {
    if (!portfolio) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!portfolio) return;

    setIsDeleting(true);
    try {
      await onDeletePortfolio(portfolio.id);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      log.error("Failed to delete portfolio", error, "PortfolioDetailsDialog");
      // Error handling is done by the parent component
    } finally {
      setIsDeleting(false);
    }
  };

  if (!portfolio) return null;

  const portfolioMetadata = (portfolio.metadata || {}) as {
    portfolioSummary?: string;
    riskManagement?: string;
  };

  const positionsColumns = useMemo<ColumnDef<PortfolioPosition>[]>(
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
          <div className="font-semibold text-foreground">
            {row.original.symbol}
          </div>
        ),
      },
      {
        accessorKey: "name",
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Name
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
        cell: ({ row }) => <div>{row.original.name}</div>,
      },
      {
        accessorKey: "side",
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
        cell: ({ row }) => (
          <div className="capitalize">{row.original.side || "N/A"}</div>
        ),
      },
      {
        id: "weight",
        accessorFn: (row) => row.weight || 0,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Weight
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
          <div>
            {row.original.weight
              ? (row.original.weight * 100).toFixed(1) + "%"
              : "N/A"}
          </div>
        ),
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
        cell: ({ row }) => (
          <div className="capitalize">
            {row.original.status?.replace("_", " ") || "N/A"}
          </div>
        ),
      },
      {
        id: "priceTarget",
        accessorFn: (row) => row.priceTarget || 0,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
              className="-ml-4 h-8"
            >
              Price Target
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
          <div>
            {row.original.priceTarget > 0
              ? `$${row.original.priceTarget.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : "—"}
          </div>
        ),
      },
      {
        accessorKey: "catalyst",
        header: "Catalyst",
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.original.catalyst || "—"}
          </div>
        ),
      },
      {
        accessorKey: "rationale",
        header: "Rationale",
        cell: ({ row }) => (
          <div className="text-muted-foreground">{row.original.rationale}</div>
        ),
      },
    ],
    []
  );

  const positionsTable = useReactTable({
    data: portfolio.positions,
    columns: positionsColumns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <Modal
        open={Boolean(portfolio)}
        onOpenChange={(open) => {
          console.log("PortfolioDetailsDialog onOpenChange called with:", open);
          if (!open) {
            console.log("PortfolioDetailsDialog calling onClose");
            onClose();
          }
        }}
        title="Portfolio Details"
        size="2xl"
        className="max-w-6xl"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                console.log("PortfolioDetailsDialog Close button clicked");
                onClose();
              }}
            >
              Close
            </Button>
            <Button variant="destructive" onClick={handleDeleteClick}>
              Delete Portfolio
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Portfolio Information</CardTitle>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(!editing)}
                  >
                    {editing ? "Cancel" : "Edit"}
                  </Button>
                  {editing && (
                    <Button size="sm" onClick={handleSave}>
                      Save
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name</label>
                  {editing ? (
                    <Input
                      value={formData.name || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  ) : (
                    <p className="text-foreground">{portfolio.name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Status
                  </label>
                  <Badge variant={portfolio.isActive ? "default" : "secondary"}>
                    {portfolio.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                {editing ? (
                  <Input
                    value={formData.description || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                  />
                ) : (
                  <p className="text-foreground">{portfolio.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Created
                  </label>
                  <p className="text-foreground">
                    {new Date(portfolio.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Last Updated
                  </label>
                  <p className="text-foreground">
                    {new Date(portfolio.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Investment Thesis */}
          <Card>
            <CardHeader>
              <CardTitle>Investment Thesis</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <textarea
                  value={formData.thesis || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, thesis: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  rows={6}
                />
              ) : (
                <div className="bg-muted p-4 rounded-md">
                  <p className="whitespace-pre-wrap text-foreground">
                    {portfolio.thesis}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio Positions */}
          <Card>
            <CardHeader>
              <CardTitle>Portfolio Positions</CardTitle>
              <CardDescription>
                AI-generated trade recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {portfolio.positions.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No positions have been generated yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {portfolioMetadata.portfolioSummary && (
                    <div className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
                      <p className="font-medium text-foreground">
                        Portfolio Summary
                      </p>
                      <p className="text-muted-foreground">
                        {portfolioMetadata.portfolioSummary}
                      </p>
                    </div>
                  )}
                  {portfolioMetadata.riskManagement && (
                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p className="font-medium">Risk Guidance</p>
                      <p>{portfolioMetadata.riskManagement}</p>
                    </div>
                  )}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        {positionsTable.getHeaderGroups().map((headerGroup) => (
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
                        {positionsTable.getRowModel().rows.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={positionsColumns.length}
                              className="text-center text-muted-foreground py-8"
                            >
                              No positions found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          positionsTable.getRowModel().rows.map((row) => (
                            <TableRow
                              key={row.id}
                              className="align-top hover:bg-muted/50"
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Portfolio"
        description={`Are you sure you want to delete "${portfolio.name}"? This will permanently remove the portfolio and all its data.`}
        variant="destructive"
        isLoading={isDeleting}
        loadingText="Deleting..."
        confirmText="Delete Portfolio"
        cancelText="Cancel"
        size="sm"
      />
    </>
  );
}
