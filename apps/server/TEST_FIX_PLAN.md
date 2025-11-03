# Test Fix Plan - Ensure No Lost Functionality

## Priority: Prove Refactor Preserves All Behavior

**Goal:** Get ALL existing tests passing to validate the refactor

**Current:** 169/257 passing (66%)
**Target:** 220+/257 passing (85%+)

## Tests That Need Fixing (By Priority)

### CRITICAL - Core Engine Tests (Must Pass)

#### 1. test_balance_tracking_bug.py (1/3 passing) ⚡
**Status:** In progress
**Fixes Needed:**
- ✅ Fixed type names (EntryLevel, MarketDataSnapshot)
- ✅ Fixed method calls (order_executor.execute_buy_order)
- ✅ Fixed patches (order_executor module)
- ❌ 2 tests still failing - need to debug why

#### 2. test_balance_validation.py (0/6 passing - ALL ERRORS) ⚡
**Status:** Not started
**Fixes Needed:**
- Fix EntrySignal → EntryLevel
- Fix ExitSignal → StopUpdate  
- Fix MarketData → MarketDataSnapshot
- Fix method calls
- Fix patches

#### 3. test_cash_management.py (0/5 passing) ⚡
**Status:** Not started
**Same fixes as balance_validation**

#### 4. test_order_lifecycle.py (0/7 passing) ⚡
**Status:** Not started
**Same fixes needed**

#### 5. test_order_management.py (3/10 passing) ⚡
**Status:** Partial
**Same fixes needed**

###6. test_overselling_prevention.py (5/9 passing) ⚡
**Status:** Partial
**Fixes Needed:**
- Update ExitSignal → StopUpdate
- Update method calls to order_executor

#### 7. test_partial_fills.py (0/6 passing) ⚡
**Status:** Not started
**Same fixes needed**

### IMPORTANT - Position/Fund Tests

#### 8. test_position_sizing.py (6/9 passing)
**Status:** Mostly working
**Fixes:** Minor - EntrySignal references

#### 9. test_fund_balance.py (9/12 passing)
**Status:** Mostly working  
**Fixes:** Minor - method call updates

#### 10. test_funds_positions_api.py (10/12 passing)
**Status:** Mostly working
**Fixes:** Minor

#### 11. test_funds_sync_issues.py (8/11 passing)
**Status:** Mostly working
**Fixes:** Minor

#### 12. test_position_sync.py (1/2 passing)
**Status:** Mostly working

#### 13. test_risk_parameters.py (4/6 passing)
**Status:** Mostly working

#### 14. test_trading_hours.py (5/6 passing)
**Status:** Mostly working

## Pattern for Fixing Tests

For each test file:

1. **Update imports:**
   ```python
   from app.strategies.base import EntryLevel, StopUpdate, MarketDataSnapshot
   ```

2. **Update type usage:**
   ```python
   # Old
   signal = EntrySignal(should_enter=True, entry_price=150.0, reason="test")
   market_data = MarketData(symbol="AAPL", price=150.0, ...)
   
   # New
   signal = EntryLevel(entry_price=150.0, stop_loss=147.0, confidence=1.0)
   market_data = MarketDataSnapshot(symbol="AAPL", price=150.0, ...)
   ```

3. **Update method calls:**
   ```python
   # Old
   await engine._enter_position(symbol, signal, market_data)
   await engine._exit_position(position, signal, market_data)
   
   # New
   await engine.order_executor.execute_buy_order(symbol, signal, market_data)
   await engine.order_executor.execute_sell_order(position, signal, market_data)
   ```

4. **Update patches:**
   ```python
   # Old
   with patch('app.services.strategies.strategy_engine.get_async_session'):
   
   # New (patch BOTH modules that use get_async_session)
   with patch('app.services.strategies.order_executor.get_async_session') as m1, \
        patch('app.services.strategies.strategy_service.get_async_session') as m2:
   ```

## Execution Plan

**Phase 1: Fix Core Engine Tests (1 hour)**
- test_balance_tracking_bug.py ✅ IN PROGRESS
- test_balance_validation.py
- test_cash_management.py
- test_order_lifecycle.py
- test_order_management.py
- test_overselling_prevention.py
- test_partial_fills.py

**Expected Result:** ~50+ more tests passing

**Phase 2: Fix Minor Issues (30 min)**
- test_position_sizing.py
- test_fund_balance.py
- test_funds_positions_api.py
- test_funds_sync_issues.py
- test_position_sync.py
- test_risk_parameters.py
- test_trading_hours.py

**Expected Result:** ~15+ more tests passing

**Total Expected:** 220+ tests passing (from 169)

## What This Proves

When all tests pass:
✅ Refactor preserved all balance validation logic
✅ Refactor preserved all order lifecycle logic
✅ Refactor preserved all position management
✅ Refactor preserved all cash management
✅ Refactor preserved all overselling prevention
✅ **NO FUNCTIONALITY LOST!**

## Implementation Strategy

Work file-by-file, test after each fix. Commit after each file passes.

Current priority: test_balance_tracking_bug.py (finish this file first)

