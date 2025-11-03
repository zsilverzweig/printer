# Strategy System Rebuild - Level-Based Architecture

## Overview

Completed rebuild of the strategy system with simplified level-based architecture. Strategies now declare price levels; engine executes when levels hit. All state persists to DB for crash recovery.

## What Was Implemented

### 1. Database Layer

**Files Created:**
- `alembic/versions/026_add_strategy_monitoring_state.py` - Table for persisting entry/exit levels
- `alembic/versions/027_add_fund_ticker_emoji.py` - Added ticker and emoji to Fund model
- `app/models/monitoring_state.py` - StrategyMonitoringState model

**Run Migrations:**
```bash
cd apps/server
python -m alembic upgrade head
```

### 2. Core Architecture

**Files Created:**
- `app/strategies/base.py` - New simplified 3-phase interface
  - `analyze_setup()` - Optional pre-analysis phase
  - `analyze_entry()` - Required: set entry levels
  - `manage_position()` - Required: update stops
  
**Key Data Classes:**
- `EntryLevel` - Entry price, stop loss, confidence
- `StopUpdate` - Current stop (raised to lock profits)
- `MarketDataSnapshot` - Rich market data with bars, indicators, metrics
- `PositionContext` - Position state

### 3. Supporting Services

**Files Created:**
- `app/services/strategies/strategy_service.py` - Persists/recovers levels
- `app/services/strategies/position_sizer.py` - Fund-level position sizing
- `app/lib/strategy_logger.py` - Consistent logging with [FUND] [SYMBOL] format

### 4. Strategies Rebuilt

**Files Created:**
- `app/strategies/gpt_5min.py` - GPT Five Guy (AI-powered scalping)
- `app/strategies/bull_flag.py` - Bull Flag pattern detection
- `app/strategies/monkey_darts.py` - Random testing strategy

**Old Strategies Archived:**
- Moved to `app/strategies/archived/` with `_old.py` suffix
- Can be referenced but not active

### 5. Strategy Engine Updates

**File Modified:** `app/services/strategies/strategy_engine.py`

**Added:**
- StrategyService integration
- PositionSizer integration  
- StrategyLogger with emoji/ticker support
- `_calculate_profit_protection_stop()` - Enforces 50% profit protection
- State recovery on startup

### 6. Fund Model Updates

**File Modified:** `app/models/strategies.py`

**Added Fields:**
- `ticker` - Display ticker (e.g., "5GUYS")
- `emoji` - Display emoji (e.g., "🍔")

## Key Simplifications

1. **No take_profit needed** - Strategies just manage stops
2. **Engine enforces 50% profit protection** - Automatically raises stops
3. **Single exit condition** - Stop hit (at loss or profit)
4. **Clearer lifecycle** - Setup → Entry → Management
5. **Ticker-based flow** - Each phase processes tickers

## Profit Protection Logic

```python
# Example: Entry $100, Current $120
profit = $120 - $100 = $20
protection_stop = $100 + ($20 * 0.5) = $110

# Strategy says: stop at $105
# Engine says: protection stop at $110
# Final stop: max($105, $110) = $110 (engine wins, protects more)
```

## Strategy Examples

### GPT Five Guy
- Analyzes multiple timeframes every 5 minutes
- Sets patient entry levels (can be below current price)
- Updates stops every 30 seconds
- Engine adds 50% profit protection

### Bull Flag
- Uses setup phase to detect patterns
- Sets entry at breakout level
- Moves stop to breakeven after 1 minute
- Engine adds 50% profit protection

### Monkey Darts
- Random selection for testing
- No setup phase
- Doesn't touch stops (engine does all work)

## Testing

Run tests:
```bash
cd apps/server
pytest tests/test_position_initialization.py -v
```

## Next Steps

1. Complete StrategyEngine refactor for full level-based flow
2. Add failed_equal_highs strategy with new interface
3. Create crash recovery integration tests
4. Update frontend to show emoji/ticker in fund UI
5. Add strategy configuration UI for new schemas

## Migration Notes

- Old strategies archived, not deleted
- Can re-enable old strategies by updating registry
- New strategies are backward compatible with existing Fund model
- Position sizing moved from strategies to Fund level
- All monitoring state survives restarts

## Usage

Creating a new strategy:
```python
class MyStrategy(ExecutionStrategy):
    @property
    def id(self) -> str:
        return "my_strategy"
    
    @property
    def name(self) -> str:
        return "My Strategy"
    
    @property
    def description(self) -> str:
        return "Does cool things"
    
    async def analyze_entry(self, ticker, market_data):
        # Your logic here
        return EntryLevel(
            entry_price=market_data.price,
            stop_loss=market_data.price * 0.98,
            confidence=0.8
        )
    
    async def manage_position(self, position, market_data):
        # Raise stop to lock profits
        return StopUpdate(
            current_stop=position.entry_price  # Breakeven
        )
```

Register in `app/strategies/registry.py`:
```python
try:
    from app.strategies.my_strategy import MyStrategy
    register_strategy(MyStrategy)
except ImportError as e:
    logger.warning(f"Failed to import MyStrategy: {e}")
```

## Architecture Benefits

1. **Crash Recovery** - All levels persisted to DB
2. **Simplified Strategies** - Just declare levels, engine handles execution
3. **Consistent Profit Protection** - 50% rule enforced by engine
4. **Clean Separation** - Strategy intelligence, engine execution
5. **AI-Friendly** - Easy to define strategies via AI agent generation
6. **Testable** - Each phase can be tested independently

