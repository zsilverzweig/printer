# Over-Selling Bug Investigation Report

## Fund: 2d9a3bd1-28b6-4263-a572-9830c7babdce (GPT Candlestick)

**Date:** 2025-10-31 14:14 UTC

## Executive Summary

🚨 **CRITICAL**: The over-selling prevention fixes were implemented but **were not active** because the Docker container wasn't restarted. The system continued to allow selling more shares than owned, creating negative positions.

**Server has now been restarted - fixes are now active.**

---

## Current State

### Fund Overview

- **Name:** GPT Candlestick
- **Balance:** $20,366.68
- **Created:** 2025-10-29 19:02:20
- **Total Transactions:** 127

### Positions (from Transaction Ledger)

#### 🔴 NEGATIVE POSITIONS (Critical Issue)

| Symbol | Quantity | Total Cost | Status       |
| ------ | -------- | ---------- | ------------ |
| TALK   | -221.00  | -$711.62   | ⚠️ OVER-SOLD |
| NUAI   | -130.00  | -$782.60   | ⚠️ OVER-SOLD |
| DXC    | -53.00   | -$730.87   | ⚠️ OVER-SOLD |
| ARDX   | -4.00    | -$25.80    | ⚠️ OVER-SOLD |
| CABA   | -3.00    | -$7.95     | ⚠️ OVER-SOLD |

#### ✅ POSITIVE POSITIONS (Normal)

| Symbol | Quantity | Total Cost |
| ------ | -------- | ---------- |
| CSIQ   | 19.50    | $379.02    |
| HIMZ   | 28.00    | $377.60    |
| OLMA   | 51.56    | $475.92    |
| SLDP   | 84.50    | $519.68    |

---

## Over-Selling Transactions Detected

### 📊 12 Over-Selling Events Found

All transactions occurred on **2025-10-31** between **13:32 and 13:47 UTC**:

| Time (UTC) | Symbol   | Attempted Sell | Actually Owned | Over-Sell Amount |
| ---------- | -------- | -------------- | -------------- | ---------------- |
| 13:32:18   | FINV     | 123.00         | 96.00          | 27.00            |
| 13:34:06   | CORZW    | 53.00          | 44.00          | 9.00             |
| 13:34:06   | **DXC**  | **56.00**      | **3.00**       | **53.00**        |
| 13:34:06   | HIMZ     | 62.00          | 45.00          | 17.00            |
| 13:34:06   | ARDX     | 104.00         | 100.00         | 4.00             |
| 13:34:06   | **NUAI** | **131.00**     | **1.00**       | **130.00**       |
| 13:34:07   | CABA     | 304.00         | 301.00         | 3.00             |
| 13:34:08   | SBET     | 59.00          | 32.00          | 27.00            |
| 13:34:08   | **TALK** | **248.00**     | **27.00**      | **221.00**       |
| 13:34:08   | LOCO     | 69.00          | 2.00           | 67.00            |
| 13:47:36   | LOCO     | 70.00          | 3.00           | 67.00            |
| 13:47:37   | UPSX     | 64.00          | 63.00          | 1.00             |

**Total Over-Sold:** 626 shares across 12 transactions

---

## Financial Impact

### Trading Summary

- **Total Invested (Buys):** $44,908.19
- **Total Proceeds (Sells):** $45,274.87
- **Net Trading Impact:** $366.68 (profit)
- **Current Balance:** $20,366.68

### ⚠️ Inflated Performance

The reported profit of $366.68 is **artificially inflated** because:

1. The fund received sale proceeds for shares it didn't own
2. Negative positions represent phantom profits that cannot be realized
3. The actual performance should be calculated only from legitimate trades

---

## Root Cause Analysis

### Why the Bug Occurred

1. **Code Path:** `order_polling.py` → `_create_transaction()`

   - When processing filled sell orders from Alpaca
   - Transaction creation did not validate actual position ownership
   - Balance was credited for ALL shares in the filled order

2. **Missing Validation:**

   - No check against transaction ledger before creating sell transaction
   - Assumed Alpaca position data was accurate (but cache can be stale)
   - No safeguard against duplicate or phantom sells

3. **Strategy Engine:**
   - `_exit_position()` relied on in-memory position cache
   - No pre-trade validation against database transaction history
   - Could place sell orders for shares not actually owned

### Timeline of Events

1. **Oct 29-30:** Fund trading normally with some positions
2. **Oct 31 13:32-13:47:** Multiple over-sell transactions processed
3. **Oct 31 14:02:** Over-selling fixes implemented
4. **Oct 31 14:14:** Docker container restarted - fixes now active

---

## Fixes Implemented

### ✅ Fix 1: Position Tracker Service

**File:** `apps/server/app/services/position_tracker.py` (NEW)

```python
async def get_position_quantity_from_transactions(
    session: AsyncSession,
    fund_id: str,
    symbol: str
) -> float:
    """Calculate current position from transaction ledger (source of truth)"""
```

### ✅ Fix 2: Transaction Creation Validation

**File:** `apps/server/app/services/order_polling.py` (MODIFIED)

Added pre-transaction validation in `_create_transaction()`:

- Queries actual position from transaction ledger
- Caps sell quantity to owned shares
- Logs error if over-sell detected
- Prevents balance credit for phantom shares

### ✅ Fix 3: Pre-Trade Validation

**File:** `apps/server/app/services/strategy_engine.py` (MODIFIED)

Added validation in `_exit_position()`:

- Checks position exists in database before placing order
- Compares cache vs. transaction ledger
- Blocks order if insufficient shares
- Prevents over-sell orders from being placed

### ✅ Fix 4: Comprehensive Tests

**File:** `apps/server/tests/test_overselling_prevention.py` (NEW)

9 tests covering:

- Position calculation from transactions
- Over-sell detection and capping
- Pre-trade validation blocking
- Normal sell operations
- Partial sells with deficits

---

## Next Steps

### Immediate Actions Required

1. **Reset Fund Balance** ✅ (User will perform)

   - Current balance is corrupted by phantom profits
   - Reset to initial capital to start clean

2. **Monitor Trading Activity** (Next 24 hours)

   - Watch logs for validation messages
   - Verify no new negative positions occur
   - Confirm position tracking is accurate

3. **Verify Alpaca Positions** (Optional)
   - Check if Alpaca shows these negative positions
   - May need to manually close orphaned positions
   - Reconcile Alpaca vs. database state

### Verification Script

Run this to check for new over-sells:

```bash
docker exec printer-server python /app/investigate_fund.py
```

Look for:

- ✅ "No over-selling detected" message
- ✅ No negative positions
- ✅ Position quantities match expectations

---

## Prevention Measures Now Active

✅ **Database is source of truth** for position tracking  
✅ **Pre-transaction validation** caps sell quantities  
✅ **Pre-trade validation** blocks invalid orders  
✅ **Comprehensive logging** for debugging  
✅ **Test coverage** prevents regressions

---

## Questions for Review

1. Should we add automated reconciliation between Alpaca and database?
2. Should we add alerts for negative positions?
3. Should we recalculate historical performance excluding over-sells?
4. Should we add a daily position audit job?

---

**Investigation completed:** 2025-10-31 14:14 UTC  
**Status:** Fixes deployed and active ✅  
**Follow-up:** Monitor for 24 hours
