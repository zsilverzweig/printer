# Ledger and Performance Tracking Update

## Summary

Successfully implemented comprehensive ledger tracking and performance metrics for fund management! The system now:

1. **Saves all trading activity to the database** (orders & transactions)
2. **Displays complete ledger history** (transfers, orders, and trades)
3. **Calculates fund balances from ledger** (deposits - withdrawals - buys + sells)
4. **Shows performance metrics** across multiple time windows (day/week/month/year/all-time)

---

## What Was Added

### 📊 Database Models (Already Existed)
- **Orders Table**: Tracks all order submissions with status updates
- **Transactions Table**: Records completed trades (filled orders)
- **Transfers Table**: Logs deposits/withdrawals to funds

### 🔧 Backend Services
- **Order Polling Service**: Syncs order status from Alpaca → Database
- **Transaction Creation**: Automatically creates transaction records when orders fill
- **API Endpoints**:
  - `GET /api/funds/{fund_id}/orders` - Order history
  - `GET /api/funds/{fund_id}/transactions` - Transaction ledger
  - `GET /api/funds/{fund_id}/transfers` - Transfer history

### 🎨 Frontend Components

#### New Components
1. **FundLedger** (`fund-ledger.tsx`)
   - Displays all ledger items in unified timeline
   - Tabs for filtering: All | Transfers | Orders | Trades
   - Color-coded by transaction type
   - Status badges for orders (pending, filled, cancelled)

2. **FundPerformanceCard** (`fund-performance-card.tsx`)
   - Current balance calculated from ledger
   - Balance breakdown (deposits, withdrawals, buys, sells, P&L)
   - Performance windows (day, week, month, year, all-time)
   - Win rate and trade statistics per period

#### New Hooks
1. **useFundLedger** - Fetches orders, transactions, and transfers
2. **useFundPerformance** - Calculates balance and performance metrics

#### New Utilities
- **ledger-calculations.ts**:
  - `calculateFundBalance()` - Derives balance from ledger
  - `calculatePerformanceMetrics()` - Computes P&L, ROI%, win rates
  - Time window calculations (1d, 7d, 30d, 365d, all-time)
  - Trade matching logic (FIFO basis for calculating wins/losses)

### 📦 Shared Types
Added to `@printer/shared`:
- `FundOrder` - Order record with status, timestamps, fill details
- `FundTransaction` - Completed trade with price, quantity, total value

---

## How It Works

### Balance Calculation
```
Current Balance = 
  Total Deposits 
  - Total Withdrawals 
  - Total Buys (cash out)
  + Total Sells (cash in)
```

### Performance Calculation
For each time window:
1. Calculate starting balance (before window)
2. Filter transactions within window
3. Calculate P&L = Total Sells - Total Buys
4. Calculate ROI% = (P&L / Starting Balance) × 100
5. Match buys with sells to determine winning/losing trades
6. Calculate win rate = Winning Trades / Total Trades

### Order → Transaction Flow
1. Strategy engine creates `Order` record in database
2. Order submitted to Alpaca via API
3. Order record updated with Alpaca order ID
4. Order polling service polls Alpaca every 5 seconds
5. When order fills, polling service:
   - Updates order status to "filled"
   - Creates `Transaction` record
   - Broadcasts event via WebSocket

---

## What You'll See

### Fund Overview Tab
- **Performance Cards**:
  - Current Balance (from ledger calculation)
  - Breakdown: Deposits, Withdrawals, Buys, Sells, Realized P&L
  - Performance table with 5 time windows
  - Win rate and trade count per window

### Ledger Tab
- **Unified Timeline** with tabs:
  - **All**: Combined view of everything
  - **Transfers**: Deposits and withdrawals
  - **Orders**: Pending, filled, and cancelled orders
  - **Trades**: Completed transactions (filled orders)

Each entry shows:
- Icon indicating type (deposit ↓, withdrawal ↑, buy ↗, sell ↘)
- Status badges for orders
- Timestamps
- Amounts with color coding (green for gains, red for costs)

---

## Testing

To test the new features:

1. **Create a fund** with initial deposit
2. **Start trading** (make sure polling service is running)
3. **Place orders** via strategy or manual trading
4. **Watch the ledger** populate as orders fill
5. **Check performance** metrics update in real-time
6. **Review balance** calculation vs. database balance

---

## Files Modified/Created

### Backend (Python)
- `apps/server/app/services/order_polling.py` - Already saving orders & transactions ✓
- `apps/server/app/services/strategy_engine.py` - Already creating orders ✓
- `apps/server/app/routers/funds.py` - Endpoints already exist ✓

### Frontend (TypeScript/React)
**New Files:**
- `apps/web/src/features/finance/funds/hooks/use-fund-ledger.ts`
- `apps/web/src/features/finance/funds/hooks/use-fund-performance.ts`
- `apps/web/src/features/finance/funds/utils/ledger-calculations.ts`
- `apps/web/src/features/finance/funds/components/fund-performance-card.tsx`

**Modified Files:**
- `packages/shared/src/types/funds.ts` - Added FundOrder & FundTransaction types
- `packages/shared/src/index.ts` - Exported new types
- `apps/web/src/features/finance/funds/types/index.ts` - Re-exported new types
- `apps/web/src/features/finance/funds/components/fund-ledger.tsx` - Complete rewrite
- `apps/web/src/features/finance/funds/components/fund-detail-view.tsx` - Use new ledger hook
- `apps/web/src/features/finance/funds/components/fund-overview.tsx` - Show performance
- `apps/web/src/features/finance/funds/index.ts` - Export new components & hooks

---

## Next Steps

Potential enhancements:
1. Add unrealized P&L from open positions (fetch current prices)
2. Export ledger to CSV
3. Charts for performance over time
4. Tax reporting (cost basis, realized gains)
5. Compare performance across multiple funds
6. Benchmark against market indices

---

## Notes

- ✅ Orders and transactions ARE being saved to the database
- ✅ Balance is now calculated from ledger (source of truth)
- ✅ Performance metrics calculated client-side (no backend changes needed)
- ✅ All calculations happen in real-time as ledger data loads
- ✅ No migration needed - existing database schema already supports this

