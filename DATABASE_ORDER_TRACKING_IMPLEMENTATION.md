# Database Order Tracking Implementation - Complete

## Summary

Successfully implemented database-backed order and transaction tracking with Alpaca as the source of truth. This fixes the synchronization issues where the engine tried to sell positions it didn't actually own.

## What Was Implemented

### 1. Database Models ✅

Created two new models in `apps/server/app/models/strategies.py`:

- **Order** - Tracks all orders submitted to Alpaca
  - Includes order ID, Alpaca order ID, status, fill details
  - Status synced from Alpaca via polling service
- **Transaction** - Ledger of all order fills
  - Created when orders are filled
  - Maintains strategy-specific state (high_water_mark, strategy_state)
- **Removed** PositionContext model (replaced by Orders + Transactions)

### 2. Database Migration ✅

Created and ran migration `007_add_orders_and_transactions.py`:

- ✅ Created `orders` table with indexes
- ✅ Created `transactions` table with indexes
- ✅ Dropped `position_contexts` table
- Migration completed successfully

### 3. Order Polling Service ✅

New service: `apps/server/app/services/order_polling.py`

**Features:**

- Polls Alpaca every 5 seconds for order status updates
- Updates order status in database (pending → filled/canceled/failed)
- Creates transaction records when orders fill
- Broadcasts status updates to frontend via WebSocket
- Comprehensive logging at every step

**Integration:**

- Initialized in `app/main.py` on application startup
- Runs continuously in background

### 4. Strategy Engine Refactor ✅

Major refactor of `apps/server/app/services/strategy_engine.py`:

**Removed:**

- `active_positions` dict (in-memory tracking)
- `_load_positions()` method
- `_save_position()`, `_update_position()`, `_close_position()` methods

**Added:**

- `_position_cache` - Temporary cache refreshed from Alpaca
- `get_active_positions()` - Queries Alpaca for current positions
- `_refresh_positions_from_alpaca()` - Syncs positions from Alpaca
- `_get_position_details()` - Gets entry details from transaction history

**Updated Entry Logic:**

- Creates Order record in database BEFORE submitting to Alpaca
- Submits order to Alpaca
- Updates Order with Alpaca order ID
- Logs: "Order awaiting fill confirmation from polling service"
- Does NOT add to in-memory positions (Alpaca is source of truth)

**Updated Exit Logic:**

- Cancels pending orders first (prevents wash trade errors)
- Creates Order record for sell
- Submits to Alpaca
- Updates Order with Alpaca ID
- Polling service will update status and create transaction

**Position Querying:**

- All position checks now use `await self.get_active_positions()`
- Queries Alpaca API for current positions
- Cross-references with transaction history for entry price and strategy state
- Caches for 10 seconds to avoid excessive API calls

### 5. API Endpoints ✅

Updated `apps/server/app/routers/funds.py`:

**New Endpoints:**

- `GET /api/funds/{fund_id}/orders` - Get order history
- `GET /api/funds/{fund_id}/transactions` - Get transaction ledger

**Updated Endpoints:**

- `GET /api/funds/{fund_id}/status` - Now queries positions from engine (which queries Alpaca)
- `GET /api/funds/running/list` - Now uses `await engine.get_active_positions()`

**New Response Models:**

- `OrderResponse` - Order details
- `TransactionResponse` - Transaction details

### 6. Comprehensive Logging ✅

Added detailed logging throughout:

**Order Polling Service:**

- 🔄 "Polling X pending order(s)"
- 🔄 "Order status update: SYMBOL → old_status → new_status"
- ✅ "Order filled: SYMBOL qty@price"
- 💰 "Transaction created: SYMBOL side qty@price"

**Strategy Engine:**

- 📝 "Creating order record: SYMBOL side qty shares"
- 📤 "Order submitted to Alpaca: order_id, alpaca_id"
- ⏳ "Order awaiting fill confirmation"
- 📊 "Querying active positions from Alpaca"
- 📊 "Synced X position(s) from Alpaca: [symbols]"

**Startup:**

- ✓ "OrderPollingService initialized and running (polling every 5s)"

### 7. WebSocket Broadcasting ✅

All key events broadcast to frontend:

- `order_submitted` - When order is placed
- `order_status_update` - When polling service updates status
- `transaction_created` - When order fills
- `order_cancelled` - When orders are canceled

## How It Works Now

### Complete Flow:

1. **Entry Signal Detected**

   - Strategy engine creates Order record (status=pending)
   - Submits to Alpaca
   - Updates Order with Alpaca order ID
   - Logs and broadcasts "order_submitted" event

2. **Polling Service (every 5s)**

   - Queries all pending orders from database
   - Checks status with Alpaca API
   - Updates order status in database
   - If filled → creates Transaction record
   - Broadcasts status updates

3. **Position Queries**

   - Engine queries Alpaca for current positions
   - Cross-references with transaction history for entry details
   - Returns PositionContext objects with strategy state
   - Caches for 10 seconds

4. **Exit Signal Detected**

   - Cancels any pending buy orders (prevents wash trade errors)
   - Creates Order record for sell
   - Submits to Alpaca
   - Polling service will handle fill

5. **Position Closes**
   - Sell order fills → Transaction created
   - Position disappears from Alpaca
   - Next position query won't find it
   - Strategy knows position is closed

## Benefits

✅ **No more sync issues** - Alpaca is always the source of truth
✅ **No more wash trade errors** - Orders are canceled before exits
✅ **Complete audit trail** - All orders and transactions in database
✅ **Real-time updates** - Polling service syncs every 5 seconds
✅ **Strategy state preserved** - Transaction table maintains strategy data
✅ **Comprehensive logging** - Every step is logged with emojis for easy scanning
✅ **WebSocket updates** - Frontend gets real-time order/transaction events

## Testing

To test the complete flow:

1. Start a fund with Monkey Darts
2. Watch logs for order creation and submission
3. Wait ~5 seconds for polling service to update status
4. Check database:
   ```sql
   SELECT * FROM orders WHERE fund_id = 'your-fund-id' ORDER BY submitted_at DESC;
   SELECT * FROM transactions WHERE fund_id = 'your-fund-id' ORDER BY timestamp DESC;
   ```
5. Verify position shows in Alpaca
6. Wait for exit signal
7. Verify sell order created and eventually fills
8. Verify position removed from Alpaca

## Files Modified

1. `apps/server/app/models/strategies.py` - New Order/Transaction models
2. `apps/server/app/models/__init__.py` - Updated exports
3. `apps/server/alembic/versions/007_add_orders_and_transactions.py` - Migration
4. `apps/server/app/services/order_polling.py` - New polling service
5. `apps/server/app/services/strategy_engine.py` - Major refactor
6. `apps/server/app/routers/funds.py` - New endpoints, updated status endpoint
7. `apps/server/app/main.py` - Initialize polling service on startup

## Next Steps (Future Enhancements)

- [ ] Migrate to Alpaca webhooks for real-time updates (instead of polling)
- [ ] Add order cancellation endpoint for manual intervention
- [ ] Add retry logic for failed orders
- [ ] Track partial fills more granularly
- [ ] Add order amendment support (modify open orders)
- [ ] Persist fund balance updates after transactions
