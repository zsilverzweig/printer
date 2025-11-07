import type { AggregateBar } from "@/lib/types/market";

export interface LinePoint {
  time: number; // seconds since epoch for lightweight-charts
  value: number;
}

function getTimestamp(bar: any): number | undefined {
  const t = typeof bar.t === "number" ? bar.t : bar.timestamp;
  return typeof t === "number" ? Math.floor(t / 1000) : undefined;
}

function getMetric(bar: any, key: string): number | undefined {
  if (!bar) return undefined;
  if (typeof bar[key] === "number") return bar[key];
  const metrics = bar.metrics;
  if (metrics && typeof metrics[key] === "number") return metrics[key];
  return undefined;
}

function toLineSeries(
  bars: AggregateBar[],
  selector: (bar: AggregateBar) => number | undefined
): LinePoint[] {
  if (!Array.isArray(bars)) return [];

  return bars
    .map((bar) => {
      const value = selector(bar);
      const timestamp = getTimestamp(bar);
      if (typeof value === "number" && typeof timestamp === "number") {
        return { time: timestamp, value };
      }
      return null;
    })
    .filter((point): point is LinePoint => point !== null)
    .sort((a, b) => a.time - b.time);
}

export function computeEMA(bars: AggregateBar[], period: number): LinePoint[] {
  if (!Number.isFinite(period) || period <= 0) return [];
  const key = `ema_${period}`;
  return toLineSeries(bars, (bar) => getMetric(bar, key));
}

export function computeVWAP(bars: AggregateBar[]): LinePoint[] {
  return toLineSeries(bars, (bar) => {
    const vwap = getMetric(bar, "vwap");
    if (typeof vwap === "number") return vwap;
    const high = typeof (bar as any).h === "number" ? (bar as any).h : (bar as any).high;
    const low = typeof (bar as any).l === "number" ? (bar as any).l : (bar as any).low;
    const close = typeof (bar as any).c === "number" ? (bar as any).c : (bar as any).close;
    if (
      typeof high === "number" &&
      typeof low === "number" &&
      typeof close === "number"
    ) {
      return (high + low + close) / 3;
    }
    return undefined;
  });
}

export function computeMACD(
  bars: AggregateBar[]
): { macd: LinePoint[]; signal: LinePoint[]; histogram: LinePoint[] } {
  const macd = toLineSeries(bars, (bar) => getMetric(bar, "macd_line"));
  const signal = toLineSeries(bars, (bar) => getMetric(bar, "macd_signal"));
  const histogram = toLineSeries(bars, (bar) => getMetric(bar, "macd_histogram"));
  return { macd, signal, histogram };
}
