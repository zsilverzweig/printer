# Data Architecture & Flow Documentation

This document describes the complete data pipeline from Polygon API through storage, processing, and consumption in the Printer application.

## Overview

The Printer application ingests market data from Polygon.io, stores it in TimescaleDB (PostgreSQL with time-series extensions), and processes it through multiple layers:

1. **Data Ingestion**: Real-time WebSocket feeds and historical REST API calls
2. **Storage**: TimescaleDB hypertables for efficient time-series storage
3. **Validation**: Automatic tracking of data completeness per symbol/date/timescale
4. **Processing**: Technical indicators, screener metrics, and backtest lookup tables
5. **Consumption**: Services query processed data for strategies, screener, and backtesting

## Data Flow Diagram

```
Polygon API
    │
    ├─ REST API ──────────────────┐
    │   (Historical aggregates)   │
    │                             │
    └─ WebSocket ─────────────────┤
        (Real-time bars)          │
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  MarketDataService       │
                    │  (Data ingestion layer)  │
                    └─────────────────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  TimescaleDB             │
                    │  market_data table       │
                    │  (Hypertable)           │
                    └─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  Real-time Ingestion  │   │  Historical Loader    │
        │  (WebSocket → Batch)  │   │  (REST API → Batch)    │
        └───────────────────────┘   └───────────────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  SymbolDateValidation    │
                    │  (Completeness tracking) │
                    └─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  Technical Indicators │   │  Screener Metrics     │
        │  technical_indicators  │   │  screener_metrics     │
        └───────────────────────┘   └───────────────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │  Backtest Lookup         │
                    │  market_data_backtest_  │
                    │  lookup table            │
                    └─────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        ┌───────────────────────┐   ┌───────────────────────┐
        │  Strategy Engine       │   │  Screener Service     │
        │  (Live trading)        │   │  (Stock screening)    │
        └───────────────────────┘   └───────────────────────┘
```

## 1. Data Ingestion

### 1.1 Polygon API Integration

**Location**: `apps/server/app/core.py`, `apps/server/app/routers/market.py`

The application uses Polygon.io's REST API and WebSocket feeds:

- **REST Client**: Initialized in `app.core` with `RESTClient(api_key)`
- **Endpoints Used**:
  - `/v2/aggs/{ticker}` - Historical aggregate bars (used by historical loader)
  - `/v2/snapshot/locale/us/markets/stocks/tickers` - Real-time snapshots
  - WebSocket feeds: `A.{symbol}` (second bars), `AM.{symbol}` (minute bars)

// TODO We need trade/quote subscriptions. This isn't enough for real time.

### 1.2 Real-Time Ingestion

**Location**: `apps/server/app/services/market/realtime_ingestion.py`

**Flow**:

1. `RealtimeIngestionService` subscribes to Polygon WebSocket `AM.*` (all minute bars)
   // THIS IS SO SLOW, TODO at least second bars for real time!!
2. Messages are buffered in an async queue
3. Every 5-10 seconds (configurable), batch inserts are performed:
   - Uses PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` for upserts
   - Inserts into `market_data` table with `timescale='1min'`
   - Updates `SymbolDateValidation` table to track completeness
4. Metrics tracked: messages received, bars inserted, batch latency

TODO: can the app handle 10k bars a second? How long after the second does this close?

**Key Features**:

- Automatic reconnection on WebSocket failures
- Batch processing for efficiency (reduces database round-trips)
- Validation tracking integrated with ingestion

### 1.3 Historical Data Loading

**Location**: `apps/server/scripts/market_data_loader_core.py`, `apps/server/scripts/market_data_loader.py`

**Flow**:

1. Script queries `ticker_details` table for active symbols
2. For each symbol/date/timescale combination:
   - Checks `SymbolDateValidation` to see if data already exists
   - If missing, calls Polygon REST API `/v2/aggs/{ticker}`
   - Batch inserts bars into `market_data` table
   - Creates/updates `SymbolDateValidation` record
3. Supports multiple timescales: `1min`, `5min`, `15min`, `1hour`, `1day`

**Timescale Mapping**:

- `1min`: `multiplier=1, timespan='minute'`
- `5min`: `multiplier=5, timespan='minute'`
- `15min`: `multiplier=15, timespan='minute'`
- `1hour`: `multiplier=1, timespan='hour'`
- `1day`: `multiplier=1, timespan='day'`

**Expected Bar Counts** (per trading day):

- `1min`: 390 bars (9:30 AM - 4:00 PM)
- `5min`: 78 bars
- `15min`: 26 bars
- `1hour`: 7 bars
- `1day`: 1 bar

## 2. Data Storage

### 2.1 Market Data Table

**Location**: `apps/server/app/models/market_data.py`

**Table**: `market_data` (TimescaleDB hypertable)

**Schema**:

- `time` (datetime, timezone-aware, primary key)
- `symbol` (string, primary key)
- `timescale` (string, primary key): `'1min'`, `'5min'`, `'15min'`, `'1hour'`, `'1day'`
- `open`, `high`, `low`, `close` (numeric)
- `volume` (bigint)
- `vwap` (numeric, nullable)
- `trade_count` (integer, nullable)
- `session_type` (string): `'regular'`, `'pre'`, `'after'`

**Features**:

- Partitioned by time (TimescaleDB hypertable)
- Supports multiple timescales in single table
- Timezone-aware timestamps (UTC)
- Indexed on `(symbol, timescale, time)` for efficient queries

### 2.2 Validation Tracking

**Location**: `apps/server/app/models/market_data.py`

**Table**: `symbol_date_validation`

**Schema**:

- `symbol` (string, primary key)
- `date` (date, primary key)
- `timescale` (string, primary key)
- `is_complete` (boolean): True if all expected bars present
- `bar_count` (integer): Actual number of bars stored
- `expected_bars` (integer, nullable): Expected bar count
- `first_bar_time`, `last_bar_time` (datetime, nullable)
- `validated_at` (datetime): When validation was last updated
- `notes` (text, nullable): Any issues or notes

**Purpose**:

- Tracks data completeness per symbol/date/timescale
- Prevents unnecessary API calls (if validated, use DB data)
- Enables data quality monitoring
- Used by backtest system to verify data readiness

## 3. Data Processing

### 3.1 MarketDataService

**Location**: `apps/server/app/services/market/market_data_service.py`

**Purpose**: Single source of truth for all historical bar queries

**Features**:

- Database-first queries (TimescaleDB)
- Intelligent API fallback (only if data insufficient)
- Automatic caching of API results
- Batch query support for multiple symbols
- Backtest-aware (respects time context)
- Data quality validation

**Key Methods**:

- `get_bars()`: Get bars for single symbol
- `get_bars_batch()`: Get bars for multiple symbols (efficient batch query)
- `get_latest_prices_batch()`: Get latest prices for multiple symbols

**Backtest Support**:

- Checks `SymbolDateValidation` in backtest mode
- If validated, uses DB data exclusively (no API calls)
- Respects `get_current_time()` from time context

### 3.2 Technical Indicators

**Location**: `apps/server/app/services/backtest/technical_indicators_service.py`

**Table**: `technical_indicators`

**Purpose**: Pre-computed technical indicators for intraday timescales

**Indicators Calculated**:

- EMA (Exponential Moving Average) - multiple periods
- VWAP (Volume-Weighted Average Price)
- MACD (Moving Average Convergence Divergence)
- RSI (Relative Strength Index)
- ATR (Average True Range)
- Bollinger Bands

**Flow**:

1. Script `populate_technical_indicators.py` runs for specific dates
2. Queries `market_data` for bars at specified timescale
3. Calculates indicators using functions from `app.lib.technical_analysis`
4. Inserts into `technical_indicators` table with:
   - `symbol`, `time`, `timescale` (primary keys)
   - Indicator values (EMA, VWAP, MACD, RSI, ATR, BB)

**Usage**:

- Strategies query `technical_indicators` for fast indicator access
- Avoids recalculating indicators on every query
- Supports backtesting (pre-computed for historical dates)

### 3.3 Screener Metrics

**Location**: `apps/server/app/services/screener/screener_metrics_storage.py`

**Table**: `screener_metrics`

**Purpose**: Pre-calculated metrics for stock screening

**Metrics Stored**:

- Relative Volume: `rv14`, `rv30`, `rv60` (14/30/60-day averages)
- Price Levels: `high_90d`, `low_90d` (90-day high/low)
- Moving Averages: `sma_20`, `sma_50`, `sma_200`
- Technical Indicators: `rsi_14`, `macd_line`, `macd_signal`, `macd_histogram`
- Bollinger Bands: `bb_upper`, `bb_middle`, `bb_lower`
- ATR: `atr_14`
- Volume: `volume_ma_20`, `volume_trend`

**Flow**:

1. `screener_metrics_job.py` runs daily (or on-demand)
2. For each symbol, queries historical bars from `market_data`
3. Calculates metrics using `screener_indicators.py` functions
4. Bulk upserts into `screener_metrics` table (one row per symbol/date)

**Usage**:

- Screener service queries `screener_metrics` for fast screening
- Avoids recalculating metrics on every screener run
- Supports historical screening (for backtesting)

### 3.4 Backtest Lookup Table

**Location**: `apps/server/app/services/backtest/backtest_lookup_service.py`

**Table**: `market_data_backtest_lookup`

**Purpose**: Pre-computed "latest bar as-of" data for instant backtest queries

**Problem Solved**:

- Backtests need to answer: "What was the latest 5min bar for symbol X at time Y?"
- Without lookup table: Must scan backwards through history (slow)
- With lookup table: Instant lookup (milliseconds vs seconds)

**Schema**:

- `symbol` (string, primary key)
- `timescale` (string, primary key): Usually `'5min'` for screener
- `lookup_time` (datetime, primary key): The "as-of" timestamp
- `latest_bar_time` (datetime): When the actual latest bar occurred
- `close`, `open`, `high`, `low`, `volume`: OHLCV from latest bar

**Flow**:

1. Script `populate_backtest_lookup.py` runs for specific dates
2. For each trading minute (9:30 AM - 4:00 PM):
   - For each symbol:
     - Finds latest bar at or before `lookup_time`
     - Inserts into lookup table
3. Creates one row per symbol/minute combination

**Usage**:

- Backtest screener queries use lookup table for instant price data
- Enables fast backtesting (ms instead of seconds per query)

## 4. Backtest Time Context System

**Location**: `apps/server/app/services/core/time_context.py`

**Purpose**: Allows services to work in both live and backtest modes without modification

### How It Works

1. **Context Variable**: Uses Python `contextvars.ContextVar` for async-safe isolation
2. **Time Injection**: `get_current_time()` returns backtest time if in backtest mode, otherwise real time
3. **Isolation**: Each async task has its own context (concurrent backtests don't interfere)

### Usage Pattern

```python
from app.services.core.time_context import get_current_time, set_backtest_context

# In backtest code:
set_backtest_context("backtest-123", datetime(2024, 11, 3, 9, 30))

# In any service:
current_time = get_current_time()  # Returns backtest time or real time
```

### Services That Use Time Context

- `MarketDataService`: Queries historical data at backtest time
- `ScreenerService`: Screens stocks as-of backtest time
- `StrategyEngine`: Executes strategies at backtest time
- All services that need time awareness

### Benefits

- **No Code Duplication**: Same services work in live and backtest modes
- **Concurrent Execution**: Multiple backtests can run simultaneously
- **Consistent Behavior**: Services behave identically in both modes

## 5. Data Consumption

### 5.1 Strategy Engine

**Location**: `apps/server/app/services/strategies/strategy_engine.py`

**Data Sources**:

- `market_data`: Historical bars for entry/exit analysis
- `technical_indicators`: Pre-computed indicators
- `market_latest_trades`: Real-time trade data

**Flow**:

1. Strategy requests bars via `MarketDataService.get_bars()`
2. MarketDataService queries `market_data` (or API fallback)
3. Strategy analyzes bars and makes trading decisions
4. Orders executed through trading service

### 5.2 Screener Service

**Location**: `apps/server/app/services/screener/screener_data_unified.py`

**Data Sources**:

- `screener_metrics`: Pre-calculated metrics (RV, SMA, RSI, etc.)
- `market_data`: Current prices and volumes
- `market_latest_trades`: Real-time price updates

**Flow**:

1. Screener queries `screener_metrics` for historical metrics
2. Queries `market_data` or `market_latest_trades` for current prices
3. Calculates real-time metrics (if needed)
4. Filters and ranks stocks based on criteria
5. Returns top N stocks

### 5.3 Backtest System

**Location**: `apps/server/app/services/backtest/backtest_coordinator.py`

**Data Sources**:

- `market_data_backtest_lookup`: Pre-computed "as-of" prices
- `market_data`: Historical bars for strategy execution
- `technical_indicators`: Pre-computed indicators
- `screener_metrics`: Historical metrics

**Flow**:

1. Backtest sets time context: `set_backtest_context(backtest_id, start_time)`
2. Screener queries use lookup table for instant price data
3. Strategy queries use `MarketDataService` (respects time context)
4. Time advances: `update_backtest_time(next_time)`
5. Process repeats until end time reached
6. Context cleared: `clear_backtest_context()`

## 6. Data Models & Relationships

### Core Tables

```
market_data (TimescaleDB hypertable)
├── Primary Key: (time, symbol, timescale)
├── Indexes: (symbol, timescale, time)
└── Partitioned by: time

symbol_date_validation
├── Primary Key: (symbol, date, timescale)
└── Tracks: completeness, bar counts, validation status

technical_indicators
├── Primary Key: (symbol, time, timescale)
└── Stores: EMA, VWAP, MACD, RSI, ATR, Bollinger Bands

screener_metrics
├── Primary Key: (symbol, date)
└── Stores: RV, SMA, RSI, MACD, BB, ATR, volume metrics

market_data_backtest_lookup
├── Primary Key: (symbol, timescale, lookup_time)
└── Stores: latest bar as-of each minute

market_latest_trades
├── Primary Key: (symbol)
└── Stores: most recent trade (updated every 5 seconds)
```

### Data Relationships

- `market_data` → `symbol_date_validation`: One validation record per symbol/date/timescale
- `market_data` → `technical_indicators`: Indicators calculated from bars
- `market_data` → `screener_metrics`: Metrics calculated from bars
- `market_data` → `market_data_backtest_lookup`: Lookup pre-computed from bars

## 7. Timescales Supported

The system supports multiple timescales for different use cases:

| Timescale | Use Case                             | Expected Bars/Day | Storage       |
| --------- | ------------------------------------ | ----------------- | ------------- |
| `1min`    | Real-time trading, detailed analysis | 390               | `market_data` |
| `5min`    | Screener, backtesting                | 78                | `market_data` |
| `15min`   | Medium-term analysis                 | 26                | `market_data` |
| `1hour`   | Long-term analysis                   | 7                 | `market_data` |
| `1day`    | Daily charts, long-term trends       | 1                 | `market_data` |

All timescales are stored in the same `market_data` table, distinguished by the `timescale` column.

## 8. Session Types

Market data includes session type classification:

- **`regular`**: Regular trading hours (9:30 AM - 4:00 PM ET)
- **`pre`**: Pre-market hours (4:00 AM - 9:30 AM ET)
- **`after`**: After-hours (4:00 PM - 8:00 PM ET)

This allows filtering and analysis by trading session.

## 9. Data Quality & Validation

### Validation Process

1. **During Ingestion**:

   - Real-time ingestion updates `SymbolDateValidation` after each batch
   - Historical loader creates validation records after loading

2. **Validation Checks**:

   - Bar count vs expected bars
   - Time range coverage (first_bar_time to last_bar_time)
   - Completeness flag (`is_complete`)

3. **Usage**:
   - `MarketDataService` checks validation before API fallback
   - Backtest system verifies data readiness before running
   - Monitoring endpoints report validation status

### Data Quality Metrics

- **Coverage**: Percentage of symbols with data
- **Completeness**: Percentage of dates with complete data
- **Freshness**: Age of latest data
- **Gaps**: Missing bars or dates

## 10. Performance Optimizations

1. **TimescaleDB Hypertables**: Automatic partitioning by time
2. **Batch Queries**: `get_bars_batch()` for multiple symbols
3. **Pre-computed Metrics**: Screener metrics and technical indicators
4. **Backtest Lookup Table**: Instant "as-of" queries
5. **Validation Checks**: Avoid unnecessary API calls
6. **Indexes**: Optimized for time-series queries

## 11. Future Enhancements

Areas for improvement identified in the data architecture:

1. **Timeframe Tracking**: Ensure all metrics track source timeframe
2. **Timewindow RV**: Compare current periods to historical same-timewindow periods
3. **Enhanced Validation**: More comprehensive data quality checks
4. **Data Cleanup**: Scripts to fix data quality issues
5. **Monitoring Dashboard**: Real-time data quality visibility

## 12. Related Documentation

- **Polygon Capabilities**: See `polygon-capabilities.md` (to be created)
- **Database Setup**: See `TIMESCALEDB_SETUP.md`
- **Backtesting**: See `BACKTEST_IMPLEMENTATION_SUMMARY.md`
- **API Endpoints**: See `README.md` in server directory
