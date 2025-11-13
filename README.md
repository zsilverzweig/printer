# Printer

An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.

## Overview

Printer is a virtual investment firm powered by AI agents that work together to analyze companies, build investment theses, and manage portfolios. The system uses multi-agent collaboration, persistent context, and continuous learning to make investment decisions that improve over time.

## Automatic Data Maintenance

Printer keeps market data, derived metrics, and backtest snapshots in sync through a coordinated set of loaders and health checks. The table below calls out the dependencies so operators and AI agents understand the order of operations.

### Dependency Matrix

| Process                    | Input Data                                                         | Trigger(s)                                                                                                         | Output Tables/Flags                                                                                           | Health Owner                  | Recovery Notes                                                                                                  |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Market data ingestion      | Polygon REST aggregates per symbol/timescale                       | `MarketDataLoaderHealthCheck` (auto, every 5min)                                                                   | `market_data`, `symbol_date_validation`                                                                       | `MarketDataLoaderHealthCheck` | Auto-fills gaps every 5 minutes. Manual: `docker exec printer-server python /app/scripts/market_data_loader.py` |
| Daily metric calculation   | Validated `1day` bars with `background_metrics_calculated = false` | `BacktestDataHealthCheck` → `BackgroundMetricsLoader` (gated by `BACKGROUND_METRICS_LOADER_ENABLED=true`)          | Daily metric columns in `market_data`, flips `symbol_date_validation.background_metrics_calculated` to `true` | `BacktestDataHealthCheck`     | Health check only triggers the loader when metrics are missing. Once complete the flag prevents redundant runs. |
| Backtest lookup population | Validated `1min` bars for the prior trading day                    | `BacktestDataHealthCheck` → `populate_lookup_for_date` (auto-run with `BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED=true`) | `market_data_backtest_lookup` rows with `today_volume` computed via window function during insertion          | `BacktestDataHealthCheck`     | Auto-populates when validation exists. Window function handles `today_volume` during insertion.                 |

### Process Detail

- **Market data ingestion**

  - Script: `apps/server/scripts/market_data_loader.py` (calls helpers from `apps/server/scripts/market_data_loader_core.py`).
  - Loads prior-day coverage for every supported timescale and writes `symbol_date_validation` rows that encode bar counts.
  - Manual execution inside the server container: `docker exec printer-server python /app/apps/server/scripts/market_data_loader.py`.

- **Daily metric calculation**

  - Service: `apps/server/app/services/market/background_metrics_loader.py`.
  - Triggered by `BacktestDataHealthCheck` when any validated `1day` record still has metrics unset; the health check now batches calls so the loader runs once per pass.
  - Completion recorded by flipping `symbol_date_validation.background_metrics_calculated` to `true` so we do not recompute unless data changes.

- **Backtest lookup population**
  - Service: `apps/server/app/services/backtest/backtest_lookup_service.py`.
  - Health check waits for `symbol_date_validation` coverage on the prior trading day before invoking `populate_lookup_for_date`.
  - Produces `market_data_backtest_lookup` rows used by historical screeners and backtests.
  - Window function computes `today_volume` during insertion as cumulative volume up to each minute.

### Operational Playbook

1. **Enable health monitor toggles**: Set `BACKGROUND_METRICS_LOADER_ENABLED=true` and `BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED=true`.
2. **Check health**: Health endpoint shows status from `MarketDataLoaderHealthCheck` (auto market data gaps), `BacktestDataHealthCheck` (auto metrics + lookup).
3. **Manual recovery (if needed)**: `docker exec printer-server python /app/scripts/market_data_loader.py` then let health monitor auto-populate downstream.
