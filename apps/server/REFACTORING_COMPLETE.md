# Separation of Concerns Refactoring - COMPLETE ✅

## Summary

Successfully refactored the strategy plugin system to achieve proper separation of concerns. The engine is now generic and strategies contain all business logic.

## What Changed

### 1. **ExecutionStrategy Base Class** (`base.py`)

**Removed:**

```python
async def screen(candidates) -> List[str]:
    """Filter candidates"""  # ❌ Conflated with ScreeningCriteria
```

**Added:**

```python
async def get_monitored_symbols(
    candidates: List[Dict],
    active_position_count: int = 0
) -> List[str]:
    """
    Select which symbols to monitor for entry.

    Strategy decides monitoring approach:
    - Bull Flag: Returns all (checks pattern on each)
    - Monkey Darts: Returns one random (or empty if have position)
    - Chart Analysis: Returns top N by criteria
    """
```

### 2. **BullFlagStrategy** (`bull_flag.py`)

**Before:**

```python
async def screen(candidates) -> List[str]:
    for candidate in candidates:
        # Filter by change, volume...
```

**After:**

```python
async def get_monitored_symbols(candidates, active_position_count=0) -> List[str]:
    # Still filters by change/volume (strategy-specific requirements)
    # But clearly separated from basic screening
    monitored = []
    for candidate in candidates:
        if candidate.get("change_close", 0) > 0:  # Strategy needs uptrend
            if candidate.get("rv14", 0) >= 1.5:    # Strategy needs volume
                monitored.append(symbol)
    return monitored
```

### 3. **MonkeyDartsStrategy** (`monkey_darts.py`)

**Before:**

```python
async def screen(candidates) -> List[str]:
    filtered = []
    for candidate in candidates:
        if volume < 10000:  # ❌ This is screening!
            continue
        if price < 1.0:     # ❌ This is screening!
            continue
        filtered.append(symbol)
    return filtered

def select_random_candidate(candidates: List[str]) -> str:
    # Separate method for engine to call
    return random.choice(candidates)
```

**After:**

```python
async def get_monitored_symbols(candidates, active_position_count=0) -> List[str]:
    """
    Random selection logic integrated into standard interface.

    Volume/price filtering should be in ScreeningCriteria.
    """
    if active_position_count > 0:
        return []  # Wait for position to close

    if not candidates:
        return []

    selected = random.choice(candidates)
    return [selected["ticker"]]

# ✅ No more select_random_candidate() method!
```

### 4. **StrategyEngine** (`strategy_engine.py`)

**Before:**

```python
async def _update_candidates():
    screener_results = []
    filtered = await strategy.screen(screener_results)  # ❌ Old method
    self.monitored_symbols = filtered[:50]

async def _monitor_entries():
    if hasattr(strategy, 'select_random_candidate'):  # ❌ Special case!
        # Special handling for random strategies
        symbol = strategy.select_random_candidate(...)
        ...
    else:
        # Traditional monitoring
        for symbol in self.monitored_symbols:
            ...
```

**After:**

```python
async def _update_candidates():
    """Generic approach - no special cases!"""
    screener_results = []

    # ✅ Unified interface
    self.monitored_symbols = await strategy.get_monitored_symbols(
        screener_results,
        active_position_count=len(self.active_positions)
    )

async def _monitor_entries():
    """Works for ALL strategies identically!"""
    for symbol in self.monitored_symbols:
        if symbol not in self.active_positions:
            market_data = await get_market_data(symbol)
            signal = await strategy.should_enter(symbol, market_data)
            if signal.should_enter:
                await execute_entry(symbol, signal)

    # ✅ No hasattr() checks, no special cases!
```

### 5. **Test Script** (`test_monkey_darts.py`)

Updated to test the new `get_monitored_symbols()` interface:

- Tests with 0 active positions (should return 1 symbol)
- Tests with 1 active position (should return empty)
- Tests multiple random selections

## Benefits Achieved

### ✅ Clear Separation of Concerns

| Component             | Responsibility                                   |
| --------------------- | ------------------------------------------------ |
| **ScreeningCriteria** | Basic market filters (volume, price, market cap) |
| **ExecutionStrategy** | ALL trading decisions (monitoring, entry, exit)  |
| **StrategyEngine**    | Pure orchestration (no business logic)           |

### ✅ Generic Engine

```python
# This code works for EVERY strategy pattern:
for symbol in monitored_symbols:
    signal = await strategy.should_enter(symbol, market_data)
    if signal.should_enter:
        await execute_entry(symbol, signal)
```

No `if hasattr()`, no pattern-specific logic!

### ✅ Self-Contained Strategies

Each strategy contains ALL its logic in one class:

- How to select symbols to monitor
- When to enter
- When to exit
- How to scale
- Position sizing

### ✅ Extensible Without Engine Changes

Adding new strategies (e.g., Chart Analysis, Momentum, Mean Reversion):

1. Implement `ExecutionStrategy` interface
2. Register in `registry.py`
3. Done! ✅

Engine doesn't need any changes.

## Architecture Diagram

### Before (❌)

```
Screener → Strategy.screen() → Engine (special cases) → Strategy.should_enter()
                                  ↓
                       if hasattr(strategy, "select_random_candidate")
```

### After (✅)

```
Screener → Strategy.get_monitored_symbols() → Engine (generic) → Strategy.should_enter()
                        ↓                           ↓
             ALL strategies use same interface    Same code path for ALL
```

## Testing

All tests pass with no linter errors:

- ✅ `base.py` - Updated interface
- ✅ `bull_flag.py` - Implements new method
- ✅ `monkey_darts.py` - Simplified, removed screening
- ✅ `strategy_engine.py` - Generic, no special cases
- ✅ `test_monkey_darts.py` - Tests new interface

Run tests:

```bash
cd apps/server
python test_monkey_darts.py
```

## Migration Notes

### For New Strategies

Implement `get_monitored_symbols()` instead of `screen()`:

```python
class MyStrategy(ExecutionStrategy):
    async def get_monitored_symbols(
        self,
        candidates: List[Dict],
        active_position_count: int = 0
    ) -> List[str]:
        """
        Decide which symbols to monitor.

        Examples:
        - Monitor all: return [c["ticker"] for c in candidates]
        - Monitor one: return [random.choice(candidates)["ticker"]]
        - Monitor top N: return sorted_by_criteria[:N]
        - Monitor none if have positions: return [] if active_position_count > 0
        """
        pass
```

### For ScreeningCriteria Configuration

Basic filters should be in ScreeningCriteria config:

```json
{
  "name": "Low Float High Volume",
  "criteria": {
    "min_volume": 10000,
    "min_price": 1.0,
    "max_price": 500.0,
    "min_relative_volume": 1.5,
    "max_float": 50000000
  }
}
```

Strategy-specific filters go in `get_monitored_symbols()`:

- Bull Flag needs uptrend: `change_close > 0`
- Momentum needs strength: `rsi > 60`
- etc.

## Code Quality Metrics

- **Cyclomatic Complexity**: Reduced (removed conditional logic from engine)
- **Coupling**: Reduced (strategies don't know about engine internals)
- **Cohesion**: Increased (each component has single responsibility)
- **Testability**: Improved (strategies fully testable in isolation)
- **Maintainability**: Improved (adding strategies doesn't touch engine)

## Next Steps

1. ✅ Refactoring complete
2. 🚧 Connect to real screener service
3. 🚧 Implement database operations
4. 🚧 Test with live paper trading
5. 🚧 Build frontend UI updates

## Files Modified

1. `apps/server/app/strategies/base.py`
2. `apps/server/app/strategies/bull_flag.py`
3. `apps/server/app/strategies/monkey_darts.py`
4. `apps/server/app/services/strategy_engine.py`
5. `apps/server/test_monkey_darts.py`

**Result**: Clean, maintainable architecture with proper separation of concerns! 🎉
