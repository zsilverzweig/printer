# Screener Change Metrics and Filtering Stats Enhancement

## Overview

Add multiple change metrics to the screener (close, open, 1m, 5m, 15m, 1h, 4h) with proper null handling, and display detailed filtering statistics showing how many items were removed and why.

## Architecture Refactoring

**Current Problem:**

- `screener_data_unified.py` duplicates functionality that `MarketDataService` already provides
- It queries TimescaleDB directly instead of using the centralized service
- `MarketDataService` should be the single source of truth for all ticker data

**Correct Architecture:**

- `MarketDataService` should be extended to provide all screener data needs:
  - Daily OHLCV data (already has `get_bars()`)
  - Current/latest prices (already has `get_latest_prices_batch()`)
  - Today's open price (needs to be added)
  - Historical prices for 15m/4h changes (already has `get_bars()` with different timeframes)
- `screener_data_unified.py` should be refactored to use `MarketDataService` exclusively
- `screener_data.py` (ScreenerDataLoader) can remain for state management (price history tracking, volume calculators)

**Action Items:**

1. Extend `MarketDataService` with screener-specific methods:
   - `get_today_open_batch()` - Get today's open price for multiple symbols
   - `get_daily_ohlcv_batch()` - Get daily OHLCV for multiple symbols (optimized batch query)
   - `get_latest_trades_batch()` - Get latest trades from `market_latest_trades` table
2. Refactor `screener_data_unified.py` to use `MarketDataService` instead of direct SQL queries
3. Keep `screener_data.py` for state management only (price history, volume calculators)
4. Remove duplicate SQL queries from `screener_data_unified.py`

## Backend Changes

### 1. Extend PriceHistoryTracker (`apps/server/app/services/screener/screener_price_history.py`)

- Add `change_15m` and `change_4h` calculations to `calculate_all_changes()`
- Extend history retention to support 4-hour lookback (currently 1 hour max)
- Add tracking for today's open price per ticker
- Update `get_price_change()` to return `None` instead of calculating when data is insufficient

### 2. Extend MarketDataService for Today's Open

- Add `get_today_open_batch()` method to `MarketDataService`:
  - Queries first minute bar of the trading day for each symbol
  - Returns dict mapping symbol -> open price
  - Handles both live and historical modes
- Use this method in `screener_data_unified.py` instead of direct SQL
- Store today's open in `PriceHistoryTracker` or pass through to computation
- Calculate `change_open` as `(current_price - today_open) / today_open * 100` when today_open is available

### 3. Add Historical Price Queries for 15m and 4h

- For live mode: Query TimescaleDB for 15m and 4h bars when needed via MarketDataService
- For historical mode: Use timestamp-based queries via MarketDataService
- Cache or batch these queries efficiently using `MarketDataService.get_bars_batch()`

### 4. Enhance Filtering Statistics (`apps/server/app/services/screener/screener_compute.py`)

- Create a `FilterStats` class/dict to track:
  - `filtered_by_exchange`: Count excluded by exchange
  - `filtered_by_price`: Count excluded by price range
  - `filtered_by_volume`: Count excluded by volume
  - `filtered_by_rv`: Count excluded by relative volume
  - `filtered_by_change`: Count excluded by change percent
  - `filtered_by_etf`: Count excluded as ETFs
  - `filtered_by_asset_type`: Count excluded by asset type
  - `filtered_by_market_cap`: Count excluded by market cap
  - `missing_price`: Count with missing price data
- Pass stats through computation and return in response

### 5. Update Response Types (`apps/server/app/types.py`)

- Add new change fields to `ScreenerResult`:
  - `change_close?: number | null`
  - `change_open?: number | null`
  - `change_1m?: number | null`
  - `change_5m?: number | null`
  - `change_15m?: number | null`
  - `change_1h?: number | null`
  - `change_4h?: number | null`
- Update `ScreenerRunResult` to include `filter_stats?: Dict[str, int]`

### 6. Update Screener Router (`apps/server/app/routers/screening_criteria.py`)

- Include filter stats in `ScreenerRunResult` response
- Ensure stats are passed from compute methods

## Frontend Changes

### 7. Update TypeScript Types (`apps/web/src/lib/types/market.ts`)

- Add all new change fields to `ScreenedStockPreview`:
  - `change_open?: number | null`
  - `change_15m?: number | null`
  - `change_4h?: number | null`
- Ensure existing `change_1m`, `change_5m`, `change_1h`, `change_close` support null

### 8. Add Filtering Stats Display (`apps/web/src/app/screener/page.tsx`)

- Add state for filter stats: `filterStats: Record<string, number> | null`
- Parse filter stats from API response
- Display stats in a collapsible section or info panel above the table
- Show breakdown: "X removed by price filter, Y removed by volume filter, etc."

### 9. Update Table Columns (`apps/web/src/features/screener/components/screener-table-columns.tsx`)

- Add columns for:
  - `change_open` (Change since open)
  - `change_15m` (Change 15m)
  - `change_4h` (Change 4h)
- Update formatters to handle `null` values (display "N/A" or "-")
- Ensure all change columns handle null gracefully

### 10. Add Change Metric Filters to Controls (`apps/web/src/features/screener/components/screener-controls.tsx`)

- Add filter options for new change metrics (optional, can be added later if needed)
- Ensure existing change filters work with all new metrics

## Implementation Notes

- **Null Handling**: All change metrics should return `null` when price data is unavailable, not `0.0`
- **Performance**: Batch historical price queries where possible to avoid N+1 queries
- **Backward Compatibility**: Existing `change_close`, `change_1m`, `change_5m`, `change_1h` should continue working
- **Today's Open**: Query first minute bar of the trading day or use market open price from MarketDataService
- **Filter Stats**: Should be optional in response to maintain backward compatibility
- **MarketDataService First**: All data queries should go through MarketDataService, not direct SQL

## Files to Modify

### Backend Core Services

1. `apps/server/app/services/market/market_data_service.py` - **EXTEND** MarketDataService:

   - Add `get_today_open_batch()` method to fetch today's open prices
   - Add `get_daily_ohlcv_batch()` method for optimized daily OHLCV queries
   - Add `get_latest_trades_batch()` method to fetch from `market_latest_trades` table
   - These methods should be the single source of truth for all ticker data

2. `apps/server/app/services/screener/screener_price_history.py` - Extend change calculations:

   - Add `change_15m` and `change_4h` calculations
   - Extend history retention to support 4-hour lookback
   - Add tracking for today's open price per ticker
   - Update `get_price_change()` to return `None` when data is insufficient

3. `apps/server/app/services/screener/screener_data_unified.py` - **REFACTOR** to use MarketDataService:

   - Replace direct SQL queries with MarketDataService method calls
   - Use `MarketDataService.get_daily_ohlcv_batch()` instead of direct SQL
   - Use `MarketDataService.get_latest_prices_batch()` for current prices
   - Use `MarketDataService.get_today_open_batch()` for today's open
   - Use `MarketDataService.get_bars_batch()` for 15m/4h historical queries
   - Keep only metrics queries (screener_metrics table) and RV calculations

4. `apps/server/app/services/screener/screener_compute.py` - Add filter stats tracking:

   - Create `FilterStats` class/dict to track filtering reasons
   - Track counts for each filter type (exchange, price, volume, RV, change, ETF, asset_type, market_cap)
   - Return stats in computation results

5. `apps/server/app/types.py` - Update type definitions:

   - Add new change fields to `ScreenerResult` (change_open, change_15m, change_4h, all nullable)
   - Update `ScreenerRunResult` to include `filter_stats?: Dict[str, int]`

6. `apps/server/app/routers/screening_criteria.py` - Include stats in response:
   - Pass filter stats from compute methods to response
   - Ensure `ScreenerRunResult` includes filter_stats

### Frontend

7. `apps/web/src/lib/types/market.ts` - Update frontend types:

   - Add `change_open`, `change_15m`, `change_4h` fields (all nullable)
   - Ensure existing change fields support null

8. `apps/web/src/app/screener/page.tsx` - Display filter stats:

   - Add state for `filterStats: Record<string, number> | null`
   - Parse filter stats from API response
   - Display stats in UI (collapsible section or info panel)

9. `apps/web/src/features/screener/components/screener-table-columns.tsx` - Add new columns:
   - Add columns for `change_open`, `change_15m`, `change_4h`
   - Update formatters to handle `null` values (display "N/A" or "-")
   - Ensure all change columns handle null gracefully

### Optional

10. `apps/web/src/features/screener/components/screener-controls.tsx` - Add change metric filters (optional, can be added later)

## Success Criteria

- All change metrics (close, open, 1m, 5m, 15m, 1h, 4h) are calculated and displayed
- Change metrics return `null` when price data is unavailable
- Filtering statistics are displayed showing breakdown of removed items
- All data queries go through MarketDataService (no direct SQL in screener_data_unified.py)
- Backward compatibility is maintained for existing change metrics
- Performance is maintained through efficient batch queries
