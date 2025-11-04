# Critical Features - What Tests Tell Us

## From test_balance_validation.py & test_cash_management.py

### Feature: Balance Validation BEFORE Order Placement

**What Tests Check:**

1. Orders are REJECTED if cost > available balance
2. Balance check happens BEFORE calling Alpaca API
3. Validation accounts for pending orders (reserved cash)
4. Fractional shares round correctly
5. Zero/negative balance prevents orders

**Does Our New Code Support This?**
✅ YES - `OrderExecutor.execute_buy_order()` calls `order_lifecycle.validate_buy_order()`
✅ This happens BEFORE Alpaca API call
✅ Uses row-level locking to prevent race conditions

**Location:** `apps/server/app/services/strategies/order_executor.py` lines ~148-175

## From test_order_lifecycle.py

### Feature: Pending Order Tracking

**What Tests Check:**

1. Pending orders prevent duplicate entries for same symbol
2. Multiple pending orders are tracked correctly
3. Filled orders transition to position
4. Stale orders get cancelled
5. Order status lifecycle management

**Does Our New Code Support This?**
✅ YES - `OrderExecutor.cancel_stale_orders()` exists
✅ Order validation checks pending orders
❓ UNCLEAR - Do we prevent duplicate pending orders?

**Need to Verify:**

- Does `execute_buy_order()` check for existing pending orders before placing?
- This was in old `_enter_position()` via validation

## From test_overselling_prevention.py

### Feature: Overselling Prevention

**What Tests Check:**

1. Can't sell more shares than owned (ledger quantity check)
2. Position quantity from transaction ledger is source of truth
3. Discrepancy between Alpaca and ledger handled safely
4. Sell orders validate against ledger BEFORE execution

**Does Our New Code Support This?**
✅ YES - `OrderExecutor.execute_sell_order()` checks ledger quantity
✅ Uses `get_position_quantity_from_transactions()`
✅ Handles discrepancies

**Location:** `apps/server/app/services/strategies/order_executor.py` lines ~336-369

## From test_partial_fills.py

### Feature: Partial Fill Handling

**What Tests Check:**

1. Partial fills create transactions for filled amount
2. Incremental fills create multiple transactions
3. Balance updates with each partial fill
4. No duplicate transactions if quantity unchanged

**Does Our New Code Support This?**
❓ UNCLEAR - This is handled by polling service, not engine
✅ Polling service should still work (unchanged)

## Critical Question: What Are We Missing?

Based on test analysis, our new code SHOULD support all features. The tests are failing because:

1. **Test API mismatch** - Tests call `engine._enter_position()` but should call `engine.order_executor.execute_buy_order()`
2. **Type signature changes** - Tests use `EntrySignal` but should use `EntryLevel` with stop_loss
3. **Patch locations** - Tests patch `strategy_engine.get_async_session` but should patch `order_executor.get_async_session`

##Action Plan

Instead of bulk sed changes, let me:

1. Pick ONE test file (test_balance_validation.py)
2. Manually fix it completely to use new API
3. Verify it passes AND tests the same features
4. Use that as a template for other files

This ensures we don't lose any functionality checks!
