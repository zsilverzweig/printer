# Separation of Concerns Refactoring Plan

## Problem Statement

Current architecture has business logic leaking between components:

- Screening logic in strategy (`monkey_darts.screen()` checks volume/price)
- Strategy-specific logic in engine (checks for `select_random_candidate()`)
- Unclear responsibility chain

## Proper Architecture

### 1. Screener/ScreeningCriteria

**Responsibility**: Find stocks meeting basic market criteria

**Examples:**

- Volume > X
- Price in range [Y, Z]
- Relative volume > N
- Market cap filters
- Exchange filters

**Output**: List of candidate stocks that meet ALL basic criteria

### 2. ExecutionStrategy

**Responsibility**: ALL trading decisions

**Methods:**

```python
# Which symbols should we actively monitor for entry?
get_monitored_symbols(candidates: List[Dict]) -> List[str]:
    # Bull Flag: Returns all candidates (we'll check pattern on each)
    # Monkey Darts: Returns ONE random pick (or empty if have position)

# Should we enter this symbol right now?
should_enter(symbol: str, market_data: MarketData) -> EntrySignal:
    # Bull Flag: Complex pattern detection
    # Monkey Darts: Always yes (already picked it)

# Should we exit this position?
should_exit(position: PositionContext, market_data: MarketData) -> ExitSignal:
    # Bull Flag: Stop loss, time-based, profit target
    # Monkey Darts: Time-based only
```

### 3. StrategyEngine

**Responsibility**: Pure orchestration (no business logic)

**Flow:**

```python
while running:
    # 1. Get screened candidates
    candidates = await screener.get_results()

    # 2. Ask strategy which symbols to monitor
    monitored = strategy.get_monitored_symbols(candidates)

    # 3. Check entries for monitored symbols
    for symbol in monitored:
        if symbol not in active_positions:
            market_data = await get_market_data(symbol)
            signal = await strategy.should_enter(symbol, market_data)
            if signal.should_enter:
                await execute_entry(symbol, signal)

    # 4. Check exits for active positions
    for symbol, position in active_positions.items():
        market_data = await get_market_data(symbol)
        signal = await strategy.should_exit(position, market_data)
        if signal.should_exit:
            await execute_exit(position, signal)
```

**Key**: No `if hasattr(strategy, 'select_random_candidate')` or other pattern-specific logic!

## Refactoring Steps

### Step 1: Update ExecutionStrategy Base Class

**Add new method:**

```python
@abstractmethod
async def get_monitored_symbols(
    self,
    candidates: List[Dict[str, Any]]
) -> List[str]:
    """
    Select which symbols to actively monitor for entry.

    Args:
        candidates: Screened candidates (already filtered by ScreeningCriteria)

    Returns:
        List of symbols to monitor (can be empty, one, or many)

    Examples:
        - Bull Flag: Returns all candidates (will check pattern on each)
        - Monkey Darts: Returns one random pick (or empty if have position)
        - Chart Analysis: Returns top N by volume/momentum
    """
    pass
```

**Remove `screen()` method** - it's redundant with ScreeningCriteria

### Step 2: Update BullFlagStrategy

**Before:**

```python
async def screen(self, candidates: List[Dict]) -> List[str]:
    # Filter candidates
    ...
    return filtered
```

**After:**

```python
async def get_monitored_symbols(self, candidates: List[Dict]) -> List[str]:
    """
    Monitor all candidates - we'll check pattern on each.

    Further filtering if needed (e.g., only stocks with positive momentum).
    """
    monitored = []
    for candidate in candidates:
        # Optional: additional strategy-specific filtering
        if candidate.get("change_close", 0) > 0:  # Uptrend
            monitored.append(candidate["ticker"])
    return monitored
```

### Step 3: Update MonkeyDartsStrategy

**Remove screening logic** (volume/price checks go to ScreeningCriteria)

**Before:**

```python
async def screen(self, candidates: List[Dict]) -> List[str]:
    filtered = []
    for candidate in candidates:
        volume = candidate.get("today_vol", 0)
        if volume < 10000:  # ❌ This is screening!
            continue
        price = candidate.get("price", 0)
        if price < 1.0:  # ❌ This is screening!
            continue
        filtered.append(symbol)
    return filtered

# Separate method for random selection
def select_random_candidate(self, candidates: List[str]) -> str:
    return random.choice(candidates)
```

**After:**

```python
async def get_monitored_symbols(self, candidates: List[Dict]) -> List[str]:
    """
    Random selection: pick ONE candidate if we have no positions.

    All volume/price filtering already done by ScreeningCriteria.
    """
    # Only pick if we don't have a position
    # (Engine will check this, but we can optimize here)
    if hasattr(self, '_has_active_position') and self._has_active_position:
        return []

    # Random pick from all candidates
    if not candidates:
        return []

    selected = random.choice(candidates)
    return [selected["ticker"]]

# No more separate select_random_candidate() method!
```

### Step 4: Simplify StrategyEngine

**Remove special-case logic:**

**Before:**

```python
async def _monitor_entries(self):
    if hasattr(self.execution_strategy, 'select_random_candidate'):
        # Special handling for random strategies ❌
        if len(self.active_positions) == 0:
            symbol = self.execution_strategy.select_random_candidate(...)
            ...
    else:
        # Traditional monitoring
        for symbol in self.monitored_symbols:
            ...
```

**After:**

```python
async def _monitor_entries(self):
    """Monitor entry conditions - unified approach for all strategies."""
    for symbol in self.monitored_symbols:
        # Skip if already have position
        if symbol in self.active_positions:
            continue

        try:
            market_data = await self.market_data_provider.build_market_data(symbol)
            entry_signal = await self.execution_strategy.should_enter(symbol, market_data)

            if entry_signal.should_enter:
                await self._enter_position(symbol, entry_signal, market_data)
        except Exception as e:
            logger.error(f"Error monitoring entry for {symbol}: {e}")
```

**Update monitoring loop:**

```python
async def _update_candidates(self):
    """Update list of monitored symbols."""
    try:
        # Get screener results (already filtered by ScreeningCriteria)
        screener_results = await self._get_screener_results()

        # Ask strategy which symbols to monitor
        self.monitored_symbols = await self.execution_strategy.get_monitored_symbols(
            screener_results
        )

        logger.debug(f"Monitoring {len(self.monitored_symbols)} symbols")
    except Exception as e:
        logger.error(f"Error updating candidates: {e}")
```

### Step 5: Update MonkeyDartsStrategy State Tracking

**Problem**: Strategy needs to know if it has active positions

**Solution**: Pass active position count to `get_monitored_symbols()`

**Update base class:**

```python
@abstractmethod
async def get_monitored_symbols(
    self,
    candidates: List[Dict[str, Any]],
    active_position_count: int = 0
) -> List[str]:
    """
    Select which symbols to actively monitor.

    Args:
        candidates: Screened candidates
        active_position_count: Number of currently active positions
    """
    pass
```

**MonkeyDarts implementation:**

```python
async def get_monitored_symbols(
    self,
    candidates: List[Dict],
    active_position_count: int = 0
) -> List[str]:
    """Only pick if we have no active positions."""
    if active_position_count > 0:
        return []  # Wait for current position to close

    if not candidates:
        return []

    # Pick random candidate
    selected = random.choice(candidates)
    logger.info(f"🐵 Monkey selecting: {selected['ticker']}")
    return [selected["ticker"]]
```

## Files to Modify

### Backend

1. `apps/server/app/strategies/base.py`

   - Add `get_monitored_symbols()` abstract method
   - Remove `screen()` method (optional to keep for backward compat)
   - Update `get_monitored_symbols()` signature with `active_position_count`

2. `apps/server/app/strategies/bull_flag.py`

   - Implement `get_monitored_symbols()`
   - Keep most logic in `should_enter()` (pattern detection)

3. `apps/server/app/strategies/monkey_darts.py`

   - Remove volume/price filtering from code
   - Implement `get_monitored_symbols()` with random selection
   - Remove `select_random_candidate()` method
   - Simplify `should_enter()` (always yes)

4. `apps/server/app/services/strategy_engine.py`

   - Remove `hasattr(strategy, 'select_random_candidate')` check
   - Update `_update_candidates()` to call `get_monitored_symbols()`
   - Simplify `_monitor_entries()` to unified approach
   - Pass `active_position_count` to `get_monitored_symbols()`

5. `apps/server/test_monkey_darts.py`
   - Update tests for new interface
   - Add test for `get_monitored_symbols()`

### Configuration

6. `apps/server/alembic/...` or admin UI
   - ScreeningCriteria should include volume/price filters
   - Example: `{"min_volume": 10000, "min_price": 1.0, "max_price": 500}`

## Benefits

✅ **Clear Separation**: Each component has ONE responsibility  
✅ **Engine is Generic**: Works with ANY strategy pattern  
✅ **Strategies are Self-Contained**: All logic in one place  
✅ **Testable**: Can test strategies in isolation  
✅ **Extensible**: New strategies don't require engine changes

## Migration Path

1. Add `get_monitored_symbols()` to base class (keep `screen()` for now)
2. Update both strategies to implement new method
3. Update engine to call new method (keep old path as fallback)
4. Test thoroughly
5. Remove old code paths and `screen()` method

## Example Usage After Refactoring

```python
# Bull Flag - monitors many symbols, complex entry logic
candidates = [
    {"ticker": "AAPL", "price": 150, "today_vol": 50000000, "change_close": 2.5},
    {"ticker": "TSLA", "price": 242, "today_vol": 30000000, "change_close": 1.8},
]

monitored = await bull_flag.get_monitored_symbols(candidates, active_position_count=0)
# Returns: ["AAPL", "TSLA"]

for symbol in monitored:
    signal = await bull_flag.should_enter(symbol, market_data)
    # Checks pattern on AAPL, then TSLA
```

```python
# Monkey Darts - picks one random, simple entry logic
monitored = await monkey_darts.get_monitored_symbols(candidates, active_position_count=0)
# Returns: ["TSLA"] (random pick)

signal = await monkey_darts.should_enter("TSLA", market_data)
# Always returns True (already selected it randomly)
```

Both strategies use the SAME engine code path!
