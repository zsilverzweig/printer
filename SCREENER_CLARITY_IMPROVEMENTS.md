# Screener Data Clarity and Architecture Improvements

## Problem Statement

The Screener tab has data clarity and UI issues:

1. **Opaque Calculations**: RV14 shows "2.3x" but users can't see the numerator/denominator
2. **Unclear Data Sources**: Not obvious that SMA/RSI/MACD use daily bars
3. **Ambiguous Timeframes**: No indication of what "14" in RV14/RSI14 means (14 days? 14 minutes?)
4. **UI Clutter**: Change (1m), Change (5m), Change (1h) columns aren't useful
5. **Missing Context**: Pre-market RV14=0 with no explanation

## Solution: Make All Data Transparent and Self-Documenting

### Core Principle

**Every metric should show WHAT it is, HOW it was calculated, and WHEN it was calculated.**

---

## Phase 1: Database Schema - Add Transparency Fields

### 1.1 Create Migration for Enhanced screener_metrics Table

**File**: `apps/server/alembic/versions/025_add_screener_metrics_transparency.py`

**Goal**: Add fields that make calculations transparent and self-documenting

**New Fields**:

```sql
-- For RV14/RV30/RV60: Show the calculation components
rv14_today_volume BIGINT,           -- Numerator: Today's volume
rv14_avg_volume BIGINT,             -- Denominator: 14-day average volume
rv30_avg_volume BIGINT,             -- Denominator for RV30
rv60_avg_volume BIGINT,             -- Denominator for RV60

-- For RSI: Show the calculation period
rsi_14_period VARCHAR(10) DEFAULT '14d',  -- e.g., '14d' for 14 daily bars

-- For SMA: Show what bars were used
sma_20_period VARCHAR(10) DEFAULT '20d',  -- e.g., '20d' for 20 daily bars
sma_50_period VARCHAR(10) DEFAULT '50d',
sma_200_period VARCHAR(10) DEFAULT '200d',

-- For MACD: Show the parameters
macd_params VARCHAR(20) DEFAULT '12,26,9d',  -- '12,26,9d' = EMA(12d), EMA(26d), Signal(9d)

-- For ATR: Show the period
atr_14_period VARCHAR(10) DEFAULT '14d',

-- Global metadata: Make it clear all calculations use daily bars
calculation_timescale VARCHAR(10) DEFAULT '1day',  -- Always '1day' for these metrics
calculation_source VARCHAR(50) DEFAULT 'market_data',  -- Table used for calculation
```

**Full Migration**:

```python
"""Add transparency fields to screener_metrics

Revision ID: 025
Revises: 024
Create Date: 2025-11-03

This migration adds fields to make metric calculations transparent:
- Shows numerator/denominator for RV calculations
- Documents the timeframe for all indicators (daily bars)
- Makes data sources explicit
"""
from alembic import op
import sqlalchemy as sa


revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add transparency fields to screener_metrics."""

    # Add RV calculation components
    op.execute("""
        ALTER TABLE screener_metrics
        ADD COLUMN IF NOT EXISTS rv14_today_volume BIGINT,
        ADD COLUMN IF NOT EXISTS rv14_avg_volume BIGINT,
        ADD COLUMN IF NOT EXISTS rv30_avg_volume BIGINT,
        ADD COLUMN IF NOT EXISTS rv60_avg_volume BIGINT;
    """)

    # Add period indicators for all metrics
    op.execute("""
        ALTER TABLE screener_metrics
        ADD COLUMN IF NOT EXISTS calculation_timescale VARCHAR(10) DEFAULT '1day',
        ADD COLUMN IF NOT EXISTS calculation_source VARCHAR(50) DEFAULT 'market_data';
    """)

    # Add comments for documentation
    op.execute("""
        COMMENT ON COLUMN screener_metrics.rv14 IS
        'Relative Volume (14-day): Today volume / 14-day avg volume. Calculated from daily bars.';

        COMMENT ON COLUMN screener_metrics.rv14_today_volume IS
        'Numerator for RV14 calculation: Today''s total volume from completed daily bar';

        COMMENT ON COLUMN screener_metrics.rv14_avg_volume IS
        'Denominator for RV14 calculation: Average volume over previous 14 daily bars';

        COMMENT ON COLUMN screener_metrics.sma_20 IS
        'Simple Moving Average of closing prices over last 20 daily bars';

        COMMENT ON COLUMN screener_metrics.rsi_14 IS
        'Relative Strength Index calculated from last 14 daily bars using Wilder smoothing';

        COMMENT ON COLUMN screener_metrics.macd_line IS
        'MACD Line: EMA(12d) - EMA(26d) calculated from daily closing prices';

        COMMENT ON COLUMN screener_metrics.calculation_timescale IS
        'Timescale of bars used for calculation. Always ''1day'' for screener metrics.';

        COMMENT ON COLUMN screener_metrics.calculation_source IS
        'Source table for calculation. Always ''market_data'' WHERE timescale=''1day''.';
    """)


def downgrade() -> None:
    """Remove transparency fields."""

    op.execute("""
        ALTER TABLE screener_metrics
        DROP COLUMN IF EXISTS rv14_today_volume,
        DROP COLUMN IF EXISTS rv14_avg_volume,
        DROP COLUMN IF EXISTS rv30_avg_volume,
        DROP COLUMN IF EXISTS rv60_avg_volume,
        DROP COLUMN IF EXISTS calculation_timescale,
        DROP COLUMN IF EXISTS calculation_source;
    """)
```

---

## Phase 2: Backend - Update Calculation and Storage Logic

### 2.1 Update RV Calculation to Store Components

**File**: `apps/server/app/services/screener/screener_indicators.py`

**Change**: Modify `calculate_rv_metrics()` to return the raw volumes:

```python
async def calculate_rv_metrics(
    self,
    symbols: List[str],
    target_date: date
) -> Dict[str, Dict[str, float]]:
    """
    Calculate RV14, RV30, RV60 with transparent components.

    Returns dict with:
    - rv14, rv30, rv60 (ratios)
    - rv14_today_volume, rv14_avg_volume (components)
    - rv30_avg_volume, rv60_avg_volume (denominators)
    """
    if not symbols:
        return {}

    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    WITH daily_volumes AS (
                        SELECT
                            symbol,
                            time::date as date,
                            volume,
                            ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY time DESC) as rn
                        FROM market_data
                        WHERE symbol = ANY(:symbols)
                          AND timescale = '1day'
                          AND time::date <= :target_date
                          AND time::date >= :cutoff_date
                        ORDER BY symbol, time DESC
                    ),
                    volume_calcs AS (
                        SELECT
                            symbol,
                            MAX(CASE WHEN rn = 1 THEN volume END) as today_vol,
                            AVG(CASE WHEN rn BETWEEN 2 AND 15 THEN volume END) as avg_14d,
                            AVG(CASE WHEN rn BETWEEN 2 AND 31 THEN volume END) as avg_30d,
                            AVG(CASE WHEN rn BETWEEN 2 AND 61 THEN volume END) as avg_60d
                        FROM daily_volumes
                        WHERE rn <= 61
                        GROUP BY symbol
                        HAVING COUNT(*) >= 15
                    )
                    SELECT
                        symbol,
                        today_vol,
                        avg_14d,
                        avg_30d,
                        avg_60d,
                        CASE WHEN avg_14d > 0 THEN today_vol / avg_14d ELSE 0 END as rv14,
                        CASE WHEN avg_30d > 0 THEN today_vol / avg_30d ELSE 0 END as rv30,
                        CASE WHEN avg_60d > 0 THEN today_vol / avg_60d ELSE 0 END as rv60
                    FROM volume_calcs
                """),
                {
                    "symbols": symbols,
                    "target_date": target_date,
                    "cutoff_date": target_date - timedelta(days=65)
                }
            )

            results = {}
            for row in result:
                results[row[0]] = {
                    # Ratios
                    "rv14": float(row[5]) if row[5] else 0.0,
                    "rv30": float(row[6]) if row[6] else 0.0,
                    "rv60": float(row[7]) if row[7] else 0.0,
                    # Components for transparency
                    "rv14_today_volume": int(row[1]) if row[1] else 0,
                    "rv14_avg_volume": int(row[2]) if row[2] else 0,
                    "rv30_avg_volume": int(row[3]) if row[3] else 0,
                    "rv60_avg_volume": int(row[4]) if row[4] else 0,
                }

            return results

    except Exception as e:
        self.logger.error(f"Error calculating RV metrics: {e}", exc_info=True)
        return {}
```

### 2.2 Update Storage to Include New Fields

**File**: `apps/server/app/services/screener/screener_metrics_storage.py`

**Update `upsert_metrics()`**:

```python
async def upsert_metrics(metrics: Dict[str, Dict], target_date: date) -> int:
    """
    Bulk upsert metrics with transparency fields.
    """
    if not metrics:
        return 0

    try:
        async with get_async_session() as session:
            values_parts = []
            for symbol, m in metrics.items():
                values_parts.append(f"""(
                    '{symbol}',
                    '{target_date}',
                    -- RV ratios
                    {m.get('rv14') or 'NULL'},
                    {m.get('rv30') or 'NULL'},
                    {m.get('rv60') or 'NULL'},
                    -- RV components (NEW)
                    {m.get('rv14_today_volume') or 'NULL'},
                    {m.get('rv14_avg_volume') or 'NULL'},
                    {m.get('rv30_avg_volume') or 'NULL'},
                    {m.get('rv60_avg_volume') or 'NULL'},
                    -- Other metrics...
                    {m.get('high_90d') or 'NULL'},
                    {m.get('low_90d') or 'NULL'},
                    {m.get('sma_20') or 'NULL'},
                    {m.get('sma_50') or 'NULL'},
                    {m.get('sma_200') or 'NULL'},
                    {m.get('rsi_14') or 'NULL'},
                    {m.get('macd_line') or 'NULL'},
                    {m.get('macd_signal') or 'NULL'},
                    {m.get('macd_histogram') or 'NULL'},
                    {m.get('bb_upper') or 'NULL'},
                    {m.get('bb_middle') or 'NULL'},
                    {m.get('bb_lower') or 'NULL'},
                    {m.get('atr_14') or 'NULL'},
                    {m.get('volume_ma_20') or 'NULL'},
                    {m.get('volume_trend') and f"'{m['volume_trend']}'" or 'NULL'},
                    -- Metadata (NEW)
                    '1day',
                    'market_data'
                )""")

            values_clause = ",\n".join(values_parts)

            await session.execute(
                text(f"""
                    INSERT INTO screener_metrics (
                        symbol, date,
                        rv14, rv30, rv60,
                        rv14_today_volume, rv14_avg_volume,
                        rv30_avg_volume, rv60_avg_volume,
                        high_90d, low_90d,
                        sma_20, sma_50, sma_200,
                        rsi_14,
                        macd_line, macd_signal, macd_histogram,
                        bb_upper, bb_middle, bb_lower,
                        atr_14,
                        volume_ma_20, volume_trend,
                        calculation_timescale, calculation_source
                    )
                    VALUES {values_clause}
                    ON CONFLICT (symbol, date)
                    DO UPDATE SET
                        rv14 = EXCLUDED.rv14,
                        rv30 = EXCLUDED.rv30,
                        rv60 = EXCLUDED.rv60,
                        rv14_today_volume = EXCLUDED.rv14_today_volume,
                        rv14_avg_volume = EXCLUDED.rv14_avg_volume,
                        rv30_avg_volume = EXCLUDED.rv30_avg_volume,
                        rv60_avg_volume = EXCLUDED.rv60_avg_volume,
                        -- ... update all other fields ...
                        calculation_timescale = EXCLUDED.calculation_timescale,
                        calculation_source = EXCLUDED.calculation_source,
                        calculated_at = NOW()
                """)
            )

            await session.commit()
            logger.info(f"Upserted {len(metrics)} metrics for {target_date}")
            return len(metrics)

    except Exception as e:
        logger.error(f"Error upserting metrics: {e}", exc_info=True)
        return 0
```

**Update `get_metrics()`**:

```python
async def get_metrics(symbols: List[str], target_date: date) -> Dict[str, Dict]:
    """
    Retrieve metrics with transparency fields.
    """
    if not symbols:
        return {}

    try:
        async with get_async_session() as session:
            result = await session.execute(
                text("""
                    SELECT
                        symbol,
                        rv14, rv30, rv60,
                        rv14_today_volume, rv14_avg_volume,
                        rv30_avg_volume, rv60_avg_volume,
                        high_90d, low_90d,
                        sma_20, sma_50, sma_200,
                        rsi_14,
                        macd_line, macd_signal, macd_histogram,
                        bb_upper, bb_middle, bb_lower,
                        atr_14,
                        volume_ma_20, volume_trend,
                        calculation_timescale, calculation_source
                    FROM screener_metrics
                    WHERE symbol = ANY(:symbols)
                      AND date = :target_date
                """),
                {"symbols": symbols, "target_date": target_date}
            )

            metrics = {}
            for row in result:
                metrics[row[0]] = {
                    # RV ratios
                    "rv14": float(row[1]) if row[1] else 0.0,
                    "rv30": float(row[2]) if row[2] else 0.0,
                    "rv60": float(row[3]) if row[3] else 0.0,
                    # RV components (NEW)
                    "rv14_today_volume": int(row[4]) if row[4] else 0,
                    "rv14_avg_volume": int(row[5]) if row[5] else 0,
                    "rv30_avg_volume": int(row[6]) if row[6] else 0,
                    "rv60_avg_volume": int(row[7]) if row[7] else 0,
                    # Other metrics...
                    "high_90d": float(row[8]) if row[8] else None,
                    "low_90d": float(row[9]) if row[9] else None,
                    "sma_20": float(row[10]) if row[10] else None,
                    "sma_50": float(row[11]) if row[11] else None,
                    "sma_200": float(row[12]) if row[12] else None,
                    "rsi_14": float(row[13]) if row[13] else None,
                    "macd_line": float(row[14]) if row[14] else None,
                    "macd_signal": float(row[15]) if row[15] else None,
                    "macd_histogram": float(row[16]) if row[16] else None,
                    "bb_upper": float(row[17]) if row[17] else None,
                    "bb_middle": float(row[18]) if row[18] else None,
                    "bb_lower": float(row[19]) if row[19] else None,
                    "atr_14": float(row[20]) if row[20] else None,
                    "volume_ma_20": float(row[21]) if row[21] else None,
                    "volume_trend": row[22],
                    # Metadata (NEW)
                    "calculation_timescale": row[23],  # '1day'
                    "calculation_source": row[24],     # 'market_data'
                }

            return metrics

    except Exception as e:
        logger.error(f"Error retrieving metrics: {e}", exc_info=True)
        return {}
```

---

## Phase 3: Frontend - Update Types and UI

### 3.1 Update TypeScript Type Definitions

**File**: `apps/web/src/features/screener/types/index.ts`

```typescript
/**
 * Stock data returned by the screener.
 *
 * Data comes from 3 sources:
 * 1. Real-time price data (market_data_daily + current price)
 * 2. Pre-calculated metrics (screener_metrics table, calculated daily from daily bars)
 * 3. Static ticker information (ticker_details table)
 */
export type StockData = {
  // ===== IDENTIFIERS =====
  ticker: string;

  // ===== CATEGORY 1: REAL-TIME PRICE DATA =====
  // Source: market_data_daily (yesterday) + market_latest_trades (current price)
  price: number; // Current price (live: latest trade, historical: 5min bar)
  open: number; // Yesterday's open
  high: number; // Yesterday's high
  low: number; // Yesterday's low
  close: number; // Yesterday's close
  volume: number; // Yesterday's volume
  today_vol?: number; // Alias for volume
  change_close_pct?: number; // % change from yesterday's close to current price
  change_close?: number; // Alias for change_close_pct

  // ===== CATEGORY 2: PRE-CALCULATED METRICS (DAILY BARS) =====
  // Source: screener_metrics table (calculated daily from market_data WHERE timescale='1day')
  // All metrics below use DAILY bars (1 day = 1 bar)

  // --- Relative Volume (RV) ---
  // RV = Today's completed daily bar volume / N-day average volume
  // Note: Shows 0 during live trading (no completed daily bar yet)
  rv14?: number; // Ratio: today_vol / 14-day avg (e.g., 2.5 = 2.5x normal volume)
  rv?: number; // Alias for rv14
  rv30?: number; // Ratio: today_vol / 30-day avg
  rv60?: number; // Ratio: today_vol / 60-day avg

  // RV Components (for transparency)
  rv14_today_volume?: number; // Numerator: Today's total volume from completed daily bar
  rv14_avg_volume?: number; // Denominator: Average volume over previous 14 daily bars
  rv30_avg_volume?: number; // Denominator: Average volume over previous 30 daily bars
  rv60_avg_volume?: number; // Denominator: Average volume over previous 60 daily bars

  // --- Moving Averages (SMA) ---
  // Calculated from closing prices of daily bars
  sma_20?: number; // Simple Moving Average of last 20 daily closes
  sma_50?: number; // Simple Moving Average of last 50 daily closes
  sma_200?: number; // Simple Moving Average of last 200 daily closes

  // --- Momentum Indicators ---
  rsi_14?: number; // Relative Strength Index from last 14 daily bars (0-100)
  macd_line?: number; // MACD: EMA(12d) - EMA(26d) from daily closes
  macd_signal?: number; // MACD Signal: EMA(9d) of MACD line
  macd_histogram?: number; // MACD Histogram: macd_line - macd_signal

  // --- Volatility Indicators ---
  atr_14?: number; // Average True Range over last 14 daily bars
  bb_upper?: number; // Bollinger Band Upper (SMA20 + 2*StdDev from daily closes)
  bb_middle?: number; // Bollinger Band Middle (SMA20 from daily closes)
  bb_lower?: number; // Bollinger Band Lower (SMA20 - 2*StdDev from daily closes)

  // --- Price Levels ---
  high_90d?: number; // Highest high over last 90 daily bars
  low_90d?: number; // Lowest low over last 90 daily bars

  // --- Volume Trends ---
  volume_ma_20?: number; // 20-day moving average of daily volume
  volume_trend?: string; // 'rising' | 'falling' | 'neutral'

  // --- Metadata (for debugging/transparency) ---
  calculation_timescale?: string; // Always '1day' for screener metrics
  calculation_source?: string; // Always 'market_data' for screener metrics

  // ===== REMOVED: Not useful for daily screening =====
  // change_1m?: number;            // Removed: Intraday changes not relevant
  // change_5m?: number;            // Removed: Intraday changes not relevant
  // change_1h?: number;            // Removed: Intraday changes not relevant
};

/**
 * Helper type for RV display with components
 */
export type RVDisplay = {
  ratio: number; // The RV ratio (e.g., 2.5)
  todayVolume: number; // Numerator
  avgVolume: number; // Denominator
  period: number; // Period (14, 30, or 60 days)
};
```

### 3.2 Update Screener Table Columns

**File**: `apps/web/src/features/screener/components/screener-table-columns.tsx`

**Changes**:

1. Remove change_1m, change_5m, change_1h columns
2. Add transparency to RV14 column with tooltip showing calculation
3. Add tooltips to SMA/RSI/MACD columns explaining they use daily bars

```tsx
"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Info } from "lucide-react";
import Link from "next/link";

import { Button } from "@/lib/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/lib/components/ui/tooltip";

import type { StockData } from "../types";
import {
  formatMultiple,
  formatNumber,
  formatPercent,
} from "../utils/formatters";

/**
 * Format large numbers with commas (e.g., 1,234,567)
 */
function formatVolume(num: number | undefined): string {
  if (num === undefined || num === null) return "-";
  return num.toLocaleString("en-US");
}

export function createScreenerColumns(): ColumnDef<StockData>[] {
  return [
    {
      accessorKey: "ticker",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Ticker
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <Link
          href={`/?ticker=${row.original.ticker}`}
          className="text-blue-600 hover:underline font-medium"
        >
          {row.original.ticker}
        </Link>
      ),
    },
    {
      accessorKey: "price",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Price
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.price)}</div>
      ),
    },
    {
      accessorKey: "open",
      header: "Open",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.open)}</div>
      ),
    },
    {
      accessorKey: "high",
      header: "High",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.high)}</div>
      ),
    },
    {
      accessorKey: "low",
      header: "Low",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.low)}</div>
      ),
    },
    {
      accessorKey: "close",
      header: "Close",
      cell: ({ row }) => (
        <div className="text-right">${formatNumber(row.original.close)}</div>
      ),
    },
    {
      accessorKey: "volume",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Volume
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-right">
          {formatNumber(row.original.today_vol || row.original.volume)}
        </div>
      ),
    },
    {
      accessorKey: "rv14",
      header: ({ column }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            RV14
            <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="font-semibold mb-1">Relative Volume (14-day)</p>
                <p className="text-xs mb-2">
                  Measures today's volume compared to the 14-day average.
                </p>
                <p className="text-xs font-mono bg-muted p-2 rounded mb-2">
                  RV14 = Today's Volume ÷ 14-Day Avg Volume
                </p>
                <p className="text-xs text-muted-foreground mb-1">
                  <strong>Calculated from:</strong> Daily bars (1 day = 1 bar)
                </p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  ⚠️ Shows 0 during live trading (no completed daily bar yet).
                  Use Historical mode to see calculated values.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ),
      cell: ({ row }) => {
        const rv14 = row.original.rv14 || row.original.rv || 0;
        const todayVol = row.original.rv14_today_volume;
        const avgVol = row.original.rv14_avg_volume;

        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-right cursor-help">
                  {formatMultiple(rv14)}
                </div>
              </TooltipTrigger>
              {todayVol !== undefined && avgVol !== undefined && avgVol > 0 && (
                <TooltipContent className="max-w-xs">
                  <p className="text-xs font-semibold mb-1">
                    RV14 Calculation:
                  </p>
                  <p className="text-xs font-mono">
                    {formatVolume(todayVol)} ÷ {formatVolume(avgVol)} ={" "}
                    {rv14.toFixed(2)}x
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Today's volume is <strong>{rv14.toFixed(1)}x</strong> the
                    14-day average
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        );
      },
    },
    {
      accessorKey: "change_close_pct",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Change (Close)
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const change =
          row.original.change_close_pct || row.original.change_close;
        return (
          <div
            className={`text-right ${
              change && change > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatPercent(change)}
          </div>
        );
      },
    },
    // REMOVED: change_1m, change_5m, change_1h (not useful for daily screening)
  ];
}
```

### 3.3 Add Column for Additional Metrics with Tooltips

**Optional enhancement**: Add columns for SMA20, RSI14, etc. with similar transparency

```tsx
// Example: SMA20 column with tooltip
{
  accessorKey: "sma_20",
  header: ({ column }) => (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        SMA20
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="font-semibold mb-1">Simple Moving Average (20-day)</p>
            <p className="text-xs mb-2">
              Average closing price over the last 20 daily bars.
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Calculated from:</strong> Daily closing prices (1 day = 1 bar)
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ),
  cell: ({ row }) => (
    <div className="text-right">
      {row.original.sma_20 ? `$${formatNumber(row.original.sma_20)}` : "-"}
    </div>
  ),
},

// Example: RSI14 column with tooltip
{
  accessorKey: "rsi_14",
  header: ({ column }) => (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        RSI14
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="font-semibold mb-1">Relative Strength Index (14-day)</p>
            <p className="text-xs mb-2">
              Momentum indicator comparing average gains to losses over 14 days.
            </p>
            <p className="text-xs mb-1">
              <strong>Range:</strong> 0-100
            </p>
            <p className="text-xs mb-2">
              • &gt;70 = Overbought<br/>
              • &lt;30 = Oversold
            </p>
            <p className="text-xs text-muted-foreground">
              <strong>Calculated from:</strong> Daily closing prices (1 day = 1 bar)
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  ),
  cell: ({ row }) => (
    <div className="text-right">
      {row.original.rsi_14 !== undefined ? row.original.rsi_14.toFixed(1) : "-"}
    </div>
  ),
},
```

---

## Phase 4: Testing and Verification

### 4.1 Test RV14 Calculation with Components

**File**: `apps/server/tests/test_screener_metrics.py`

```python
@pytest.mark.asyncio
async def test_rv14_calculation_with_components():
    """
    Test RV14 calculation includes transparent components.
    Verify numerator/denominator are stored and retrievable.
    """
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    from datetime import date, timedelta

    # Use recent trading day
    target_date = date.today() - timedelta(days=1)

    calculator = TimescaleIndicatorCalculator()
    results = await calculator.calculate_rv_metrics(["AAPL", "TSLA"], target_date)

    assert "AAPL" in results, "AAPL not in results"

    aapl = results["AAPL"]

    # Check ratio exists
    assert "rv14" in aapl, "rv14 ratio missing"
    assert aapl["rv14"] >= 0, f"Invalid RV14: {aapl['rv14']}"

    # Check components exist (NEW)
    assert "rv14_today_volume" in aapl, "rv14_today_volume missing"
    assert "rv14_avg_volume" in aapl, "rv14_avg_volume missing"

    today_vol = aapl["rv14_today_volume"]
    avg_vol = aapl["rv14_avg_volume"]
    rv14 = aapl["rv14"]

    # Verify components are positive
    assert today_vol > 0, f"today_volume should be positive: {today_vol}"
    assert avg_vol > 0, f"avg_volume should be positive: {avg_vol}"

    # Verify calculation: rv14 = today_vol / avg_vol
    calculated_rv14 = today_vol / avg_vol if avg_vol > 0 else 0
    assert abs(calculated_rv14 - rv14) < 0.01, \
        f"RV14 calculation mismatch: {calculated_rv14:.2f} != {rv14:.2f}"

    print(f"✓ AAPL RV14 transparency test passed:")
    print(f"  Today Volume: {today_vol:,}")
    print(f"  14-Day Avg:   {avg_vol:,}")
    print(f"  RV14 Ratio:   {rv14:.2f}x")
    print(f"  Calculation:  {today_vol:,} ÷ {avg_vol:,} = {rv14:.2f}")


@pytest.mark.asyncio
async def test_screener_metrics_include_metadata():
    """
    Test that stored metrics include metadata fields.
    """
    from app.services.screener.screener_metrics_storage import get_metrics
    from datetime import date, timedelta

    target_date = date.today() - timedelta(days=1)
    metrics = await get_metrics(["AAPL"], target_date)

    assert "AAPL" in metrics, "AAPL not found"

    aapl = metrics["AAPL"]

    # Check metadata fields exist
    assert "calculation_timescale" in aapl, "calculation_timescale missing"
    assert "calculation_source" in aapl, "calculation_source missing"

    # Verify values
    assert aapl["calculation_timescale"] == "1day", \
        f"Expected '1day', got '{aapl['calculation_timescale']}'"
    assert aapl["calculation_source"] == "market_data", \
        f"Expected 'market_data', got '{aapl['calculation_source']}'"

    print(f"✓ Metadata fields present and correct")
```

### 4.2 Manual UI Testing Checklist

After implementing changes, test in browser:

- [ ] RV14 column shows ratio (e.g., "2.3x")
- [ ] RV14 tooltip shows formula and explanation
- [ ] Hovering over RV14 value shows calculation: "1,234,567 ÷ 534,876 = 2.3x"
- [ ] Change (1m), Change (5m), Change (1h) columns are removed
- [ ] SMA20/RSI14 tooltips explain they use daily bars
- [ ] Historical mode shows non-zero RV14 values
- [ ] Live mode shows RV14=0 with explanation in tooltip

---

## Phase 5: Documentation

### 5.1 Update AGENTS.md

**File**: `AGENTS.md`

Add section:

```markdown
## Screener Metrics: Data Transparency

All screener metrics (RV14, SMA20, RSI14, MACD, etc.) are:

1. **Calculated from daily bars** (`market_data` WHERE `timescale='1day'`)
2. **Pre-computed once per day** (after market close)
3. **Stored with transparency fields** showing calculation components

### Transparency Fields

- **RV14**: Stores both the ratio AND the numerator/denominator
  - `rv14`: The ratio (e.g., 2.3)
  - `rv14_today_volume`: Numerator (today's volume)
  - `rv14_avg_volume`: Denominator (14-day average)
- **All metrics**: Include metadata
  - `calculation_timescale`: Always '1day' for screener metrics
  - `calculation_source`: Always 'market_data' table

### Why RV14 = 0 During Live Trading

RV14 requires a **completed daily bar**. During live trading:

- Today's daily bar is not complete yet
- No today_volume to use as numerator
- Therefore RV14 = 0

Use **Historical mode** to see RV14 values from previous completed days.

### Key Files

- `screener_metrics` table - Stores pre-calculated metrics with transparency
- `screener_indicators.py` - Calculates metrics from daily bars
- `screener_metrics_storage.py` - Stores/retrieves metrics with components
- `screener-table-columns.tsx` - UI displays metrics with explanatory tooltips
```

### 5.2 Create Architecture Documentation

**File**: `apps/server/docs/SCREENER_METRICS_TRANSPARENCY.md`

````markdown
# Screener Metrics: Transparency Architecture

## Problem

Users see metrics like "RV14: 2.3x" but have no visibility into:

- What "2.3x" means (what's the numerator? denominator?)
- What timeframe "14" refers to (14 days? 14 minutes?)
- What data source was used (daily bars? 5-min bars?)

## Solution

Store calculation components alongside the final metrics.

## Implementation

### Database Schema

```sql
CREATE TABLE screener_metrics (
    symbol VARCHAR(20),
    date DATE,

    -- Metric value
    rv14 NUMERIC(10, 2),

    -- Transparency: Store components
    rv14_today_volume BIGINT,      -- Numerator
    rv14_avg_volume BIGINT,         -- Denominator

    -- Metadata: Make data source explicit
    calculation_timescale VARCHAR(10) DEFAULT '1day',
    calculation_source VARCHAR(50) DEFAULT 'market_data',

    PRIMARY KEY (symbol, date)
);
```
````

### API Response

```json
{
  "ticker": "AAPL",
  "rv14": 2.34,
  "rv14_today_volume": 125000000,
  "rv14_avg_volume": 53400000,
  "calculation_timescale": "1day",
  "calculation_source": "market_data"
}
```

### UI Display

**Column Header**: "RV14" with info icon

**Tooltip on Header**:

```
Relative Volume (14-day)
Measures today's volume vs 14-day average

Formula: RV14 = Today's Volume ÷ 14-Day Avg Volume

Calculated from: Daily bars (1 day = 1 bar)

⚠️ Shows 0 during live trading (no completed bar yet)
```

**Tooltip on Value** (when hovering "2.3x"):

```
RV14 Calculation:
125,000,000 ÷ 53,400,000 = 2.34x

Today's volume is 2.3x the 14-day average
```

## Benefits

1. **User Confidence**: Can verify calculations themselves
2. **Educational**: Users learn what metrics mean
3. **Debugging**: Easy to spot data quality issues
4. **Transparency**: No "black box" calculations

## Applies To

- RV14, RV30, RV60 (show numerator/denominator)
- All indicators (show they use daily bars via metadata)
- Future: Could add parameter fields (RSI_14_period = '14d', MACD_params = '12,26,9d')

```

---

## Success Criteria

- [ ] **Migration created** and applied: `025_add_screener_metrics_transparency.py`
- [ ] **RV calculation** returns components: `rv14_today_volume`, `rv14_avg_volume`
- [ ] **Storage** saves and retrieves transparency fields
- [ ] **API responses** include transparency fields
- [ ] **Type definitions** updated with transparency fields and documentation
- [ ] **UI columns** show tooltips explaining daily bars
- [ ] **RV14 cell tooltips** show calculation: "X ÷ Y = Z"
- [ ] **Change (1m/5m/1h)** columns removed
- [ ] **Tests pass** for RV14 components
- [ ] **Documentation** updated in AGENTS.md
- [ ] **Manual testing** confirms tooltips work in browser

---

## Implementation Order

1. **Phase 1**: Create migration, apply to DB
2. **Phase 2**: Update backend calculation and storage
3. **Phase 3**: Update frontend types and UI
4. **Phase 4**: Add tests
5. **Phase 5**: Update documentation

Each phase can be tested independently before moving to the next.

```
