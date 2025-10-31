# Strategy Engine Events UI Integration

## Overview

Added a user-friendly way to view strategy engine events directly from the Fund Ledger UI.

## What Was Added

### Backend API
- **New Endpoint**: `GET /api/events/strategy-engine`
  - Query params: `fund_id` (required), `symbol`, `category`, `severity`, `limit`
  - Returns filtered strategy engine events with full context

### Frontend Components

1. **StrategyEngineEventsModal** (`strategy-engine-events-modal.tsx`)
   - Beautiful modal showing all engine events
   - Filters by symbol, category, and severity
   - Expandable details showing full event data
   - Color-coded by severity (info/warning/error)
   - Real-time filtering

2. **Button in Fund Ledger**
   - "Engine Events" button in top-right of ledger
   - Opens modal showing all events for that fund
   - Easy access to debugging information

### UI Components Created
- `scroll-area.tsx` - Radix UI scroll area component

## Usage

### From the UI

1. Navigate to a fund's detail page
2. Go to the "Ledger" tab
3. Click "Engine Events" button in top-right
4. Filter events by:
   - **Symbol** - See events for specific stocks
   - **Category** - position_sync, fill_tracking, etc.
   - **Severity** - info, warning, error
5. Click "View Details" on any event to see full JSON data

### Event Categories Shown

- **Position Sync** - Alpaca vs ledger quantity mismatches
- **Fill Tracking** - Partial fills and incremental order fills
- **Order Decision** - Strategy entry/exit signals
- **Validation** - Risk checks and validations
- **Error** - Any error conditions

### Example: Debugging TXG Issue

1. Open fund → Ledger → Engine Events
2. Filter by Symbol: "TXG"
3. Look for "Position Sync" events (warnings)
4. Expand details to see:
   ```json
   {
     "alpaca_quantity": 46.81640625,
     "ledger_quantity": 47.0,
     "discrepancy": -0.18359375,
     "action": "using_ledger_quantity"
   }
   ```
5. This shows exactly when and how the mismatch was detected

## Migration Required

Before the UI will work, you need to run the database migration:

```bash
cd apps/server
alembic upgrade head
```

This creates the `strategy_engine_events` table.

## Benefits

- **No more SSH/SQL** - View events directly in the UI
- **Visual timeline** - See what happened and when
- **Easy filtering** - Focus on specific issues
- **Full context** - All event data at your fingertips
- **Real-time** - See events as they happen

## Future Enhancements

- Add real-time updates (WebSocket)
- Export events to CSV
- Link directly from ledger rows to related events
- Add charts/graphs of event frequency
- Alerting for critical events

