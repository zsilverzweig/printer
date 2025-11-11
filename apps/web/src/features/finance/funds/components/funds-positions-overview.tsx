/**
 * FundsPositionsOverview Component
 *
 * Displays grouped positions across funds to highlight cross-fund exposure.
 */

"use client";

import { RefreshCw } from "lucide-react";
import { useMemo } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/lib/components/ui/table";
import { Button } from "@/lib/components/ui/button";
import { Badge } from "@/lib/components/ui/badge";

import { useFundPositionsOverview } from "../hooks/use-fund-positions-overview";

interface FundsPositionsOverviewProps {
  isActive: boolean;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return currencyFormatter.format(value);
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return numberFormatter.format(value);
}

export function FundsPositionsOverview({
  isActive,
}: FundsPositionsOverviewProps) {
  const { positions, loading, error, refresh } =
    useFundPositionsOverview(isActive);

  const totalSymbols = positions.length;
  const totalFundsWithPositions = useMemo(() => {
    const fundIds = new Set<string>();
    positions.forEach((group) => {
      group.funds.forEach((fund) => fundIds.add(fund.fundId));
    });
    return fundIds.size;
  }, [positions]);

  const totalNetUnrealized = useMemo(() => {
    return positions.reduce((sum, group) => {
      const value = group.totalUnrealizedPl ?? 0;
      return sum + value;
    }, 0);
  }, [positions]);

  if (loading && !positions.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
          <CardDescription>
            Loading cross-fund positions and exposure…
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-12 text-center text-muted-foreground">
            Fetching positions overview…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800">Active Positions</CardTitle>
          <CardDescription className="text-red-700">
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!positions.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Positions</CardTitle>
          <CardDescription>
            No open positions found across funds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refresh} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Active Positions</CardTitle>
          <CardDescription>
            Grouped by symbol across {totalFundsWithPositions} fund
            {totalFundsWithPositions === 1 ? "" : "s"} ({totalSymbols} symbol
            {totalSymbols === 1 ? "" : "s"}). Use this to spot overlapping
            exposure before reconciliation issues occur.
          </CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="text-sm text-muted-foreground">
            Net unrealized P/L:{" "}
            <span
              className={
                totalNetUnrealized >= 0 ? "text-green-600" : "text-red-600"
              }
            >
              {formatCurrency(totalNetUnrealized)}
            </span>
          </div>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/4">Symbol</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Cost Basis</TableHead>
                <TableHead className="text-right">Open P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((group) => (
                <TableSection key={group.symbol} group={group} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface TableSectionProps {
  group: ReturnType<typeof useFundPositionsOverview>["positions"][number];
}

function TableSection({ group }: TableSectionProps) {
  const latestPriceLabel =
    group.latestPrice !== null
      ? `${formatCurrency(group.latestPrice)}`
      : "Price unavailable";

  const summaryQuantity = formatNumber(group.totalQuantity);
  const summaryUnrealized = formatCurrency(group.totalUnrealizedPl);

  return (
    <>
      <TableRow className="bg-muted/50">
        <TableCell colSpan={5} className="text-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-base">{group.symbol}</span>
              <Badge variant="outline">{latestPriceLabel}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                Total quantity:{" "}
                <span className="font-medium text-foreground">
                  {summaryQuantity}
                </span>
              </span>
              <span>
                Net P/L:{" "}
                <span
                  className={
                    (group.totalUnrealizedPl ?? 0) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }
                >
                  {summaryUnrealized}
                </span>
              </span>
            </div>
          </div>
        </TableCell>
      </TableRow>
      {group.funds.map((fund) => (
        <TableRow key={`${group.symbol}-${fund.fundId}`}>
          <TableCell className="text-muted-foreground">↳</TableCell>
          <TableCell className="space-y-1">
            <div className="font-medium">{fund.fundName}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{fund.fundMode.toUpperCase()}</Badge>
              <span>Status: {fund.fundStatus}</span>
              {fund.ticker && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Ticker:</span>
                  <span>{fund.ticker}</span>
                </span>
              )}
              {fund.updatedAt && (
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Updated:</span>
                  <span>{new Date(fund.updatedAt).toLocaleString()}</span>
                </span>
              )}
            </div>
          </TableCell>
          <TableCell className="text-right">
            {formatNumber(fund.quantity)}
          </TableCell>
          <TableCell className="text-right">
            {formatCurrency(fund.costBasis)}
          </TableCell>
          <TableCell
            className={`text-right ${
              (fund.unrealizedPl ?? 0) >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(fund.unrealizedPl)}
            {fund.unrealizedPlPercent !== null && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({formatNumber(fund.unrealizedPlPercent)}%)
              </span>
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}


