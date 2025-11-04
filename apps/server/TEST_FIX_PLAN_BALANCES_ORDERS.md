# Test Fix Plan: Balance Validation & Order Placing

## Overview

After refactoring the strategy system, 35 tests related to balance validation and order placing are failing. **ALL THE CORE FEATURES ARE PRESERVED** in the new code - the tests just need API updates to use the new types and methods.

## Categories to Fix

### Category 1: Balance Validation Tests (18 tests)

- `test_balance_validation.py` (6 tests)
- `test_cash_management.py` (5 tests)
- `test_fund_balance.py` (3 of 12)

### Category 2: Order Lifecycle Tests (17 tests)

- `test_order_lifecycle.py` (7 tests)
- `test_order_management.py` (7 of 10)
- `test_partial_fills.py` (6 tests)

---

## Key Changes from Refactor

### 1. Type Updates

**OLD Types** → **NEW Types**

```python
# OLD (no longer exists)
from app.strategies.archived.base_old import EntrySignal, ExitSignal, MarketData

# NEW
from app.strategies.base import EntryLevel, StopUpdate, MarketDataSnapshot
```

**Detailed Mapping:**

| Old Type      | New Type             | Key Differences                    |
| ------------- | -------------------- | ---------------------------------- |
| `EntrySignal` | `EntryLevel`         | Added `stop_loss` field (required) |
| `ExitSignal`  | `StopUpdate`         | Renamed, same fields               |
| `MarketData`  | `MarketDataSnapshot` | Renamed, added optional fields     |

**Old EntrySignal:**

```python
EntrySignal(
    should_enter=True,
    entry_price=10.0,
    reason="test entry"
)
```

**New EntryLevel:**

```python
EntryLevel(
    entry_price=10.0,
    stop_loss=9.8,  # NOW REQUIRED
    confidence=1.0,
    order_type="market"
)
```

### 2. Method Updates

**OLD Methods** → **NEW Methods**

| Old Method                                            | New Method                                                                | Location        |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | --------------- |
| `engine._enter_position(symbol, signal, market_data)` | `engine.order_executor.execute_buy_order(symbol, signal, market_data)`    | `OrderExecutor` |
| `engine._exit_position(symbol, signal, market_data)`  | `engine.order_executor.execute_sell_order(position, signal, market_data)` | `OrderExecutor` |
| `engine._cancel_stale_orders()`                       | `engine.order_executor.cancel_stale_orders(max_age, pending_orders)`      | `OrderExecutor` |

### 3. Return Value Changes

| Method               | Old Return    | New Return               |
| -------------------- | ------------- | ------------------------ |
| `execute_buy_order`  | None / raises | `bool` (True on success) |
| `execute_sell_order` | None / raises | `bool` (True on success) |

---

## Fix Patterns

### Pattern 1: Update Type Imports

**Before:**

```python
from app.strategies.archived.base_old import EntrySignal, MarketData
```

**After:**

```python
from app.strategies.base import EntryLevel, MarketDataSnapshot
```

### Pattern 2: Update Type Construction

**Before:**

```python
entry_signal = EntrySignal(
    should_enter=True,
    entry_price=10.0,
    reason="Test entry"
)

market_data = MarketData(
    symbol="TEST",
    price=10.0,
    timestamp=datetime.utcnow(),
    volume=1000000,
)
```

**After:**

```python
entry_signal = EntryLevel(
    entry_price=10.0,
    stop_loss=9.8,  # Add stop_loss
    confidence=1.0,
    order_type="market"
)

market_data = MarketDataSnapshot(
    symbol="TEST",
    price=10.0,
    timestamp=datetime.utcnow(),
)
```

### Pattern 3: Update Method Calls

**Before:**

```python
await engine._enter_position("TEST", entry_signal, market_data)
```

**After:**

```python
result = await engine.order_executor.execute_buy_order("TEST", entry_signal, market_data)
# result is now a bool - True if order placed, False if rejected
```

### Pattern 4: Update Mock Patches

**Before:**

```python
@patch('app.services.strategies.strategy_engine.get_async_session')
async def test_something(mock_get_session):
    # ...
```

**After:**

```python
@patch('app.services.strategies.order_executor.get_async_session')
async def test_something(mock_get_session):
    # Note: patch location changed to order_executor
    # ...
```

---

## Detailed Fix Instructions

### Category 1: test_balance_validation.py (6 tests)

**Issues:**

1. Lines 346, 401: Uses old `EntrySignal` type (should be `EntryLevel`)
2. Missing `stop_loss` field in signal construction

**Fix Steps:**

1. **Update imports** (top of file):

```python
# Change from:
# from app.strategies.archived.base_old import EntrySignal

# To:
from app.strategies.base import (
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
```

2. **Update all EntrySignal → EntryLevel** (lines 346, 401):

```python
# OLD:
entry_signal = EntrySignal(
    should_enter=True,
    entry_price=17.50,
    reason="Test entry",
)

# NEW:
entry_signal = EntryLevel(
    entry_price=17.50,
    stop_loss=17.00,  # Add appropriate stop
    confidence=1.0,
    order_type="market"
)
```

3. **Update method calls** - Already correct! Tests use:

```python
await engine.order_executor.execute_buy_order("TEST", entry_signal, market_data)
```

4. **Update assertions** - Check return value:

```python
# These tests expect False return when balance insufficient
result = await engine.order_executor.execute_buy_order("TEST", entry_signal, market_data)
assert result == False, "Should return False for insufficient balance"
```

**Files to modify:**

- Line 346: `test_fractional_share_cost_rounds_down`
- Line 401: `test_zero_balance_prevents_all_orders`

---

### Category 2: test_cash_management.py (5 tests)

**Issues:**

1. Uses old `EntrySignal` and `MarketData` types
2. Calls old `_enter_position` method
3. Wrong patch location for `get_async_session`

**Fix Steps:**

1. **Update imports**:

```python
from app.strategies.base import EntryLevel, MarketDataSnapshot
```

2. **Update all signal/data construction** (multiple locations):

```python
# OLD:
entry_signal = EntrySignal(
    should_enter=True,
    entry_price=100.0,
    reason="test_entry"
)

market_data = MarketData(
    symbol="GOOGL",
    price=100.0,
    timestamp=datetime.utcnow(),
    volume=1000000,
)

# NEW:
entry_signal = EntryLevel(
    entry_price=100.0,
    stop_loss=95.0,  # Add appropriate stop
    confidence=1.0,
    order_type="market"
)

market_data = MarketDataSnapshot(
    symbol="GOOGL",
    price=100.0,
    timestamp=datetime.utcnow(),
)
```

3. **Update method calls**:

```python
# OLD:
with patch('app.services.strategies.strategy_engine.get_async_session') as mock_get_session:
    mock_get_session.return_value.__aenter__.return_value = async_session
    await engine._enter_position("GOOGL", entry_signal, market_data)

# NEW:
with patch('app.services.strategies.order_executor.get_async_session') as mock_get_session:
    mock_get_session.return_value.__aenter__.return_value = async_session
    result = await engine.order_executor.execute_buy_order("GOOGL", entry_signal, market_data)
```

4. **Update assertions** - Orders that should fail return False:

```python
# Order should be blocked - check return value
assert result == False, "Should return False when insufficient balance"

# Or verify order NOT created in DB
from sqlalchemy import select
stmt = select(Order).where(
    Order.fund_id == fund.id,
    Order.symbol == "GOOGL"
)
result = await async_session.execute(stmt)
orders = result.scalars().all()
assert len(orders) == 0, "Should not create order when insufficient balance"
```

**Tests to fix:**

- `test_pending_order_cost_uses_correct_prices` (line 26)
- `test_cash_validation_without_estimated_price` (line 125)
- `test_sufficient_balance_allows_order` (line 215)
- `test_multiple_pending_orders_different_prices` (line 301)
- `test_sell_orders_not_counted_in_pending_cost` (line 409)

---

### Category 3: test_order_lifecycle.py (7 tests)

**Issues:**

1. Uses direct DB access instead of engine methods
2. Needs to properly test the flow through engine

**Fix Steps:**

1. **Keep imports as-is** - Already using new types!

```python
from app.strategies.base import PositionContext, EntryLevel, MarketDataSnapshot
```

2. **Tests look mostly correct** - They're testing engine methods like:

```python
pending_orders = await engine.get_pending_orders()
active_positions = await engine.get_active_positions()
```

3. **Main issue: Mock the execution strategy** properly:

```python
@pytest.fixture
def mock_execution_strategy():
    """Create a mock execution strategy."""
    strategy = AsyncMock()

    # The strategy needs to respect pending orders
    async def get_monitored_symbols(candidates, active_position_count=0, active_order_count=0):
        # Don't select new symbols if we have pending orders or positions
        if active_order_count > 0 or active_position_count > 0:
            return []
        return [c["ticker"] for c in candidates]

    strategy.get_monitored_symbols = AsyncMock(side_effect=get_monitored_symbols)
    return strategy
```

4. **Test for stale order cancellation** needs update:

```python
# OLD:
await engine._cancel_stale_orders()

# NEW:
pending_orders = await engine.get_pending_orders()
max_age = fund.max_order_age_seconds or 60
await engine.order_executor.cancel_stale_orders(max_age, pending_orders)
```

**Tests to review:**

- All 7 tests in this file
- Most should work with minor tweaks to mocking

---

### Category 4: test_order_management.py (7 of 10 failing)

Similar fixes to `test_order_lifecycle.py`:

1. Update type imports
2. Update method calls from `_enter_position` → `execute_buy_order`
3. Update patches to `order_executor` module

---

### Category 5: test_partial_fills.py (6 tests)

**Issues:**

1. Tests the order polling/fill detection system
2. Needs to simulate Alpaca responses

**Fix Steps:**

1. **Update type imports** (already done?)

2. **Create orders through proper flow**:

```python
# Place order via engine
entry_signal = EntryLevel(
    entry_price=100.0,
    stop_loss=95.0,
    confidence=1.0,
    order_type="market"
)
market_data = MarketDataSnapshot(
    symbol="TEST",
    price=100.0,
    timestamp=datetime.utcnow()
)

result = await engine.order_executor.execute_buy_order("TEST", entry_signal, market_data)
assert result == True, "Order should be placed"
```

3. **Simulate partial fills**:

```python
# Get the order from DB
async with get_async_session() as session:
    stmt = select(Order).where(Order.fund_id == fund.id, Order.symbol == "TEST")
    result = await session.execute(stmt)
    order = result.scalar_one()

    # Update to partially filled
    order.filled_qty = 5.0  # Out of 10
    order.filled_avg_price = 100.5
    await session.commit()
```

---

## Testing Strategy

### Phase 1: Fix Mechanically (Easy wins - 50 tests)

1. Update type imports
2. Update type construction
3. Update method calls
4. Update assertions

### Phase 2: Fix Mock Patterns (Medium - 13 tests)

1. Update `get_async_session` patches
2. Update Alpaca service mocks
3. Update strategy mocks

### Phase 3: Integration Validation (Hard)

1. Run full test suite
2. Verify features work end-to-end
3. Check for any edge cases

---

## Verification Checklist

After fixing each test category:

- [ ] **Balance Validation**

  - [ ] Insufficient balance prevents orders ✓
  - [ ] Sufficient balance allows orders ✓
  - [ ] Pending orders reduce available balance ✓
  - [ ] Zero/negative balance handled ✓

- [ ] **Order Lifecycle**

  - [ ] Pending orders tracked ✓
  - [ ] Filled orders create positions ✓
  - [ ] Cancelled orders freed ✓
  - [ ] Stale orders cancelled ✓
  - [ ] No duplicate orders ✓

- [ ] **Cash Management**
  - [ ] Per-symbol price tracking ✓
  - [ ] Multiple pending orders ✓
  - [ ] Sell orders don't reserve cash ✓

---

## Key Files Reference

### Core Services

- `app/services/strategies/order_executor.py` - Order execution
- `app/services/trading/order_lifecycle.py` - Balance validation
- `app/services/strategies/strategy_engine.py` - Main engine
- `app/strategies/base.py` - Type definitions

### Test Files to Fix

- `apps/server/tests/test_balance_validation.py`
- `apps/server/tests/test_cash_management.py`
- `apps/server/tests/test_fund_balance.py`
- `apps/server/tests/test_order_lifecycle.py`
- `apps/server/tests/test_order_management.py`
- `apps/server/tests/test_partial_fills.py`

---

## Success Criteria

✅ All 35 tests pass
✅ No regressions in working tests
✅ Features verified through tests:

- Balance validation before orders
- Pending order tracking
- Order lifecycle management
- No duplicate orders
- Stale order cancellation

---

## Next Steps

1. Start with `test_balance_validation.py` (6 tests) - simplest fixes
2. Move to `test_cash_management.py` (5 tests) - similar pattern
3. Tackle `test_order_lifecycle.py` (7 tests) - more complex
4. Continue with remaining test files
5. Run full test suite to verify no regressions

**Estimate:** 2-3 hours of mechanical fixes + 1 hour validation = ~4 hours total
