# Strategy Engine Test Analysis

## Current Test Status

**Overall:** 169 PASSED / 80 FAILED / 8 SKIPPED / 20 ERRORS

### Engine-Related Test Files (20 files)

1. `test_balance_tracking_bug.py` - ❌ 0/3 passing
2. `test_balance_validation.py` - ❌ 0/6 passing (all ERRORS)
3. `test_cash_management.py` - ❌ 0/5 passing
4. `test_cash_position_bug.py` - ✅ 3/3 passing
5. `test_fund_balance.py` - ⚠️ 9/12 passing (3 failures)
6. `test_funds_crud_api.py` - ✅ 16/16 passing
7. `test_funds_money_api.py` - ✅ 8/8 passing
8. `test_funds_positions_api.py` - ⚠️ 10/12 passing (2 failures)
9. `test_funds_sync_issues.py` - ⚠️ 8/11 passing (3 failures)
10. `test_funds_trading_api.py` - ✅ 8/8 passing
11. `test_funds_utilities_api.py` - ✅ 2/2 passing
12. `test_order_lifecycle.py` - ❌ 0/7 passing
13. `test_order_management.py` - ❌ 3/10 passing (7 failures)
14. `test_overselling_prevention.py` - ⚠️ 5/9 passing (4 failures)
15. `test_partial_fills.py` - ❌ 0/6 passing
16. `test_position_sizing.py` - ⚠️ 6/9 passing (3 failures)
17. `test_position_sync.py` - ⚠️ 1/2 passing (1 failure)
18. `test_risk_parameters.py` - ⚠️ 4/6 passing (2 failures)
19. `test_trading_hours.py` - ⚠️ 5/6 passing (1 failure)
20. `test_strategy_recovery.py` - ⚠️ 1/8 passing (7 skipped - need real DB)

## Why Tests Are Failing

### Category 1: Old Type Names (Mechanical fixes needed)

**Issue:** Tests using old type names
- `EntrySignal` → need `EntryLevel`
- `ExitSignal` → need `StopUpdate`
- `MarketData` → need `MarketDataSnapshot`

**Affected Tests:**
- `test_balance_tracking_bug.py` (all 3 tests)
- `test_cash_management.py` (all 5 tests)
- `test_order_lifecycle.py` (all 7 tests)
- `test_partial_fills.py` (all 6 tests)

**Fix:** Simple find/replace in test files

### Category 2: Old Method Calls (Need refactor)

**Issue:** Tests calling old private methods
- `engine._enter_position()` → now `engine.order_executor.execute_buy_order()`
- `engine._exit_position()` → now `engine.order_executor.execute_sell_order()`
- `engine._monitor_entries()` → removed (new flow)
- `engine._monitor_exits()` → removed (new flow)

**Affected Tests:**
- `test_balance_tracking_bug.py`
- `test_cash_management.py`
- `test_order_lifecycle.py`
- `test_order_management.py`
- `test_overselling_prevention.py`

**Fix:** Update method calls to use new service architecture

### Category 3: Missing Fixtures (Setup issues)

**Issue:** test_balance_validation.py has setup errors
- MockStrategyEngine fixture doesn't match new __init__ signature
- Missing async_session in some fixtures

**Fix:** Update mock_strategy_engine fixture in conftest.py

## What Functionality the Tests Cover

### Critical Features Being Tested:

**1. Balance Validation** (test_balance_*.py, test_cash_*.py)
- ✅ Insufficient balance prevents orders
- ✅ Exact balance match allows order
- ✅ Fractional shares handled correctly
- ✅ Balance check happens BEFORE Alpaca submission
- ❌ Balance tracking across multiple orders
- ❌ Pending order cost calculation

**2. Order Lifecycle** (test_order_lifecycle.py, test_order_management.py)
- ❌ Pending orders prevent duplicate entries
- ❌ Multiple pending orders counted
- ❌ Filled orders counted as positions
- ✅ Stale order cancellation
- ❌ Order status transitions
- ❌ Rapid ticks don't create duplicates

**3. Position Management** (test_position_*.py, test_overselling_*.py)
- ✅ Position calculation from transactions
- ✅ Position calculation for multiple symbols
- ❌ Exit position validation
- ❌ Partial sell handling
- ❌ Position sync issues

**4. Partial Fills** (test_partial_fills.py)
- ❌ Partial fill creates transaction
- ❌ Incremental fills create multiple transactions
- ❌ Balance updates with each partial fill

## What We Might Have Missed

### 1. Entry Level Lifecycle

**Current Coverage:** ❓ Unknown
**Need Tests For:**
- Setting entry levels via `analyze_entry()`
- Persisting entry levels to DB
- Entry level triggering on price cross
- Entry level cleanup after trigger
- Multiple entry levels for different tickers
- Entry level recovery after restart

### 2. Stop Management Lifecycle

**Current Coverage:** ❓ Unknown
**Need Tests For:**
- Initial stop setting on position open
- Stop updates via `manage_position()`
- Stop persistence to DB
- Stop hit detection
- 50% profit protection override
- Stop recovery after restart

### 3. Service Integration

**Current Coverage:** ❓ None
**Need Tests For:**
- RiskManager: risk limit checks, trading hours
- OrderExecutor: buy/sell execution with services
- LevelMonitor: trigger detection
- ScreenerConnector: ticker filtering
- PositionSyncService: Alpaca syncing

### 4. Crash Recovery

**Current Coverage:** 7 tests (all skipped - need real DB)
**Need Tests For:**
- Restart with active entry levels
- Restart with open positions
- Level persistence across restarts
- Multi-fund state isolation

### 5. New Monitoring Loop

**Current Coverage:** ❓ None
**Need Tests For:**
- 5-phase monitoring loop execution
- Setup phase (optional)
- Entry analysis phase
- Entry trigger checking
- Stop management updates
- Stop trigger checking

## Recommended Test Plan

### Phase 1: Fix Existing Tests (Mechanical)

**Files to update (20 min):**
1. Replace `EntrySignal` → `EntryLevel` (all files)
2. Replace `ExitSignal` → `StopUpdate` (all files)
3. Replace `MarketData` → `MarketDataSnapshot` (all files)
4. Update method calls:
   - `_enter_position()` → `order_executor.execute_buy_order()`
   - `_exit_position()` → `order_executor.execute_sell_order()`

**Expected Result:** 150+ tests passing (current failures become passes)

### Phase 2: New Service Tests (Comprehensive)

**test_risk_manager.py** (NEW)
```python
- test_trading_hours_validation()
- test_daily_loss_limit_dollars()
- test_daily_loss_limit_percent()
- test_total_exposure_limit()
- test_profit_protection_50_percent()
- test_trading_mode_verification()
```

**test_order_executor.py** (NEW)
```python
- test_execute_buy_order_success()
- test_execute_buy_order_insufficient_balance()
- test_execute_sell_order_success()
- test_execute_sell_order_quantity_mismatch()
- test_cancel_pending_orders()
- test_cancel_stale_orders()
- test_orphaned_order_cleanup()
```

**test_level_monitor.py** (NEW)
```python
- test_check_entry_triggers()
- test_check_stop_triggers()
- test_update_position_management()
- test_profit_protection_overrides_strategy()
- test_force_exit_handling()
```

**test_screener_connector.py** (NEW)
```python
- test_get_screened_tickers()
- test_run_setup_phase()
- test_run_entry_analysis()
- test_apply_screening_filters()
```

**test_position_sync_service.py** (NEW)
```python
- test_refresh_positions_from_alpaca()
- test_reconcile_closed_position()
- test_get_fund_symbols()
- test_get_position_details()
- test_multi_fund_position_filtering()
```

**test_strategy_service.py** (NEW)
```python
- test_persist_entry_level()
- test_persist_management_state()
- test_get_active_entry_levels()
- test_get_active_exit_levels()
- test_check_entry_triggered()
- test_check_stop_hit()
- test_mark_triggered()
- test_deactivate_level()
- test_recover_fund_state()
```

**test_position_sizer.py** (NEW)
```python
- test_basic_sizing()
- test_confidence_multiplier()
- test_max_bet_percent_cap()
- test_min_bet_percent_floor()
- test_fractional_shares_truncated()
```

### Phase 3: Integration Tests

**test_level_based_flow.py** (NEW)
```python
- test_full_entry_lifecycle()
  - analyze_entry → persist → trigger → execute
- test_full_exit_lifecycle()
  - manage_position → persist stop → trigger → execute
- test_profit_protection_in_action()
- test_multi_position_management()
- test_crash_recovery_scenario()
```

**test_strategy_engine_integration.py** (NEW)
```python
- test_monitoring_loop_phases()
- test_setup_to_entry_flow()
- test_entry_to_exit_flow()
- test_multiple_tickers_concurrent()
- test_risk_limits_prevent_entries()
- test_outside_trading_hours()
```

### Phase 4: Strategy-Specific Tests

**test_gpt_five_guy.py** (NEW)
```python
- test_entry_analysis_interval_tracking()
- test_stop_management_interval_tracking()
- test_gpt_call_rate_limiting()
- test_confidence_threshold()
- test_candlestick_fetching()
```

**test_bull_flag.py** (NEW)
```python
- test_setup_phase_pattern_detection()
- test_entry_at_breakout()
- test_stop_to_breakeven_after_1min()
```

**test_monkey_darts.py** (NEW)
```python
- test_random_selection()
- test_simple_stop_management()
```

## Estimated Test Coverage Needed

**Current:** ~169 tests passing (mostly existing)
**After Phase 1:** ~220 tests (fix existing)
**After Phase 2:** ~280 tests (service tests)
**After Phase 3:** ~300 tests (integration)
**After Phase 4:** ~320 tests (strategy-specific)

## Priority Order

1. **CRITICAL - Fix existing tests** (Phase 1)
   - Get existing 80 failures passing
   - Validates refactor didn't break functionality
   
2. **HIGH - Service unit tests** (Phase 2)
   - Test each service in isolation
   - Catch edge cases

3. **MEDIUM - Integration tests** (Phase 3)
   - Test services working together
   - Validate full flow

4. **LOW - Strategy tests** (Phase 4)
   - Strategy-specific behavior
   - AI call validation

## What We Learned From Test Analysis

**Good News:**
- ✅ Fund CRUD fully working (16/16 tests)
- ✅ Fund trading API working (8/8 tests)
- ✅ Cash position tracking working (3/3 tests)
- ✅ MockExecutionStrategy updated to new interface

**Gaps Found:**
1. No tests for new service layer (RiskManager, OrderExecutor, etc.)
2. No tests for level-based flow (entry persistence, trigger detection)
3. No tests for profit protection logic
4. No crash recovery tests (skipped - need real DB)
5. Existing tests use old method names (mechanical fix)

**Functionality NOT Covered:**
- Entry level lifecycle (analyze → persist → trigger → execute)
- Stop management lifecycle (manage → persist → trigger → execute)
- Service coordination in monitoring loop
- 50% profit protection enforcement
- Multi-ticker concurrent management
- Rate limiting of AI calls

## Recommendation

Start with Phase 1 (fix existing tests) to validate the refactor, then systematically add Phase 2 (service tests) to build comprehensive coverage of the new architecture.

