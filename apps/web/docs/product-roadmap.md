# Product Roadmap (Capability-Driven, No Phases)

### Purpose

A concise, capability-focused roadmap reflecting current implementation status without prescribing immediate next steps or phases.

### Completion Snapshot (by capability)

- **Auth & Infrastructure — COMPLETE**
  - Key: `middleware.ts`, `src/lib/auth/server.ts`, `src/lib/services/firebase.ts`
- **Trading Integration (Alpaca) — COMPLETE**
  - Key: API `src/app/api/alpaca/**`, `src/app/api/trading/**`; UI `src/features/finance/trading/**`
- **Portfolio Management UI & Data — COMPLETE**
  - Key: `src/features/finance/portfolio/**`, `src/app/portfolios/page.tsx`, `src/lib/utils/firebase-converters.ts`
- **Predefined Agent Execution — PARTIAL**
  - Key: `src/features/agents/*`, `src/lib/api/agent-executor.ts`, `src/lib/api/agent-middleware.ts`
- **Company Research Pipeline (CRU base) — PARTIAL**
  - Key: API `src/app/api/agents/research-company/route.ts`; UI `src/features/research/company/**`; Provider `src/features/research/company/providers/research-provider.tsx`
  - Gap: No EDGAR/news/analyst data fetch; LLM-only prompts
- **Cost Monitoring — PARTIAL**
  - Key: `src/lib/services/cost-monitor.ts`; Gap: no UI/alerts
- **Agent Teams & Orchestration — NOT STARTED**
  - Docs: `docs/Development Planning/teams.md`
- **Current Information Integration — NOT STARTED**
  - EDGAR, news/search, analyst coverage (see CRU sections below)
- **Financial Data Enhancements — NOT STARTED**
  - Options, indicators, analyst coverage, econ data
- **Active Portfolio Management — NOT STARTED**
  - Trade log, rebalancing, risk controls, benchmarking/attribution
- **Research Library & Caching — NOT STARTED**
  - Search, freshness, versioning, synthesis

### Capability Definitions & Current Scope

- **Auth & Infrastructure**: Server-first auth, route protection, Firebase setup. Complete.
- **Trading Integration**: OAuth, account/positions/orders, quotes, order placement, UI. Complete.
- **Portfolio Management**: Create/edit/delete portfolios and positions, real-time Firestore. Complete.
- **Predefined Agent Execution**: Execute fixed agents via API with middleware; no builder/versioning UI. Partial.
- **Company Research (CRU base)**: 3-step flow (background → news → synthesis) persisted to Firestore and rendered in UI. External data not integrated. Partial.
- **Cost Monitoring**: Service present for cost tracking; not surfaced in UI/alerts. Partial.
- **Agent Teams & Orchestration**: Team workflow engine and collaboration patterns. Not started.
- **Current Information Integration**: SEC EDGAR filings, news/search APIs, analyst coverage, Alpaca metrics for prompts. Not started.
- **Financial Data Enhancements**: Technical indicators, options data, sentiment/econ data. Not started.
- **Active Portfolio Management**: Trade log, rebalancing, risk/position sizing, benchmarking, attribution analytics. Not started.
- **Research Library & Caching**: Cached research DB, freshness, incremental updates, search/cross-reference. Not started.

### Acceptance Criteria (per capability)

- **Predefined Agent Execution**: Clear logs and structured outputs for each job; configurable model overrides per job.
- **Company Research (CRU base)**: Research docs saved with deterministic schema; UI shows background, news, synthesis with timestamps and status.
- **Cost Monitoring**: Aggregates per-request costs and model usage; emits structured events consumable by a UI.
- **Agent Teams & Orchestration**: Can define team steps (sequential/parallel), run a CRU template, and collect merged output.
- **Current Information Integration**: For a ticker, system can fetch latest filings, 3–6 months of news, and basic metrics; prompts include sources and timestamps.
- **Financial Data Enhancements**: Compute at least RSI/MAs for a symbol and expose via API; options chain retrieval for major tickers where supported.
- **Active Portfolio Management**: Every order recorded in a trade log with reason/context; daily P&L and S&P 500 baseline computed; basic position sizing rules enforced.
- **Research Library & Caching**: Deduplicated research entries with version field; search by ticker/sector/keywords; freshness timestamps maintained.

### References

- Docs: `docs/product-roadmap.md`, `docs/Development Planning/*`
- Agents: `src/features/agents/*`
- Agent execution: `src/lib/api/agent-executor.ts`, `src/lib/api/agent-middleware.ts`
- Research: `src/features/research/company/**`, `src/app/api/agents/research-company/route.ts`
- Trading: `src/app/api/alpaca/**`, `src/app/api/trading/**`, `src/features/finance/trading/**`
- Portfolio: `src/features/finance/portfolio/**`
- Infra/Auth: `middleware.ts`, `src/lib/auth/server.ts`, `src/lib/services/firebase.ts`

### Notes

- Removed “Immediate Next Steps” and all prior “Phase” constructs.
- This roadmap is descriptive, not prescriptive.
