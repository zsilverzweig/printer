# TimescaleDB Real-time Market Data Setup

## Quick Start

### 1. Run Migrations

```bash
cd apps/server
alembic upgrade head
```

This creates:

- Migration 019: `symbol_date_validation` table for tracking data completeness
- Migration 020: `market_data_5m`, `market_data_15m`, `market_data_1h`, `market_data_daily` continuous aggregates

### 2. Enable Services

Edit your `env.local`:

```bash
# Enable real-time ingestion from Polygon WebSocket (AM.* - all minute bars)
MARKET_DATA_INGESTION_ENABLED=true

# Enable automatic backfill of missing data
MARKET_DATA_BACKFILL_ENABLED=true

# Health check interval (optional, default 300s)
MARKET_DATA_HEALTH_CHECK_INTERVAL=300
```

### 3. Start Server

```bash
./start_server.sh
```

The server will:

1. Initialize health monitoring
2. Run initial gap detection
3. Start real-time WebSocket ingestion (if enabled)
4. Start smart backfill service (if enabled)
5. Load screener data from TimescaleDB

### 4. Load Historical Data

Option A: Let it accumulate naturally (real-time ingestion + backfill will fill gaps)

Option B: Manually trigger historical load:

```bash
curl -X POST http://localhost:8000/api/market/historical/load \
  -H "Content-Type: application/json" \
  -d '{
    "days": 30,
    "symbols": null
  }'
```

Check status:

```bash
curl http://localhost:8000/api/market/historical/stats
```

## Monitoring Endpoints

### Ingestion Status

```bash
curl http://localhost:8000/api/market/ingestion/status
```

### Gap Detection

```bash
curl http://localhost:8000/api/market/gaps
```

Manually trigger:

```bash
curl -X POST http://localhost:8000/api/market/gaps/detect
```

### Backfill Status

```bash
curl http://localhost:8000/api/market/backfill/status
```

Manually backfill a symbol:

```bash
curl -X POST "http://localhost:8000/api/market/backfill/AAPL?start_date=2025-10-01&end_date=2025-10-31"
```

### Data Completeness

```bash
curl http://localhost:8000/api/market/completeness/AAPL?days=30
```

## Architecture

### Data Flow

```
Polygon WebSocket (AM.*)
  ↓
Real-time Ingestion Service (10s batches)
  ↓
TimescaleDB (market_data_minute)
  ↓
Continuous Aggregates (auto-refresh)
  ├─ market_data_5m
  ├─ market_data_15m
  ├─ market_data_1h
  └─ market_data_daily
  ↓
Screener Service (rv14 calculation)
```

### Background Services

1. **Health Monitor** (every 5 min)

   - Checks data freshness
   - Validates completeness coverage
   - Detects gaps

2. **Gap Detector** (on startup + via health monitor)

   - Scans for missing data
   - Prioritizes gaps for backfill

3. **Smart Backfill** (continuous)
   - Processes gap queue
   - Rate-limited to avoid API throttling
   - Updates validation tracking

## Key Changes from Legacy System

### Before (Polygon Grouped Daily API)

- Loaded 60 days of grouped daily data on startup
- Stored in memory (Dict[symbol, Deque[volume]])
- Calculated rv14, rv30, rv60 from in-memory data
- No persistence or validation tracking

### After (TimescaleDB)

- Real-time ingestion via WebSocket
- Persistent storage with compression
- Continuous aggregates for fast queries
- Validation tracking for data completeness
- Only calculates rv14 (simplified per requirements)
- Graceful degradation when data incomplete

## Troubleshooting

### Screener shows no data

- Check if historical data is loaded: `GET /api/market/historical/stats`
- Verify validation records exist: `GET /api/market/completeness/AAPL`
- Run gap detection: `POST /api/market/gaps/detect`
- Trigger backfill if needed

### Ingestion not working

- Check API key is set
- Verify `MARKET_DATA_INGESTION_ENABLED=true`
- Check ingestion status: `GET /api/market/ingestion/status`
- Look for errors in server logs

### High CPU usage

- Check batch interval (default 10s)
- Verify continuous aggregate refresh policies
- Monitor DB compression status

## Migration Notes

- Screener now requires at least 14 days of complete data per symbol
- rv30 and rv60 removed from output (only rv14)
- Price history tracker still uses in-memory state (can migrate later)
