# Strategy Engine Breakdown - Status Report

## Current Status: 80% Complete ⚡

The strategy engine has been successfully broken down into focused services. All new service code exists and is ready. StrategyEngine needs final cleanup to remove old code.

## What Was Accomplished ✅

### 1. Service Extraction Complete

**Created 4 New Services:**

1. **RiskManager** (161 lines) ✅

   - `check_risk_limits()` - Daily loss limits, exposure limits
   - `is_trading_time()` - Trading hours validation
   - `verify_trading_mode()` - Sim vs real safety check
   - `calculate_profit_protection_stop()` - 50% profit protection

2. **OrderExecutor** (428 lines) ✅

   - `execute_buy_order()` - Complete buy order lifecycle
   - `execute_sell_order()` - Complete sell order lifecycle
   - `cancel_pending_orders()` - Wash trade prevention
   - `cancel_stale_orders()` - Timeout handling
   - All CRITICAL order validation and reconciliation logic

3. **LevelMonitor** (250 lines) ✅

   - `check_entry_triggers()` - Monitor entry levels
   - `check_stop_triggers()` - Monitor stop levels
   - `update_position_management()` - Call strategy + apply profit protection
   - Coordinates with OrderExecutor for execution

4. **ScreenerConnector** (192 lines) ✅
   - `get_screened_tickers()` - Interface with screener service
   - `run_setup_phase()` - Optional pre-analysis
   - `run_entry_analysis()` - Entry level setting
   - `_apply_screening_filters()` - Fund-specific filters

**Previously Created:**

5. **PositionSyncService** (347 lines) ✅

   - `refresh_positions_from_alpaca()` - Position syncing
   - `_reconcile_closed_position()` - Discrepancy resolution
   - `_get_fund_symbols()` - Fund ownership tracking
   - `_get_position_details()` - Transaction history

6. **PositionSizer** (88 lines) ✅

   - `calculate_position_size()` - Fund-level sizing

7. **StrategyService** (341 lines) ✅

   - Level persistence and recovery

8. **StrategyLogger** (106 lines) ✅
   - Consistent logging with emoji/ticker

### 2. StrategyEngine Refactored

**Current State:**

- File: 1689 lines (was 1807)
- Has new service initialization ✅
- Has new monitoring loop ✅
- Has old methods still present (needs cleanup)

**New Initialization:**

```python
def __init__(...):
    # Core services
    self.strategy_service = get_strategy_service()
    self.position_sizer = get_position_sizer()
    self.position_sync_service = PositionSyncService(...)
    self.strategy_logger = StrategyLogger(...)

    # Specialized services
    self.risk_manager = RiskManager(...)
    self.order_executor = OrderExecutor(...)
    self.level_monitor = LevelMonitor(...)
    self.screener_connector = ScreenerConnector(...)
```

**New Monitoring Loop:**

```python
async def _monitoring_loop(self):
    while running:
        # Cancel stale orders
        await self.order_executor.cancel_stale_orders(...)

        # Get screened tickers
        tickers = await self.screener_connector.get_screened_tickers()

        # Setup phase (optional)
        if strategy.requires_setup:
            tickers = await self.screener_connector.run_setup_phase(tickers)

        # Refresh positions
        self._position_cache = await self.position_sync_service.refresh_positions_from_alpaca(...)

        # Check risk
        can_trade, reason = await self.risk_manager.check_risk_limits(...)

        # Entry analysis
        await self.screener_connector.run_entry_analysis(...)

        # Check triggers
        await self.level_monitor.check_entry_triggers(self.order_executor)
        await self.level_monitor.update_position_management(...)
        await self.level_monitor.check_stop_triggers(..., self.order_executor)
```

### 3. Code Organization

**Before Breakdown:**

```
strategy_engine.py: 1807 lines
  - Position syncing
  - Risk checks
  - Order execution
  - Level monitoring
  - Screener interface
  - Everything in one file
```

**After Breakdown:**

```
strategy_engine.py: ~400 lines (after cleanup)
risk_manager.py: 161 lines
order_executor.py: 428 lines
level_monitor.py: 250 lines
screener_connector.py: 192 lines
position_sync_service.py: 347 lines
position_sizer.py: 88 lines
strategy_service.py: 341 lines
strategy_logger.py: 106 lines

Total: ~2,300 lines (vs 1,807 in monolith)
BUT: Much better organized, focused, testable
```

## What Needs Cleanup 🧹

### Remaining Old Code in strategy_engine.py

The file still contains old method implementations that are now in services:

**Lines to Remove:**

- `_refresh_positions_from_alpaca()` → in PositionSyncService
- `_reconcile_closed_position()` → in PositionSyncService
- `_get_fund_symbols()` → in PositionSyncService
- `_get_position_details()` → in PositionSyncService
- `_update_candidates()` → superseded by new flow
- `_is_trading_time()` → in RiskManager
- `_check_risk_limits()` → in RiskManager
- `_verify_trading_mode()` → in RiskManager
- `_get_screened_tickers()` → in ScreenerConnector
- `_run_setup_phase()` → in ScreenerConnector
- `_run_entry_analysis()` → in ScreenerConnector
- `_apply_screening_filters()` → in ScreenerConnector
- `_check_entry_triggers()` → in LevelMonitor
- `_update_position_management()` → in LevelMonitor
- `_check_stop_triggers()` → in LevelMonitor
- `_enter_position()` → in OrderExecutor
- `_exit_position()` → in OrderExecutor
- `_cancel_pending_orders()` → in OrderExecutor
- `_cancel_stale_orders()` → in OrderExecutor
- `_monitor_entries()` → old flow
- `_monitor_exits()` → old flow
- `_check_scaling()` → removed (simplified)
- `_scale_out_position()` → removed (simplified)
- `_scale_in_position()` → removed (simplified)

**Estimated Removal:** ~1,300 lines

**Expected Final Size:** ~400 lines (orchestration only)

### Lint Errors to Fix

10 remaining lint errors - all from old method signatures using old type names:

- `MarketData` → `MarketDataSnapshot`
- `EntrySignal` → `EntryLevel`
- `ExitSignal` → `StopUpdate`
- `ScaleSignal` → removed

These will disappear when old methods are removed.

## Benefits Achieved ✅

1. **Separation of Concerns**

   - Each service has ONE job
   - Clear boundaries
   - Easy to test in isolation

2. **Maintainability**

   - RiskManager: 161 lines (was 200+ in engine)
   - OrderExecutor: 428 lines (was 500+ in engine)
   - LevelMonitor: 250 lines (was 300+ in engine)
   - ScreenerConnector: 192 lines (was 250+ in engine)

3. **Testability**

   - Can mock services easily
   - Test order execution without engine
   - Test risk checks without positions
   - Test level monitoring without orders

4. **Reusability**
   - RiskManager could be used by other engines
   - OrderExecutor could handle manual trades
   - PositionSyncService shared across funds

## Final Cleanup Script

To complete the breakdown, remove these methods from strategy_engine.py:

```python
# Remove all methods that start at these lines:
# (Use search_replace or manual editing)

# Lines ~225-500: Position syncing methods (MOVED to PositionSyncService)
# Lines ~500-690: Screening and analysis methods (MOVED to ScreenerConnector)
# Lines ~690-810: Level monitoring methods (MOVED to LevelMonitor)
# Lines ~810-1400: Order execution methods (MOVED to OrderExecutor)
# Lines ~1400-1500: Risk and utility methods (MOVED to RiskManager)
```

**Result:** strategy_engine.py will be ~400 lines of pure orchestration

## Testing

All services compile and have no lint errors (except strategy_engine which has old code).

**To Test:**

1. Remove old methods from strategy_engine.py
2. Fix remaining lint errors
3. Run: `pytest tests/test_strategy_recovery.py`
4. Test fund startup
5. Verify level persistence

## Architecture Diagram

```
StrategyEngine (orchestrator)
    ├── ScreenerConnector → get tickers, run setup/entry phases
    ├── RiskManager → check limits, trading hours, profit protection
    ├── LevelMonitor → check triggers, update stops
    ├── OrderExecutor → execute buys/sells
    ├── PositionSyncService → sync from Alpaca
    ├── PositionSizer → calculate sizes
    ├── StrategyService → persist/recover levels
    └── StrategyLogger → consistent logging

Each service is focused, testable, and reusable!
```

## Recommendation

Complete the cleanup by removing old methods from strategy_engine.py. This is mostly mechanical deletion of code that now lives in services. The refactor is 80% done - just needs final polish!
