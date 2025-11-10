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
      accessorKey: "last_trade_price",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Last Trade
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const lastTrade = row.original.last_trade_price ?? row.original.price;
        return <div className="text-right">${formatNumber(lastTrade)}</div>;
      },
    },
    {
      accessorKey: "prev_close",
      header: "Prev Close",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.prev_close)}</div>
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
          Change %
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const change =
          row.original.change_close_pct ?? row.original.change_close ?? 0;
        const changeClass = change > 0 ? "text-green-600" : "text-red-600";
        return (
          <div className={`text-right ${change === 0 ? "" : changeClass}`}>
            {formatPercent(change)}
          </div>
        );
      },
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
        <div className="text-right">{formatMultiple(row.original.rv14)}</div>
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
          RV Last Week
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
        <div className="text-right">{formatNumber(row.original.market_cap)}</div>
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
        <div className="text-right">{formatNumber(row.original.public_float)}</div>
      ),
    },
    {
      accessorKey: "type",
      header: "Type",
      cell: ({ row }) => <div className="text-center">{row.original.type ?? "-"}</div>,
    },
    {
      accessorKey: "primary_exchange",
      header: "Primary Exchange",
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.primary_exchange ?? "-"}
        </div>
      ),
    },
    {
      accessorKey: "sic_description",
      header: "Industry",
      cell: ({ row }) => (
        <div className="max-w-[200px] truncate" title={row.original.sic_description ?? ""}>
          {row.original.sic_description ?? "-"}
        </div>
      ),
    },
  ];
}
