/**
 * FundCard Component
 *
 * Displays a fund with its key information.
 */

import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { useFundSummary } from "../hooks/use-fund-summary";
import { Fund } from "../types";

interface FundCardProps {
  fund: Fund;
}

export function FundCard({ fund }: FundCardProps) {
  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";

  // Fetch real fund summary data (AUM, performance)
  const summary = useFundSummary(fund.id);

  const isPositive = summary.dayChange >= 0;

  return (
    <Link href={`/funds/${fund.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-xl">{fund.name}</CardTitle>
              {fund.description && (
                <CardDescription className="mt-1">
                  {fund.description}
                </CardDescription>
              )}
            </div>
            <Badge className={`${modeColor} text-white`}>{modeLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* AUM (Assets Under Management) */}
            <div>
              <p className="text-sm text-muted-foreground">
                Assets Under Management
              </p>
              {summary.loading ? (
                <p className="text-2xl font-bold text-muted-foreground">
                  Loading...
                </p>
              ) : summary.error ? (
                <p className="text-2xl font-bold text-red-600">Error</p>
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    $
                    {summary.aum.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cash: $
                    {summary.cashBalance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    • Positions: $
                    {summary.positionValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </>
              )}
            </div>

            {/* Performance */}
            {!summary.loading && !summary.error && (
              <div className="flex items-center justify-between pt-4 border-t">
                <span className="text-sm text-muted-foreground">Today</span>
                <div
                  className={`flex items-center gap-1 ${
                    isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span className="font-medium">
                    ${Math.abs(summary.dayChange).toFixed(2)} (
                    {isPositive ? "+" : ""}
                    {summary.dayChangePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Created Date */}
            <div className="text-xs text-muted-foreground">
              Created {fund.createdAt.toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
