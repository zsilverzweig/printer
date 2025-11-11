"use client";

import { format, parseISO, subDays } from "date-fns";
import { Check, CircleDot, Loader2, RefreshCw, Timer } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useFunds } from "@/features/finance/funds/hooks/use-funds";
import { backtestService } from "../services/backtest-service";
import type {
  ScreenerBacktestResponse,
  ScreenerBacktestSeries,
} from "../types";

import { Alert, AlertDescription, AlertTitle } from "@/lib/components/ui/alert";
import { Badge } from "@/lib/components/ui/badge";
import { Button } from "@/lib/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { DatePicker } from "@/lib/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/lib/components/ui/select";
import { SimpleLineChart } from "@/lib/components/ui/simple-line-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/lib/components/ui/table";

const SERIES_STROKES = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#22c55e",
];

const ALL_FUNDS_OPTION = "all";

const LOADING_STEPS = [
  {
    label: "Queuing screener jobs",
    description: "Submitting selected screener criteria to the backtesting engine",
  },
  {
    label: "Collecting historical matches",
    description: "Loading symbol hits for each screener across the trading session",
  },
  {
    label: "Aggregating hourly buckets",
    description: "Summing matches and aligning timelines for comparison",
  },
  {
    label: "Preparing charts & summaries",
    description: "Building tables, charts, and ticker highlights for review",
  },
];

interface ScreenerSeriesCardProps {
  series: ScreenerBacktestSeries;
  stroke: string;
}

function formatTimeLabel(timestamp: string) {
  try {
    return format(parseISO(timestamp), "HH:mm");
  } catch {
    return timestamp;
  }
}

function ScreenerSeriesCard({ series, stroke }: ScreenerSeriesCardProps) {
  const chartData = useMemo(
    () =>
      series.points.map((point) => ({
        x: new Date(point.timestampLocal ?? point.timestampUtc).getTime(),
        y: point.count,
      })),
    [series.points]
  );

  const uniqueTickers = useMemo(() => {
    const tickers = new Set<string>();
    series.points.forEach((point) => {
      point.tickers.slice(0, 20).forEach((ticker) => tickers.add(ticker));
    });
    return Array.from(tickers).slice(0, 12);
  }, [series.points]);

  return (
    <Card className="h-full">
      <CardHeader className="space-y-1">
        <CardTitle>{series.criteriaName}</CardTitle>
        <CardDescription>
          {series.description || "No description provided"}
        </CardDescription>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {series.totalHits}
            </span>{" "}
            total hits
          </span>
          <span>
            <span className="font-semibold text-foreground">
              {series.uniqueTickerCount}
            </span>{" "}
            unique tickers
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <SimpleLineChart
          data={chartData}
          height={220}
          stroke={stroke}
          className="text-primary"
        />

        <div>
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            Hourly breakdown
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Time</TableHead>
                <TableHead className="w-20">Count</TableHead>
                <TableHead>Sample tickers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {series.points.map((point) => (
                <TableRow key={point.timestampUtc}>
                  <TableCell className="font-mono text-xs">
                    {formatTimeLabel(point.timestampLocal ?? point.timestampUtc)}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {point.count}
                  </TableCell>
                  <TableCell>
                    {point.tickers.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {point.tickers.slice(0, 5).map((ticker) => (
                          <Badge
                            key={`${point.timestampUtc}-${ticker}`}
                            variant="secondary"
                            className="text-xs font-medium"
                          >
                            {ticker}
                          </Badge>
                        ))}
                        {point.tickers.length > 5 ? (
                          <span className="text-xs text-muted-foreground">
                            +{point.tickers.length - 5} more
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {uniqueTickers.length > 0 ? (
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              Frequent tickers
            </h4>
            <div className="flex flex-wrap gap-1">
              {uniqueTickers.map((ticker) => (
                <Badge key={ticker} variant="outline" className="text-xs">
                  {ticker}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatDuration(totalSeconds: number) {
  if (totalSeconds <= 0) {
    return "0s";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function ScreenerBacktestTab() {
  const { funds, loading: fundsLoading, error: fundsError } = useFunds();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    subDays(new Date(), 1)
  );
  const [selectedFundId, setSelectedFundId] = useState<string>(ALL_FUNDS_OPTION);
  const [result, setResult] = useState<ScreenerBacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [lastRunFundId, setLastRunFundId] = useState<string>(ALL_FUNDS_OPTION);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastRunDuration, setLastRunDuration] = useState<number | null>(null);

  const fundNameById = useMemo(() => {
    const map = new Map<string, string>();
    funds.forEach((fund) => {
      map.set(fund.id, fund.name);
    });
    return map;
  }, [funds]);

  const selectedFundLabel = useMemo(() => {
    if (selectedFundId === ALL_FUNDS_OPTION) {
      return "All funds";
    }
    if (fundNameById.size === 0 && fundsLoading) {
      return "Loading funds…";
    }
    return fundNameById.get(selectedFundId) ?? "Unknown fund";
  }, [fundNameById, selectedFundId, fundsLoading]);

  const lastRunFundLabel = useMemo(() => {
    if (lastRunFundId === ALL_FUNDS_OPTION) {
      return "All funds";
    }
    return fundNameById.get(lastRunFundId) ?? "Unknown fund";
  }, [fundNameById, lastRunFundId]);

  const isSelectedFundValid =
    selectedFundId === ALL_FUNDS_OPTION || fundNameById.has(selectedFundId);

  useEffect(() => {
    if (
      selectedFundId !== ALL_FUNDS_OPTION &&
      !fundNameById.has(selectedFundId) &&
      !fundsLoading
    ) {
      setSelectedFundId(ALL_FUNDS_OPTION);
    }
  }, [fundNameById, fundsLoading, selectedFundId]);

  const handleRun = useCallback(async () => {
    if (!selectedDate || !isSelectedFundValid) {
      return;
    }

    const fundIds =
      selectedFundId === ALL_FUNDS_OPTION ? undefined : [selectedFundId];

    const runStartedAt = Date.now();
    setLoading(true);
    setError(null);
    setActiveStepIndex(0);
    setElapsedSeconds(0);
    try {
      const response = await backtestService.runScreenerBacktest({
        date: format(selectedDate, "yyyy-MM-dd"),
        fundIds,
      });
      setResult(response);
      setLastRunAt(new Date());
      setLastRunFundId(selectedFundId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run screener backtest"
      );
    } finally {
      setLastRunDuration(Math.floor((Date.now() - runStartedAt) / 1000));
      setLoading(false);
      setElapsedSeconds(0);
    }
  }, [isSelectedFundValid, selectedDate, selectedFundId]);

  useEffect(() => {
    if (selectedDate && isSelectedFundValid) {
      void handleRun();
    }
  }, [selectedDate, isSelectedFundValid, handleRun]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      return;
    }

    setActiveStepIndex(0);
    const stepInterval = window.setInterval(() => {
      setActiveStepIndex((current) =>
        current < LOADING_STEPS.length - 1 ? current + 1 : current
      );
    }, 4500);

    return () => {
      window.clearInterval(stepInterval);
    };
  }, [loading]);

  const aggregatedPoints = useMemo(() => {
    if (!result || result.series.length === 0) {
      return [];
    }

    const base = result.series[0].points.map((point) => ({
      timestampUtc: point.timestampUtc,
      timestampLocal: point.timestampLocal,
      count: 0,
    }));

    result.series.forEach((series) => {
      series.points.forEach((point, index) => {
        if (base[index]) {
          base[index].count += point.count;
        }
      });
    });

    return base;
  }, [result]);

  const aggregatedChartData = useMemo(
    () =>
      aggregatedPoints.map((point) => ({
        x: new Date(point.timestampLocal ?? point.timestampUtc).getTime(),
        y: point.count,
      })),
    [aggregatedPoints]
  );

  const totalHits = useMemo(
    () =>
      result?.series.reduce((sum, series) => sum + series.totalHits, 0) ?? 0,
    [result]
  );

  const totalDataPoints = aggregatedPoints.length;

  const isRunDisabled = !selectedDate || loading || !isSelectedFundValid;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Screener Backtesting</CardTitle>
          <CardDescription>
            Select a historical date to evaluate each screener hourly and view
            how many symbols matched throughout the session.
            <span className="mt-1 block text-muted-foreground">
              Scope: {selectedFundLabel}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex w-full flex-col gap-4 md:flex-row md:items-end md:gap-6">
            <div className="w-full md:w-auto">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Backtest date
              </label>
              <DatePicker
                date={selectedDate}
                onDateChange={setSelectedDate}
                placeholder="Select date"
              />
            </div>
            <div className="w-full md:w-64">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Fund scope
              </label>
              <Select
                value={selectedFundId}
                onValueChange={setSelectedFundId}
                disabled={fundsLoading && funds.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All funds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FUNDS_OPTION}>All funds</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedFundId === ALL_FUNDS_OPTION
                  ? "Runs every screener (default)."
                  : "Runs only screeners linked to this fund."}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={handleRun}
                disabled={isRunDisabled}
                variant="default"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Run analysis
              </Button>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Processing… {formatDuration(elapsedSeconds)}</span>
                </div>
              ) : null}
            </div>
            {lastRunAt ? (
              <span className="text-sm text-muted-foreground">
                Last run {format(lastRunAt, "PPpp")}
                {lastRunDuration !== null && lastRunDuration > 0
                  ? ` · completed in ${formatDuration(lastRunDuration)}`
                  : ""}
                {lastRunFundLabel ? ` · scope ${lastRunFundLabel}` : ""}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {fundsError ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load funds</AlertTitle>
          <AlertDescription>{fundsError}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to run screener backtest</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Running screener analysis</CardTitle>
            <CardDescription>
              We are issuing backtest jobs and preparing hourly aggregates for
              each screener. These runs typically take 30-90 seconds depending
              on the number of screeners and symbols returned.
              <span className="mt-1 block text-muted-foreground">
                Scope: {selectedFundLabel}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Timer className="h-4 w-4" />
              <span>Elapsed time · {formatDuration(elapsedSeconds)}</span>
            </div>
            <div className="space-y-3">
              {LOADING_STEPS.map((step, index) => {
                const isCompleted = index < activeStepIndex;
                const isActive = index === activeStepIndex;

                return (
                  <div
                    key={step.label}
                    className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                      isActive
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="mt-1">
                      {isCompleted ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <CircleDot className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">
                        {step.label}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {step.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result && result.series.length > 0 ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>
                Aggregated view across {result.criteriaCount} screener
                {result.criteriaCount === 1 ? "" : "s"} between{" "}
                {formatTimeLabel(result.startUtc)} and{" "}
                {formatTimeLabel(result.endUtc)} UTC.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-sm text-muted-foreground">
                    Screener criteria evaluated
                  </div>
                  <div className="text-2xl font-semibold">
                    {result.criteriaCount}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Total matches across screeners
                  </div>
                  <div className="text-2xl font-semibold">{totalHits}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Interval (minutes) · Data points
                  </div>
                  <div className="text-2xl font-semibold">
                    {result.intervalMinutes}m · {totalDataPoints}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Fund scope
                  </div>
                  <div className="text-2xl font-semibold">
                    {selectedFundLabel}
                  </div>
                </div>
              </div>

              {aggregatedChartData.length > 0 ? (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    Total matches by hour
                  </h4>
                  <SimpleLineChart
                    data={aggregatedChartData}
                    height={220}
                    stroke="#0ea5e9"
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {result.series.map((series, index) => (
              <ScreenerSeriesCard
                key={series.criteriaId}
                series={series}
                stroke={SERIES_STROKES[index % SERIES_STROKES.length]}
              />
            ))}
          </div>
        </>
      ) : null}

      {result && result.series.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No screening criteria were found. Create screening criteria to run
            screener backtests.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

