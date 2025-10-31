# Strategy Engine Event Logging

Comprehensive event logging system for debugging position tracking, order fills, and strategy engine decisions.

## Overview

The Strategy Engine now logs all critical events to the `strategy_engine_events` table, providing a complete audit trail for:

- **Position Sync Issues** - Alpaca vs ledger quantity mismatches
- **Fill Tracking** - Partial fills, incremental order fills
- **Order Decisions** - Entry/exit signals and strategy logic
- **Validations** - Risk checks and pre-trade validations
- **Errors** - Any error conditions encountered

## Event Categories

| Category         | Purpose                  | Examples                                        |
| ---------------- | ------------------------ | ----------------------------------------------- |
| `position_sync`  | Position tracking issues | Alpaca reports 46.81 shares but ledger shows 47 |
| `fill_tracking`  | Order fill progression   | Partial fill: 30 shares filled, 17 remaining    |
| `order_decision` | Strategy signals         | Exit signal triggered due to stop loss          |
| `validation`     | Pre-trade checks         | Risk check failed: max daily loss reached       |
| `error`          | Error conditions         | Failed to place order with Alpaca               |

## Severity Levels

- `info` - Normal operations and successful actions
- `warning` - Potential issues that were handled gracefully
- `error` - Failures that prevented an action

## Event Data Structure

Each event includes:

```python
{
    "timestamp": datetime,           # When the event occurred
    "fund_id": str,                  # Which fund
    "event_category": str,           # Category (see table above)
    "symbol": str | null,            # Stock symbol if applicable
    "severity": str,                 # info/warning/error
    "message": str,                  # Human-readable description
    "event_data": dict | null        # Additional structured data
}
```

## Example: Position Quantity Mismatch

When TXG shows 47 shares in the ledger but Alpaca reports 46.81640625:

```json
{
  "event_category": "position_sync",
  "symbol": "TXG",
  "severity": "warning",
  "message": "Position quantity mismatch detected for TXG",
  "event_data": {
    "alpaca_quantity": 46.81640625,
    "ledger_quantity": 47.0,
    "discrepancy": -0.18359375,
    "action": "using_ledger_quantity",
    "exit_reason": "stop_loss_triggered",
    "current_price": 15.25
  }
}
```

## Querying Events

### Via Script

```bash
# All events for a fund
python query_engine_events.py <fund_id>

# Events for specific symbol
python query_engine_events.py <fund_id> --symbol TXG

# Events by category
python query_engine_events.py <fund_id> --category position_sync

# Combine filters
python query_engine_events.py <fund_id> --symbol TXG --category fill_tracking
```

### Via SQL

```sql
-- Recent position sync issues
SELECT timestamp, symbol, message, event_data
FROM strategy_engine_events
WHERE event_category = 'position_sync'
  AND severity = 'warning'
ORDER BY timestamp DESC
LIMIT 20;

-- All fills for a specific order
SELECT timestamp, message, event_data
FROM strategy_engine_events
WHERE event_category = 'fill_tracking'
  AND event_data::json->>'order_id' = '<order_id>'
ORDER BY timestamp ASC;

-- Position mismatches for a symbol
SELECT timestamp, event_data
FROM strategy_engine_events
WHERE symbol = 'TXG'
  AND event_category = 'position_sync'
ORDER BY timestamp DESC;
```

## Debugging Position Issues

When you encounter a position mismatch like "TXG 47 shares doesn't match 46.81":

1. **Check fill events:**

   ```bash
   python query_engine_events.py <fund_id> --symbol TXG --category fill_tracking
   ```

   This shows if the buy order was filled incrementally.

2. **Check position sync events:**

   ```bash
   python query_engine_events.py <fund_id> --symbol TXG --category position_sync
   ```

   This shows when/how the mismatch was detected.

3. **Check transactions table:**

   ```sql
   SELECT timestamp, side, quantity, price
   FROM transactions
   WHERE symbol = 'TXG' AND fund_id = '<fund_id>'
   ORDER BY timestamp ASC;
   ```

   This shows actual recorded transactions that build up the position.

4. **Check orders table:**
   ```sql
   SELECT quantity, filled_qty, status
   FROM orders
   WHERE symbol = 'TXG' AND fund_id = '<fund_id>'
   ORDER BY submitted_at DESC;
   ```
   This shows if orders were partially filled.

## Alpaca Fill Tracking

Alpaca supports detailed fill tracking through their API:

- `filled_qty` - Total quantity filled so far
- `filled_avg_price` - Average price of all fills
- Order status shows: `new`, `partially_filled`, `filled`

Our system:

1. Polls Alpaca every 5 seconds for order updates
2. Detects when `filled_qty` increases
3. Creates transactions for the **delta** (incremental fills only)
4. Logs each fill as a `fill_tracking` event

This ensures even complex partial fills are tracked accurately.

## Migration

Run the migration to add the `strategy_engine_events` table:

```bash
cd apps/server
alembic upgrade head
```

## Next Steps

Future enhancements could include:

- Lot-based position tracking (FIFO/LIFO)
- Alpaca's individual fill/execution tracking
- Automated reconciliation between Alpaca and ledger
- Real-time alerts for discrepancies
