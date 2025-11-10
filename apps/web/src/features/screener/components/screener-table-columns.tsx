"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import Link from "next/link";

import { Button } from "@/lib/components/ui/button";

import type { StockData } from "../types";
import { formatMultiple, formatNumber } from "../utils/formatters";

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
      accessorKey: "today_vol",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Today Vol
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">{formatNumber(row.original.today_vol)}</div>
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
      accessorKey: "rv_lw",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          RV LW
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">{formatMultiple(row.original.rv_lw)}</div>
      ),
    },
    {
      accessorKey: "market_cap",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Market Cap
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.market_cap != null
            ? formatNumber(row.original.market_cap)
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "public_float",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Public Float
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {row.original.public_float != null
            ? formatNumber(row.original.public_float)
            : "—"}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <div>{row.original.type ?? "—"}</div>,
    },
    {
      accessorKey: "primary_exchange",
      header: "Primary Exchange",
      cell: ({ row }) => <div>{row.original.primary_exchange ?? "—"}</div>,
    },
    {
      accessorKey: "sic_description",
      header: "SIC Description",
      cell: ({ row }) => <div>{row.original.sic_description ?? "—"}</div>,
    },
  ];
}
