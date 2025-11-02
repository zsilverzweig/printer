"use client";

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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/lib/components/ui/tabs";
import {
  BarChart3,
  CheckCircle,
  Clock,
  Database,
  RefreshCw,
  Square,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { TickerDatabaseManagement } from "@/features/admin/components/ticker-database-management";

interface AssetLoadingStatus {
  status: string;
  total_tickers: number | null;
  processed_tickers: number;
  failed_tickers: number;
  current_phase: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_remaining: string | null;
  progress_percentage: number;
}

interface AssetSummary {
  total_tickers: number;
  cs_stocks: number;
  exchanges: Record<string, number>;
  types: Record<string, number>;
  active_status: Record<string, number>;
  tradable_status: Record<string, number>;
  data_completeness: {
    with_market_cap: number;
    with_employees: number;
    with_sic_code: number;
    with_description: number;
    market_cap_percentage: number;
    employees_percentage: number;
    sic_code_percentage: number;
    description_percentage: number;
  };
  cs_data_quality: {
    total_cs_stocks: number;
    with_market_cap: number;
    with_employees: number;
    with_sic_code: number;
    with_description: number;
    with_public_float: number;
    with_short_percent: number;
    with_outstanding_shares: number;
    market_cap_percentage: number;
    employees_percentage: number;
    sic_code_percentage: number;
    description_percentage: number;
    float_percentage: number;
    short_percent_percentage: number;
    outstanding_percentage: number;
  };
}

export default function AdminAssetsPage() {
  const [loadingStatus, setLoadingStatus] = useState<AssetLoadingStatus | null>(
    null
  );
  const [assetSummary, setAssetSummary] = useState<AssetSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoadingStatus, setShowLoadingStatus] = useState(false);

  // Auto-refresh when task is running
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (loadingStatus?.status === "running") {
      setShowLoadingStatus(true); // Auto-show when running
      interval = setInterval(() => {
        fetchStatus();
      }, 5000); // Poll every 5 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadingStatus?.status]);

  // Initial load
  useEffect(() => {
    fetchStatus();
    fetchSummary();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/admin/assets/status");
      if (response.ok) {
        const data = await response.json();
        setLoadingStatus(data);
        setError(null);
      } else {
        throw new Error("Failed to fetch status");
      }
    } catch (err) {
      console.error("Error fetching status:", err);
      setError("Failed to fetch loading status");
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await fetch("/api/admin/assets/summary");
      if (response.ok) {
        const data = await response.json();
        setAssetSummary(data);
      }
    } catch (err) {
      console.error("Error fetching summary:", err);
    }
  };

  const startLoading = async (sample: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoint = sample
        ? "/api/admin/assets/load/sample"
        : "/api/admin/assets/load";
      const response = await fetch(endpoint, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setLoadingStatus({
          status: "running",
          total_tickers: sample ? 1 : null,
          processed_tickers: 0,
          failed_tickers: 0,
          current_phase: sample ? "Loading sample (AAPL)..." : "Starting...",
          error_message: null,
          started_at: new Date().toISOString(),
          completed_at: null,
          estimated_remaining: null,
          progress_percentage: 0,
        });
        // Start polling for updates
        setTimeout(fetchStatus, 1000);
      } else if (response.status === 409) {
        setError("Asset loading task is already running");
      } else {
        throw new Error("Failed to start loading");
      }
    } catch (err) {
      console.error("Error starting loading:", err);
      setError("Failed to start asset loading");
    } finally {
      setIsLoading(false);
    }
  };

  const cancelLoading = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/assets/cancel", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.cancelled) {
          setLoadingStatus((prev) =>
            prev ? { ...prev, status: "cancelled" } : null
          );
        } else {
          setError("No task was running to cancel");
        }
      } else {
        throw new Error("Failed to cancel loading");
      }
    } catch (err) {
      console.error("Error cancelling loading:", err);
      setError("Failed to cancel asset loading");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = () => {
    fetchStatus();
    fetchSummary();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Database className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      idle: "secondary",
      running: "default",
      completed: "default",
      failed: "destructive",
      cancelled: "destructive",
    } as const;

    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ticker Database Management</h1>
          <p className="text-muted-foreground">
            Load and manage ticker details & historical market data
          </p>
        </div>
      </div>

      <Tabs defaultValue="ticker-details" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="ticker-details"
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Ticker Details
          </TabsTrigger>
          <TabsTrigger value="market-data" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Market Data (TimescaleDB)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ticker-details" className="space-y-6 mt-6">
          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Toggle Button for Loading Status */}
          <div className="flex justify-end">
            <Button
              onClick={() => setShowLoadingStatus(!showLoadingStatus)}
              variant="outline"
              size="sm"
            >
              {showLoadingStatus ? "Hide" : "Show"} Loading Status
            </Button>
          </div>

          {/* Loading Status Card - Collapsible */}
          {showLoadingStatus && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(loadingStatus?.status || "idle")}
                      Loading Status
                      {loadingStatus?.status &&
                        getStatusBadge(loadingStatus.status)}
                    </CardTitle>
                    <CardDescription>
                      {loadingStatus?.current_phase || "No active loading task"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => startLoading(false)}
                      disabled={
                        isLoading || loadingStatus?.status === "running"
                      }
                      size="lg"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh Data
                    </Button>
                    {loadingStatus?.status === "running" && (
                      <Button
                        onClick={cancelLoading}
                        disabled={isLoading}
                        variant="destructive"
                        size="lg"
                        className="flex items-center gap-2"
                      >
                        <Square className="h-4 w-4" />
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingStatus?.status === "running" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress</span>
                      <span>
                        {loadingStatus.progress_percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress
                      value={loadingStatus.progress_percentage}
                      className="w-full"
                    />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          Processed:
                        </span>{" "}
                        {loadingStatus.processed_tickers.toLocaleString()}
                        {loadingStatus.total_tickers &&
                          ` / ${loadingStatus.total_tickers.toLocaleString()}`}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed:</span>{" "}
                        {loadingStatus.failed_tickers.toLocaleString()}
                      </div>
                      {loadingStatus.estimated_remaining && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">
                            Estimated remaining:
                          </span>{" "}
                          {loadingStatus.estimated_remaining}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {loadingStatus?.status === "completed" && (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      Asset loading completed successfully! Processed{" "}
                      {loadingStatus.processed_tickers.toLocaleString()}{" "}
                      tickers.
                      {loadingStatus.failed_tickers > 0 && (
                        <span className="block mt-1">
                          {loadingStatus.failed_tickers} tickers failed to load.
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>
                )}

                {loadingStatus?.status === "failed" &&
                  loadingStatus.error_message && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        {loadingStatus.error_message}
                      </AlertDescription>
                    </Alert>
                  )}
              </CardContent>
            </Card>
          )}

          {/* Asset Summary Card */}
          {assetSummary && (
            <Card>
              <CardHeader>
                <CardTitle>Database Summary</CardTitle>
                <CardDescription>
                  Current state of loaded ticker data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <h4 className="font-semibold mb-2">Total Tickers</h4>
                    <p className="text-2xl font-bold">
                      {assetSummary.total_tickers.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {assetSummary.cs_stocks.toLocaleString()} CS stocks
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Data Completeness</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Market Cap:</span>
                        <span>
                          {assetSummary.data_completeness.market_cap_percentage}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Employees:</span>
                        <span>
                          {assetSummary.data_completeness.employees_percentage}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>SIC Code:</span>
                        <span>
                          {assetSummary.data_completeness.sic_code_percentage}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Description:</span>
                        <span>
                          {
                            assetSummary.data_completeness
                              .description_percentage
                          }
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Top Exchanges</h4>
                    <div className="space-y-1 text-sm">
                      {Object.entries(assetSummary.exchanges)
                        .slice(0, 5)
                        .map(([exchange, count]) => (
                          <div key={exchange} className="flex justify-between">
                            <span>{exchange}:</span>
                            <span>{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Asset Types</h4>
                    <div className="space-y-1 text-sm">
                      {Object.entries(assetSummary.types)
                        .slice(0, 5)
                        .map(([type, count]) => (
                          <div key={type} className="flex justify-between">
                            <span>{type}:</span>
                            <span>{count.toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* CS Data Quality Section */}
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-semibold mb-4">
                    CS Stock Data Quality (
                    {assetSummary.cs_stocks.toLocaleString()} stocks)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Market Cap */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Market Cap</span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.market_cap_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={
                          assetSummary.cs_data_quality.market_cap_percentage
                        }
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_market_cap.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* Employees */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Employees</span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.employees_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={
                          assetSummary.cs_data_quality.employees_percentage
                        }
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_employees.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* SIC Code */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">SIC Code</span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.sic_code_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={assetSummary.cs_data_quality.sic_code_percentage}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_sic_code.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Description</span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.description_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={
                          assetSummary.cs_data_quality.description_percentage
                        }
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_description.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* Public Float */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          Public Float
                        </span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.float_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={assetSummary.cs_data_quality.float_percentage}
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_public_float.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* Short % */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          Short % of Float
                        </span>
                        <Badge variant="secondary">
                          {
                            assetSummary.cs_data_quality
                              .short_percent_percentage
                          }
                          %
                        </Badge>
                      </div>
                      <Progress
                        value={
                          assetSummary.cs_data_quality.short_percent_percentage
                        }
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_short_percent.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>

                    {/* Outstanding Shares */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          Outstanding Shares
                        </span>
                        <Badge variant="secondary">
                          {assetSummary.cs_data_quality.outstanding_percentage}%
                        </Badge>
                      </div>
                      <Progress
                        value={
                          assetSummary.cs_data_quality.outstanding_percentage
                        }
                        className="h-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        {assetSummary.cs_data_quality.with_outstanding_shares.toLocaleString()}{" "}
                        /{" "}
                        {assetSummary.cs_data_quality.total_cs_stocks.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="market-data" className="mt-6">
          <TickerDatabaseManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
