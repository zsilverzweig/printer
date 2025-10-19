"use client";

import {
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  SeriesOptionsMap,
} from "lightweight-charts";
import * as React from "react";

import type { AggregateBar } from "@/lib/types/market";
import { computeEMA, computeVWAP } from "@/lib/utils/indicators";
import { cn } from "@/lib/utils/utils";

interface CandlestickChartProps {
  data: AggregateBar[];
  height?: number | string; // number in px or CSS string (e.g., '60vh')
  className?: string;
  showEMA12?: boolean;
  showEMA26?: boolean;
  showVWAP?: boolean;
  showVolume?: boolean;
}

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

function mapToCandles(bars: AggregateBar[]) {
  // Support both shapes:
  // 1) { t, o, h, l, c }
  // 2) { timestamp, open, high, low, close }
  return bars
    .map((b: any) => {
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
}: CandlestickChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema12Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const ema26Ref = React.useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const volumeRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);

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
      color: resolveColor("--blue-400", "#60a5fa"),
      lineWidth: 2,
    });
    ema26Ref.current = chart.addLineSeries({
      color: resolveColor("--amber-400", "#f59e0b"),
      lineWidth: 2,
    });
    vwapRef.current = chart.addLineSeries({
      color: resolveColor("--violet-400", "#a78bfa"),
      lineWidth: 2,
    });

    // Volume histogram (bottom pane via scaleMargins)
    volumeRef.current = chart.addHistogramSeries({
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      color: resolveColor("--muted-foreground", "#6b7280"),
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });

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
      if (volumeRef.current) chart.removeSeries(volumeRef.current);
      chart.removeSeries(series);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      ema12Ref.current = null;
      ema26Ref.current = null;
      vwapRef.current = null;
      volumeRef.current = null;
    };
  }, [height]);

  // Update data
  React.useEffect(() => {
    if (!seriesRef.current) return;
    const candles = mapToCandles(data);
    seriesRef.current.setData(candles);
    // Adjust viewport to fit data
    chartRef.current?.timeScale().fitContent();

    // overlays
    if (ema12Ref.current) {
      const ema12 = computeEMA(data, 12);
      showEMA12
        ? ema12Ref.current.setData(ema12)
        : ema12Ref.current.setData([]);
    }
    if (ema26Ref.current) {
      const ema26 = computeEMA(data, 26);
      showEMA26
        ? ema26Ref.current.setData(ema26)
        : ema26Ref.current.setData([]);
    }
    if (vwapRef.current) {
      const vwap = computeVWAP(data);
      showVWAP ? vwapRef.current.setData(vwap) : vwapRef.current.setData([]);
    }

    // volume
    if (volumeRef.current) {
      const upColor = resolveColor("--green-500", "#10b981");
      const downColor = resolveColor("--red-500", "#ef4444");
      const volPoints = (data || [])
        .map((b: any) => {
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
      showVolume
        ? volumeRef.current.setData(volPoints)
        : volumeRef.current.setData([]);
    }
  }, [data, showEMA12, showEMA26, showVWAP, showVolume]);

  const styleHeight = typeof height === "number" ? `${height}px` : height;
  return (
    <div
      ref={containerRef}
      className={cn("w-full", className)}
      style={{ height: styleHeight }}
    />
  );
}
