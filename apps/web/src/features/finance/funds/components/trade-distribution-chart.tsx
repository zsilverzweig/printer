/**
 * TradeDistributionChart Component
 *
 * Displays a histogram showing the distribution of trade returns, colored by fund.
 */

"use client";

import { useMemo } from "react";

import type { FundTrade } from "@printer/shared";
import { formatCurrency } from "../utils/ledger-calculations";

interface TradeDistributionChartProps {
  trades: FundTrade[];
  height?: number;
}

interface TradeReturn {
  fundId: string;
  fundName: string;
  pnl: number;
}

interface Bin {
  start: number;
  end: number;
  trades: TradeReturn[];
}

// Fund colors - consistent palette
const FUND_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function TradeDistributionChart({
  trades,
  height = 300,
}: TradeDistributionChartProps) {
  const { bins, stats, fundColorMap } = useMemo(() => {
    // Extract trade returns from closed trades with realized P&L
    const closedTrades = trades.filter(
      (trade) =>
        trade.status === "closed" &&
        trade.realizedPnl !== null &&
        trade.realizedPnl !== undefined
    );

    const tradeReturns: TradeReturn[] = closedTrades.map((trade) => ({
      fundId: trade.fundId,
      fundName: "", // Will be populated from fund map if needed
      pnl: trade.realizedPnl ?? 0,
    }));

    // Create fund color map from unique fund IDs
    const uniqueFundIds = Array.from(
      new Set(closedTrades.map((t) => t.fundId))
    ).sort();
    const colorMap = new Map<string, string>();
    uniqueFundIds.forEach((fundId, index) => {
      colorMap.set(fundId, FUND_COLORS[index % FUND_COLORS.length]);
    });

    if (tradeReturns.length === 0) {
      return {
        bins: [],
        stats: { min: 0, max: 0, range: 0 },
        fundColorMap: colorMap,
        uniqueFundIds,
      };
    }

    // Calculate statistics
    const pnls = tradeReturns.map((t) => t.pnl);
    const minPnl = Math.min(...pnls);
    const maxPnl = Math.max(...pnls);
    const range = maxPnl - minPnl;

    // Create bins (20 bins for good granularity)
    const numBins = 20;
    const binWidth = range / numBins;
    const bins: Bin[] = [];

    for (let i = 0; i < numBins; i++) {
      const start = minPnl + i * binWidth;
      const end = start + binWidth;
      bins.push({
        start,
        end,
        trades: [],
      });
    }

    // Assign trades to bins
    tradeReturns.forEach((trade) => {
      const binIndex = Math.min(
        Math.floor((trade.pnl - minPnl) / binWidth),
        numBins - 1
      );
      bins[binIndex].trades.push(trade);
    });

    return {
      bins,
      stats: { min: minPnl, max: maxPnl, range },
      fundColorMap: colorMap,
      uniqueFundIds,
    };
  }, [trades]);

  if (bins.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No trade data available for distribution chart
      </div>
    );
  }

  const maxCount = Math.max(...bins.map((b) => b.trades.length));
  const padding = { top: 20, right: 40, bottom: 70, left: 60 };
  const chartWidth = 800;
  const chartHeight = height;
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const barWidth = plotWidth / bins.length;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={chartWidth} height={chartHeight} className="mx-auto">
        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + plotHeight}
          stroke="currentColor"
          strokeWidth="1"
          className="text-muted-foreground"
        />

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={padding.left + plotWidth}
          y2={padding.top + plotHeight}
          stroke="currentColor"
          strokeWidth="1"
          className="text-muted-foreground"
        />

        {/* Zero line (if crosses zero) */}
        {stats.min < 0 && stats.max > 0 && (
          <line
            x1={padding.left + ((0 - stats.min) / stats.range) * plotWidth}
            y1={padding.top}
            x2={padding.left + ((0 - stats.min) / stats.range) * plotWidth}
            y2={padding.top + plotHeight}
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 4"
            className="text-foreground"
            opacity="0.3"
          />
        )}

        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((percent) => {
          const y = padding.top + plotHeight - percent * plotHeight;
          const count = Math.round(maxCount * percent);
          return (
            <g key={percent}>
              <line
                x1={padding.left - 5}
                y1={y}
                x2={padding.left}
                y2={y}
                stroke="currentColor"
                className="text-muted-foreground"
              />
              <text
                x={padding.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-xs fill-current text-muted-foreground"
              >
                {count}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((percent) => {
          const value = stats.min + percent * stats.range;
          const x = padding.left + percent * plotWidth;
          return (
            <g key={percent}>
              <line
                x1={x}
                y1={padding.top + plotHeight}
                x2={x}
                y2={padding.top + plotHeight + 5}
                stroke="currentColor"
                className="text-muted-foreground"
              />
              <text
                x={x}
                y={padding.top + plotHeight + 20}
                textAnchor="middle"
                className="text-xs fill-current text-muted-foreground"
              >
                {formatCurrency(value)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bins.map((bin, index) => {
          // Group trades by fund in this bin
          const tradesByFund = new Map<string, TradeReturn[]>();
          bin.trades.forEach((trade) => {
            const existing = tradesByFund.get(trade.fundId) || [];
            existing.push(trade);
            tradesByFund.set(trade.fundId, existing);
          });

          const x = padding.left + index * barWidth;
          let cumulativeHeight = 0;

          return (
            <g key={index}>
              {Array.from(tradesByFund.entries()).map(
                ([fundId, trades], fundIndex) => {
                  const segmentCount = trades.length;
                  const segmentHeight = (segmentCount / maxCount) * plotHeight;
                  const y =
                    padding.top + plotHeight - cumulativeHeight - segmentHeight;
                  cumulativeHeight += segmentHeight;

                  const color = fundColorMap.get(fundId) || "#888";

                  return (
                    <rect
                      key={fundIndex}
                      x={x + 1}
                      y={y}
                      width={barWidth - 2}
                      height={segmentHeight}
                      fill={color}
                      opacity={0.8}
                      className="hover:opacity-100 transition-opacity"
                    >
                      <title>
                        Fund {fundId}: {segmentCount} trade
                        {segmentCount !== 1 ? "s" : ""} (
                        {formatCurrency(bin.start)} to {formatCurrency(bin.end)}
                        )
                      </title>
                    </rect>
                  );
                }
              )}
            </g>
          );
        })}

        {/* Axis labels */}
        <text
          x={padding.left + plotWidth / 2}
          y={chartHeight - 15}
          textAnchor="middle"
          className="text-sm fill-current text-foreground font-medium"
        >
          Trade P&L
        </text>
        <text
          x={padding.left - 45}
          y={padding.top + plotHeight / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${padding.left - 45} ${
            padding.top + plotHeight / 2
          })`}
          className="text-sm fill-current text-foreground font-medium"
        >
          Number of Trades
        </text>
      </svg>

      {/* Legend */}
      {uniqueFundIds.length > 0 && (
        <div className="flex flex-wrap gap-4 justify-center mt-4">
          {uniqueFundIds.map((fundId) => (
            <div key={fundId} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  backgroundColor: fundColorMap.get(fundId) || "#888",
                }}
              />
              <span className="text-sm text-muted-foreground">
                Fund {fundId.substring(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
