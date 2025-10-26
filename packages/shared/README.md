# @printer/shared

Shared TypeScript types for the Printer monorepo, with a focus on Trading Command Center (TCC) functionality.

## Purpose

This package contains type definitions that are shared between the frontend (`apps/web`) and potentially other applications in the monorepo. Currently focused on:

- **Alpaca Trading Types**: Account, positions, orders, market data
- **Market Data Types**: Real-time streaming, aggregate bars
- **NOC/TCC Types**: Network Operations Center stock data and signals

## Usage

```typescript
import {
  AlpacaAccount,
  AlpacaOrder,
  NocStockData,
  AggregateBar,
} from "@printer/shared";
```

## Type Categories

### Alpaca Trading (`types/alpaca.ts`)

Types for the Alpaca Trading API integration:

- Account management
- Positions and orders
- Market data and quotes
- OAuth authentication

### Market Data (`types/market.ts`)

Types for real-time market data streaming:

- Aggregate bars from Polygon
- WebSocket streaming options
- Market stream hooks

### NOC/TCC (`types/noc.ts`)

Types for the Trading Command Center:

- Stock indicators and signals
- Screener results
- NOC stock data structure

## Maintenance

When adding new shared types:

1. Add the type definition to the appropriate file in `src/types/`
2. Export it from `src/index.ts`
3. Update this README if adding a new category

