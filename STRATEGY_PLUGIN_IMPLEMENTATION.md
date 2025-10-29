# Strategy Plugin System - Implementation Summary

## Overview

Implemented a code-based plugin architecture for trading strategies that allows complex execution logic like the Bull Flag pattern to be implemented as Python classes with full access to market data, indicators, news, and real-time triggers.

## ✅ Completed Backend Components

### 1. Database Models (`apps/server/app/models/strategies.py`)

Created comprehensive models for the strategy system:

- **Fund**: Trading account with balance and mode (sim/real)
- **ScreeningCriteria**: Reusable screening configurations (renamed from Setup)
- **Strategy**: Complete trading strategy referencing execution strategy and screening criteria
- **PositionContext**: Active position state tracking with strategy-specific state

### 2. Base Strategy Framework (`apps/server/app/strategies/`)

- **base.py**: Abstract `ExecutionStrategy` class defining the plugin interface
  - `screen()` - Filter candidates
  - `should_enter()` - Entry signal logic
  - `should_exit()` - Exit signal logic
  - `position_sizing()` - Calculate position size
  - `should_scale_in()` / `should_scale_out()` - Optional scaling
- Data structures: `MarketData`, `EntrySignal`, `ExitSignal`, `ScaleSignal`, `PositionContext`

### 3. Strategy Registry (`apps/server/app/strategies/registry.py`)

- Auto-discovery and registration of strategy plugins
- `get_strategy()` - Instantiate strategy by ID
- `list_strategies()` - List available strategies
- `get_strategy_metadata()` - Get strategy metadata and config schema

### 4. Bull Flag Strategy (`apps/server/app/strategies/bull_flag.py`)

Complete implementation of the Bull Flag pattern:

- **Entry**: 2-3 green candles → pullback (max 1/4 gains) → breakout + positive MACD
- **Exit**: Stop at flag low, time-based (1-3 min), take profit
- **Scaling Out**: 25% profit taking when profitable
- **Scaling In**: 2x size on repeat pattern with breakeven stop
- Configurable parameters: pullback ratio, candle counts, profit take %, timeouts

### 4b. Monkey Darts Strategy (`apps/server/app/strategies/monkey_darts.py`)

Simple random selection strategy for testing:

- **Entry**: Randomly picks one stock, buys immediately
- **Exit**: Time-based (1 minute default)
- **Purpose**: Test the execution engine plumbing without complex logic
- **Features**: Random candidate selection, configurable hold time, reproducible with seed
- Includes test script: `test_monkey_darts.py`
- Full testing guide: `MONKEY_DARTS_TESTING.md`

### 5. Market Data Provider (`apps/server/app/services/market_data_provider.py`)

Aggregates data from multiple sources:

- Real-time quotes from Alpaca/Polygon
- Historical bars for pattern detection
- Technical indicators (MACD, RSI)
- News sentiment (placeholder for integration)
- Float data (placeholder for integration)
- Real-time subscription support

### 6. Strategy Engine (`apps/server/app/services/strategy_engine.py`)

Orchestrates strategy execution:

- Load strategy configuration
- Monitor screener candidates
- Check entry/exit conditions
- Execute trades via Alpaca (ready, but commented out)
- Track position state in database
- Handle scaling in/out
- **Multi-layer safety verification** (see Trading Safety below)

### 7. API Endpoints (`apps/server/app/routers/strategies.py`)

- `GET /api/strategies` - List available execution strategies
- `GET /api/strategies/{id}` - Get strategy metadata & config schema
- `POST /api/strategies/{id}/validate` - Validate configuration
- Registered in main FastAPI app

### 8. Database Migration (`apps/server/alembic/versions/003_add_strategy_models.py`)

- Creates all strategy-related tables
- Adds foreign key constraints
- Creates indexes for common queries
- Updated alembic env.py to include all model metadata

### 9. Trading Safety System

**Multiple layers of protection to prevent accidental real trading:**

#### AlpacaService Updates (`apps/server/app/services/alpaca_service.py`)

- Supports both paper and real trading modes
- Separate credentials: `ALPACA_API_KEY` (paper) vs `ALPACA_REAL_API_KEY` (real)
- Account verification: Confirms account type matches expected mode
- Raises exceptions if mode mismatch detected

#### Strategy Engine Safety (`apps/server/app/services/strategy_engine.py`)

- Requires Fund object (not just ID) for mode verification
- Constructor validates fund.mode matches AlpacaService mode
- Pre-trade verification before EVERY trade execution
- Clear logging with mode prefix: `[SIM]` or `[REAL]`

#### Strategy Factory (`apps/server/app/services/strategy_factory.py`)

- Factory function: `create_strategy_engine(fund, strategy)`
- Automatically selects correct AlpacaService based on fund mode
- Validates credentials exist before proceeding
- Provides clear error messages

#### Safety Documentation (`apps/server/TRADING_SAFETY.md`)

- Complete documentation of all safety mechanisms
- Configuration examples and best practices
- Testing procedures and failure scenarios

**5 Layers of Protection:**

1. ✓ Separate credentials (paper vs real)
2. ✓ AlpacaService account verification
3. ✓ StrategyEngine constructor validation
4. ✓ Pre-trade runtime verification
5. ✓ Clear logging and visibility

## ✅ Completed Frontend Components

### 1. Type Definitions (`apps/web/src/features/finance/funds/types/index.ts`)

Updated types to support the new architecture:

- `ExecutionStrategy` - Execution strategy metadata
- `ScreeningCriteria` - Renamed from Setup
- Updated `Strategy` type with `executionStrategyId` and `executionConfig`
- Backward compatibility aliases maintained

### 2. Execution Strategy Service (`apps/web/src/features/finance/funds/services/execution-strategy-service.ts`)

- Fetch available execution strategies
- Get strategy details and schema
- Validate strategy configuration

## 🚧 Remaining Work

### Frontend Updates Needed

1. **Update Strategy Editor Component** (`apps/web/src/features/finance/funds/components/strategy-editor.tsx`)

   - Add dropdown to select ExecutionStrategy
   - Display strategy description and requirements
   - Dynamically render configuration form based on `configSchema`
   - Remove old AI prompt fields
   - Update to use `executionConfig` instead of separate fields

2. **Rename Setup Components** (for consistency)

   - `setup-selector.tsx` → `screening-criteria-selector.tsx`
   - `setup-editor.tsx` → `screening-criteria-editor.tsx`
   - Update `setup-service.ts` to use new API endpoints
   - Update all imports and references

3. **Update Fund Management Components**

   - Update fund detail view to show execution strategy name
   - Display strategy type and expected timeframe
   - Show configuration parameters

4. **Create Position Monitoring Dashboard** (future)
   - Real-time position tracking
   - P&L display
   - Strategy state visualization

### Backend Integration Tasks

1. **Connect to Real Screener**

   - Update `StrategyEngine._update_candidates()` to use actual screener service
   - Pass screener results to strategy.screen()

2. **Database Operations**

   - Implement `_save_position()` in StrategyEngine
   - Implement `_update_position()` in StrategyEngine
   - Implement `_close_position()` in StrategyEngine

3. **Alpaca Integration**

   - Uncomment trade execution calls in StrategyEngine
   - Add error handling for order failures
   - Add order status tracking

4. **Real-time Data Subscriptions**

   - Implement actual WebSocket subscriptions in MarketDataProvider
   - Connect to Polygon/Alpaca streaming

5. **News & Float Integration**
   - Connect `get_news_sentiment()` to existing news service
   - Connect `get_float_data()` to existing float scraper

## 🎯 How to Use the System

### 1. Create a New Execution Strategy

```python
# apps/server/app/strategies/my_strategy.py

from app.strategies.base import ExecutionStrategy, EntrySignal, ExitSignal
from typing import Dict, Any, List

class MyStrategy(ExecutionStrategy):
    @property
    def id(self) -> str:
        return "my_strategy"

    @property
    def name(self) -> str:
        return "My Trading Strategy"

    # Implement required methods...
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        # Your entry logic here
        pass
```

### 2. Register the Strategy

```python
# apps/server/app/strategies/registry.py

def _auto_register_strategies():
    # Add your strategy import
    from app.strategies.my_strategy import MyStrategy
    register_strategy(MyStrategy)
```

### 3. Use the Strategy in a Fund

1. Create a Fund
2. Create a Strategy referencing your execution strategy:

   - `execution_strategy_id`: "my_strategy"
   - `execution_config`: { /_ strategy-specific params _/ }
   - Configure risk parameters and position sizing

3. Start the StrategyEngine for that fund

## 📊 Architecture Diagram

```
Fund (1) → (1) Strategy
              ├── References: ExecutionStrategy (code plugin)
              ├── References: ScreeningCriteria (optional)
              ├── Risk Parameters
              └── Execution Config

ExecutionStrategy (code)
  ├── Bull Flag
  ├── Chart Analysis (future)
  └── Custom Strategies

StrategyEngine
  ├── Monitors Candidates
  ├── Checks Entry/Exit
  ├── Executes Trades
  └── Tracks Positions → PositionContext
```

## 🔧 Configuration Example

**Bull Flag Strategy Config:**

```json
{
  "executionStrategyId": "bull_flag",
  "executionConfig": {
    "pullback_ratio": 0.25,
    "min_green_candles": 2,
    "max_green_candles": 3,
    "profit_take_percent": 25,
    "scale_in_multiplier": 2.0,
    "max_timeout_minutes": 3
  },
  "maxLossPercent": 2.0,
  "sizePerTrade": 1000,
  "maxBetPercent": 5.0
}
```

## 🧪 Testing

### Quick Test: Monkey Darts Strategy

**Recommended starting point for testing the system:**

1. Run unit tests:

   ```bash
   cd apps/server
   python test_monkey_darts.py
   ```

2. Test API endpoints:

   ```bash
   # List available strategies (should include monkey_darts)
   curl http://localhost:8000/api/strategies

   # Get Monkey Darts details
   curl http://localhost:8000/api/strategies/monkey_darts
   ```

3. See full testing guide: `apps/server/MONKEY_DARTS_TESTING.md`

### Testing the Bull Flag Strategy

1. Run database migration: `python run_migrations.py`
2. Configure paper trading credentials in `env.local`:
   ```bash
   ALPACA_API_KEY=your_paper_key
   ALPACA_SECRET_KEY=your_paper_secret
   # Leave real trading credentials blank for safety
   ```
3. Start the server: `./start_server.sh`
4. Test API endpoints:
   - `http://localhost:8000/api/strategies` - List strategies
   - `http://localhost:8000/api/strategies/bull_flag` - Bull Flag details

### Testing Trading Safety

See `apps/server/TRADING_SAFETY.md` for comprehensive safety testing procedures.

## 🔄 Recent Updates

### Separation of Concerns Refactoring (✅ COMPLETE)

Refactored the architecture to achieve proper separation of concerns:

- **Base Class**: Added `get_monitored_symbols()` method (replaces `screen()`)
- **Strategies**: All business logic now in strategy classes
- **Engine**: Pure orchestration with no special cases
- **Result**: Generic engine works with any strategy pattern

See `apps/server/REFACTORING_COMPLETE.md` for full details.

**Key Changes:**

- Strategies decide which symbols to monitor via unified interface
- Engine has no pattern-specific logic (no more `hasattr()` checks)
- MonkeyDarts simplified (random selection in `get_monitored_symbols()`)
- BullFlag updated to use new interface
- All tests passing

## 📝 Next Steps

1. Complete frontend Strategy Editor updates
2. Connect to real screener service in StrategyEngine
3. Implement database operations in StrategyEngine
4. Test with paper trading account
5. Add more execution strategies (Chart Analysis, etc.)
6. Build position monitoring dashboard
7. Add backtesting capability

## 🎉 Key Benefits

- **Code-based**: Complex logic in Python, not JSON config
- **Reusable**: Multiple funds can use the same strategy
- **A/B Testing**: Easy to create variants and compare
- **Type-safe**: Full TypeScript/Python type safety
- **Extensible**: Simple plugin architecture for new strategies
- **State Tracking**: Full position context with strategy-specific state
- **Real-time**: Built for live trading with real-time data
- **Safe by Design**: 5 layers of protection against accidental real trading
- **Mode Isolation**: Paper and real trading completely separated
