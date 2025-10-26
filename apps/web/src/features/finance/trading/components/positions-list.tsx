"use client";

import { X } from "lucide-react";

import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { AlpacaPosition } from "@/lib/types/alpaca";

interface PositionsListProps {
  positions: AlpacaPosition[];
  loading: boolean;
  accountCurrency: string;
  onClosePosition?: (symbol: string, qty: number) => void;
  isClosingPosition?: boolean;
}

export function PositionsList({
  positions,
  loading,
  accountCurrency,
  onClosePosition,
  isClosingPosition = false,
}: PositionsListProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatNumber = (value: number, decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
          <CardDescription>
            Your current holdings and their performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
          <CardDescription>
            Your current holdings and their performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              No open positions found.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open Positions</CardTitle>
        <CardDescription>
          Current holdings across long and short positions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-sm font-medium text-muted-foreground">
                  Symbol
                </th>
                <th className="text-left py-2 text-sm font-medium text-muted-foreground">
                  Side
                </th>
                <th className="text-left py-2 text-sm font-medium text-muted-foreground">
                  Quantity
                </th>
                <th className="text-right py-2 text-sm font-medium text-muted-foreground">
                  Market Value
                </th>
                <th className="text-right py-2 text-sm font-medium text-muted-foreground">
                  Unrealized P/L
                </th>
                <th className="text-right py-2 text-sm font-medium text-muted-foreground">
                  P/L %
                </th>
                {onClosePosition && (
                  <th className="text-center py-2 text-sm font-medium text-muted-foreground">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const unrealizedPL = Number(position.unrealized_pl) || 0;
                const unrealizedPLPercent =
                  Number(position.unrealized_plpc) || 0;
                const marketValue = Number(position.market_value) || 0;
                const qty = Number(position.qty) || 0;
                const side = qty > 0 ? "Long" : "Short";

                return (
                  <tr key={position.symbol} className="border-b">
                    <td className="py-3 font-medium">{position.symbol}</td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {side}
                    </td>
                    <td className="py-3 text-sm text-muted-foreground">
                      {formatNumber(qty, 4)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(marketValue, accountCurrency)}
                    </td>
                    <td
                      className={`py-3 text-right font-medium ${
                        unrealizedPL >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {unrealizedPL >= 0 ? "+" : ""}
                      {formatCurrency(unrealizedPL, accountCurrency)}
                    </td>
                    <td
                      className={`py-3 text-right font-medium ${
                        unrealizedPLPercent >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {unrealizedPLPercent >= 0 ? "+" : ""}
                      {formatNumber(unrealizedPLPercent * 100, 2)}%
                    </td>
                    {onClosePosition && (
                      <td className="py-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onClosePosition?.(position.symbol, Math.abs(qty))
                          }
                          disabled={isClosingPosition}
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
