import type { AggregateBar } from "@/lib/types/market";

export interface LinePoint {
  time: number; // seconds since epoch for lightweight-charts
  value: number;
}

function getClose(bar: any): number | undefined {
  return typeof bar.c === "number" ? bar.c : bar.close;
}

function getTimestamp(bar: any): number | undefined {
  const t = typeof bar.t === "number" ? bar.t : bar.timestamp;
  return typeof t === "number" ? Math.floor(t / 1000) : undefined;
}

export function computeEMA(bars: AggregateBar[], period: number): LinePoint[] {
  if (!Array.isArray(bars) || period <= 0) return [];
  const sorted = [...bars]
    .map((b) => ({ t: getTimestamp(b), c: getClose(b) }))
    .filter((b) => typeof b.t === "number" && typeof b.c === "number")
    .sort((a, b) => (a.t as number) - (b.t as number)) as {
    t: number;
    c: number;
  }[];

  if (sorted.length === 0) return [];

  const k = 2 / (period + 1);
  const out: LinePoint[] = [];
  let ema: number | undefined = undefined;
  for (let i = 0; i < sorted.length; i++) {
    const close = sorted[i].c;
    if (ema === undefined) {
      // seed EMA with SMA of first N closes once we have enough points
      if (i + 1 < period) continue;
      const start = i + 1 - period;
      let sum = 0;
      for (let j = start; j <= i; j++) sum += sorted[j].c;
      ema = sum / period;
    } else {
      ema = close * k + ema * (1 - k);
    }
    out.push({ time: sorted[i].t, value: ema });
  }
  return out;
}

export function computeVWAP(bars: AggregateBar[]): LinePoint[] {
  if (!Array.isArray(bars)) return [];
  const sorted = [...bars]
    .map((b: any) => ({
      t: getTimestamp(b),
      // prefer provided vwap, else typical price
      vwap: typeof b.vwap === "number" ? b.vwap : undefined,
      h: typeof b.h === "number" ? b.h : b.high,
      l: typeof b.l === "number" ? b.l : b.low,
      c: getClose(b),
      v: typeof b.v === "number" ? b.v : b.volume,
    }))
    .filter((x) => typeof x.t === "number" && typeof x.c === "number")
    .sort((a, b) => (a.t as number) - (b.t as number)) as {
    t: number;
    vwap?: number;
    h?: number;
    l?: number;
    c: number;
    v?: number;
  }[];

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  const out: LinePoint[] = [];
  for (const bar of sorted) {
    let price = bar.vwap;
    if (typeof price !== "number") {
      // typical price (H+L+C)/3
      const h = typeof bar.h === "number" ? bar.h : bar.c;
      const l = typeof bar.l === "number" ? bar.l : bar.c;
      price = (h + l + bar.c) / 3;
    }
    const volume = typeof bar.v === "number" ? bar.v : 0;
    cumulativePV += price * volume;
    cumulativeVolume += volume;
    const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : price;
    out.push({ time: bar.t, value: vwap });
  }
  return out;
}

export function computeMACD(
  bars: AggregateBar[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: LinePoint[]; signal: LinePoint[]; histogram: LinePoint[] } {
  if (
    !Array.isArray(bars) ||
    fastPeriod <= 0 ||
    slowPeriod <= 0 ||
    signalPeriod <= 0
  )
    return { macd: [], signal: [], histogram: [] };

  // Ensure fast < slow; swap if needed to keep logic consistent
  let fast = fastPeriod;
  let slow = slowPeriod;
  if (fast > slow) {
    const tmp = fast;
    fast = slow;
    slow = tmp;
  }

  const sorted = [...bars]
    .map((b) => ({ t: getTimestamp(b), c: getClose(b) }))
    .filter((b) => typeof b.t === "number" && typeof b.c === "number")
    .sort((a, b) => (a.t as number) - (b.t as number)) as {
    t: number;
    c: number;
  }[];

  if (sorted.length === 0) return { macd: [], signal: [], histogram: [] };

  const fastK = 2 / (fast + 1);
  const slowK = 2 / (slow + 1);

  const emaFast: Array<number | undefined> = new Array(sorted.length).fill(
    undefined
  );
  const emaSlow: Array<number | undefined> = new Array(sorted.length).fill(
    undefined
  );

  let fastEma: number | undefined = undefined;
  let slowEma: number | undefined = undefined;

  for (let i = 0; i < sorted.length; i++) {
    const close = sorted[i].c;
    if (fastEma === undefined) {
      if (i + 1 >= fast) {
        let sum = 0;
        for (let j = i + 1 - fast; j <= i; j++) sum += sorted[j].c;
        fastEma = sum / fast;
        emaFast[i] = fastEma;
      }
    } else {
      fastEma = close * fastK + fastEma * (1 - fastK);
      emaFast[i] = fastEma;
    }

    if (slowEma === undefined) {
      if (i + 1 >= slow) {
        let sum = 0;
        for (let j = i + 1 - slow; j <= i; j++) sum += sorted[j].c;
        slowEma = sum / slow;
        emaSlow[i] = slowEma;
      }
    } else {
      slowEma = close * slowK + slowEma * (1 - slowK);
      emaSlow[i] = slowEma;
    }
  }

  // Compute MACD line = EMA(fast) - EMA(slow)
  const macdRaw: Array<number | undefined> = new Array(sorted.length).fill(
    undefined
  );
  for (let i = 0; i < sorted.length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (typeof f === "number" && typeof s === "number") {
      macdRaw[i] = f - s;
    }
  }

  // Signal = EMA(signalPeriod) of MACD line (using only defined macd values)
  const signalRaw: Array<number | undefined> = new Array(sorted.length).fill(
    undefined
  );
  const signalK = 2 / (signalPeriod + 1);

  let seedCount = 0;
  let signalEma: number | undefined = undefined;
  let macdSeedSum = 0;
  for (let i = 0; i < sorted.length; i++) {
    const m = macdRaw[i];
    if (typeof m !== "number") continue;
    if (signalEma === undefined) {
      macdSeedSum += m;
      seedCount += 1;
      if (seedCount >= signalPeriod) {
        signalEma = macdSeedSum / signalPeriod;
        signalRaw[i] = signalEma;
      }
    } else {
      signalEma = m * signalK + signalEma * (1 - signalK);
      signalRaw[i] = signalEma;
    }
  }

  // Histogram = MACD - Signal
  const histogramRaw: Array<number | undefined> = new Array(sorted.length).fill(
    undefined
  );
  for (let i = 0; i < sorted.length; i++) {
    const m = macdRaw[i];
    const s = signalRaw[i];
    if (typeof m === "number" && typeof s === "number") {
      histogramRaw[i] = m - s;
    }
  }

  const macd: LinePoint[] = [];
  const signal: LinePoint[] = [];
  const histogram: LinePoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (typeof macdRaw[i] === "number")
      macd.push({ time: sorted[i].t, value: macdRaw[i] as number });
    if (typeof signalRaw[i] === "number")
      signal.push({ time: sorted[i].t, value: signalRaw[i] as number });
    if (typeof histogramRaw[i] === "number")
      histogram.push({ time: sorted[i].t, value: histogramRaw[i] as number });
  }

  return { macd, signal, histogram };
}
