"use client";

import { format, parseISO, subDays } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

export function ScreenerBacktestTab() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() =>
    subDays(new Date(), 1)
  );
  const [result, setResult] = useState<ScreenerBacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const handleRun = useCallback(async () => {
    if (!selectedDate) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await backtestService.runScreenerBacktest({
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      setResult(response);
      setLastRunAt(new Date());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run screener backtest"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (selectedDate) {
      void handleRun();
    }
  }, [selectedDate, handleRun]);

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

  const isRunDisabled = !selectedDate || loading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Screener Backtesting</CardTitle>
          <CardDescription>
            Select a historical date to evaluate each screener hourly and view
            how many symbols matched throughout the session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
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
          <div className="flex items-center gap-3">
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
            {lastRunAt ? (
              <span className="text-sm text-muted-foreground">
                Last run {format(lastRunAt, "PPpp")}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to run screener backtest</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !result ? (
        <Card>
          <CardContent className="flex h-48 items-center justify-center">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Running screener analysis…</span>
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
              <div className="grid gap-4 sm:grid-cols-3">
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

