# Real-time Entry/Exit Monitoring with WebSocket Trades

## Current State

- Entry levels are checked via polling every 5 seconds using REST API calls (`build_market_data()`)
- No WebSocket trade subscriptions for entry/exit monitoring
- Realtime router supports `A.{symbol}` (second bars) and `AM.{symbol}` (minute bars) but not `T.{symbol}` (trades)
- Level monitor uses `check_entry_triggers()` which polls database and REST API

## Changes Required

### 1. Add Trade WebSocket Support to Realtime Router

**File**: `apps/server/app/routers/realtime.py`

- Add `T.{symbol}` subscription support alongside existing `A.{symbol}` and `AM.{symbol}`
- Track trade subscriptions separately from bar subscriptions
- Route trade messages to appropriate handlers

### 2. Create Trade Monitoring Service

**New File**: `apps/server/app/services/strategies/trade_monitor.py`

- Manages WebSocket trade subscriptions for entry/exit monitoring
- Tracks active subscriptions per symbol (entry levels + open positions)
- Processes incoming trade messages to check if entry price or stop loss is hit
- Integrates with existing `LevelMonitor` and `OrderExecutor`

### 3. Update Strategy Service

**File**: `apps/server/app/services/strategies/strategy_service.py`

- When `persist_entry_level()` is called, trigger trade subscription
- When `persist_management_state()` is called for new positions, trigger trade subscription
- When levels are deactivated, unsubscribe from trades

### 4. Update Level Monitor

**File**: `apps/server/app/services/strategies/level_monitor.py`

- Remove polling-based entry trigger checking (or make it backup)
- Integrate with trade monitor for real-time trade-based trigger detection
- Process trade callbacks immediately instead of waiting for polling cycle

### 5. Update Strategy Engine

**File**: `apps/server/app/services/strategies/strategy_engine.py`

- Initialize trade monitor service
- Pass trade monitor to level monitor
- Ensure trade subscriptions are cleaned up on engine stop

### 6. Update Screener Connector

**File**: `apps/server/app/services/strategies/screener_connector.py`

- When entry level is persisted, trigger trade subscription setup
- No changes to entry analysis logic itself (still no waiting for holds)

## Implementation Details

### Trade Subscription Lifecycle

1. **Entry Level Created**: Subscribe to `T.{symbol}` immediately
2. **Position Opened**: Subscribe to `T.{symbol}` for stop loss monitoring (if not already subscribed)
3. **Entry Triggered**: Keep subscription for stop loss monitoring
4. **Position Closed**: Unsubscribe from `T.{symbol}`
5. **Entry Level Cancelled**: Unsubscribe if no position exists

### Trade Message Processing

- Parse Polygon trade messages (`ev: "T"` or `event_type: "trade"`)
- Check if trade price hits entry price (for limit orders) or crosses entry (for market orders)
- Check if trade price hits stop loss
- Execute orders immediately when conditions met (no polling delay)

### Backward Compatibility

- Keep polling as fallback if WebSocket unavailable
- Support both trade-based and bar-based monitoring
- Ensure backtesting continues to work (no WebSocket in backtest mode)

## Testing Considerations

- Verify trade subscriptions are created when entry levels persist
- Verify trades trigger orders immediately (no 5-second delay)
- Verify stop loss hits are detected in real-time
- Verify subscriptions are cleaned up properly
- Test with multiple symbols simultaneously

## To-dos

- [ ] Add T.{symbol} trade subscription support to realtime router alongside A.{symbol} and AM.{symbol}
- [ ] Create trade_monitor.py service to manage WebSocket trade subscriptions and process trade messages for entry/exit detection
- [ ] Update strategy_service.py to trigger trade subscriptions when entry levels are persisted and when positions are opened
- [ ] Update level_monitor.py to use trade monitor for real-time trigger detection instead of polling
- [ ] Initialize trade monitor in strategy_engine.py and ensure proper cleanup on stop
- [ ] Implement subscription cleanup when entry levels are cancelled or positions are closed
