# Monkey Darts Strategy - Testing Guide

## Overview

The "Monkey Throwing Darts" strategy is a simple random stock selection strategy designed to test the execution engine plumbing without complex entry/exit logic.

## Strategy Behavior

1. **Selection**: Randomly picks one stock from screener results
2. **Entry**: Buys immediately (no conditions)
3. **Hold**: Holds for exactly 1 minute (configurable)
4. **Exit**: Sells after hold time expires
5. **Repeat**: Picks another random stock and repeats

## Why This Strategy?

- **Simple**: No complex pattern detection or indicators
- **Fast**: 1-minute cycles for quick testing
- **Predictable**: Time-based exits are deterministic
- **Complete**: Tests the full entry → hold → exit cycle

## Configuration

```json
{
  "executionStrategyId": "monkey_darts",
  "executionConfig": {
    "hold_time_seconds": 60,
    "random_seed": 42 // Optional: for reproducible testing
  },
  "sizePerTrade": 1000,
  "maxBetPercent": 5.0
}
```

### Configuration Options

- `hold_time_seconds` (default: 60)

  - How long to hold each position
  - Range: 30-300 seconds
  - Recommended for testing: 60 (1 minute)

- `random_seed` (optional)
  - Set for reproducible random selection
  - Useful for debugging and testing
  - Leave blank for true randomness

## Running Tests

### 1. Unit Tests

```bash
cd apps/server
python test_monkey_darts.py
```

This test script validates:

- ✓ Strategy registration
- ✓ Strategy instantiation
- ✓ Candidate screening
- ✓ Random selection
- ✓ Entry signals
- ✓ Time-based exit signals
- ✓ Position sizing

### 2. Integration Test with Strategy Engine

```python
from app.services.strategy_factory import create_strategy_engine
from app.models.strategies import Fund, Strategy
import uuid

# Create test fund
fund = Fund(
    id=str(uuid.uuid4()),
    name="Monkey Test Fund",
    mode="sim",  # Paper trading
    balance=10000.0,
)

# Create strategy config
strategy = Strategy(
    id=str(uuid.uuid4()),
    fund_id=fund.id,
    execution_strategy_id="monkey_darts",
    execution_config={
        "hold_time_seconds": 60,
        "random_seed": 42,
    },
    max_loss_percent=5.0,
    max_loss_dollars=500.0,
    max_giveback_percent=50.0,
    size_per_trade=1000.0,
    min_bet_percent=1.0,
    max_bet_percent=5.0,
    max_total_exposure=5000.0,
    risk_reward_ratio=2.0,
)

# Create and start engine
engine = await create_strategy_engine(fund=fund, strategy=strategy)
await engine.start()

# Monitor for a few minutes, then stop
await asyncio.sleep(300)  # 5 minutes
await engine.stop()
```

## Expected Behavior

### Logs

You should see logs like:

```
[SIM] 🐵 Monkey threw dart at: AAPL
[SIM] 🐵 Monkey selecting: AAPL @ 150.25
[SIM] Entering position: AAPL @ 150.25 (reason: random_dart_throw)
[SIM] Position entered: AAPL, quantity: 6.66, size: $1000.00

... 60 seconds later ...

[SIM] 🐵 Monkey exit time! AAPL held for 60s, P&L: $5.32 (+0.79%)
[SIM] Exiting position: AAPL @ 151.05 (reason: time_limit_reached)
[SIM] Position exited: AAPL, P&L: $5.32

[SIM] 🐵 Monkey threw dart at: TSLA
[SIM] 🐵 Monkey selecting: TSLA @ 242.50
... cycle repeats ...
```

### Position Lifecycle

1. **No positions**: Engine picks random candidate
2. **Entry**: Buys immediately at market price
3. **Hold**: Monitors for 60 seconds
4. **Exit**: Sells at market price after 60s
5. **Repeat**: Back to step 1

### Position Tracking

- Only one position at a time (by design)
- Each position tracked in `position_contexts` table
- Full history of entries/exits
- P&L calculated for each trade

## Testing Checklist

### Basic Functionality

- [ ] Strategy registers successfully
- [ ] Can instantiate with config
- [ ] Screens candidates (filters out bad ones)
- [ ] Selects random candidates
- [ ] Generates entry signals
- [ ] Generates exit signals after hold time
- [ ] Calculates position sizes correctly

### Strategy Engine Integration

- [ ] Engine creates Alpaca service in correct mode (paper)
- [ ] Engine validates fund mode matches
- [ ] Engine loads screener candidates
- [ ] Engine calls random selection (not per-symbol monitoring)
- [ ] Engine enters position on signal
- [ ] Engine monitors position
- [ ] Engine exits after hold time
- [ ] Engine repeats cycle

### Database Operations

- [ ] Position saved to database on entry
- [ ] Position updated during hold
- [ ] Position closed on exit
- [ ] P&L recorded correctly

### Safety Checks

- [ ] Fund mode verified (sim)
- [ ] Alpaca service in paper mode
- [ ] Pre-trade verification passes
- [ ] Logs show [SIM] prefix

## Troubleshooting

### "Monkey Darts not registered"

- Check that `registry.py` imports `MonkeyDartsStrategy`
- Verify no import errors in `monkey_darts.py`
- Restart server to reload registry

### "No candidates available"

- Check screener is running and returning results
- Verify screener results have required fields (ticker, volume, price)
- Lower volume threshold if needed (currently 10,000)

### "Entry signal not generated"

- Monkey Darts always enters if called with a symbol
- Check that `should_enter()` is being called
- Verify market data is available

### "Exit not happening"

- Check system time is advancing correctly
- Verify `time_in_position_minutes()` calculation
- Ensure monitoring loop is running (5s interval)

## Performance Expectations

### Expected Metrics

- **Trade frequency**: ~1 trade per minute
- **Position count**: Always 0 or 1
- **Hold time**: Exactly 60 seconds (±5s for execution)
- **Win rate**: ~50% (random selection)
- **Average P&L**: Near $0 over time (random walk)

### Resource Usage

- Minimal CPU (no complex calculations)
- Minimal memory (one position at a time)
- Low API calls (only current price needed)

## Next Steps After Testing

Once Monkey Darts works correctly:

1. **Verify all components**:

   - ✓ Strategy registration
   - ✓ Market data provider
   - ✓ Position tracking
   - ✓ Database operations
   - ✓ Trade execution
   - ✓ Safety checks

2. **Test Bull Flag strategy**:

   - More complex entry conditions
   - Pattern detection logic
   - Multiple monitored symbols
   - Scaling in/out

3. **Build UI components**:

   - Strategy selector dropdown
   - Config editor based on schema
   - Position monitoring dashboard

4. **Add real trading**:
   - Test with real credentials
   - Verify mode isolation
   - Confirm safety checks work

## Safety Note

Even though this is a "test" strategy, it will execute real trades if:

- Fund mode is set to "real"
- Real trading credentials are configured
- Safety checks pass

**Always test with paper trading first!**

Set only paper trading credentials:

```bash
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret
# Leave these blank:
ALPACA_REAL_API_KEY=
ALPACA_REAL_SECRET_KEY=
```

## Fun Facts

- 🐵 Emoji logging for easy identification
- 🎲 Optional random seed for reproducibility
- ⏱️ Precise 1-minute timing
- 🔄 Infinite loop (until stopped)
- 📊 Tests all major engine components

The monkey doesn't care about fundamentals, technicals, or news. Pure chaos for testing purposes! 🎯
