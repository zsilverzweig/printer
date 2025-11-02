"use client";

import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle,
  Database,
  HardDrive,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import * as React from "react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/lib/components/ui/alert";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Progress } from "@/lib/components/ui/progress";

import { useMarketDataLoader } from "../hooks/use-market-data-loader";
import { MarketDataCoverage } from "./market-data-coverage";

interface ValidationProgress {
  target_symbols: number;
  symbols_with_data: number;
  symbols_ready_for_screening: number;
  total_validations: number;
  coverage_percentage: number;
  screening_ready_percentage: number;
  date_range: {
    min_date: string | null;
    max_date: string | null;
    unique_days: number;
  };
  recent_activity: {
    last_hour_validations: number;
  };
}

export function TickerDatabaseManagement() {
  const { dbStats, loading, error, refreshStats } = useMarketDataLoader();

  const [validationProgress, setValidationProgress] =
    useState<ValidationProgress | null>(null);

  // Fetch validation progress
  const fetchValidationProgress = async () => {
    try {
      const response = await fetch(
        "http://localhost:8000/api/market/validation/progress"
      );
      if (response.ok) {
        const data = await response.json();
        setValidationProgress(data);
      }
    } catch (err) {
      console.error("Failed to fetch validation progress:", err);
    }
  };

  // Refresh validation progress every 10 seconds
  React.useEffect(() => {
    fetchValidationProgress();
    const interval = setInterval(fetchValidationProgress, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Validation Progress Card */}
      {validationProgress && (
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-primary" />
                  Data Loading Progress
                </CardTitle>
                <CardDescription>
                  Validation-based progress tracking (
                  {validationProgress.date_range.unique_days} days covered)
                </CardDescription>
              </div>
              <Button
                onClick={fetchValidationProgress}
                variant="ghost"
                size="sm"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Main Progress Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Coverage</span>
                    <Badge variant="default" className="text-lg">
                      {validationProgress.coverage_percentage}%
                    </Badge>
                  </div>
                  <Progress
                    value={validationProgress.coverage_percentage}
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground">
                    {validationProgress.symbols_with_data.toLocaleString()} /{" "}
                    {validationProgress.target_symbols.toLocaleString()} symbols
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Screening Ready</span>
                    <Badge variant="default" className="text-lg">
                      {validationProgress.screening_ready_percentage}%
                    </Badge>
                  </div>
                  <Progress
                    value={validationProgress.screening_ready_percentage}
                    className="h-3"
                  />
                  <p className="text-xs text-muted-foreground">
                    {validationProgress.symbols_ready_for_screening.toLocaleString()}{" "}
                    symbols with 14+ days
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Total Validations
                    </span>
                    <span className="text-2xl font-bold">
                      {validationProgress.total_validations.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Date records confirmed with Polygon
                  </p>
                  {validationProgress.recent_activity.last_hour_validations >
                    0 && (
                    <Badge variant="secondary" className="mt-2">
                      +
                      {validationProgress.recent_activity.last_hour_validations.toLocaleString()}{" "}
                      in last hour
                    </Badge>
                  )}
                </div>
              </div>

              {/* Date Range */}
              {validationProgress.date_range.min_date &&
                validationProgress.date_range.max_date && (
                  <div className="pt-4 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          Earliest Date:
                        </span>
                        <div className="font-semibold mt-1">
                          {new Date(
                            validationProgress.date_range.min_date
                          ).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Latest Date:
                        </span>
                        <div className="font-semibold mt-1">
                          {new Date(
                            validationProgress.date_range.max_date
                          ).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Days of Coverage:
                        </span>
                        <div className="font-semibold mt-1">
                          {validationProgress.date_range.unique_days} days
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database Stats Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Statistics
              </CardTitle>
              <CardDescription>
                Current state of TimescaleDB market data
              </CardDescription>
            </div>
            <Button
              onClick={refreshStats}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dbStats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Bars</span>
                </div>
                <p className="text-3xl font-bold">
                  {formatNumber(dbStats.total_bars)}
                </p>
                <p className="text-xs text-muted-foreground">
                  1-minute candlesticks
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-sm font-medium">Symbols</span>
                </div>
                <p className="text-3xl font-bold">
                  {formatNumber(dbStats.symbol_count)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Unique tickers loaded
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HardDrive className="h-4 w-4" />
                  <span className="text-sm font-medium">Total Storage</span>
                </div>
                <p className="text-3xl font-bold">{dbStats.total_size}</p>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Table: {dbStats.table_size}</div>
                  {dbStats.index_size && (
                    <div>Indexes: {dbStats.index_size}</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Database className="h-4 w-4" />
                  <span className="text-sm font-medium">Avg per Symbol</span>
                </div>
                <p className="text-3xl font-bold">
                  {dbStats.symbol_count > 0
                    ? `${Math.round(
                        (dbStats.total_bytes_raw || 0) /
                          dbStats.symbol_count /
                          1024
                      )} KB`
                    : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Per ticker</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Date Range Start</span>
                </div>
                <p className="text-lg font-semibold">
                  {formatDate(dbStats.min_date)}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Date Range End</span>
                </div>
                <p className="text-lg font-semibold">
                  {formatDate(dbStats.max_date)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Coverage Analysis */}
      {dbStats &&
        dbStats.symbol_details &&
        dbStats.symbol_details.length > 0 && (
          <MarketDataCoverage stats={dbStats} />
        )}

      {/* Info Card */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="font-medium mb-2">About TimescaleDB Market Data</div>
          <ul className="text-sm space-y-1 ml-4">
            <li>
              • 1-minute candlestick data with extended hours (4am-8pm ET)
            </li>
            <li>• Automatic compression after 7 days (10x space savings)</li>
            <li>
              • Continuous aggregates for 5m, 15m, 1h, and daily timeframes
            </li>
            <li>• All data retained indefinitely for backtesting</li>
            <li>• ~190 MB per day for 10,000 tickers (compressed)</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
