# Background Metrics Loader API

## ⚠️ Deprecation Notice

The following metrics-related services have been **DEPRECATED** and will be removed in a future version:

- `MetricsCompletionService` - Old background metrics completion service
- `MetricsPopulator` - Old historical metrics backfill service

**BackgroundMetricsLoader is now the mothership for all metrics processing.** It provides:

- Unified processing of all historical daily data
- Better performance and reliability
- Simplified architecture without continuous background loops
- Health monitor integration for automatic triggering

All new development should use BackgroundMetricsLoader. Existing code using the deprecated services should migrate.

The Background Metrics Loader service now has API endpoints for monitoring and control.

## Endpoints

### GET `/market/background-metrics-loader/status`
Get the current status of the background metrics loader.

**Response:**
```json
{
  "running": true,
  "interval_seconds": 30,
  "batch_size": 5000,
  "last_cycle_stats": {
    "symbols_scanned": 5,
    "bars_processed": 1250,
    "metrics_calculated": 26250,
    "database_updates": 3,
    "errors": 0
  }
}
```

### POST `/market/background-metrics-loader/trigger`
Manually trigger one cycle of the background metrics loader.

**Response:**
```json
{
  "success": true,
  "stats": {
    "symbols_scanned": 5,
    "bars_processed": 1250,
    "metrics_calculated": 26250,
    "database_updates": 3,
    "errors": 0
  }
}
```

### POST `/market/background-metrics-loader/start`
Start the background metrics loader service.

**Response:**
```json
{
  "message": "Background metrics loader started"
}
```

### POST `/market/background-metrics-loader/stop`
Stop the background metrics loader service.

**Response:**
```json
{
  "message": "Background metrics loader stopped"
}
```

## Testing

Use the provided test script:

```bash
./test_background_loader_api.sh
```

Or test manually with curl:

```bash
# Check status
curl http://localhost:8000/market/background-metrics-loader/status

# Trigger a manual cycle
curl -X POST http://localhost:8000/market/background-metrics-loader/trigger

# Start the service
curl -X POST http://localhost:8000/market/background-metrics-loader/start

# Stop the service
curl -X POST http://localhost:8000/market/background-metrics-loader/stop
```

## Service Configuration

The service is configured via environment variables:

- `BACKGROUND_METRICS_LOADER_BATCH_SIZE=5000` - Batch size for processing

The service is automatically available and called by the health monitor when needed.

## What It Does

The Background Metrics Loader:
1. Called by the health monitor when checking daily data completeness
2. Scans for **ALL** 1day timescale bars (no date restriction) missing any metrics
3. Calculates technical indicators (EMA, RSI, MACD, Bollinger Bands, etc.) for those bars
4. Updates the database with the calculated metrics
5. Processes all symbols in batches for maximum throughput

This ensures your **complete historical daily market data** always has technical indicators for analysis and screening.
