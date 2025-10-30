# Orphaned Position Cleanup Feature

## Overview

This feature allows users to clean up "orphaned" database positions - positions that exist in the database transaction history but don't exist in Alpaca. This typically happens when:

1. A position was manually closed in Alpaca outside of the trading system
2. The sync between the database and Alpaca failed during a sell order
3. The fund was reset or recreated in Alpaca but database history remains

## What It Does

The cleanup feature:

1. **Verifies** the position exists in the database but NOT in Alpaca
2. **Calculates** the net quantity and average cost basis from transaction history
3. **Creates** a matching sell transaction to zero out the position
4. **Returns** the cost basis to the fund balance (as sale proceeds)
5. **Maintains** a complete audit trail with special tags for traceability

## Backend Implementation

### New Endpoint: `POST /api/funds/{fund_id}/positions/{symbol}/close-orphaned`

**Location:** `apps/server/app/routers/funds.py`

**Functionality:**

- Validates that the position exists in the database
- Ensures the position does NOT exist in Alpaca (safety check)
- Calculates net quantity and cost basis from all buy/sell transactions
- Creates a closing sell transaction at the average entry price (breakeven)
- Creates a corresponding order record for audit trail
- Updates fund balance to reflect the sale proceeds
- Tags the transaction with `"source": "orphaned_cleanup"` for easy identification

**Safety Features:**

- Will not close if position exists in Alpaca
- Will not close if position is already at zero quantity
- Requires explicit user action (no automatic cleanup)
- Creates full audit trail with special tags

**Example Response:**

```json
{
  "success": true,
  "message": "Closed orphaned position for AAPL",
  "fund_id": "fund-123",
  "symbol": "AAPL",
  "quantity_closed": 10.5,
  "avg_entry_price": 150.25,
  "proceeds": 1577.63,
  "new_balance": 12577.63,
  "transaction_id": "txn-456"
}
```

## Frontend Implementation

### Updated Component: `FundPositions`

**Location:** `apps/web/src/features/finance/funds/components/fund-positions.tsx`

**Changes:**

1. Added new "Actions" column to the Database Positions table
2. Added `CloseOrphanedPositionButton` component for positions not in Alpaca
3. Displays button only for positions with sync issues (in DB but not in Alpaca)

**UI Features:**

- **Confirmation Dialog:** User must confirm before closing
- **Detailed Explanation:** Dialog explains what the action does and why it's needed
- **Visual Indicators:** Orange styling to indicate caution (not as severe as red/delete)
- **Error Handling:** Displays error messages if cleanup fails
- **Auto-refresh:** Automatically refreshes positions after successful cleanup

**User Experience:**

1. User navigates to Fund → Positions tab
2. Sees sync issue alert if any positions are orphaned
3. Sees "Close Out" button next to orphaned positions in the Database Positions table
4. Clicks button to see detailed confirmation dialog
5. Confirms action to close the position
6. Position is closed and removed from the list

## Technical Details

### Transaction Creation

The cleanup creates a "synthetic" sell transaction with these characteristics:

- **Side:** `sell`
- **Quantity:** Net quantity from all transactions (buys - sells)
- **Price:** Average entry price from buy transactions
- **Result:** Breakeven exit (no P&L impact)
- **Tagging:** `strategy_state` contains `{"source": "orphaned_cleanup", "reason": "..."}`

### Balance Impact

When a position is closed:

1. Sale proceeds = quantity × average_entry_price
2. Fund balance increases by sale proceeds
3. Net effect: Returns the original cost basis to available cash

### Audit Trail

All cleanup actions are fully traceable:

- Order record with `order_type="manual_cleanup"`
- Transaction record with `"source": "orphaned_cleanup"` in strategy_state
- Empty `alpaca_order_id` to indicate no actual Alpaca order
- Full timestamp information

## Use Cases

### Scenario 1: Manual Position Close in Alpaca

**Problem:** User manually closed a position in Alpaca web interface
**Result:** Position gone from Alpaca, but database still shows open position
**Solution:** Click "Close Out" to sync the database with reality

### Scenario 2: Sync Failure

**Problem:** Sell order executed in Alpaca but webhook/polling failed
**Result:** Alpaca shows closed, database shows open
**Solution:** Click "Close Out" to reconcile the mismatch

### Scenario 3: Fund Reset/Recreation

**Problem:** Fund was deleted and recreated in Alpaca, but database history remains
**Result:** Old positions in database don't exist in new Alpaca account
**Solution:** Click "Close Out" to clean up old positions

## Safety Considerations

1. **Manual Action Required:** Positions are never auto-closed
2. **Alpaca Verification:** Checks that position doesn't exist in Alpaca before closing
3. **Breakeven Pricing:** Uses entry price to avoid incorrect P&L calculations
4. **Audit Trail:** All actions are logged and traceable
5. **Reversibility:** While not directly reversible, all data is preserved in transaction history

## Testing

To test this feature:

1. **Create a Test Scenario:**

   ```bash
   # In fund detail page, manually execute a buy order
   # Then manually close the position in Alpaca web interface
   # Refresh the Positions tab - you should see the position in DB but not Alpaca
   ```

2. **Verify the Button Appears:**

   - Navigate to Fund → Positions tab
   - Look for "Close Out" button next to orphaned position
   - Verify button only appears for positions NOT in Alpaca

3. **Test the Cleanup:**

   - Click "Close Out" button
   - Read the confirmation dialog
   - Confirm the action
   - Verify position is removed from database list
   - Check transaction history to see the closing transaction
   - Verify fund balance increased by the cost basis amount

4. **Verify Error Handling:**
   - Try to close a position that exists in Alpaca (should fail)
   - Try to close a position with zero quantity (should fail)
   - Check that appropriate error messages are displayed

## Future Enhancements

Potential improvements for future versions:

1. **Batch Cleanup:** Close multiple orphaned positions at once
2. **Price Discovery:** Fetch actual market price instead of using entry price
3. **P&L Calculation:** Calculate actual P&L if we can determine the real exit price
4. **Automatic Detection:** Periodic background job to detect orphaned positions
5. **Email Alerts:** Notify users when orphaned positions are detected
6. **History View:** Dedicated view for all cleanup actions

## Related Files

### Backend

- `apps/server/app/routers/funds.py` - New endpoint implementation
- `apps/server/app/models/strategies.py` - Transaction and Order models

### Frontend

- `apps/web/src/features/finance/funds/components/fund-positions.tsx` - UI component
- `apps/web/src/lib/components/ui/alert-dialog.tsx` - Confirmation dialog

## API Documentation

### Close Orphaned Position

**Endpoint:** `POST /api/funds/{fund_id}/positions/{symbol}/close-orphaned`

**Parameters:**

- `fund_id` (path): UUID of the fund
- `symbol` (path): Stock symbol to close

**Response:** See example above

**Error Codes:**

- `400`: Position still exists in Alpaca or already closed
- `404`: Fund not found or no transactions for symbol
- `500`: Internal server error

## Conclusion

This feature provides a safe, auditable way to clean up orphaned database positions and maintain data consistency between the database and Alpaca. It's designed with safety and transparency in mind, requiring explicit user confirmation and maintaining complete audit trails.
