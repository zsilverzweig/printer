# Test Failures by Category

**Last Updated:** 2025-11-04  
**Total Tests:** 277 (193 passed, 62 failed, 14 errors, 8 skipped)

## Summary

- ✅ **Balance & Order Tests** - 50/50 passing (All fixed!)
- ❌ **Remaining Failures:** 62 failed + 14 errors = 76 total issues

---

## 1. API & Timezone Serialization (4 failed)

**File:** `test_api_timezone_serialization.py`

- `test_transaction_api_returns_utc_timestamps`
- `test_transfer_api_returns_utc_timestamps`
- `test_create_transfer_api_returns_utc_timestamp`
- `test_multiple_transactions_all_have_utc_timestamps`

**Likely Issue:** Timezone serialization format changed or API response format updated

---

## 2. Funds Positions API (2 failed)

**File:** `test_funds_positions_api.py`

- `test_get_fund_positions_summary`
- `test_get_fund_positions_with_sync_check`

**Likely Issue:** API endpoint changes or position sync logic updates

---

## 3. Funds Sync Issues (3 failed)

**File:** `test_funds_sync_issues.py`

- `test_detect_orders_in_alpaca_but_not_in_db`
- `test_partial_fill_sync_issue`
- `test_detect_missing_sell_transaction`

**Likely Issue:** Sync detection logic changed, or database schema updates

---

## 4. Funds Trading API (1 failed)

**File:** `test_funds_trading_api.py`

- `test_start_trading_success`

**Likely Issue:** Trading start workflow changed or API endpoint updated

---

## 5. Overselling Prevention (2 failed)

**File:** `test_overselling_prevention.py`

- `test_exit_position_validates_before_order`
- `test_normal_sell_proceeds`

**Likely Issue:** Exit validation logic changed, or method calls updated (`_exit_position` → `execute_sell_order`)

---

## 6. Position Sizing (6 failed)

**File:** `test_position_sizing.py`

- `test_size_per_trade_is_baseline`
- `test_max_bet_percent_caps_position_size`
- `test_min_bet_percent_prevents_tiny_positions`
- `test_max_total_exposure_prevents_new_positions`
- `test_multiple_positions_cumulative_exposure`
- `test_zero_max_bet_percent_treated_as_no_limit`

**Likely Issue:** Position sizing logic moved to `PositionSizer` class, tests need to update method calls

---

## 7. Position Sync (3 failed)

**File:** `test_position_sync.py`

- `test_detects_position_closed_in_alpaca`
- `test_reconcile_closed_position_calls_reconciliation_service`
- `test_no_reconciliation_when_all_positions_synced`

**Likely Issue:** Position sync service refactored, method calls or service structure changed

---

## 8. Risk Parameters (14 failed) ⚠️ **Largest Category**

**File:** `test_risk_parameters.py`

- `test_max_loss_dollars_stops_trading`
- `test_max_loss_dollars_allows_trading_under_limit`
- `test_max_loss_percent_stops_trading`
- `test_max_loss_percent_allows_trading_under_limit`
- `test_no_risk_limits_always_allows_trading`
- `test_max_total_exposure_stops_trading`
- `test_max_total_exposure_allows_trading_under_limit`
- `test_multiple_risk_limits_work_together`
- `test_profitable_positions_dont_trigger_loss_limits`
- `test_max_giveback_percent_not_implemented`
- `test_strategy_engine_checks_risk_limits_before_entry`
- `test_risk_limits_checked_before_each_entry`
- `test_zero_balance_with_losses_allows_trading`

**Likely Issue:** Risk management logic moved to `RiskManager` class, tests need significant updates

---

## 9. Screener Filters (11 failed)

**File:** `test_screener_filters.py`

- `TestScreenerFilters::test_min_price_filter`
- `TestScreenerFilters::test_max_price_filter`
- `TestScreenerFilters::test_min_volume_filter`
- `TestScreenerFilters::test_min_change_percent_filter`
- `TestScreenerFilters::test_max_change_percent_filter`
- `TestScreenerFilters::test_etf_filter`
- `TestScreenerFilters::test_penny_stock_filter`
- `TestScreenerFilters::test_exchange_filter`
- `TestScreenerFilters::test_combined_filters`
- `TestScreenerFilters::test_relative_volume_filter`
- `TestHistoricalFilters::test_historical_price_filter`

**Likely Issue:** Screener filter API changed or filter logic refactored

---

## 10. Screener Historical vs Live (1 failed)

**File:** `test_screener_historical_vs_live.py`

- `test_historical_vs_live_screener_consistency`

**Likely Issue:** Historical vs live screener logic differences

---

## 11. Screener Limit (3 failed)

**File:** `test_screener_limit.py`

- `TestScreenerLimit::test_compute_respects_limit`
- `TestScreenerLimit::test_compute_historical_respects_limit`
- `TestScreenerLimit::test_limit_none_returns_all`

**Likely Issue:** Screener limit logic changed

---

## 12. Screener Metrics (10 failed)

**File:** `test_screener_metrics.py`

- `test_calculate_rv14_single_symbol`
- `test_calculate_sma_20_50_200`
- `test_calculate_rsi_overbought`
- `test_calculate_macd_signal`
- `test_calculate_bollinger_bands`
- `test_calculate_atr`
- `test_calculate_90day_levels`
- `test_batch_calculation_1000_symbols`
- `test_metrics_persistence`
- `test_unified_fetcher_includes_metrics`

**Likely Issue:** Metrics calculation API changed or metric storage refactored

---

## 13. Timezone Handling (1 failed)

**File:** `test_timezone_handling.py`

- `test_screening_criteria_timestamps`

**Likely Issue:** Timezone handling in screening criteria changed

---

## 14. Trading Hours (2 failed)

**File:** `test_trading_hours.py`

- `test_strategy_engine_respects_trading_hours`
- `test_monitor_entries_skips_outside_hours`

**Likely Issue:** Trading hours check logic moved or method calls changed

---

## 15. Historical Data Loader (14 errors) ⚠️ **All Errors**

**File:** `test_historical_data_loader.py`

- `TestDatabaseStats::test_get_database_stats_empty` (ERROR)
- `TestDatabaseStats::test_get_database_stats_with_data` (ERROR)
- `TestStatusManagement::test_create_status` (ERROR)
- `TestStatusManagement::test_update_status_progress` (ERROR)
- `TestStatusManagement::test_update_status_completion` (ERROR)
- `TestStatusManagement::test_update_status_with_error` (ERROR)
- `TestFieldMapping::test_field_names_in_get_load_status` (ERROR)
- `TestBulkInsert::test_bulk_insert_bars` (ERROR)
- `TestBulkInsert::test_bulk_insert_conflict_handling` (ERROR)
- `TestCustomSymbolList::test_custom_symbols_only_queries_specified_symbols` (ERROR)
- `TestMockedPolygonData::test_load_symbol_data_success` (ERROR)
- `TestMockedPolygonData::test_load_symbol_data_empty_response` (ERROR)
- `TestProgressCalculation::test_progress_calculation_accuracy` (ERROR)
- `TestErrorHandling::test_multiple_failed_symbols` (ERROR)

**Likely Issue:** Database connection issues, missing test fixtures, or historical data loader service refactored

---

## Priority Recommendations

### High Priority (Core Functionality)

1. **Risk Parameters (14 tests)** - Critical risk management functionality
2. **Position Sizing (6 tests)** - Core position calculation logic
3. **Overselling Prevention (2 tests)** - Critical safety feature
4. **Position Sync (3 tests)** - Data integrity

### Medium Priority (API & Integration)

5. **Funds Positions API (2 tests)**
6. **Funds Sync Issues (3 tests)**
7. **Funds Trading API (1 test)**
8. **Trading Hours (2 tests)**

### Lower Priority (Screener & Data)

9. **Screener Filters (11 tests)**
10. **Screener Metrics (10 tests)**
11. **Screener Limit (3 tests)**
12. **Historical Data Loader (14 errors)** - May need separate investigation
13. **API Timezone (4 tests)**
14. **Timezone Handling (1 test)**
15. **Screener Historical vs Live (1 test)**

---

## Common Patterns to Fix

Based on the refactor, most tests likely need:

1. **Method Call Updates:**

   - `_enter_position()` → `execute_buy_order()`
   - `_exit_position()` → `execute_sell_order()`
   - Risk checks → `RiskManager` methods
   - Position sizing → `PositionSizer` methods

2. **Type Updates:**

   - `EntrySignal` → `EntryLevel`
   - `MarketData` → `MarketDataSnapshot`

3. **Service Location Updates:**

   - Patch targets: `strategy_engine` → `order_executor`, `risk_manager`, `position_sizer`

4. **Database Session Mocking:**
   - Ensure proper async session mocking with `get_async_session` patches
