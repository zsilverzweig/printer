# Reconciliation Services Analysis

## Existing Services Overview

### 1. `reconciliation_service.py` (Automatic Position Reconciliation)

**Purpose**: Automatic position reconciliation with Fibonacci backoff retry logic

**Location**: `app/services/trading/reconciliation_service.py`

**Responsibilities**:

- Schedules reconciliation checks after order placement
- Uses Fibonacci backoff (1, 1, 2, 3, 5, 8, 13 seconds)
- Auto-corrects discrepancies by querying Activities API
- Delegates to `TradingReconciliationService` for actual correction
- Used by `order_executor.py` after every order

**Key Methods**:

- `schedule_order_reconciliation()` - Background retry logic
- `reconcile_symbol()` - Check if position matches Alpaca
- `auto_correct_from_activities()` - Correct using Activities API

---

### 2. `trading_reconciliation_service.py` (Manual Reconciliation)

**Purpose**: Manual reconciliation service using Alpaca's Activities API as source of truth

**Location**: `app/services/trading/trading_reconciliation_service.py`

**Responsibilities**:

- Manual "Sync Positions" button functionality
- Startup reconciliation (catches orders placed while offline)
- Uses Activities API to find missing fills
- Creates missing Transaction records
- Auto-updates Trade records after transactions

**Key Methods**:

- `reconcile_fund_positions()` - Full fund reconciliation
- `get_missing_fills()` - Query Activities API for fills
- `auto_correct_position()` - Create missing transactions from fills
- `_auto_update_trades_for_symbol()` - Update Trade records after transactions

**Used By**:

- `reconciliation_service.py` (for auto-correction)
- `funds.py` endpoint `/funds/{fund_id}/reconcile-positions`
- `strategy_engine.py` (startup reconciliation)

---

### 3. `position_sync_service.py` (Position Syncing)

**Purpose**: Sync positions from Alpaca and detect closed positions

**Location**: `app/services/strategies/position_sync_service.py`

**Responsibilities**:

- Refresh positions from Alpaca
- Filter positions by fund ownership
- Detect positions closed in Alpaca but still in DB
- Trigger reconciliation for closed positions
- Used by `strategy_engine.py` for position management

**Key Methods**:

- `refresh_positions_from_alpaca()` - Get positions and filter by fund
- `_reconcile_closed_position()` - Reconcile positions closed in Alpaca
- `_get_fund_symbols()` - Get symbols owned by fund

---

## Reconciliation Code in `funds.py`

### 1. `_recreate_missing_trade()` (Lines 1536-1714)

**Purpose**: Recreate missing Trade records from orders and transactions

**Current Location**: `app/routers/funds.py`

**Scope**: ~180 lines

**What it does**:

- Takes an order with a `trade_id` but no Trade record
- Reconstructs Trade from order's transactions
- Handles both buy (entry) and sell (exit) orders
- Uses FIFO matching for sell orders without existing trades
- Updates all related transactions and orders with `trade_id`

**Relationship to existing services**:

- **Complementary**: `trading_reconciliation_service.py` has `_auto_update_trades_for_symbol()` but it's called after transactions are created
- **Gap**: No existing service handles Trade record recreation from orders that have transactions but missing Trade records
- **Overlap**: Both use `TradeBuilder` but for different scenarios

**Recommendation**: Extract to `app/services/funds/trade_recreation_service.py`

---

### 2. `close_orphaned_position()` (Lines 2148-2346)

**Purpose**: Close orphaned positions (exist in DB but not in Alpaca)

**Current Location**: `app/routers/funds.py`

**Scope**: ~200 lines

**What it does**:

- Identifies positions in DB that don't exist in Alpaca
- Creates synthetic sell transaction to close position
- Tries to find matching Alpaca sell order for actual exit price
- Falls back to breakeven price if no order found
- Updates fund balance

**Relationship to existing services**:

- **Overlap**: `position_sync_service._reconcile_closed_position()` detects closed positions but uses Activities API reconciliation
- **Gap**: No existing service handles orphaned positions (DB has position, Alpaca doesn't)
- **Different**: This is for manual cleanup, not automatic reconciliation

**Recommendation**: Extract to `app/services/funds/orphaned_position_service.py`

---

### 3. `close_all_orphaned_positions()` (Lines 2349-2575)

**Purpose**: Batch operation to close all orphaned positions

**Current Location**: `app/routers/funds.py`

**Scope**: ~230 lines

**What it does**:

- Identifies all orphaned positions for a fund
- Closes each one individually
- Returns summary of all positions closed

**Relationship to existing services**:

- **Same as above**: Batch version of `close_orphaned_position()`

**Recommendation**: Extract to same service as `close_orphaned_position()`

---

### 4. `reconcile_fund_balance()` (Lines 2077-2145)

**Purpose**: Diagnostic check if fund balance matches ledger calculation

**Current Location**: `app/routers/funds.py`

**Scope**: ~70 lines

**What it does**:

- Calculates what balance SHOULD be from transfers + transactions
- Compares with actual fund.balance
- Returns discrepancy for diagnostics

**Relationship to existing services**:

- **Unique**: No existing service does balance reconciliation
- **Different scope**: This is balance-level, not position-level
- **Note**: Comment says "not a source of truth due to timing issues"

**Recommendation**: Extract to `app/services/funds/balance_reconciliation_service.py` or include in `fund_service.py`

---

## Service Relationships Diagram

```
┌─────────────────────────────────────────────────────────────┐
│              PRIMARY ORDER FLOW (Normal Operation)          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  order_executor.py                                           │
│  ────────────────────────                                    │
│  • Places order via AlpacaService                            │
│  • Creates Order record in DB                                │
│  • Schedules reconciliation (backup)                         │
│        │                                                      │
│        ▼                                                      │
│  ┌──────────────────────────────────────┐                   │
│  │  Alpaca WebSocket                     │                   │
│  │  (trade_updates stream)               │                   │
│  │  ────────────────────────             │                   │
│  │  • Receives real-time order events    │                   │
│  │  • new, fill, partial_fill, canceled  │                   │
│  └──────────────────────────────────────┘                   │
│        │                                                      │
│        ▼                                                      │
│  ┌──────────────────────────────────────┐                   │
│  │  trade_event_handler.py               │                   │
│  │  (PRIMARY Transaction Creator)        │                   │
│  │  ────────────────────────             │                   │
│  │  • handle_trade_update()              │                   │
│  │  • Creates Transaction records        │                   │
│  │  • Updates Order records              │                   │
│  │  • Updates Trade records              │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│         RECONCILIATION FLOW (Backup/Manual/Fallback)        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  funds.py (Router)                                           │
│  - Endpoints for reconciliation actions                      │
│        │                                                      │
│        ├──────────────────────────────┐                      │
│        │                              │                      │
│        ▼                              ▼                      │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  │  reconciliation_service.py            │  │  trading_reconciliation_service.py   │
│  │  (Automatic - Background)             │  │  (Manual - Activities API)           │
│  │  ────────────────────────             │  │  ────────────────────────            │
│  │  • schedule_order_reconciliation()    │  │  • reconcile_fund_positions()        │
│  │  • reconcile_symbol()                 │──┼──► • auto_correct_position()         │
│  │  • auto_correct_from_activities()     │  │  • get_missing_fills()               │
│  │  • Uses Activities API as source      │  │  • Uses Activities API as source     │
│  │  • Only runs if WebSocket missed      │  │  • Manual "Sync Positions" button    │
│  └──────────────────────────────────────┘  └──────────────────────────────────────┘
│        │                                                      │
│        │                                                      │
│        ▼                                                      │
│  ┌──────────────────────────────────────┐                   │
│  │  position_sync_service.py             │                   │
│  │  (Position Refresh & Detection)       │                   │
│  │  ────────────────────────             │                   │
│  │  • refresh_positions_from_alpaca()    │                   │
│  │  • _reconcile_closed_position()       │──┐                │
│  └──────────────────────────────────────┘  │                │
│                                             │                │
│                                             │ Uses            │
│                                             ▼                 │
│  ┌──────────────────────────────────────┐                   │
│  │  reconciliation_service.py            │                   │
│  │  (for auto-correction)                │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  NEW SERVICES TO EXTRACT FROM funds.py:                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  trade_recreation_service.py                                 │
│  • recreate_missing_trade()                                  │
│                                                              │
│  orphaned_position_service.py                                │
│  • close_orphaned_position()                                 │
│  • close_all_orphaned_positions()                            │
│                                                              │
│  balance_reconciliation_service.py (or fund_service.py)      │
│  • reconcile_fund_balance()                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Consolidation Recommendations

### 1. Trade Recreation Service

**File**: `app/services/funds/trade_recreation_service.py`

**Rationale**:

- Fills gap: No existing service handles Trade record recreation from orders
- Different from `_auto_update_trades_for_symbol()` which updates existing trades
- Can be used by order validation endpoints

**Dependencies**:

- `TradeBuilder` (already used)
- `Order`, `Transaction`, `Trade` models

---

### 2. Orphaned Position Service

**File**: `app/services/funds/orphaned_position_service.py`

**Rationale**:

- Distinct from `position_sync_service` which handles positions closed in Alpaca
- Handles opposite case: positions in DB but not in Alpaca
- Manual cleanup operation, not automatic reconciliation

**Dependencies**:

- `AlpacaService` (to check Alpaca positions)
- `Transaction`, `Order` models
- `fund_service` (to update balance)

**Potential Consolidation**:

- Could merge with `position_sync_service.py` but they handle opposite cases
- Better to keep separate for clarity

---

### 3. Balance Reconciliation

**File**: Include in `app/services/funds/fund_service.py` or separate service

**Rationale**:

- Simple diagnostic function
- Fits naturally with fund operations
- Different scope than position reconciliation

---

## Updated Refactoring Plan

### Phase 6 (Revised): Extract Trade Reconciliation

**Target**: `_recreate_missing_trade()` from `funds.py`

**New Service**: `app/services/funds/trade_recreation_service.py`

**Integration**: Can be called by order validation endpoints

### Phase 7 (Revised): Extract Orphaned Position Service

**Target**: `close_orphaned_position()` and `close_all_orphaned_positions()` from `funds.py`

**New Service**: `app/services/funds/orphaned_position_service.py`

**Integration**: Manual cleanup operations, separate from automatic reconciliation

### Phase 8 (Revised): Extract Balance Reconciliation

**Target**: `reconcile_fund_balance()` from `funds.py`

**New Service**: Include in `fund_service.py` or `app/services/funds/balance_reconciliation_service.py`

---

## Key Insights

1. **Clear Separation of Concerns**:

   - Automatic reconciliation (background, retry logic)
   - Manual reconciliation (Activities API, user-triggered)
   - Position syncing (refresh from Alpaca)
   - Trade recreation (fix missing Trade records)
   - Orphaned position cleanup (manual DB cleanup)
   - Balance reconciliation (diagnostic)

2. **No Redundancy**: Each service handles a distinct scenario

3. **Good Architecture**: Existing services are well-structured and follow single responsibility

4. **Extraction Opportunities**: Trade recreation and orphaned position cleanup are good candidates for extraction from router

5. **WebSocket Integration**: The Alpaca WebSocket is the PRIMARY transaction creation mechanism. Reconciliation services are backup/fallback mechanisms:
   - WebSocket handles normal order flow (real-time)
   - Reconciliation services catch missed events (WebSocket downtime, manual cleanup)
   - Activities API is used as source of truth for reconciliation
