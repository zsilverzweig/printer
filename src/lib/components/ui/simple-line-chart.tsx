"use client";

import { cn } from "@/lib/utils/utils";
import * as React from "react";

export interface SimpleLineChartPoint {
  x: number; // epoch millis or any monotonic value
  y: number; // numeric value to plot
}

interface SimpleLineChartProps {
  data: SimpleLineChartPoint[];
  width?: number; // if omitted, fills container width responsively
  height?: number;
  stroke?: string; // defaults to currentColor (theme-aware)
  strokeWidth?: number;
  fill?: string;
  className?: string;
}

export function SimpleLineChart({
  data,
  width,
  height = 240,
  stroke = "currentColor",
  strokeWidth = 2,
  fill = "none",
  className,
}: SimpleLineChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = React.useState<number | undefined>(
    undefined
  );

  // Measure parent width when width not provided
  React.useLayoutEffect(() => {
    if (typeof window === "undefined" || width) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width);
        if (w && w !== measuredWidth) setMeasuredWidth(w);
      }
    });
    ro.observe(el);
    // Initial measure
    setMeasuredWidth(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, [width, measuredWidth]);

  const computedWidth = width ?? measuredWidth ?? 640;

  if (!data || data.length === 0) {
    return (
      <div
        ref={containerRef}
        className={cn("w-full", className)}
        style={{ height }}
      >
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          No data
        </div>
      </div>
    );
  }

  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = 8;
  const innerW = computedWidth - pad * 2;
  const innerH = height - pad * 2;

  const scaleX = (x: number) =>
    innerW === 0 || maxX === minX
      ? pad
      : pad + ((x - minX) / (maxX - minX)) * innerW;
  const scaleY = (y: number) =>
    innerH === 0 || maxY === minY
      ? pad + innerH / 2
      : pad + innerH - ((y - minY) / (maxY - minY)) * innerH;

  const pathD = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${scaleX(d.x)},${scaleY(d.y)}`)
    .join(" ");

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <svg
        width={computedWidth}
        height={height}
        role="img"
        aria-label="line chart"
        className="block"
      >
        <path
          d={pathD}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill={fill}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
