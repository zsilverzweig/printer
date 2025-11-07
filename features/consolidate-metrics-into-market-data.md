# Consolidate Metrics into market_data Table

## Problem

Currently, technical indicators and metrics are stored in multiple redundant systems:

1. **Multiple storage locations**:

   - `technical_indicators` table: EMA12, EMA26, VWAP, MACD, RSI, ATR for intraday timescales
   - `screener_metrics` table: RV14, RV30, RV60, SMA, RSI, MACD, BB, ATR for daily bars
   - On-the-fly calculations in 7+ different places

2. **Inconsistent calculations**: Metrics calculated multiple times in different places (market_data_provider.py, strategies, frontend, screener services) leading to potential inconsistencies

3. **Performance overhead**: Repeated calculations waste CPU cycles and slow down queries

4. **Complex queries**: Requiring joins across multiple tables to get complete market data with metrics

5. **No timeframe-dependent metrics**: Can't easily query "what was the RV14 for this ticker at this timestamp on a 5min timescale"

## Solution

Store all metrics directly on each bar in the `market_data` table, making metrics timeframe-dependent and queryable for any timestamp. This provides:

- **Single source of truth**: All metrics stored with their corresponding bar
- **Timeframe-dependent**: RV14 for 1min bars is different from RV14 for 5min bars
- **Simple queries**: Get any metric for any timestamp with a single query
- **Incremental calculation**: Metrics calculated as bars are inserted, not recalculated from scratch
- **Background completion**: Missing metrics filled in by background service

## Implementation Plan

### Phase 1: Database Schema Changes

1. **Add metric columns to market_data table** (`apps/server/app/models/market_data.py`)

   - Price indicators: `ema_12`, `ema_26`, `ema_50`, `ema_200`, `sma_20`, `sma_50`, `sma_200`
   - MACD: `macd_line`, `macd_signal`, `macd_histogram`
   - Momentum: `rsi_14`
   - Volatility: `atr_14`, `bb_upper`, `bb_middle`, `bb_lower`
   - Volume: `vwap`, `rv14`, `rv30`, `rv60`, `volume_ma_20`, `volume_trend`
   - All columns nullable (metrics calculated incrementally as data becomes available)

2. **Create Alembic migration** (`apps/server/alembic/versions/040_add_metrics_to_market_data.py`)
   - Add all metric columns to `market_data` table
   - Create indexes on commonly queried metrics (RV14, MACD, RSI)
   - No data migration yet (columns start as NULL)

### Phase 2: Unified Metric Calculation Service

3. **Create unified metric calculator** (`apps/server/app/services/market/metrics_calculator.py`)

   - Single source of truth for all metric calculations
   - Uses existing `app/lib/technical_analysis.py` functions
   - Calculates metrics incrementally (one bar at a time) for efficiency
   - Handles timeframe-dependent calculations (RV14 for 1min vs 5min bars)
   - Maintains indicator state (EMA, MACD require previous values)

4. **Create metric population service** (`apps/server/app/services/market/metrics_populator.py`)
   - Populates metrics for historical bars (backfill)
   - Processes bars in chronological order to maintain indicator state
   - Supports batch processing for performance
   - Handles missing data gracefully (NULL for insufficient history)

### Phase 3: Update Data Ingestion

5. **Update real-time ingestion** (`apps/server/app/services/market/realtime_ingestion.py`)

   - Calculate and store metrics when new bars are inserted
   - Use incremental calculation (only calculate for new bar, not entire history)
   - Maintain indicator state in memory for efficiency
   - Handle cases where previous bars needed for calculation aren't available yet

6. **Update historical data loader** (`apps/server/scripts/market_data_loader.py`)
   - Calculate metrics during initial data load
   - Process bars chronologically per symbol/timescale
   - Batch insert bars with pre-calculated metrics

### Phase 4: Update Query Services

7. **Update MarketDataService** (`apps/server/app/services/market/market_data_service.py`)

   - Remove queries to `technical_indicators` table
   - Return metrics directly from `market_data` table
   - Update `get_technical_indicators()` to query `market_data` instead

8. **Update screener services** (`apps/server/app/services/screener/`)

   - Remove queries to `screener_metrics` table
   - Query metrics directly from `market_data` (using 1day timescale for daily metrics)
   - Update `screener_data_unified.py` to use `market_data` metrics

9. **Update MarketDataProvider** (`apps/server/app/services/market/market_data_provider.py`)
   - Remove on-the-fly indicator calculations
   - Return metrics from `market_data` table
   - Update `build_market_data()` to include metrics from database

### Phase 5: Update Strategies

10. **Update strategy base class** (`apps/server/app/strategies/base.py`)

    - Update `MarketDataSnapshot` to include metrics from database
    - Remove on-the-fly calculations from strategies

11. **Update individual strategies**
    - `bull_flag.py`: Use metrics from `market_data` instead of calculating
    - `macd_momentum.py`: Use MACD from `market_data`
    - `ema_crossover.py`: Use EMA from `market_data`
    - `rsi_mean_reversion.py`: Use RSI from `market_data`
    - Other strategies: Remove metric calculations, use database values

### Phase 6: Background Metric Completion System

12. **Create background metric completion service** (`apps/server/app/services/market/metrics_completion_service.py`)

    - Periodic background task that finds bars with missing metrics
    - Processes bars in chronological order per symbol/timescale
    - Uses incremental calculation (only calculates missing metrics, not entire history)
    - Configurable batch size and processing interval
    - Handles concurrent processing safely (locks per symbol/timescale)
    - Integrates with health monitor for status tracking
    - Processes oldest missing metrics first (FIFO queue)

13. **Integrate completion service into startup orchestrator** (`apps/server/app/services/core/startup_orchestrator.py`)
    - Start background metric completion task on application startup
    - Configurable via environment variable (METRICS_COMPLETION_ENABLED, METRICS_COMPLETION_INTERVAL)
    - Runs continuously, processing missing metrics in background
    - Low priority (doesn't block other operations)
    - Can be paused/resumed via health monitor

### Phase 8: Backtesting Adjustments

15. **Update backtest coordinator** (`apps/server/app/services/backtest/backtest_coordinator.py`)

    - Update queries to use metrics from `market_data` instead of `technical_indicators` table
    - Handle NULL metrics gracefully (some bars may not have metrics calculated yet)
    - For missing metrics during backtesting:
      - Option 1: Calculate on-the-fly if needed (fallback)
      - Option 2: Skip bars without metrics (if strategy requires them)
      - Option 3: Pre-populate metrics for backtest date range before running
    - Update `_get_market_data_at_timestamp()` to include metrics from `market_data` table

16. **Update backtest lookup** (`apps/server/app/models/market_data.py` - MarketDataBacktestLookup)

    - Consider including common metrics in lookup table for faster backtest queries
    - Or rely on direct `market_data` queries with metrics included

17. **Update backtest health checks** (`apps/server/app/services/monitoring/health_monitor.py`)
    - Remove checks for `technical_indicators` table
    - Add checks for metric completion status in `market_data`
    - Verify metrics exist for backtest date ranges

### Phase 9: Frontend Updates

18. **Update frontend indicator calculations** (`apps/web/src/lib/utils/indicators.ts`)
    - Remove client-side EMA/MACD/VWAP calculations
    - Use metrics from API response (already in bars)
    - Update chart components to use database metrics

### Phase 10: Cleanup

19. **Remove redundant tables and services**

    - Drop `technical_indicators` table (after migration verification)
    - Drop `screener_metrics` table (after migration verification)
    - Remove `technical_indicators_service.py`
    - Remove `screener_metrics_storage.py` and related services
    - Update health checks to remove references to old tables

20. **Update documentation**
    - Update data architecture docs
    - Document new metric storage approach
    - Update API documentation

## Key Design Decisions

1. **Metrics stored per bar**: Each bar has its own metric values, making queries simple and fast
2. **Timeframe-dependent**: RV14 for 1min bars is different from RV14 for 5min bars (calculated from respective timescales)
3. **Incremental calculation**: Metrics calculated as bars are inserted, not recalculated from scratch each time
4. **Nullable columns**: Metrics start as NULL until sufficient history is available (e.g., EMA26 needs 26 bars)
5. **Background completion**: Missing metrics filled in by background service, ensuring eventual consistency
6. **Backward compatible**: Existing code continues to work during migration, gradually updated to use new structure

## Migration Strategy

1. Add columns to `market_data` (nullable, no breaking changes)
2. Deploy metric calculation services
3. Start background completion service (fills in metrics over time)
4. Backfill historical data (can run in background, idempotent with completion service)
5. Update services to use new columns (gradual rollout)
6. Remove old tables after verification period

## Testing Considerations

- Verify metric calculations match existing implementations
- Test incremental calculation correctness
- Verify timeframe-dependent metrics (RV14 for different timescales)
- Performance testing for metric queries
- Backfill script testing on sample data
- Background completion service stress testing
- Backtesting with missing metrics (graceful degradation)
- Concurrent metric calculation safety (no race conditions)
