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
          Current Price
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.price)}</div>
      ),
    },
    {
      accessorKey: "prev_close",
      header: "Prev Close",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.prev_close)}</div>
      ),
    },
    {
      accessorKey: "prev_high",
      header: "Prev High",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.prev_high)}</div>
      ),
    },
    {
      accessorKey: "prev_low",
      header: "Prev Low",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.prev_low)}</div>
      ),
    },
    {
      accessorKey: "prev_open",
      header: "Prev Open",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.prev_open)}</div>
      ),
    },
    {
      accessorKey: "prev_volume",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Prev Volume
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.prev_volume)}
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
          {formatMultiple(row.original.rv14)}
        </div>
      ),
    },
    {
      accessorKey: "rv30",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          RV30
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {formatMultiple(row.original.rv30)}
        </div>
      ),
    },
    {
      accessorKey: "volume_ma_20",
      header: "Vol MA 20",
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.volume_ma_20)}
        </div>
      ),
    },
    {
      accessorKey: "rsi_14",
      header: "RSI 14",
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.rsi_14)}
        </div>
      ),
    },
    {
      accessorKey: "sma_50",
      header: "SMA 50",
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.sma_50)}
        </div>
      ),
    },
    {
      accessorKey: "sma_200",
      header: "SMA 200",
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.sma_200)}
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
  ];
}
