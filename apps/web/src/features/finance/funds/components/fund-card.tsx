/**
 * FundCard Component
 *
 * Displays a fund with its key information using real-time WebSocket updates.
 */

import { TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { useFundRealtime } from "../hooks/use-fund-realtime";
import { Fund } from "../types";

import { Badge } from "@/lib/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

interface FundCardProps {
  fund: Fund;
}

export function FundCard({ fund }: FundCardProps) {
  const modeColor = fund.mode === "sim" ? "bg-blue-500" : "bg-green-500";
  const modeLabel = fund.mode === "sim" ? "SIM" : "REAL";

  // Connect to real-time WebSocket for fund data
  const { data, isConnecting, error } = useFundRealtime(fund.id);
  const performance = data.performance;

  // Calculate display values
  const loading = isConnecting || !performance;
  const hasError = !!error;
  const aum = performance?.aum ?? 0;
  const cashBalance = performance?.cashBalance ?? 0;
  const positionValue = performance?.positionValue ?? 0;
  const dayChange = performance?.dayChange ?? 0;
  const dayChangePercent = performance?.dayChangePercent ?? 0;
  const isPositive = dayChange >= 0;
  const tradingWindow =
    fund.tradingStartTime && fund.tradingEndTime
      ? `${fund.tradingStartTime} – ${fund.tradingEndTime}${
          fund.timezone ? ` ${fund.timezone}` : ""
        }`
      : "Not configured";
  const lifecycleSummary = fund.tickerLifecycleSummary ?? {};
  const lifecycleStateOrder = [
    "screened",
    "setup",
    "ordered",
    "filled",
    "exited",
    "removed",
  ];
  const lifecycleItems = lifecycleStateOrder
    .map((state) => ({
      state,
      count: lifecycleSummary[state] ?? 0,
    }))
    .filter((item) => item.count > 0);
  const totalTracked = Object.values(lifecycleSummary).reduce(
    (acc, count) => acc + (typeof count === "number" ? count : 0),
    0
  );

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
              {loading ? (
                <p className="text-2xl font-bold text-muted-foreground">
                  Loading...
                </p>
              ) : hasError ? (
                <p className="text-2xl font-bold text-red-600">Error</p>
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    $
                    {aum.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cash: $
                    {cashBalance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    • Positions: $
                    {positionValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </>
              )}
            </div>

            {/* Performance */}
            {!loading && !hasError && (
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
                    ${Math.abs(dayChange).toFixed(2)} ({isPositive ? "+" : ""}
                    {dayChangePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Trading hours */}
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">Trading Hours</p>
              <p className="text-sm font-medium mt-1">{tradingWindow}</p>
            </div>

            {/* Lifecycle summary */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Lifecycle Tracking
                </p>
                <span className="text-xs text-muted-foreground">
                  {totalTracked} tracked
                </span>
              </div>
              {lifecycleItems.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2">
                  No tickers currently tracked.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {lifecycleItems.map(({ state, count }) => (
                    <Badge
                      key={state}
                      variant="outline"
                      className="text-xs capitalize"
                    >
                      {state}
                      <span className="ml-1 text-muted-foreground">
                        {count}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Created Date */}
            <div className="text-xs text-muted-foreground">
              Created {new Date(fund.createdAt).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
