# Trading Safety Documentation

## Overview

The strategy plugin system includes multiple layers of safety checks to prevent accidental real trading with paper trading funds (and vice versa). This document explains all safety mechanisms and how to configure them properly.

## Fund Modes

Each fund has a `mode` field that determines which trading environment to use:

- **`sim` (Simulation)**: Uses Alpaca paper trading account
- **`real` (Real Trading)**: Uses Alpaca real trading account with real money

## Safety Mechanisms

### 1. Separate Credentials

Paper trading and real trading use **completely separate API credentials**:

```bash
# Paper trading (for mode="sim" funds)
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret

# Real trading (for mode="real" funds)
ALPACA_REAL_API_KEY=your_real_key
ALPACA_REAL_SECRET_KEY=your_real_secret
```

**Benefits:**

- Cannot accidentally use real trading credentials for paper trading
- Cannot accidentally use paper trading credentials for real trading
- Real trading can be disabled by simply not setting the credentials

### 2. AlpacaService Mode Verification

The `AlpacaService` constructor:

1. Takes an explicit `paper_trading` boolean parameter
2. Loads the appropriate credentials based on this parameter
3. Creates the Alpaca client with the correct mode
4. **Verifies the account type** by checking if the account number starts with 'P' (paper)
5. Raises an exception if the mode doesn't match expectations

```python
# Example: Creating paper trading service
alpaca = AlpacaService(paper_trading=True)  # Uses ALPACA_API_KEY
# Verifies account number starts with 'P'

# Example: Creating real trading service
alpaca = AlpacaService(paper_trading=False)  # Uses ALPACA_REAL_API_KEY
# Verifies account number does NOT start with 'P'
```

### 3. StrategyEngine Mode Validation

The `StrategyEngine` constructor:

1. Requires a `Fund` object (not just fund ID)
2. Compares `fund.mode` with `alpaca_service.paper_trading`
3. **Raises ValueError** if they don't match
4. Prevents engine creation if modes are incompatible

```python
# Example: This will succeed
fund = Fund(mode="sim", ...)
alpaca = AlpacaService(paper_trading=True)
engine = StrategyEngine(fund=fund, alpaca_service=alpaca, ...)  # ✓ OK

# Example: This will FAIL with ValueError
fund = Fund(mode="sim", ...)
alpaca = AlpacaService(paper_trading=False)
engine = StrategyEngine(fund=fund, alpaca_service=alpaca, ...)  # ✗ FAILS
```

### 4. Pre-Trade Verification

Before **every** trade execution (entry, exit, scale in, scale out), the engine calls `_verify_trading_mode()`:

```python
def _verify_trading_mode(self) -> None:
    """Verify fund mode still matches Alpaca service mode."""
    fund_is_paper = (self.fund.mode == "sim")
    if fund_is_paper != self.alpaca_service.paper_trading:
        error_msg = "CRITICAL: Trading mode mismatch detected!"
        logger.error(error_msg)
        raise RuntimeError(error_msg)
```

This catches any runtime changes and prevents execution.

### 5. Factory Function Safety

The `create_strategy_engine()` factory function:

1. Automatically creates the correct `AlpacaService` based on fund mode
2. Validates that credentials exist before proceeding
3. Provides clear error messages if credentials are missing

```python
from app.services.strategy_factory import create_strategy_engine

# Automatically handles mode selection
engine = await create_strategy_engine(fund=fund, strategy=strategy)
```

### 6. Logging and Visibility

Every trade action is logged with the fund mode prefix:

```
[SIM] Entering position: AAPL @ 150.25 (reason: bull_flag_breakout)
[REAL] Exiting position: TSLA @ 242.50 (reason: stop_loss)
```

This makes it immediately obvious which mode is being used.

## Configuration Examples

### Paper Trading Only (Recommended for Development)

```bash
# env.local
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret

# Leave real trading credentials empty
ALPACA_REAL_API_KEY=
ALPACA_REAL_SECRET_KEY=
```

With this configuration:

- ✓ Funds with `mode="sim"` will work
- ✗ Funds with `mode="real"` will fail with missing credentials error
- ✓ No risk of accidental real trading

### Both Paper and Real Trading

```bash
# env.local
ALPACA_API_KEY=your_paper_key
ALPACA_SECRET_KEY=your_paper_secret

ALPACA_REAL_API_KEY=your_real_key
ALPACA_REAL_SECRET_KEY=your_real_secret
```

With this configuration:

- ✓ Funds with `mode="sim"` use paper account
- ✓ Funds with `mode="real"` use real account
- ✓ Modes cannot be mixed due to safety checks

## Usage Examples

### Creating a Strategy Engine (Safe Way)

```python
from app.services.strategy_factory import create_strategy_engine, validate_fund_credentials
from app.models.strategies import Fund, Strategy

# 1. Load fund and strategy from database
fund = await get_fund_by_id(fund_id)
strategy = await get_strategy_by_fund_id(fund_id)

# 2. Validate credentials exist (optional but recommended)
if not validate_fund_credentials(fund):
    raise ValueError(f"No credentials configured for fund mode: {fund.mode}")

# 3. Create engine (automatic mode selection and validation)
engine = await create_strategy_engine(fund=fund, strategy=strategy)

# 4. Start trading
await engine.start()
```

### Manual Creation (Advanced)

```python
from app.services.alpaca_service import AlpacaService
from app.services.strategy_engine import StrategyEngine

# Explicit mode selection
is_paper = (fund.mode == "sim")
alpaca = AlpacaService(paper_trading=is_paper)

# Mode validation happens in constructor
engine = StrategyEngine(
    fund=fund,
    strategy_config=strategy,
    execution_strategy=execution_strategy,
    market_data_provider=market_data_provider,
    alpaca_service=alpaca,
)
```

## Testing Safety Mechanisms

### Test 1: Mode Mismatch Detection

```python
# This should raise ValueError
fund = Fund(mode="sim")
alpaca = AlpacaService(paper_trading=False)
try:
    engine = StrategyEngine(fund=fund, alpaca_service=alpaca, ...)
    assert False, "Should have raised ValueError"
except ValueError as e:
    assert "Fund mode mismatch" in str(e)
    print("✓ Mode mismatch detected correctly")
```

### Test 2: Account Verification

```python
# This should raise RuntimeError if account doesn't match
alpaca = AlpacaService(paper_trading=True)
# Internally verifies account number starts with 'P'
```

### Test 3: Missing Credentials

```python
# With ALPACA_REAL_API_KEY unset
fund = Fund(mode="real")
try:
    engine = await create_strategy_engine(fund=fund, strategy=strategy)
    assert False, "Should have raised RuntimeError"
except RuntimeError as e:
    assert "credentials not configured" in str(e)
    print("✓ Missing credentials detected correctly")
```

## Best Practices

### 1. Start with Paper Trading Only

- Only set `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`
- All funds should use `mode="sim"`
- Test thoroughly before considering real trading

### 2. Separate Environments

- Use different `.env` files for development and production
- Development: Paper trading only
- Production: Can enable real trading if needed

### 3. Explicit Mode Selection

- Always be explicit about fund mode when creating funds
- Never default to real trading
- Use the UI to clearly indicate fund mode

### 4. Monitor Logs

- Watch for `[SIM]` vs `[REAL]` prefixes in logs
- Set up alerts for any `[REAL]` trading activity
- Review trade logs regularly

### 5. Database Constraints

Consider adding database constraints to limit real trading:

```sql
-- Only allow sim mode in development
ALTER TABLE funds ADD CONSTRAINT check_mode
  CHECK (mode = 'sim');
```

## Failure Scenarios and Responses

### Scenario 1: Credentials Swapped

**What if someone accidentally swaps the credentials in .env?**

❌ **Blocked by**: AlpacaService account verification

- Service checks if account number matches expected mode
- Raises exception if paper account is used for real mode (or vice versa)

### Scenario 2: Fund Mode Changed During Execution

**What if fund.mode is changed in database while engine is running?**

❌ **Blocked by**: Pre-trade verification

- `_verify_trading_mode()` called before every trade
- Compares current fund mode with AlpacaService mode
- Raises exception and blocks trade if mismatch detected

### Scenario 3: Environment Variables Changed at Runtime

**What if .env is modified while server is running?**

✓ **Safe**: AlpacaService mode is set at initialization

- Changing .env doesn't affect running engines
- Requires server restart to take effect
- New engines use new configuration

### Scenario 4: Database Migration Error

**What if fund mode data gets corrupted?**

❌ **Blocked by**: Multiple validation layers

- StrategyEngine constructor validates mode
- Pre-trade verification checks mode
- Invalid modes cause immediate failure

## Summary

The system provides **5 layers of protection**:

1. ✓ Separate credentials (paper vs real)
2. ✓ AlpacaService account verification
3. ✓ StrategyEngine constructor validation
4. ✓ Pre-trade runtime verification
5. ✓ Clear logging and visibility

**Result**: It is virtually impossible to accidentally execute real trades with a simulation fund, or paper trades with a real fund.

## Questions?

If you're unsure about trading safety:

1. Start with paper trading only (don't set real credentials)
2. Use the factory function (`create_strategy_engine`)
3. Monitor logs carefully
4. Test thoroughly before enabling real trading
5. Consider additional safeguards specific to your use case

