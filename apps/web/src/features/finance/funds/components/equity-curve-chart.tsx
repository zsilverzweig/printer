/**
 * Equity Curve Chart Component
 *
 * Professional equity curve visualization using TradingView's lightweight-charts.
 * Shows account value over time with drawdown periods and trade markers.
 */

"use client";

import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineData,
  Time,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";

import { analyticsService, EquityPoint } from "../services/analytics-service";

interface EquityCurveChartProps {
  fundId: string;
  height?: number;
  showDrawdowns?: boolean;
}

export function EquityCurveChart({
  fundId,
  height = 400,
  showDrawdowns = true,
}: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const equitySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const drawdownSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [finalPnl, setFinalPnl] = useState<number>(0);

  // Load equity curve data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await analyticsService.getEquityCurve(fundId);
        setEquityData(result.equity_curve);
        setFinalPnl(result.final_pnl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load equity curve data"
        );
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [fundId]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current || loading) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          labelBackgroundColor: "#374151",
        },
        horzLine: {
          labelBackgroundColor: "#374151",
        },
      },
    });

    // Add equity line series
    const equitySeries = chart.addLineSeries({
      color: "#10b981",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    // Add drawdown series if enabled
    let drawdownSeries: ISeriesApi<"Line"> | null = null;
    if (showDrawdowns) {
      drawdownSeries = chart.addLineSeries({
        color: "#ef4444",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: "drawdown",
      });

      chart.priceScale("drawdown").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    chartRef.current = chart;
    equitySeriesRef.current = equitySeries;
    drawdownSeriesRef.current = drawdownSeries;

    return () => {
      if (drawdownSeriesRef.current)
        chart.removeSeries(drawdownSeriesRef.current);
      if (equitySeriesRef.current) chart.removeSeries(equitySeriesRef.current);
      chart.remove();
      chartRef.current = null;
      equitySeriesRef.current = null;
      drawdownSeriesRef.current = null;
    };
  }, [height, showDrawdowns, loading]);

  // Update chart data
  useEffect(() => {
    if (!equitySeriesRef.current || equityData.length === 0) return;

    // Convert equity data to chart format
    const equityLineData: LineData<Time>[] = equityData.map((point) => ({
      time: (new Date(point.timestamp).getTime() / 1000) as Time,
      value: point.cumulative_pnl,
    }));

    equitySeriesRef.current.setData(equityLineData);

    // Add drawdown data if enabled
    if (drawdownSeriesRef.current && showDrawdowns) {
      const drawdownLineData: LineData<Time>[] = equityData.map((point) => ({
        time: (new Date(point.timestamp).getTime() / 1000) as Time,
        value: -point.drawdown, // Negative to show below zero
      }));

      drawdownSeriesRef.current.setData(drawdownLineData);
    }

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [equityData, showDrawdowns]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
        </CardHeader>
        <CardContent
          className="flex items-center justify-center"
          style={{ height }}
        >
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">
              Loading equity curve...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
        </CardHeader>
        <CardContent className="p-8">
          <div className="text-red-600 text-center">
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (equityData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>Account value over time</CardDescription>
        </CardHeader>
        <CardContent
          className="flex items-center justify-center"
          style={{ height }}
        >
          <p className="text-muted-foreground text-sm">
            No trade data available. Execute trades to see equity curve.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Equity Curve</CardTitle>
            <CardDescription>Cumulative P&L over time</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total P&L</div>
            <div
              className={`text-lg font-bold ${
                finalPnl >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(finalPnl)}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} style={{ width: "100%", height }} />
        {showDrawdowns && (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-green-500" />
              <span>Cumulative P&L</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-red-500" />
              <span>Drawdown</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
