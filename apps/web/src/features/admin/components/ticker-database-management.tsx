"use client";

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Database,
  Download,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/lib/components/ui/button";
import { Card } from "@/lib/components/ui/card";
import { Input } from "@/lib/components/ui/input";
import { log } from "@/lib/utils/logger";

import { useMarketDataLoader } from "../hooks/use-market-data-loader";

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

  const getStatusIcon = () => {
    if (!loadStatus) return null;

    switch (loadStatus.status) {
      case "running":
        return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "cancelled":
        return <XCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    if (!loadStatus) return "bg-gray-200";

    switch (loadStatus.status) {
      case "running":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "cancelled":
        return "bg-gray-500";
      default:
        return "bg-gray-200";
    }
  };

  const isLoading = loadStatus?.status === "running";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Market Data Management
          </h1>
          <p className="text-gray-600 mt-1">
            Load and manage historical market data in TimescaleDB
          </p>
        </div>
        <Button onClick={refreshStats} variant="outline" disabled={loading}>
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh Stats
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Database Stats Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Database Statistics
          </h2>
        </div>

        {dbStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Bars</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(dbStats.total_bars)}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Symbols</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(dbStats.symbol_count)}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Total Storage</p>
              <p className="text-2xl font-bold text-gray-900">
                {dbStats.total_size}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Table Size</p>
              <p className="text-2xl font-bold text-gray-900">
                {dbStats.table_size}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Date Range Start</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(dbStats.min_date)}
              </p>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-1">Date Range End</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatDate(dbStats.max_date)}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Loading database statistics...</p>
          </div>
        )}
      </Card>

      {/* Load Historical Data Card */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Download className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Load Historical Data
          </h2>
        </div>

        <div className="space-y-6">
          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Days of Data
              </label>
              <Input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                disabled={isLoading}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of days to load (1-30)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Symbol Selection
              </label>
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Symbols (comma-separated)
              </label>
              <Input
                type="text"
                value={customSymbols}
                onChange={(e) => setCustomSymbols(e.target.value)}
                placeholder="AAPL, TSLA, MSFT, GOOGL"
                disabled={isLoading}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter ticker symbols separated by commas
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={handleStartLoad}
              disabled={isLoading || loading}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              {isLoading ? "Loading..." : "Start Load"}
            </Button>

            {isLoading && (
              <Button
                onClick={handleCancelLoad}
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>

          {/* Load Status */}
          {loadStatus && (
            <div className="border-t pt-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      Load Status: {loadStatus.status.toUpperCase()}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Task ID: {loadStatus.status_id}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.round(loadStatus.progress_pct)}%
                  </p>
                  <p className="text-xs text-gray-500">Complete</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${getStatusColor()}`}
                  style={{ width: `${loadStatus.progress_pct}%` }}
                />
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Processed</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatNumber(loadStatus.tickers_processed)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Succeeded</p>
                  <p className="text-lg font-semibold text-green-600">
                    {formatNumber(loadStatus.tickers_succeeded)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Failed</p>
                  <p className="text-lg font-semibold text-red-600">
                    {formatNumber(loadStatus.tickers_failed)}
                  </p>
                </div>
              </div>

              {/* Timestamps */}
              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Started:</span>
                  <span className="text-gray-900 font-medium">
                    {formatDate(loadStatus.started_at)}
                  </span>
                </div>
                {loadStatus.completed_at && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Completed:</span>
                    <span className="text-gray-900 font-medium">
                      {formatDate(loadStatus.completed_at)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Last Updated:</span>
                  <span className="text-gray-900 font-medium">
                    {formatDate(loadStatus.last_updated)}
                  </span>
                </div>
              </div>

              {/* Error Message */}
              {loadStatus.error_message && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">
                    {loadStatus.error_message}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              About TimescaleDB Market Data
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
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
          </div>
        </div>
      </Card>
    </div>
  );
}
