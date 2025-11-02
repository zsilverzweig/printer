"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import React from "react";

import { Card } from "@/lib/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

import type { StockData } from "../types";
import { createScreenerColumns } from "./screener-table-columns";

interface ScreenerTableProps {
  data: StockData[];
  mode: "live" | "historical";
  isConnected: boolean;
  historicalTimestamp?: Date;
  runningScreener: boolean;
  selectedScreener: boolean;
  isNewScreener: boolean;
}

export function ScreenerTable({
  data,
  mode,
  isConnected,
  historicalTimestamp,
  runningScreener,
  selectedScreener,
  isNewScreener,
}: ScreenerTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "rv14", desc: true },
  ]);

  const columns = React.useMemo(() => createScreenerColumns(), []);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const getEmptyStateMessage = () => {
    if (!selectedScreener && !isNewScreener) {
      if (mode === "historical") {
        if (!historicalTimestamp) {
          return "Adjust filters and select a historical date, then click Run";
        }
        if (runningScreener) {
          return "Loading historical data...";
        }
        return "No results found for the selected time";
      }
      if (!isConnected) {
        return "Connecting to live data feed...";
      }
      if (data.length === 0) {
        return "Adjust filters above and click Run to see filtered results";
      }
      return "Click Run to apply filters";
    }
    if (mode === "historical") {
      if (!historicalTimestamp) {
        return "Select a historical date and click Run";
      }
      if (runningScreener) {
        return "Loading historical data...";
      }
      return "No results found for the selected time";
    }
    if (!isConnected) {
      return "Connecting to live data feed...";
    }
    if (data === null || data.length === 0) {
      return "Waiting for market data or no stocks match the criteria";
    }
    return "No stocks match the criteria";
  };

  return (
    <>
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
                    {getEmptyStateMessage()}
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

      {data && data.length > 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          Showing {data.length} results
          {mode === "live" && " (live updates)"}
          {mode === "historical" &&
            historicalTimestamp &&
            ` at ${historicalTimestamp.toLocaleString()}`}
        </div>
      )}
    </>
  );
}
