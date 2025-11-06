# Order, Transaction, Trade, and Position Architecture

This document describes the current state and ideal state for how Orders, Transactions, Trades, and Positions interact in the Printer trading system.

## Entity Definitions

### Order

- **Purpose**: Request to buy/sell (placed with Alpaca)
- **Status**: `pending`, `filled`, `canceled`, `failed`, etc.
- **Can be**: Partially filled (multiple fills = multiple transactions)
- **Links to**: `alpaca_order_id`, `trade_id` (optional)

### Transaction

- **Purpose**: Actual execution/fill of an order (the ledger)
- **Created**: When an order is filled (fully or partially)
- **Contains**: `symbol`, `side` (buy/sell), `quantity`, `price`, `total_value`, `timestamp`
- **Links to**: `order_id`, `trade_id`, `alpaca_fill_id`
- **One order can produce**: Multiple transactions (if partially filled)

### Trade

- **Purpose**: Complete lifecycle from entry to exit
- **Aggregates**: Multiple transactions (entry + exit)
- **Tracks**: Performance metrics (P&L, hold duration, MAE/MFE)
- **Links to**: `entry_order_id`, `exit_order_id`, entry/exit transactions via `trade_id`

### Position

- **Purpose**: Current holdings (calculated, not stored)
- **Source of Truth**: Calculated from Transaction ledger (FIFO)
- **Contains**: `symbol`, `quantity`, `avg_entry_price`, `cost_basis`, `current_price`, `unrealized_pnl`
- **Validated Against**: Alpaca positions API

---

## Current State

### Entity Relationship Diagram

```mermaid
erDiagram
    Order ||--o{ Transaction : has_fills
    Order }o--|| Trade : may_link_to
    Transaction }o--|| Trade : links_to
    Transaction }o--|| Order : belongs_to

    Order {
        string id PK
        string alpaca_order_id
        string fund_id FK
        string symbol
        string side
        float quantity
        string status
        string trade_id FK
    }

    Transaction {
        string id PK
        string order_id FK
        string trade_id FK
        string fund_id FK
        string symbol
        string side
        float quantity
        float price
        float total_value
        datetime timestamp
    }

    Trade {
        string id PK
        string fund_id FK
        string symbol
        string entry_order_id FK
        string exit_order_id FK
        datetime entry_time
        datetime exit_time
        float entry_price
        float exit_price
        float realized_pnl
        string status
    }

    Position {
        string symbol
        float quantity
        float avg_entry_price
        float cost_basis
        float current_price
        float unrealized_pnl
    }
```

### Current Flow: Order → Transaction → Trade → Position

```mermaid
sequenceDiagram
    participant Strategy
    participant OrderExecutor
    participant Alpaca
    participant TradeEventHandler
    participant TransactionService
    participant TradeBuilder
    participant PositionCalculator

    Strategy->>OrderExecutor: Request buy order
    OrderExecutor->>Order: Create Order record (status: pending)
    OrderExecutor->>Alpaca: Place order via API
    Alpaca-->>OrderExecutor: Order accepted (alpaca_order_id)

    Note over Alpaca: Order fills (fully or partially)
    Alpaca->>TradeEventHandler: WebSocket: trade_update (fill)
    TradeEventHandler->>TransactionService: Create Transaction from fill
    TransactionService->>Transaction: Create Transaction record
    TransactionService->>Order: Update Order (status: filled, filled_qty)

    alt Buy Order (Entry)
        TransactionService->>TradeBuilder: Create Trade from entry
        TradeBuilder->>Trade: Create Trade record (status: open)
        TradeBuilder->>Transaction: Link transaction to trade_id
        TradeBuilder->>Order: Link order to trade_id
    end

    Note over PositionCalculator: Position calculated on-demand
    PositionCalculator->>Transaction: Query all transactions (FIFO)
    PositionCalculator->>PositionCalculator: Calculate net quantity, cost basis
    PositionCalculator->>Market: Fetch current price
    PositionCalculator->>Position: Return calculated position
```

### Current Position Calculation

```mermaid
flowchart TD
    A[Get Positions Request] --> B{Fund Running?}
    B -->|Yes| C[Get from Engine]
    B -->|No| D[Calculate from Transactions]

    C --> E[Query Alpaca Positions API]
    D --> F[Query Transaction Table]

    F --> G[Group by Symbol]
    G --> H[Apply FIFO Logic]
    H --> I[Calculate Net Quantity]
    I --> J[Calculate Cost Basis]
    J --> K[Fetch Current Prices]
    K --> L[Calculate Unrealized P&L]

    E --> M[Compare with DB]
    L --> M
    M --> N[Return Positions + Sync Issues]

    style D fill:#e1f5ff
    style F fill:#e1f5ff
    style H fill:#e1f5ff
    style I fill:#e1f5ff
    style J fill:#e1f5ff
```

### Current Issues

1. **Position is Calculated, Not Stored**

   - Must query all transactions every time
   - FIFO calculation is expensive for large histories
   - No caching mechanism

2. **Trade Creation Timing**

   - Trade created on first buy transaction
   - But trade_id may not be set on order immediately
   - Can lead to orphaned transactions

3. **Position Sync Complexity**

   - Must compare calculated positions with Alpaca
   - Complex logic to handle multi-fund scenarios
   - Sync issues require manual reconciliation

4. **No Direct Position → Trade Link**
   - Positions calculated independently
   - Must query trades separately to see which trades are open
   - No clear mapping: "This position = This trade"

---

## Ideal State

### Entity Relationship Diagram (Ideal)

```mermaid
erDiagram
    Order ||--o{ Transaction : has_fills
    Order }o--|| Trade : may_link_to
    Transaction }o--|| Trade : links_to
    Transaction }o--|| Order : belongs_to
    Trade ||--|| Position : one_to_one
    Position }o--|| Trade : belongs_to

    Order {
        string id PK
        string alpaca_order_id
        string fund_id FK
        string symbol
        string side
        float quantity
        string status
        string trade_id FK
    }

    Transaction {
        string id PK
        string order_id FK
        string trade_id FK
        string fund_id FK
        string symbol
        string side
        float quantity
        float price
        float total_value
        datetime timestamp
    }

    Trade {
        string id PK
        string fund_id FK
        string symbol
        string entry_order_id FK
        string exit_order_id FK
        datetime entry_time
        datetime exit_time
        float entry_price
        float exit_price
        float realized_pnl
        string status
    }

    Position {
        string id PK
        string fund_id FK
        string symbol
        string trade_id FK
        float quantity
        float avg_entry_price
        float cost_basis
        float current_price
        float unrealized_pnl
        datetime last_updated
    }
```

### Ideal Flow: Order → Transaction → Trade → Position

```mermaid
sequenceDiagram
    participant Strategy
    participant OrderExecutor
    participant Alpaca
    participant TradeEventHandler
    participant TransactionService
    participant TradeBuilder
    participant PositionService

    Strategy->>OrderExecutor: Request buy order
    OrderExecutor->>Order: Create Order record (status: pending)
    OrderExecutor->>Alpaca: Place order via API
    Alpaca-->>OrderExecutor: Order accepted (alpaca_order_id)

    Note over Alpaca: Order fills (fully or partially)
    Alpaca->>TradeEventHandler: WebSocket: trade_update (fill)
    TradeEventHandler->>TransactionService: Create Transaction from fill
    TransactionService->>Transaction: Create Transaction record

    alt Buy Order (Entry)
        TransactionService->>TradeBuilder: Create or Update Trade
        TradeBuilder->>Trade: Create Trade (status: open)
        TradeBuilder->>PositionService: Create Position (linked to Trade)
        PositionService->>Position: Create Position record
        PositionService->>Transaction: Link transaction to trade_id
        PositionService->>Order: Link order to trade_id
    else Sell Order (Exit)
        TransactionService->>TradeBuilder: Close Trade
        TradeBuilder->>Trade: Update Trade (status: closed, exit_price, P&L)
        TradeBuilder->>PositionService: Update Position (reduce quantity)
        PositionService->>Position: Update Position (quantity, cost_basis)
        alt Position Fully Closed
            PositionService->>Position: Mark Position as closed (or delete)
        end
    end

    Note over PositionService: Position always in sync with transactions
    PositionService->>Position: Update quantity, cost_basis, avg_entry_price
```

### Ideal Position Management

```mermaid
flowchart TD
    A[Transaction Created] --> B{Transaction Side?}
    B -->|Buy| C[Get or Create Position]
    B -->|Sell| D[Get Existing Position]

    C --> E[Position.quantity += txn.quantity]
    C --> F[Position.cost_basis += txn.total_value]
    C --> G[Position.avg_entry_price = cost_basis / quantity]
    C --> H[Position.trade_id = trade.id]

    D --> I[Position.quantity -= txn.quantity]
    D --> J[Position.cost_basis -= txn.quantity * avg_entry_price]
    D --> K{Position.quantity <= 0?}
    K -->|Yes| L[Close Position or Delete]
    K -->|No| M[Update Position]

    E --> N[Position Updated]
    F --> N
    G --> N
    H --> N
    I --> N
    J --> N
    M --> N

    N --> O[Market Data Update]
    O --> P[Position.current_price = market_price]
    P --> Q[Position.unrealized_pnl = calculated]

    style C fill:#90EE90
    style D fill:#90EE90
    style E fill:#90EE90
    style F fill:#90EE90
    style G fill:#90EE90
    style H fill:#90EE90
    style I fill:#90EE90
    style J fill:#90EE90
    style N fill:#90EE90
```

### Ideal Position Query Flow

```mermaid
flowchart TD
    A[Get Positions Request] --> B[Query Position Table]
    B --> C[Filter by fund_id]
    C --> D[Filter by status = open]
    D --> E[Join with Trade for context]
    E --> F[Fetch Current Prices]
    F --> G[Calculate Unrealized P&L]
    G --> H[Return Positions]

    I[Validate Against Alpaca] --> J{Match?}
    J -->|Yes| K[Return Positions]
    J -->|No| L[Log Sync Issue]
    L --> M[Reconciliation Service]

    style B fill:#90EE90
    style C fill:#90EE90
    style D fill:#90EE90
    style E fill:#90EE90
    style H fill:#90EE90
```

### Key Improvements in Ideal State

1. **Position as Stored Entity**

   - Position table stores current state
   - Updated incrementally on each transaction
   - No need to recalculate from full transaction history
   - Fast queries: `SELECT * FROM positions WHERE fund_id = ? AND status = 'open'`

2. **1:1 Trade ↔ Position Relationship**

   - Each open Trade has exactly one Position
   - Each Position belongs to exactly one Trade
   - Clear mapping: "This position = This trade"
   - When trade closes, position closes (or deletes)

3. **Incremental Updates**

   - Position updated on transaction creation
   - No need to recalculate from scratch
   - Atomic updates ensure consistency

4. **Simplified Sync**

   - Position table is source of truth for DB
   - Compare with Alpaca positions
   - Reconciliation service can update positions directly

5. **Better Query Performance**
   - Direct table queries instead of transaction aggregation
   - Can index on `fund_id`, `symbol`, `status`
   - Supports efficient filtering and sorting

---

## Migration Path

### Phase 1: Add Position Table

```sql
CREATE TABLE positions (
    id VARCHAR(36) PRIMARY KEY,
    fund_id VARCHAR(36) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    trade_id VARCHAR(36) UNIQUE,  -- 1:1 with open Trade
    quantity FLOAT NOT NULL,
    avg_entry_price FLOAT NOT NULL,
    cost_basis FLOAT NOT NULL,
    current_price FLOAT,
    unrealized_pnl FLOAT,
    unrealized_pnl_percent FLOAT,
    status VARCHAR(20) DEFAULT 'open',  -- open, closed
    last_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (fund_id) REFERENCES funds(id),
    FOREIGN KEY (trade_id) REFERENCES trades(id)
);

CREATE INDEX idx_positions_fund_status ON positions(fund_id, status);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_positions_trade_id ON positions(trade_id);
```

### Phase 2: Backfill Positions

- Calculate current positions from transaction history
- Create Position records for all open positions
- Link to existing open Trades

### Phase 3: Update Transaction Handlers

- Modify `TransactionService` to update Position on create
- Modify `TradeBuilder` to create/update Position
- Ensure atomic updates (transaction + position in same DB transaction)

### Phase 4: Update Position Queries

- Replace transaction aggregation with Position table queries
- Keep Alpaca sync validation
- Update reconciliation service to use Position table

### Phase 5: Deprecate Old Calculation

- Remove transaction-based position calculation
- Keep as fallback for validation/reconciliation

---

## Benefits Summary

### Current State

- ✅ Simple: Positions calculated from transactions
- ❌ Slow: Must query all transactions
- ❌ Complex: FIFO calculation on every request
- ❌ No direct Trade ↔ Position link

### Ideal State

- ✅ Fast: Direct table queries
- ✅ Simple: Incremental updates
- ✅ Clear: 1:1 Trade ↔ Position relationship
- ✅ Efficient: Indexed queries
- ✅ Consistent: Atomic updates

---

## Notes

- **Position is a derived entity**: It's calculated from transactions, but storing it makes queries much faster
- **Trade is the business entity**: Represents a complete trade lifecycle
- **Transaction is the ledger**: Immutable record of all fills
- **Order is the request**: What we asked Alpaca to do
- **Position is the current state**: What we currently hold (derived but stored for performance)
