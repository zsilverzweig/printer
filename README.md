# Printer

An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.

## Overview

Printer is a virtual investment firm powered by AI agents that work together to analyze companies, build investment theses, and manage portfolios. The system uses multi-agent collaboration, persistent context, and continuous learning to make investment decisions that improve over time.

## Automatic Data Maintenance

Printer keeps market data, derived metrics, and backtest snapshots in sync through a coordinated set of loaders and health checks. The table below calls out the dependencies so operators and AI agents understand the order of operations.

### Dependency Matrix

| Process                    | Input Data                                                         | Trigger(s)                                                                                                         | Output Tables/Flags                                                                                           | Health Owner              | Recovery Notes                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Market data ingestion      | Polygon REST aggregates per symbol/timescale                       | `apps/server/scripts/market_data_loader.py` (cron/manual), ad-hoc validation utilities                             | `market_data`, `symbol_date_validation`                                                                       | `MarketDataHealthCheck`   | Re-run the loader for affected dates/timescales. Loader backfills validations before downstream jobs run.                                     |
| Daily metric calculation   | Validated `1day` bars with `background_metrics_calculated = false` | `BacktestDataHealthCheck` → `BackgroundMetricsLoader` (gated by `BACKGROUND_METRICS_LOADER_ENABLED=true`)          | Daily metric columns in `market_data`, flips `symbol_date_validation.background_metrics_calculated` to `true` | `BacktestDataHealthCheck` | Health check only triggers the loader when metrics are missing. Once complete the flag prevents redundant runs.                               |
| Backtest lookup population | Validated `1min` bars for the prior trading day                    | `BacktestDataHealthCheck` → `populate_lookup_for_date` (auto-run with `BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED=true`) | `market_data_backtest_lookup` rows for each minute, plus volume snapshots                                     | `BacktestDataHealthCheck` | Health monitor skips auto-population until validations land; rerun the market data loader first, then allow the health monitor to repopulate. |

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

### Operational Playbook

1. **Verify market data first**: run the market data loader for the target window and confirm `symbol_date_validation` rows exist.
2. **Allow metrics backfill**: set `BACKGROUND_METRICS_LOADER_ENABLED=true` (default off in local shells) so the health monitor can trigger `BackgroundMetricsLoader`.
3. **Populate backtest lookup**: ensure `BACKTEST_LOOKUP_AUTOPOPULATE_ENABLED=true` or call `docker exec printer-server python /app/apps/server/scripts/populate_backtest_lookup.py 2025-01-03`.
4. **Check health**: hit the health endpoint or inspect logs (`BacktestDataHealthCheck`) to confirm the most recent trading day is green before running screeners/backtests.
