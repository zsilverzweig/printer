# Net Worth Implementation

## Overview
Upgraded the fund performance system to show **Net Worth** (cash + positions) instead of just cash balance. This provides a complete picture of fund value including unrealized gains/losses on open positions.

## Problem
Previously, the system only tracked:
- **Cash Balance**: deposits - withdrawals - buys + sells
- **Realized P&L**: profits from closed trades only

This missed:
- Current holdings (stocks still owned)
- Unrealized P&L (gains/losses on open positions)

**Example Issue:**
- Fund has $5,000 cash + $10,000 in stocks (worth $12,000) = $17,000 total
- Old system showed: **$5,000** (misleading!)
- New system shows: **$17,000 Net Worth** ✅

## Solution

### Backend Changes

#### 1. New API Endpoint: `/api/funds/{fund_id}/positions/summary`

**Purpose:** Calculate current positions with market values even when fund is not actively trading.

**Features:**
- Calculates positions from transaction history (FIFO basis)
- Fetches current market prices for each position
- Computes unrealized P&L
- Works whether fund is running or stopped

**Response Example:**
```json
{
  "fund_id": "abc123",
  "positions": [
    {
      "symbol": "AAPL",
      "quantity": 10.0,
      "avg_entry_price": 150.00,
      "current_price": 160.00,
      "cost_basis": 1500.00,
      "market_value": 1600.00,
      "unrealized_pl": 100.00,
      "unrealized_plpc": 6.67
    }
  ],
  "summary": {
    "position_count": 1,
    "total_market_value": 1600.00,
    "total_unrealized_pl": 100.00
  }
}
```

**Implementation:** `apps/server/app/routers/funds.py` (lines 623-742)

### Frontend Changes

#### 2. Updated `useFundLedger` Hook
**File:** `apps/web/src/features/finance/funds/hooks/use-fund-ledger.ts`

**New Features:**
- Fetches positions data alongside orders, transactions, transfers
- Returns position summary with market values

**New Return Values:**
```typescript
{
  positions: FundPosition[],
  positionsSummary: PositionsSummary,
  // ... existing fields
}
```

#### 3. Updated Balance Calculations
**File:** `apps/web/src/features/finance/funds/utils/ledger-calculations.ts`

**New `FundBalanceCalculation` Structure:**
```typescript
{
  // Net Worth
  netWorth: number,           // cashBalance + positionValue
  
  // Components
  cashBalance: number,        // deposits - withdrawals - buys + sells
  positionValue: number,      // current market value of holdings
  
  // P&L Breakdown
  realizedPnL: number,        // profits from closed trades
  unrealizedPnL: number,      // gains/losses on open positions
  totalPnL: number,           // realizedPnL + unrealizedPnL
  
  // Details
  totalDeposits: number,
  totalWithdrawals: number,
  totalBuys: number,
  totalSells: number,
}
```

**Performance Calculation Updates:**
- Now includes unrealized P&L in performance metrics
- Correctly calculates returns including current positions
- Performance windows (Day/Week/Month/Year) show total P&L (realized + unrealized)

#### 4. Updated UI: `FundPerformanceCard`
**File:** `apps/web/src/features/finance/funds/components/fund-performance-card.tsx`

**Display Changes:**

**Before:**
```
Current Balance: $5,000
Realized P&L: +$500
```

**After:**
```
Net Worth: $17,000
├─ Cash: $5,000
├─ Positions: $12,000
└─ Total P&L: +$2,500
   ├─ Realized P&L: +$500
   └─ Unrealized P&L: +$2,000
```

## Key Benefits

### 1. Accurate Net Worth
Shows true account value including:
- Cash available for trading
- Current value of all holdings
- Total unrealized gains/losses

### 2. Complete P&L Picture
Breaks down performance into:
- **Realized P&L**: Profits from completed round trips
- **Unrealized P&L**: Paper gains/losses on open positions  
- **Total P&L**: Combined performance

### 3. Better Performance Metrics
Time windows (Day/Week/Month/Year) now show:
- Total returns including unrealized gains
- More accurate percentage returns
- Real-time position values

### 4. Works Always
Position calculation works whether fund is:
- ✅ Actively trading
- ✅ Stopped/paused
- ✅ During or after market hours

## Technical Details

### Position Calculation (FIFO)
```python
# When you buy
position_tracker[symbol]["quantity"] += quantity
position_tracker[symbol]["total_cost"] += total_value

# When you sell
avg_cost_per_share = total_cost / quantity
position_tracker[symbol]["quantity"] -= quantity
position_tracker[symbol]["total_cost"] -= (quantity * avg_cost_per_share)
```

### Net Worth Calculation
```typescript
// Cash position
cashBalance = totalDeposits - totalWithdrawals - totalBuys + totalSells

// Get current position values
positionValue = sum of (quantity * current_price) for all holdings

// Net worth
netWorth = cashBalance + positionValue

// Total P&L
realizedPnL = totalSells - totalBuys  // from closed trades
unrealizedPnL = positionValue - costBasis  // from open positions
totalPnL = realizedPnL + unrealizedPnL
```

### Performance Window Calculation
```typescript
// Start: cash balance at beginning of period
startBalance = calculateBalance(beforeTransfers, beforeTransactions, emptyPositions)

// End: net worth at end of period (includes current positions)
endNetWorth = calculateBalance(allTransfers, allTransactions, currentPositions)

// P&L: change in net worth excluding new deposits
pnl = endNetWorth - startBalance - netTransfers

// Return %: P&L relative to total invested
returnPercent = (pnl / totalNetDeposits) * 100
```

## Files Modified

### Backend
- `apps/server/app/routers/funds.py` - New positions/summary endpoint

### Frontend
- `apps/web/src/features/finance/funds/hooks/use-fund-ledger.ts` - Fetch positions
- `apps/web/src/features/finance/funds/hooks/use-fund-performance.ts` - Pass positions to calculations
- `apps/web/src/features/finance/funds/utils/ledger-calculations.ts` - Updated calculations
- `apps/web/src/features/finance/funds/components/fund-overview.tsx` - Use positions data
- `apps/web/src/features/finance/funds/components/fund-performance-card.tsx` - Updated UI

## Error Handling

The system gracefully handles:
- **Missing prices**: Shows position without market value if price unavailable
- **Market closed**: Falls back to last known price or shows null
- **No positions**: Shows $0 for position value, works normally
- **API failures**: Logs warning, continues with available data

## Example Scenarios

### Scenario 1: Simple Trade
```
Initial: Deposit $10,000

Buy AAPL: $5,000 (10 shares @ $500)
- Cash: $5,000
- Positions: $5,000 (cost)
- Net Worth: $10,000

AAPL rises to $600:
- Cash: $5,000
- Positions: $6,000 (market value)
- Net Worth: $11,000
- Unrealized P&L: +$1,000
- Total P&L: +$1,000
```

### Scenario 2: Multiple Trades
```
Day 1: Deposit $10,000, Buy AAPL $5,000
Day 2: AAPL rises 10%, Sell for $5,500
Day 3: Buy TSLA $5,000

Current state:
- Cash: $5,500
- Positions: TSLA worth $5,200 (up 4%)
- Net Worth: $10,700
- Realized P&L: +$500 (from AAPL trade)
- Unrealized P&L: +$200 (from TSLA position)
- Total P&L: +$700
```

## Testing

Test the endpoint:
```bash
curl http://localhost:8000/api/funds/{fund_id}/positions/summary
```

Expected response includes:
- List of current positions with market values
- Summary with total market value and unrealized P&L
- Graceful handling of unavailable prices

## Future Enhancements

Possible improvements:
1. Historical position tracking for better time-window accuracy
2. Intraday position snapshots for more precise performance
3. Cost basis adjustment for dividends/splits
4. Tax lot tracking for more accurate FIFO/LIFO
5. Position-level performance attribution


