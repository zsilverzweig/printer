# Data Architecture & Validation Overhaul

## Problem Summary

1. **Unclear data structure**: No clear understanding of how data flows from Polygon → DB → metrics
2. **Missing validation framework**: No systematic way to check data validity/completeness
3. **Unknown Polygon capabilities**: Unclear what Polygon provides (pre-market, extended hours, etc.)
4. **Timeframe tracking issues**: MACD and other metrics calculated without tracking source timeframe
5. **Weak relative volume**: RV doesn't compare timewindow-based volume against historical same-timewindow periods
6. **Data quality concerns**: Need to audit and clean existing data
7. **Backtesting considerations**: All data validation, timeframe tracking, and RV calculations must work correctly in backtest mode using historical time context

## Implementation Plan

### Phase 1: Data Architecture Documentation & Audit

#### 1.1 Create Data Flow Documentation

- **File**: `apps/server/docs/data-architecture.md`
- Document complete data pipeline:
  - Polygon API → MarketDataService → TimescaleDB (market_data table)
  - Real-time ingestion → WebSocket → batch inserts
  - Historical data loading → validation tracking
  - Technical indicators calculation → technical_indicators table
  - Metrics calculation → screener_metrics table
  - Backtest lookup table population → market_data_backtest_lookup table
  - Backtest time context system → how historical queries work
- Include data models, relationships, and storage locations
- Document all timescales supported (1min, 5min, 15min, 1hour, 1day)
- Document backtest-specific data flow and time context injection

#### 1.2 Polygon API Capabilities Documentation

- **File**: `apps/server/docs/polygon-capabilities.md`
- Document all Polygon endpoints used:
  - `/v2/aggs/{ticker}` - Historical aggregates
  - `/v2/snapshot/locale/us/markets/stocks/tickers` - Real-time snapshots
  - WebSocket feeds (A._ for second bars, AM._ for minute bars)
  - Pre-market/extended hours support
  - Session types (regular, pre, after)
- Create reference for what data is available vs. what we store
- Document any limitations or gaps
- Document historical data availability for backtesting

#### 1.3 Data Audit Script

- **File**: `apps/server/scripts/audit_data_quality.py`
- Query database to report:
  - Coverage by symbol/date/timescale
  - Gaps in data (missing bars, incomplete days)
  - Session type distribution (regular vs pre/after hours)
  - Validation status summary
  - Technical indicators coverage
  - Metrics table completeness
  - Backtest lookup table coverage
  - Backtest data readiness (dates with sufficient data for backtesting)
- Output: JSON report + human-readable summary
- Support auditing specific date ranges for backtest validation

### Phase 2: Data Validation Framework

#### 2.1 Enhanced Validation Service

- **File**: `apps/server/app/services/market/data_validation_service.py`
- Create comprehensive validation service:
  - Check bar completeness (expected vs actual bars per day)
  - Validate price continuity (no gaps, no negative prices)
  - Volume validation (reasonable ranges, no zeros unless market closed)
  - Session type validation (correctly tagged pre/regular/after hours)
  - Cross-reference validation (technical indicators match source data)
  - Timeframe consistency (bars align with timescale)
  - Backtest data validation (lookup table completeness, technical indicators for backtest dates)
  - Support both single-symbol and batch validation
  - Support validation at historical timestamps (for backtest date validation)
  - Generate validation reports with actionable recommendations

#### 2.2 Validation API Endpoints

- **File**: `apps/server/app/routers/data_validation.py`
- Endpoints:
  - `GET /api/data-validation/status` - Overall validation status
  - `GET /api/data-validation/symbol/{symbol}` - Symbol-specific validation
  - `GET /api/data-validation/date/{date}` - Date-specific validation
  - `POST /api/data-validation/validate` - Trigger validation for date range
  - `GET /api/data-validation/gaps` - Find data gaps
  - `GET /api/data-validation/coverage` - Coverage report
  - `GET /api/data-validation/backtest-ready` - Check if dates are ready for backtesting

#### 2.3 Extend SymbolDateValidation Model

- **File**: `apps/server/app/models/market_data.py`
- Add fields to `SymbolDateValidation`:
  - `validation_score`: 0-100 quality score
  - `missing_bars`: List of missing bar timestamps
  - `anomalies`: JSON field for detected issues
  - `pre_market_bars`: Count of pre-market bars
  - `after_hours_bars`: Count of after-hours bars
  - `regular_bars`: Count of regular session bars
  - `backtest_ready`: Boolean indicating if this date has sufficient data for backtesting
- Add indexes for efficient validation queries

### Phase 3: Timeframe Tracking Fixes

#### 3.1 Technical Indicators Timeframe Tracking

- **File**: `apps/server/app/services/backtest/technical_indicators_service.py`
- **File**: `apps/server/app/services/market/market_data_service.py`
- Ensure all indicator calculations:
  - Require explicit timescale parameter
  - Store timescale in technical_indicators table (already exists)
  - Validate timescale matches source bars
  - Prevent mixing bars from different timescales
  - Update MACD calculation to log/validate source timeframe
  - Add timeframe validation to indicator calculation functions
  - Work correctly in backtest mode (respect time context, use historical data)

#### 3.2 Frontend Timeframe Tracking

- **File**: `apps/web/src/lib/utils/indicators.ts`
- **File**: `apps/web/src/lib/components/ui/candlestick-chart.tsx`
- Add timeframe metadata to indicator calculations:
  - Pass `barIntervalSeconds` or `timeframe` to all indicator functions
  - Log warnings when mixing timeframes
  - Display timeframe in chart legends/tooltips
  - Store timeframe context with calculated indicators

#### 3.3 Metrics Calculation Timeframe Awareness

- **File**: `apps/server/app/services/screener/screener_indicators.py`
- **File**: `apps/server/app/services/screener/screener_metrics_storage.py`
- Ensure all metrics calculations:
  - Accept and validate timescale parameter
  - Store timescale context with metrics
  - Prevent cross-timescale metric calculations
  - Work correctly in backtest mode (use historical timestamps)
  - Add timescale column to screener_metrics table if needed

### Phase 4: Relative Volume Improvements

#### 4.1 Timewindow-Based Volume Calculator

- **File**: `apps/server/app/services/screener/timewindow_volume_calculator.py`
- New service for timewindow-based RV:
  - Calculate volume for specific timewindow (e.g., 9:30-10:00, 10:00-10:30)
  - Compare against historical same-timewindow volumes from previous weeks
  - Support multiple timewindows (30min, 60min, 2hr windows)
  - Account for trading day of week (Monday 9:30-10:00 vs Tuesday 9:30-10:00)
  - Handle market holidays and irregular trading days
  - Support backtest mode (calculate RV at historical timestamps)
  - Example: Compare today's 9:30-10:00 volume vs last 4 Mondays' 9:30-10:00 volumes

#### 4.2 Enhanced RV Calculation

- **File**: `apps/server/app/services/screener/screener_volume.py`
- Extend `TimescaleVolumeCalculator`:
  - Add `calculate_timewindow_rv()` method
  - Compare current timewindow to historical same-timewindow periods
  - Support day-of-week matching (compare Monday to Monday)
  - Support multiple lookback periods (4 weeks, 8 weeks, 12 weeks)
  - Return both traditional RV and timewindow RV
  - Update batch calculation methods to support timewindow RV
  - Support backtest mode (use historical timestamps via time context)

#### 4.3 Update Screener Metrics Storage

- **File**: `apps/server/app/services/screener/screener_metrics_storage.py`
- Add new RV fields to metrics table:
  - `rv30_9_30_10_00`: 30min window RV (9:30-10:00)
  - `rv30_10_00_10_30`: 30min window RV (10:00-10:30)
  - `rv60_9_30_10_30`: 60min window RV (9:30-10:30)
  - `rv_timewindow_metadata`: JSON with timewindow details
- Migration script to add columns and populate historical data
- Support storing metrics for historical dates (for backtest analysis)

#### 4.4 Update Screener Data Fetcher

- **File**: `apps/server/app/services/screener/screener_data_unified.py`
- Include timewindow RV in screener results
- Add timewindow RV filtering options
- Update real-time RV calculation to use timewindow method when appropriate
- Ensure historical screener (used in backtests) calculates timewindow RV correctly

### Phase 5: Data Cleanup & Migration

#### 5.1 Data Quality Fix Script

- **File**: `apps/server/scripts/fix_data_quality.py`
- Script to:
  - Identify and flag invalid bars (negative prices, impossible volumes)
  - Fill missing bars where possible (interpolate or mark as missing)
  - Fix session_type misclassifications
  - Recalculate technical indicators for corrupted dates
  - Regenerate validation records
  - Regenerate backtest lookup table for affected dates
  - Dry-run mode to preview changes before applying

#### 5.2 Backfill Missing Data

- **File**: `apps/server/scripts/backfill_missing_data.py`
- Script to:
  - Identify gaps in historical data
  - Fetch missing data from Polygon API
  - Populate missing technical indicators
  - Update validation records
  - Populate backtest lookup table for dates with missing lookup data
  - Support selective backfill (by symbol, date range, timescale)
  - Support backfilling specific dates needed for backtesting

#### 5.3 Migration for Timeframe Tracking

- **File**: `apps/server/alembic/versions/038_add_timeframe_tracking.py`
- Migration to:
  - Verify technical_indicators.timescale is populated correctly
  - Add indexes on timescale columns
  - Add validation constraints
  - Backfill missing timescale data if needed
  - Ensure backtest lookup table has proper indexes for timescale queries

### Phase 6: Testing & Monitoring

#### 6.1 Validation Tests

- **File**: `apps/server/tests/test_data_validation.py`
- Test cases:
  - Validation service correctness
  - Gap detection accuracy
  - Timeframe validation
  - Timewindow RV calculations
  - Data quality checks
  - Backtest data validation
  - Historical timestamp validation (simulating backtest time context)

#### 6.2 Monitoring Dashboard

- **File**: `apps/server/app/routers/data_validation.py` (add metrics endpoint)
- Endpoint: `GET /api/data-validation/metrics`
- Return:
  - Data coverage statistics
  - Validation scores over time
  - Gap counts by symbol/timescale
  - Timewindow RV statistics
  - Backtest data readiness (dates ready for backtesting)
- Can be consumed by frontend monitoring dashboard

## Backtesting Considerations

All phases must consider backtesting:

1. **Time Context**: All services must use `get_current_time()` from `time_context` module to support backtesting
2. **Historical Data Queries**: All validation and calculations must work with historical timestamps
3. **Backtest Lookup Table**: Validation must ensure lookup table is populated for backtest dates
4. **Technical Indicators**: Must be pre-computed for backtest dates with correct timeframes
5. **RV Calculations**: Timewindow RV must calculate correctly at historical timestamps
6. **Screener**: Historical screener must use validated data and correct timeframes
7. **Data Validation**: Must validate data completeness for backtest dates before running backtests

## Success Criteria

1. ✅ Complete documentation of data architecture and Polygon capabilities (including backtesting)
2. ✅ Validation framework identifies all data quality issues (including backtest data)
3. ✅ All metrics calculations track and validate timeframes (works in backtest mode)
4. ✅ Timewindow-based RV compares current periods to historical same-timewindow periods (works in backtests)
5. ✅ Data audit reveals full picture of data quality (including backtest readiness)
6. ✅ Data cleanup script fixes identified issues (including backtest lookup table)
7. ✅ Monitoring provides ongoing data quality visibility (including backtest data status)
8. ✅ All services work correctly in backtest mode using time context

## Files to Create/Modify

**New Files:**

- `apps/server/docs/data-architecture.md`
- `apps/server/docs/polygon-capabilities.md`
- `apps/server/scripts/audit_data_quality.py`
- `apps/server/app/services/market/data_validation_service.py`
- `apps/server/app/routers/data_validation.py`
- `apps/server/app/services/screener/timewindow_volume_calculator.py`
- `apps/server/scripts/fix_data_quality.py`
- `apps/server/scripts/backfill_missing_data.py`
- `apps/server/tests/test_data_validation.py`

**Modified Files:**

- `apps/server/app/models/market_data.py` (extend SymbolDateValidation)
- `apps/server/app/services/backtest/technical_indicators_service.py` (timeframe validation)
- `apps/server/app/services/market/market_data_service.py` (timeframe validation, backtest support)
- `apps/server/app/services/screener/screener_volume.py` (timewindow RV, backtest support)
- `apps/server/app/services/screener/screener_metrics_storage.py` (new RV fields, backtest support)
- `apps/server/app/services/screener/screener_data_unified.py` (timewindow RV, backtest support)
- `apps/web/src/lib/utils/indicators.ts` (timeframe tracking)
- `apps/web/src/lib/components/ui/candlestick-chart.tsx` (timeframe display)
- `apps/server/alembic/versions/038_add_timeframe_tracking.py` (migration)

## Implementation Order

1. **Phase 1** (Documentation & Audit) - Foundation for understanding (including backtest data flow)
2. **Phase 2** (Validation Framework) - Enables quality checks (including backtest data validation)
3. **Phase 3** (Timeframe Tracking) - Fixes core metric issues (works in backtest mode)
4. **Phase 4** (RV Improvements) - Enhances relative volume (works in backtest mode)
5. **Phase 5** (Data Cleanup) - Fixes existing data issues (including backtest lookup table)
6. **Phase 6** (Testing & Monitoring) - Ensures ongoing quality (including backtest data monitoring)
