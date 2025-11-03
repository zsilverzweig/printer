# Test Analysis Report

**Test Run Date:** 2025-11-03  
**Total Tests:** 307  
**Passed:** 203 (66%)  
**Failed:** 88 (29%)  
**Errors:** 14 (5%)  
**Skipped:** 2 (<1%)

---

## Failure Categories

### 1. **Database Schema Issues - Missing `order_type` Field (38 failures)**

**Root Cause:** The `Order` model has a NOT NULL constraint on `order_type` field, but tests are not providing this value when creating orders.

**Affected Tests:**

- `test_api_timezone_serialization.py` (4 failures)

  - test_transaction_api_returns_utc_timestamps
  - test_transfer_api_returns_utc_timestamps
  - test_create_transfer_api_returns_utc_timestamp
  - test_multiple_transactions_all_have_utc_timestamps

- `test_balance_tracking_bug.py` (3 failures)

  - test_balance_not_reduced_until_order_fills
  - test_multiple_orders_exceed_balance
  - test_balance_tracking_with_stop_start

- `test_balance_validation.py` (2 failures)

  - test_sufficient_balance_allows_order
  - test_exact_balance_match_allows_order

- `test_cash_management.py` (5 failures)

  - test_pending_order_cost_uses_correct_prices
  - test_cash_validation_without_estimated_price
  - test_sufficient_balance_allows_order
  - test_multiple_pending_orders_different_prices
  - test_sell_orders_not_counted_in_pending_cost

- `test_fund_balance.py` (1 failure)

  - test_balance_check_before_alpaca_submission

- `test_order_lifecycle.py` (7 failures)

  - test_pending_order_prevents_new_order
  - test_multiple_pending_orders_all_counted
  - test_filled_order_counts_as_position
  - test_stale_order_cancellation
  - test_order_lifecycle_full_flow
  - test_rapid_strategy_ticks_dont_create_multiple_orders
  - test_cancelled_order_doesnt_count_as_active

- `test_order_management.py` (6 failures)

  - test_stale_orders_are_cancelled
  - test_monkey_darts_doesnt_place_multiple_orders
  - test_multiple_pending_orders_all_counted
  - test_rapid_ticks_dont_create_duplicates
  - test_filled_order_removes_from_pending
  - test_cancelled_order_removes_from_pending

- `test_overselling_prevention.py` (2 failures)

  - test_exit_position_validates_before_order
  - test_normal_sell_proceeds

- `test_position_sync.py` (8 failures)

  - test_position_sync_after_fund_restart
  - test_order_fills_while_fund_stopped
  - test_orphaned_order_no_alpaca_id
  - test_position_in_alpaca_but_no_transaction
  - test_concurrent_orders_before_pending_count_updates
  - test_stop_trading_with_pending_orders
  - test_partial_position_sale_tracking
  - test_complete_position_sale_removes_from_tracking

- `test_timezone_handling.py` (6 failures)
  - test_order_timestamps_timezone_naive
  - test_order_filled_at_timezone_conversion
  - test_transaction_timestamp_timezone_naive
  - test_transaction_timezone_aware_conversion
  - test_screening_criteria_timestamps
  - test_multiple_orders_different_timezones

**Fix:** Update the Order model default or add `order_type="market"` to all test Order creations.

---

### 2. **Module Import/AttributeError Issues (16 failures)**

**Root Cause:** Import path issues and missing module attributes.

**Affected Tests:**

- `test_failed_equal_highs_strategy.py` (1 failure)

  - test_should_enter_signals_on_failed_equal_highs

- `test_funds_positions_api.py` (2 failures)

  - test_get_fund_positions_summary
  - test_get_fund_positions_with_sync_check

- `test_funds_sync_issues.py` (3 failures)

  - test_detect_orders_in_alpaca_but_not_in_db
  - test_partial_fill_sync_issue
  - test_detect_missing_sell_transaction

- `test_gpt_candlestick_strategy.py` (12 failures)

  - test_should_enter_first_evaluation_stores_level
  - test_should_enter_price_crosses_level_triggers_entry
  - test_should_enter_invalid_gpt_response
  - test_should_enter_low_confidence
  - test_should_enter_no_setup
  - test_should_enter_gpt_exception
  - test_should_enter_respects_evaluation_interval
  - test_should_exit_stop_not_hit
  - test_should_exit_updates_stop_loss
  - test_should_exit_invalid_stop_update
  - test_should_exit_stop_update_exception
  - test_should_exit_no_stop_in_state

- `test_trading_hours.py` (2 failures)
  - test_strategy_engine_respects_trading_hours
  - test_monitor_entries_skips_outside_hours

**Error:** `AttributeError: module 'app.services' has no attribute 'strategy_engine'`

**Fix:** Check import paths - should be `from app.services.strategies.strategy_engine import ...`

---

### 3. **Screener Data Format Issues (20 failures)**

**Root Cause:** Tests expecting different data format from screener endpoints. Likely API response structure changed.

**Affected Tests:**

- `test_screener_filters.py` (11 failures)

  - test_min_price_filter
  - test_max_price_filter
  - test_min_volume_filter
  - test_min_change_percent_filter
  - test_max_change_percent_filter
  - test_etf_filter
  - test_penny_stock_filter
  - test_exchange_filter
  - test_combined_filters
  - test_relative_volume_filter
  - test_historical_price_filter

- `test_screener_historical_vs_live.py` (1 failure)

  - test_historical_vs_live_screener_consistency

- `test_screener_limit.py` (3 failures)

  - test_compute_respects_limit
  - test_compute_historical_respects_limit
  - test_limit_none_returns_all

- `test_screener_metrics.py` (8 failures)
  - test_calculate_rv14_single_symbol
  - test_calculate_sma_20_50_200
  - test_calculate_rsi_overbought
  - test_calculate_bollinger_bands
  - test_calculate_90day_levels
  - test_batch_calculation_1000_symbols
  - test_metrics_persistence
  - test_unified_fetcher_includes_metrics

**Error:** `KeyError` on expected response fields or `AssertionError` on data structure

**Fix:** Update test expectations to match new API response format or fix API to match expected format.

---

### 4. **Historical Data Loader Errors (14 errors)**

**Root Cause:** Missing model or database setup for historical data loader tests.

**Affected Tests:**

- `test_historical_data_loader.py` (14 errors across multiple test classes)
  - TestDatabaseStats (2 errors)
  - TestStatusManagement (4 errors)
  - TestFieldMapping (1 error)
  - TestBulkInsert (2 errors)
  - TestCustomSymbolList (1 error)
  - TestMockedPolygonData (2 errors)
  - TestProgressCalculation (1 error)
  - TestErrorHandling (1 error)

**Error:** Database connection or model setup issues in test environment

**Fix:** Ensure proper test database setup and model initialization for TimescaleDB tests.

---

### 5. **Transaction/Partial Fill Issues (1 failure)**

**Affected Tests:**

- `test_partial_fills.py`
  - test_partial_sell_incremental_fills

**Error:** `AssertionError` - transaction count mismatch

**Fix:** Review partial fill transaction logic.

---

## Summary by Priority

### 🔴 **HIGH PRIORITY** (Must fix first)

1. **Missing `order_type` field** (38 failures) - Single root cause affecting many tests
   - Action: Add `order_type` parameter to Order model or set default value

### 🟡 **MEDIUM PRIORITY**

2. **Module import issues** (16 failures) - Import path problems

   - Action: Fix import statements in affected test files

3. **Screener data format** (20 failures) - API contract mismatch
   - Action: Align test expectations with current API response format

### 🟢 **LOW PRIORITY**

4. **Historical data loader** (14 errors) - Test environment setup

   - Action: Fix test database configuration for historical loader tests

5. **Partial fill logic** (1 failure) - Edge case
   - Action: Review transaction creation logic for partial fills

---

## Test Coverage

Overall coverage: **32%**

**Best Coverage:**

- Models: ~93-100%
- Screener filters: 93%
- Strategies base: 82%

**Needs Improvement:**

- Realtime services: 8%
- Historical data loader: 11%
- Market data provider: 14%
- Trading services: 13-24%
- Routers: 22-61%

---

## Recommendations

1. **Immediate Action:** Fix the `order_type` constraint issue - this will resolve 38 test failures with minimal effort
2. **Code Quality:** Fix import paths to use correct module structure
3. **API Contract:** Document and align screener API response format
4. **Test Infrastructure:** Improve test database setup for TimescaleDB/historical data tests
5. **Coverage Goal:** Focus on increasing coverage in trading and market data services (currently <25%)

