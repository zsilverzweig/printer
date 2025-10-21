"use client";

import type {
  CandlestickData,
  HistogramData,
  LineData,
  Time,
} from "lightweight-charts";
import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  SeriesOptionsMap,
} from "lightweight-charts";
import * as React from "react";

import type { AggregateBar } from "@/lib/types/market";
import { computeEMA, computeMACD, computeVWAP } from "@/lib/utils/indicators";
import { cn } from "@/lib/utils/utils";

interface CandlestickChartProps {
  data: AggregateBar[];
  height?: number | string; // number in px or CSS string (e.g., '60vh')
  className?: string;
  showEMA12?: boolean;
  showEMA26?: boolean;
  showVWAP?: boolean;
  showVolume?: boolean;
  showLegend?: boolean;
  showMACD?: boolean;
  // MACD histogram customization
  macdHistogramUpColor?: string; // base color before alpha (e.g., "#10b981")
  macdHistogramDownColor?: string; // base color before alpha (e.g., "#ef4444")
  macdHistogramAlpha?: number; // 0..1 transparency for histogram bars
}

type BarLike = AggregateBar & {
  timestamp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function resolveColor(name: string, fallback: string): string {
  const raw = getCssVar(name, fallback);
  // If already hex/rgb(a), return as-is
  if (raw.startsWith("#") || raw.startsWith("rgb")) return raw;

  // Parse HSL triplet: "H S% L%" optionally with "/ A" or "/ A%"
  const match = raw.match(
    /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*(\d+(?:\.\d+)?)(%?))?$/
  );
  if (!match) return fallback;

  const h = parseFloat(match[1]) % 360;
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  const a = match[4]
    ? match[5] === "%"
      ? Math.max(0, Math.min(1, parseFloat(match[4]) / 100))
      : Math.max(0, Math.min(1, parseFloat(match[4])))
    : 1;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (h >= 0 && h < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (h >= 60 && h < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (h >= 120 && h < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (h >= 180 && h < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function withAlpha(color: string, alpha: number): string {
  // Normalize common color formats to rgba with the provided alpha
  if (color.startsWith("rgba(")) {
    const parts = color
      .slice(5, -1)
      .split(",")
      .map((p) => p.trim());
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("rgb(")) {
    const parts = color
      .slice(4, -1)
      .split(",")
      .map((p) => p.trim());
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length === 8) {
      // ignore provided alpha, use given alpha
      hex = hex.slice(0, 6);
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return color;
}

function mapToCandles(bars: AggregateBar[]) {
  // Support both shapes:
  // 1) { t, o, h, l, c }
  // 2) { timestamp, open, high, low, close }
  return bars
    .map((b: BarLike) => {
      const t = typeof b.t === "number" ? b.t : b.timestamp;
      const o = typeof b.o === "number" ? b.o : b.open;
      const h = typeof b.h === "number" ? b.h : b.high;
      const l = typeof b.l === "number" ? b.l : b.low;
      const c = typeof b.c === "number" ? b.c : b.close;
      return { t, o, h, l, c } as {
        t?: number;
        o?: number;
        h?: number;
        l?: number;
        c?: number;
      };
    })
    .filter(
      (b) =>
        typeof b.t === "number" &&
        typeof b.o === "number" &&
        typeof b.h === "number" &&
        typeof b.l === "number" &&
        typeof b.c === "number"
    )
    .sort((a, b) => (a.t as number) - (b.t as number))
    .map((b) => ({
      time: Math.floor((b.t as number) / 1000),
      open: b.o as number,
      high: b.h as number,
      low: b.l as number,
      close: b.c as number,
    }));
}

export function CandlestickChart({
  data,
  height = "60vh",
  className,
  showEMA12 = true,
  showEMA26 = true,
  showVWAP = true,
  showVolume = true,
  showLegend = true,
  showMACD = true,
  macdHistogramUpColor,
  macdHistogramDownColor,
  macdHistogramAlpha,
}: CandlestickChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema12Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const ema26Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);
  const macdLineRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);

  // Create chart
  React.useEffect(() => {
    if (!containerRef.current) return;

    const fg = resolveColor("--foreground", "#e5e7eb");
    const grid = resolveColor("--muted", "#1f2937");
    const border = resolveColor("--border", "#374151");
    const up = resolveColor("--green-500", "#10b981");
    const down = resolveColor("--red-500", "#ef4444");

    const initialHeight =
      containerRef.current.clientHeight ||
      (typeof height === "number" ? height : 320);
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: initialHeight,
      layout: {
        background: { color: "transparent" },
        textColor: fg,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 8, barSpacing: 8 },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
    } as SeriesOptionsMap["Candlestick"]);

    chartRef.current = chart;
    seriesRef.current = series;

    // overlay lines
    ema12Ref.current = chart.addLineSeries({
      color: withAlpha(resolveColor("--blue-400", "#60a5fa"), 0.75),
      lineWidth: 2,
    });
    ema26Ref.current = chart.addLineSeries({
      color: withAlpha(resolveColor("--blue-600", "#2563eb"), 0.75),
      lineWidth: 2,
    });
    vwapRef.current = chart.addLineSeries({
      color: resolveColor("--amber-400", "#f59e0b"),

      lineWidth: 2,
    });

    // Adjust main price scale to reserve space for indicator panes
    const priceBottomMargin =
      showMACD && showVolume ? 0.5 : showMACD || showVolume ? 0.25 : 0;
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0, bottom: priceBottomMargin },
    });

    // Indicator panes: allow both MACD and Volume simultaneously using separate price scales
    if (showMACD) {
      const macdColor = withAlpha(resolveColor("--cyan-400", "#22d3ee"), 0.4);
      const signalColor = withAlpha(resolveColor("--rose-400", "#fb7185"), 0.4);
      macdLineRef.current = chart.addLineSeries({
        priceScaleId: "macd",
        color: macdColor,
        lineWidth: 2,
      });
      macdSignalRef.current = chart.addLineSeries({
        priceScaleId: "macd",
        color: signalColor,
        lineWidth: 2,
      });
      macdHistRef.current = chart.addHistogramSeries({
        priceScaleId: "macd",
      });
      const macdMargins = showVolume
        ? { top: 0.5, bottom: 0.25 }
        : { top: 0.75, bottom: 0 };
      chart.priceScale("macd").applyOptions({ scaleMargins: macdMargins });
    }
    if (showVolume) {
      volumeRef.current = chart.addHistogramSeries({
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        color: resolveColor("--muted-foreground", "#6b7280"),
      });
      chart.priceScale("volume").applyOptions({
        // Reserve bottom quarter for Volume
        scaleMargins: { top: 0.75, bottom: 0 },
      });
    }

    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      chart.applyOptions({ height: el.clientHeight });
      chart.timeScale().fitContent();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (ema12Ref.current) chart.removeSeries(ema12Ref.current);
      if (ema26Ref.current) chart.removeSeries(ema26Ref.current);
      if (vwapRef.current) chart.removeSeries(vwapRef.current);
      if (macdLineRef.current) chart.removeSeries(macdLineRef.current);
      if (macdSignalRef.current) chart.removeSeries(macdSignalRef.current);
      if (macdHistRef.current) chart.removeSeries(macdHistRef.current);
      if (volumeRef.current) chart.removeSeries(volumeRef.current);
      chart.removeSeries(series);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ema12Ref.current = null;
      ema26Ref.current = null;
      vwapRef.current = null;
      volumeRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
      macdHistRef.current = null;
    };
  }, [height, showMACD, showVolume]);

  // Update data
  React.useEffect(() => {
    if (!seriesRef.current) return;
    const candles = mapToCandles(data);
    seriesRef.current.setData(candles as unknown as CandlestickData<Time>[]);
    // Adjust viewport to fit data
    chartRef.current?.timeScale().fitContent();

    // overlays
    if (ema12Ref.current) {
      const ema12 = computeEMA(data, 12);
      ema12Ref.current.setData(ema12 as unknown as LineData<Time>[]);
    }
    if (ema26Ref.current) {
      const ema26 = computeEMA(data, 26);
      ema26Ref.current.setData(ema26 as unknown as LineData<Time>[]);
    }
    if (vwapRef.current) {
      const vwap = computeVWAP(data);
      vwapRef.current.setData(vwap as unknown as LineData<Time>[]);
    }

    // indicator pane data
    if (
      showMACD &&
      macdLineRef.current &&
      macdSignalRef.current &&
      macdHistRef.current
    ) {
      const { macd, signal, histogram } = computeMACD(data, 12, 26, 9);
      macdLineRef.current.setData(macd as unknown as LineData<Time>[]);
      macdSignalRef.current.setData(signal as unknown as LineData<Time>[]);

      const upBase =
        macdHistogramUpColor || resolveColor("--green-500", "#10b981");
      const downBase =
        macdHistogramDownColor || resolveColor("--red-500", "#ef4444");
      const alpha =
        typeof macdHistogramAlpha === "number" ? macdHistogramAlpha : 0.5;
      const upColor = withAlpha(upBase, alpha);
      const downColor = withAlpha(downBase, alpha);
      const histPoints = histogram.map((p) => ({
        time: p.time,
        value: p.value,
        color: p.value >= 0 ? upColor : downColor,
      }));
      macdHistRef.current.setData(
        histPoints as unknown as HistogramData<Time>[]
      );
    }
    if (showVolume && volumeRef.current) {
      const upBase = resolveColor("--green-500", "#10b981");
      const downBase = resolveColor("--red-500", "#ef4444");
      const upColor = withAlpha(upBase, 0.5);
      const downColor = withAlpha(downBase, 0.5);

      const volPoints = (data || [])
        .map((b: BarLike) => {
          const t = typeof b.t === "number" ? b.t : b.timestamp;
          const o = typeof b.o === "number" ? b.o : b.open;
          const c = typeof b.c === "number" ? b.c : b.close;
          const v = typeof b.v === "number" ? b.v : b.volume;
          if (
            typeof t !== "number" ||
            typeof o !== "number" ||
            typeof c !== "number" ||
            typeof v !== "number"
          )
            return undefined;
          return {
            time: Math.floor(t / 1000),
            value: v,
            color: c >= o ? upColor : downColor,
          };
        })
        .filter(Boolean) as { time: number; value: number; color: string }[];
      volumeRef.current.setData(volPoints as unknown as HistogramData<Time>[]);
    }
  }, [
    data,
    showEMA12,
    showEMA26,
    showVWAP,
    showVolume,
    showMACD,
    macdHistogramUpColor,
    macdHistogramDownColor,
    macdHistogramAlpha,
  ]);

  const styleHeight = typeof height === "number" ? `${height}px` : height;
  const ema12Color = withAlpha(resolveColor("--blue-400", "#60a5fa"), 0.75);
  const ema26Color = withAlpha(resolveColor("--blue-600", "#2563eb"), 0.75);
  const vwapColor = resolveColor("--amber-400", "#f59e0b");
  const volumeColor = resolveColor("--muted-foreground", "#6b7280");
  const macdColor = resolveColor("--cyan-400", "#22d3ee");
  const signalColor = resolveColor("--rose-400", "#fb7185");
  return (
    <div
      className={cn("relative w-full", className)}
      style={{ height: styleHeight }}
    >
      {showLegend && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {showEMA12 && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: ema12Color }}
                />
                EMA 12
              </span>
            )}
            {showEMA26 && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: ema26Color }}
                />
                EMA 26
              </span>
            )}
            {showVWAP && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: vwapColor }}
                />
                VWAP
              </span>
            )}
            {showVolume && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: volumeColor }}
                />
                Volume
              </span>
            )}
            {showMACD && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: macdColor }}
                />
                MACD 12,26,9
              </span>
            )}
            {showMACD && (
              <span className="inline-flex items-center">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: signalColor }}
                />
                Signal 9
              </span>
            )}
          </div>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
