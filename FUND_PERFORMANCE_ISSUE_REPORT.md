# Fund Performance Issue Report

**Fund ID:** `2d9a3bd1-28b6-4263-a572-9830c7babdce` (GPT Candlestick)

**Date:** October 31, 2025

---

## Executive Summary

The fund's performance calculation is **INCORRECT** due to a critical bug where the strategy is selling MORE shares than it owns. This results in phantom profits being credited to the fund balance.

### Key Findings:

1. **Balance Mismatch:** Fund balance shows $22,949.52, but should be $10,769.80 (difference: **$12,179.72 phantom profit**)
2. **Over-Selling:** Strategy sold shares it never owned in **10 different trades**
3. **Realized P&L:** Actual realized P&L is **-$81.18** (-0.81%), not the implied +$12,949.52

---

## Detailed Analysis

### 1. Balance Calculation from Ledger

Starting with $10,000 initial deposit:

```
Total Bought:           $15,453.76  (25 buy transactions)
Total Sold:             $16,223.56  (22 sell transactions)
Realized P&L:           $-81.18     (-0.81%)

Expected Cash Balance:  $10,769.80
Open Positions (cost):  $2,975.22
Total Account Value:    $13,745.02

ACTUAL Fund Balance:    $22,949.52  ❌
Difference:             $12,179.72  🚨
```

### 2. Over-Selling Incidents

The strategy sold shares it didn't own in these transactions:

| Symbol | Bought | Sold | Over-Sold | Sell Price | Extra Revenue |
| ------ | ------ | ---- | --------- | ---------- | ------------- |
| TALK   | 27     | 248  | **221**   | $3.27      | ~$722.67      |
| NUAI   | 1      | 131  | **130**   | $5.98      | ~$777.40      |
| LOCO   | 2      | 69   | **67**    | $10.03     | ~$672.01      |
| DXC    | 3      | 56   | **53**    | $13.76     | ~$729.28      |
| SBET   | 32     | 59   | **27**    | $13.47     | ~$363.69      |
| FINV   | 96     | 123  | **27**    | $6.11      | ~$164.97      |
| HIMZ   | 45     | 62   | **17**    | $13.27     | ~$225.59      |
| CORZW  | 44     | 53   | **9**     | $15.26     | ~$137.34      |
| ARDX   | 100    | 104  | **4**     | $6.31      | ~$25.24       |
| CABA   | 301    | 304  | **3**     | $2.67      | ~$8.01        |

**Total Extra Revenue (estimated):** ~$3,826.20

This doesn't account for the full $12,179.72 discrepancy, suggesting the issue is more complex.

### 3. Alpaca Position Reconciliation

Current Alpaca positions show:

| Symbol | Quantity | Cost Basis |
| ------ | -------- | ---------- |
| LOCO   | 3        | $55.45     |
| BFLY   | 295      | $775.85    |
| QUBX   | 62       | $792.98    |
| SMCL   | 50       | $795.50    |
| WKEY   | 36       | $678.96    |
| UPSX   | 63       | $785.36    |

**Total Alpaca Position Value:** $3,884.10

But our transaction analysis shows open positions should be worth: $2,975.22

**Discrepancy:** $908.88

This suggests additional buys occurred that our analysis captured, OR the Alpaca positions include shares from the over-sells (which would be a serious issue).

---

## Root Cause Analysis

### Primary Bug: Over-Selling Allowed

The system is allowing the strategy to sell more shares than it owns. This happens in `order_polling.py` lines 320-333:

```python
# Update fund balance (cash position)
if order.side == "buy":
    fund.balance -= transaction.total_value
else:  # sell
    fund.balance += transaction.total_value  # ❌ No position validation!
```

**The Problem:**

- When a sell order fills, the code ALWAYS credits the fund balance
- There's NO check to verify the fund actually owned those shares
- This allows "phantom sells" that create free money

### Why This Happens

The strategy engine doesn't track positions internally before placing sell orders. It relies on Alpaca's position data, but there's a timing/sync issue where:

1. Strategy sees a position in Alpaca
2. Strategy places sell order
3. Order gets filled for MORE shares than actually owned (possibly due to fractional share rounding or multiple orders racing)
4. Transaction is created and balance is credited for ALL sold shares
5. Phantom profit is created

---

## Impact Assessment

### Financial Impact

- **Inflated Performance:** Fund appears to have gained +129.5% when actual performance is +37.45%
- **False Profits:** $12,179.72 in phantom profits
- **Unreliable Metrics:** All P&L calculations are incorrect

### System Impact

- **Data Integrity:** Transaction ledger is accurate, but balance calculation is wrong
- **Trading Decisions:** Strategy may make decisions based on inflated balance
- **User Trust:** Displayed performance is misleading

---

## Recommended Fixes

### 1. Immediate: Add Position Validation (HIGH PRIORITY)

In `order_polling.py`, before crediting balance on sells:

```python
if order.side == "sell":
    # Verify we have sufficient position
    position_qty = await get_position_quantity(session, order.fund_id, order.symbol)

    if quantity_to_transact > position_qty:
        logger.error(
            f"🚨 CRITICAL: Attempting to sell {quantity_to_transact} {order.symbol} "
            f"but only own {position_qty}! Capping transaction."
        )
        quantity_to_transact = position_qty

    fund.balance += (quantity_to_transact * filled_price)
else:
    fund.balance -= transaction.total_value
```

### 2. Add Pre-Trade Position Checks

In `strategy_engine.py`, before placing sell orders, verify position exists:

```python
async def _exit_position(self, position, signal, market_data):
    # Verify position still exists in our records
    actual_position = await self._get_position_from_db(position.symbol)
    if not actual_position or actual_position.quantity < position.quantity:
        logger.warning(
            f"Position mismatch: expected {position.quantity} {position.symbol}, "
            f"found {actual_position.quantity if actual_position else 0}"
        )
        return  # Don't place sell order
```

### 3. Reconciliation Job

Create a periodic job to reconcile:

- Database transactions
- Alpaca positions
- Fund balances

### 4. Balance Recalculation Utility

Create a script to recalculate all fund balances from transaction history:

```python
# Pseudo-code
cash = initial_deposit
for transaction in transactions_chronological:
    if transaction.side == "buy":
        cash -= transaction.total_value
    else:  # sell - only credit for shares we had
        position_qty = get_position_before_transaction(...)
        actual_sold = min(transaction.quantity, position_qty)
        cash += (actual_sold * transaction.price)
fund.balance = cash
```

---

## Immediate Actions Required

1. ✅ **STOP TRADING** on this fund until fixed
2. 🔧 **Recalculate Balance** using transaction ledger (should be $10,769.80)
3. 🐛 **Fix Over-Sell Bug** in order_polling.py
4. ✅ **Add Position Validation** before all sells
5. 📊 **Audit Other Funds** for same issue

---

## Correct Performance Metrics

| Metric                  | Value          |
| ----------------------- | -------------- |
| Initial Deposit         | $10,000.00     |
| Current Cash            | $10,769.80     |
| Open Positions (cost)   | $2,975.22      |
| **Total Account Value** | **$13,745.02** |
| **Realized P&L**        | **-$81.18**    |
| **Total Return**        | **+37.45%**    |

The fund has actually gained 37.45%, not 129.5%.

---

## Technical Details

### Transaction Summary

- **47 total transactions** (25 buys, 22 sells)
- **10 over-sell incidents**
- **Current open positions:** 4 (LOCO, SMCL, UPSX, WKEY per our analysis)
- **Alpaca reports:** 6 positions (includes BFLY, QUBX)

### Timing

All problematic transactions occurred on **2025-10-31 between 13:30-13:42 UTC**

---

## Questions for Investigation

1. ❓ How did Alpaca allow these sells if the positions didn't exist?
2. ❓ Are there ADDITIONAL buy transactions not captured in our ledger?
3. ❓ Why does Alpaca show 6 positions but our analysis shows 4?
4. ❓ Is there a fractional share rounding issue causing quantity mismatches?

---

**Report Generated:** 2025-10-31  
**Analyst:** AI Code Review System  
**Status:** CRITICAL - Requires Immediate Attention
