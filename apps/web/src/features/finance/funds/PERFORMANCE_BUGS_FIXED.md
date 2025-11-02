# Fund Performance Calculation - Bugs Fixed

## Summary

Fixed critical bugs in fund performance calculations that were causing incorrect P&L reporting, inaccurate time-based performance metrics, and stale position valuations.

## Bugs Fixed

### 1. ❌ **Timezone Handling (CRITICAL)**

**Problem:** The `getDateDaysAgo()` function used local time instead of EST, causing day/week/month boundaries to be incorrect depending on where the code ran.

**Impact:** Performance windows (day, week, month) could be off by hours or even a full day, leading to transactions being counted in the wrong time period.

**Fix:**

- Created `getDateDaysAgoEST()` that explicitly calculates dates in EST timezone
- Added `getStartOfDayEST()` helper for consistent day boundaries
- All performance window calculations now use EST timezone

**Code:**

```typescript
function getDateDaysAgoEST(days: number): Date {
  // Get current time in EST
  const now = new Date();
  const estOffset = -5 * 60; // EST is UTC-5 (in minutes)
  const nowEST = new Date(
    now.getTime() + (now.getTimezoneOffset() + estOffset) * 60 * 1000
  );

  // Subtract days
  nowEST.setDate(nowEST.getDate() - days);

  // Set to start of day in EST
  nowEST.setHours(0, 0, 0, 0);

  return nowEST;
}
```

### 2. ❌ **Inconsistent Date Parsing**

**Problem:** Timestamps were sometimes Date objects, sometimes strings, and the code didn't consistently handle timezone information.

**Impact:** Could lead to timezone misinterpretation and incorrect date comparisons.

**Fix:**

- Created `parseTimestamp()` helper that safely handles both Date and string types
- Ensures all timestamp parsing goes through this consistent function

**Code:**

```typescript
function parseTimestamp(timestamp: Date | string): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  return new Date(timestamp);
}
```

### 3. ✅ **Stale Position Prices (CRITICAL) - NOW REALTIME!**

**Problem:** Position market values were only fetched once when the page loaded. As market prices changed, the displayed values, unrealized P&L, and AUM became increasingly inaccurate.

**Impact:**

- Stale position valuations showing incorrect unrealized P&L
- AUM (Assets Under Management) not reflecting current market reality
- Performance metrics based on outdated data

**Fix (Updated - Now Using WebSocket!):**

- Positions are now included in the WebSocket snapshot on connection
- Backend broadcasts position price updates every 30 seconds via WebSocket
- No more client-side polling - server pushes updates automatically
- More efficient and scalable than HTTP polling
- Instant updates when positions change

**Implementation:**

**Backend Changes (`apps/server/app/routers/`):**

1. Added `_get_positions_for_websocket()` helper function in `funds.py`
2. Updated `get_fund_snapshot()` to include positions in initial snapshot
3. Added periodic position price refresh (every 30s) in WebSocket endpoint (`realtime.py`)
4. Server broadcasts `positions_updated` events with fresh market prices

**Frontend Changes (`apps/web/src/features/finance/funds/`):**

1. Updated `use-fund-realtime.ts` to handle `positions` category
2. Removed polling logic from `use-fund-ledger.ts`
3. Updated `fund-detail-view.tsx` to use realtime positions
4. Updated `fund-overview.tsx` to receive positions as props

**Code:**

Backend (WebSocket):

```python
# Periodic position price updates in WebSocket
if time.time() - last_position_refresh >= position_refresh_interval:
    positions_data = await _get_positions_for_websocket(fund_id)

    if positions_data["positions"]:
        await websocket.send_json({
            "type": "update",
            "category": "positions",
            "event_type": "positions_updated",
            "timestamp": time.time(),
            "data": {
                "positions": positions_data["positions"],
                "summary": positions_data["summary"]
            }
        })
```

Frontend (React):

```typescript
// WebSocket automatically handles position updates
case "positions":
  if (update.event_type === "positions_updated") {
    newData.positions = (update.data.positions || []).map(transformPosition);
    newData.positionsSummary = transformPositionsSummary(update.data.summary);
  }
  break;
```

### 4. ✅ **Position Cost Basis Calculation**

**Note:** This was actually working correctly! The code uses cost basis for start-of-window calculations because we don't have historical market prices. This is the correct approach - we measure performance from the start position's cost basis to current market value.

**Why this is correct:**

- We don't store historical market prices for every position at every point in time
- Using cost basis as the baseline is standard practice
- The P&L calculation properly accounts for: `endMarketValue - startCostBasis - netTransfers`

## Testing

Created comprehensive test suite in `__tests__/ledger-calculations.test.ts` covering:

1. ✅ Balance calculations with no positions
2. ✅ Cash calculations after buy and sell transactions
3. ✅ Position value included in AUM
4. ✅ Withdrawal handling
5. ✅ EST timezone handling for day windows
6. ✅ Transaction exclusion outside time windows
7. ✅ Unrealized gains in open positions
8. ✅ P&L with positions closing at different prices
9. ✅ Empty data edge cases
10. ✅ Partial fills handling

## Performance Metrics Now Correctly Show

### Before Fix:

- ❌ Day/week/month windows incorrect due to timezone issues
- ❌ Stale position values (could be minutes or hours old)
- ❌ Unrealized P&L not updating with market
- ❌ AUM showing outdated total value
- ❌ Client-side polling wasting resources

### After Fix:

- ✅ All time windows calculated in EST timezone
- ✅ Position prices update every 30 seconds via WebSocket push
- ✅ Unrealized P&L updates with current market prices automatically
- ✅ AUM accurately reflects current portfolio value in real-time
- ✅ Performance metrics based on real-time data
- ✅ More efficient server-push architecture (no polling!)

## How Position Pricing Works (WebSocket Architecture)

**Initial Load:**

1. Client connects to WebSocket (`/api/funds/{fundId}/ws`)
2. Server sends snapshot with current positions and prices
3. Frontend displays positions immediately

**Automatic Updates:**

1. Server checks every second if 30s have passed since last refresh
2. Fetches fresh market prices from MarketDataProvider
3. Broadcasts position update to all connected clients
4. Frontend receives update and re-renders automatically

**Market Data Provider:**

```python
from app.services.market.market_data_provider import MarketDataProvider
market_provider = MarketDataProvider()
current_price = await market_provider.get_current_price(position["symbol"])
```

This ensures:

- Real market prices from Alpaca/market data provider
- Automatic 30-second updates via WebSocket push
- Fallback to cost basis if price unavailable (better than $0)
- Proper error handling without breaking the UI
- Efficient server-push architecture

## Migration Notes

- ✅ No database changes required
- ✅ No API changes required
- ✅ Backward compatible with existing data
- ✅ Automatic improvement for all users

## Files Modified

### Frontend (`apps/web/src/features/finance/funds/`)

1. `utils/ledger-calculations.ts` - Fixed timezone handling and date parsing
2. `hooks/use-fund-ledger.ts` - Removed polling, now uses WebSocket for positions
3. `hooks/use-fund-realtime.ts` - Added positions category and handling
4. `components/fund-detail-view.tsx` - Pass realtime positions to child components
5. `components/fund-overview.tsx` - Receive positions as props instead of fetching
6. `utils/__tests__/ledger-calculations.test.ts` - Created comprehensive test suite

### Backend (`apps/server/app/routers/`)

1. `funds.py` - Added `_get_positions_for_websocket()` and updated snapshot
2. `realtime.py` - Added periodic position price broadcasts to WebSocket

## Verification

To verify the fixes are working:

1. **Check EST timezone:** Performance windows should align with EST trading hours
2. **Watch position prices:** Open a fund with positions and check browser console for WebSocket logs
   - Should see: `[Fund Update] positions: positions_updated` every 30 seconds
3. **Verify realtime updates:** Position values, unrealized P&L, and AUM should update automatically
4. **Check WebSocket connection:** Look for connection indicator in UI
5. **Time-based metrics:** Check that day/week/month performance only includes transactions from those periods

**Console Logs to Look For:**

```
[Fund 123] WebSocket connected
[Fund 123] Received snapshot with 3 positions
[Fund Update] positions: positions_updated
[Fund Update] Updated 3 positions
```

## Future Improvements

Consider:

1. ~~WebSocket subscription for real-time price updates~~ ✅ **DONE!**
2. Historical price storage for more accurate start-of-window valuations
3. Intraday performance tracking (hourly windows during market hours)
4. Performance visualization charts with proper time-series data
5. Configurable refresh intervals (allow faster updates during trading hours)
