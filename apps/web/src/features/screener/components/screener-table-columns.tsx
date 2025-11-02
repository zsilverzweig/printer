"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { Button } from "@/lib/components/ui/button";

import type { StockData } from "../types";
import {
  formatMultiple,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

export function createScreenerColumns(): ColumnDef<StockData>[] {
  return [
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
  ];
}
