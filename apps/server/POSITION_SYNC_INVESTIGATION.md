# Position Sync Investigation

## Problem Statement

Database shows positions that don't exist in Alpaca. This creates a critical mismatch where:

- Our ledger thinks we own X shares
- Alpaca shows we own 0 shares (or different quantity)
- Sell orders fail or create over-selling scenarios

## Root Cause Analysis

### Current System Flow

1. **Order Placement** → Creates `Order` record with `quantity=X`
2. **Order Polling** → Checks Alpaca for fills, creates `Transaction` records
3. **Position Tracking** → Sums transactions to calculate position
4. **Problem**: If step 2 fails or misses updates, transactions don't match reality

### Why Sync Breaks

1. **Partial Fills Not Tracked**: Order for 47 shares might fill as:

   - Fill 1: 30 shares
   - Fill 2: 16.81640625 shares
   - Total: 46.81640625 (not 47!)

2. **Polling Misses Updates**: 5-second polling might miss rapid fills

3. **Order Cancellations**: Partially filled orders that get canceled

4. **Market Orders**: Can fill at slightly different quantities than requested

## Alpaca's Solution: Activities API

### What Alpaca Provides

Alpaca has a `/v2/account/activities` endpoint that provides:

```python
GET /v2/account/activities?activity_types=FILL

Response:
[
  {
    "id": "20190801011234567890::c1234567-89ab-cdef-0123-456789abcdef",
    "activity_type": "FILL",
    "transaction_time": "2019-08-01T13:30:00Z",
    "type": "fill",
    "price": "100.15",
    "qty": "10.5",  # <-- ACTUAL filled quantity
    "side": "buy",
    "symbol": "AAPL",
    "leaves_qty": "0",
    "order_id": "904837e3-3b76-47ec-b432-046db621571b",
    "cum_qty": "10.5",
    "order_status": "filled"
  }
]
```

### Key Benefits

1. **Every Fill is Recorded**: Each individual fill has a unique ID
2. **Actual Quantities**: Shows exact quantities filled (including fractional)
3. **Audit Trail**: Can query historical fills
4. **Order Linkage**: `order_id` links fills to orders
5. **No Polling Needed**: Can use WebSocket for real-time

### What We DON'T Have

Alpaca does **NOT** provide:

- Lot IDs (FIFO/LIFO tracking)
- Cost basis per lot
- Individual position IDs

But they **DO** provide:

- Order IDs (our current tracking method ✓)
- Fill-level tracking (we're not using this!)
- Position quantities at account level

## Recommended Solution

### Phase 1: Fix Current System (Immediate)

1. **Use Activities API** instead of just polling orders:

```python
# apps/server/app/services/trading/alpaca_service.py

async def get_account_activities(
    self,
    activity_types: str = "FILL",
    after: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Get account activities (fills, transactions).

    This is the SOURCE OF TRUTH for what actually happened.
    """
    if not self.client:
        raise ValueError("Alpaca client not initialized")

    activities = self.client.get_activities(
        activity_types=activity_types,
        after=after,
        page_size=limit
    )

    return [self._serialize_activity(a) for a in activities]
```

2. **Sync Transactions from Activities**:

   - On startup: Query last 24 hours of FILL activities
   - Match to our orders by `order_id`
   - Create/update transactions based on actual fills
   - This catches any missed fills

3. **Reconciliation Check**:

```python
async def reconcile_positions(self, fund_id: str):
    """
    Compare DB positions vs Alpaca positions.
    Log discrepancies to strategy_engine_events.
    """
    # Get positions from transactions
    db_positions = await get_all_positions_from_transactions(session, fund_id)

    # Get positions from Alpaca
    alpaca_positions = await self.alpaca_service.get_positions()

    # Compare and log differences
    for symbol in set(db_positions.keys()) | set(alpaca_dict.keys()):
        db_qty = db_positions.get(symbol, 0)
        alpaca_qty = alpaca_dict.get(symbol, 0)

        if abs(db_qty - alpaca_qty) > 0.01:
            # Log to strategy_engine_events
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="position_sync",
                symbol=symbol,
                severity="error",
                message=f"Position mismatch detected: DB={db_qty}, Alpaca={alpaca_qty}",
                event_data={
                    "db_quantity": db_qty,
                    "alpaca_quantity": alpaca_qty,
                    "discrepancy": db_qty - alpaca_qty
                }
            )
```

### Phase 2: Proactive Prevention (Next)

1. **Activities-Based Polling**:

   - Instead of polling orders, poll activities
   - Process each FILL activity into a transaction
   - More reliable than order-based polling

2. **WebSocket Trade Updates**:

   - Subscribe to trade_updates stream
   - Get real-time fill notifications
   - No polling delay

3. **Startup Reconciliation**:
   - When fund starts, reconcile immediately
   - Catch any missed overnight activity

### Phase 3: Advanced (Future)

1. **Lot Tracking**:

   - Build our own lot system using fill IDs
   - Track cost basis per fill
   - Support FIFO/LIFO/Specific ID

2. **Automated Reconciliation**:
   - If discrepancy detected, query Alpaca's fill history
   - Create correcting transactions
   - Alert user to investigate

## Implementation Plan

### Step 1: Add Activities API Support

```python
# apps/server/app/services/trading/alpaca_service.py
```

### Step 2: Create Activity-Based Sync Service

```python
# apps/server/app/services/trading/activity_sync.py
```

### Step 3: Integrate with Order Polling

- Call activity sync on startup
- Run periodic reconciliation
- Log all discrepancies to events

### Step 4: Monitor & Alert

- Use strategy_engine_events to track sync issues
- Dashboard showing sync health
- Alerts for critical mismatches

## Testing Strategy

1. **Create Sync Break**: Manually create mismatch
2. **Verify Detection**: Ensure system logs the issue
3. **Test Reconciliation**: Verify it corrects itself
4. **Monitor Events**: Check strategy_engine_events logs all steps

## Benefits

- ✅ **Source of Truth**: Activities API shows what actually happened
- ✅ **Catch Missed Fills**: Backfill any gaps in transaction history
- ✅ **Audit Trail**: Full visibility into what went wrong
- ✅ **Fractional Shares**: Handles partial fills correctly
- ✅ **No Lot IDs Needed**: We track by order_id + fill sequence

## Next Steps

1. Implement `get_account_activities()` method
2. Create startup reconciliation routine
3. Add reconciliation to fund start/stop
4. Monitor strategy_engine_events for patterns
5. Build auto-correction logic
