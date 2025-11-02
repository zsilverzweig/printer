"use client";

import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  TrendingUp,
  XCircle,
} from "lucide-react";
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
import { Input } from "@/lib/components/ui/input";
import { Progress } from "@/lib/components/ui/progress";
import { log } from "@/lib/utils/logger";

import { useMarketDataLoader } from "../hooks/use-market-data-loader";
import { MarketDataCoverage } from "./market-data-coverage";

export function TickerDatabaseManagement() {
  const {
    loadStatus,
    dbStats,
    loading,
    error,
    startLoad,
    cancelLoad,
    refreshStats,
  } = useMarketDataLoader();

  const [days, setDays] = useState(1);
  const [customSymbols, setCustomSymbols] = useState("");
  const [useCustomSymbols, setUseCustomSymbols] = useState(false);

  const handleStartLoad = async () => {
    try {
      const symbols =
        useCustomSymbols && customSymbols
          ? customSymbols
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      await startLoad(days, symbols);
    } catch (err) {
      log.error("Failed to start load", err, "TickerDatabaseManagement");
    }
  };

  const handleCancelLoad = async () => {
    if (confirm("Are you sure you want to cancel the current load?")) {
      try {
        await cancelLoad();
      } catch (err) {
        log.error("Failed to cancel load", err, "TickerDatabaseManagement");
      }
    }
  };

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge className="bg-blue-500">Running</Badge>;
      case "completed":
        return <Badge className="bg-green-500">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return null;
    }
  };

  const getStatusIcon = () => {
    if (!loadStatus) return null;

    switch (loadStatus.status) {
      case "running":
        return <Clock className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "failed":
        return <AlertCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
    }
  };

  const isLoading = loadStatus?.status === "running";

  return (
    <div className="space-y-6">
      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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

      {/* Load Historical Data Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Load Historical Data
          </CardTitle>
          <CardDescription>
            Import candlestick data from Polygon.io
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Days of Data</label>
              <Input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Number of days to load (1-30)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Symbol Selection</label>
              <div className="flex gap-2">
                <Button
                  variant={!useCustomSymbols ? "default" : "outline"}
                  onClick={() => setUseCustomSymbols(false)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  All from Snapshot
                </Button>
                <Button
                  variant={useCustomSymbols ? "default" : "outline"}
                  onClick={() => setUseCustomSymbols(true)}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Custom List
                </Button>
              </div>
            </div>
          </div>

          {useCustomSymbols && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Custom Symbols (comma-separated)
              </label>
              <Input
                type="text"
                value={customSymbols}
                onChange={(e) => setCustomSymbols(e.target.value)}
                placeholder="AAPL, TSLA, MSFT, GOOGL"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Enter ticker symbols separated by commas
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleStartLoad}
              disabled={isLoading || loading}
              size="lg"
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              {isLoading
                ? "Loading..."
                : loadStatus?.status === "completed" ||
                  loadStatus?.status === "failed" ||
                  loadStatus?.status === "cancelled"
                ? "Start New Load"
                : "Start Load"}
            </Button>

            {isLoading && (
              <Button
                onClick={handleCancelLoad}
                variant="destructive"
                size="lg"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>

          {/* Load Status */}
          {loadStatus && (
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <span className="font-medium">Load Status</span>
                  {getStatusBadge(loadStatus.status)}
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">
                    {Math.round(loadStatus.progress_pct)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Complete</div>
                </div>
              </div>

              {/* Progress Bar */}
              <Progress value={loadStatus.progress_pct} className="h-2" />

              {/* Statistics Grid */}
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Processed</div>
                  <div className="text-2xl font-bold">
                    {formatNumber(loadStatus.tickers_processed)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Succeeded</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatNumber(loadStatus.tickers_succeeded)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Failed</div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatNumber(loadStatus.tickers_failed)}
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-medium">
                    {formatDate(loadStatus.started_at)}
                  </span>
                </div>
                {loadStatus.completed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Completed</span>
                    <span className="font-medium">
                      {formatDate(loadStatus.completed_at)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span className="font-medium">
                    {formatDate(loadStatus.last_updated)}
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {loadStatus.error_message && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {loadStatus.error_message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
