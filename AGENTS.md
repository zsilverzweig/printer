# AI Agent Guidance for Building Printer

**This file contains guidance for AI assistants (like Cursor) to help code the Printer application. It should not be displayed in the web interface.**

## Core Principles

**Keep responses under 1,000 tokens** - Be concise and focused. Break complex topics into multiple responses if needed.

Follow Single Responsibility Principles

### SQLAlchemy Declarative Gotchas

- ❌ **NEVER** declare mapped attributes using SQLAlchemy reserved names like `metadata`, `registry`, or `metadata_obj`.
- ✅ Prefer renaming columns (for example, use `details` instead of `metadata` for JSON blobs) to avoid reserved-name collisions. Only fall back to alias patterns if renaming is impossible.
- ✅ Before running migrations, quickly scan new/modified models for reserved identifiers and run `pytest apps/server/tests/models` (or the narrowest relevant suite) to catch mapper errors early.
- ✅ When an existing migration fails during development, fix the model first, then regenerate or amend the migration rather than piling on overrides.

When working in IDE modes, never commit files unless explicitly directed to.

Assume that there is a pattern already in place to solve problems, don't create a new one. If you can't find a pattern, ask the user for more guidance.

### UI Interaction Standards

- Prefer blur-based apply over keystroke debouncing for form edits. Specifically:
  - Fund configuration editors should save on `onBlur` rather than on individual keystrokes.
  - Screener filters should run/apply on `onBlur` for text/number inputs; selects/switches may apply immediately on change.

## Testing and Development Workflow

**CRITICAL: Always test endpoints with curl before assuming they work!**

### Testing API Endpoints

When working on backend features:

1. ✅ **ALWAYS** test endpoints with `curl` after making changes
2. ✅ **ALWAYS** verify the response matches expectations
3. ✅ **ALWAYS** check server logs for errors (capture targeted snapshots rather than following the stream)
4. ❌ **NEVER** tail logs as a strategy—our logs are too verbose for `--follow` to be useful
5. ✅ **ALWAYS** verify database state with direct queries when relevant

Example testing workflow:

```bash
# Test the endpoint
curl -X POST "http://localhost:8000/api/screening-criteria/run?timestamp=2025-10-29T14:30:00Z" \
  -H "Content-Type: application/json" \
  -d '{"min_price": 5, "max_price": 100, "limit": 5}' | jq '.'

# Fetch recent server logs (avoid --follow)
nx docker:logs:server printer

# Check database if needed
docker exec printer-db psql -U postgres -d printer_events -c "SELECT COUNT(*) FROM market_data WHERE timescale = '5min';"
```

### Performance Testing

When working on queries or data processing:

1. ✅ **ALWAYS** profile slow operations
2. ✅ **ALWAYS** watch for N+1 query problems (loops calling individual queries)
3. ✅ **ALWAYS** use batch operations when processing multiple items
4. ✅ **ALWAYS** test with realistic data volumes

**Example N+1 Problem to Avoid:**

```python
# BAD: N+1 queries (slow!)
for symbol in symbols:
    data = await get_data(symbol)  # Individual query per symbol

# GOOD: Batch query (fast!)
all_data = await get_data_batch(symbols)  # Single query for all symbols
```

## Docker Environment

**CRITICAL: This application runs in Docker containers.**

### Database Access

- ❌ **NEVER** run SQL queries directly with `psql` or database clients from the host
- ❌ **NEVER** connect to databases from the host machine expecting local access without verifying Docker status
- ✅ **ALWAYS** use Docker exec: `docker exec printer-db psql -U postgres -d printer_events -c "QUERY"`
- ⚠️ **NOTE**: Use `-it` flags only for interactive sessions (manual shell access), NOT for scripted commands
- ✅ **ALWAYS** check if services are running: `nx docker:ps printer`

### API/Service Access

- ❌ **NEVER** run curl/wget against localhost expecting services without checking Docker status first
- ❌ **NEVER** suggest running Python scripts directly without considering container context
- ✅ **ALWAYS** verify services are running in Docker first
- ✅ **ALWAYS** use docker-compose commands or NX docker targets
- ✅ **ALWAYS** remember: Database runs at `db:5432` inside containers, `localhost:5432` from host

### Common Operations

```bash
# Check what's running
nx docker:ps printer

# Execute database queries (non-interactive)
docker exec printer-db psql -U postgres -d printer_events -c "SELECT COUNT(*) FROM market_data;"

# Interactive database shell (manual use only)
docker exec -it printer-db psql -U postgres -d printer_events

# Run Python scripts in server container
docker exec printer-server python /app/check_db_data.py

# Interactive shell in container (manual use only)
docker exec -it printer-server bash

# View logs
nx docker:logs:server printer
nx docker:logs:web printer
nx docker:logs:db printer

# Start/stop services
nx docker:up printer
nx docker:down printer
```

Follow a folder structure along these lines:

```
src/
├── features/ # Feature Domains
│ └── feature-name/ # Specific business domain
│ ├── components/ # Feature-specific UI components
│ ├── services/ # Feature-specific business logic
│ ├── hooks/ # Feature-specific state management
│ ├── types/ # Feature-specific TypeScript types
│ └── utils/ # Feature-specific utility functions
└── lib/ # Shared Utilities
  ├── components/ # Reusable UI components
  ├── services/ # Shared services and integrations
  ├── hooks/ # Shared state management hooks
  ├── types/ # Shared TypeScript types
  └── utils/ # Shared utility functions
```

## Backtesting Support

**CRITICAL: Always use `get_current_time()` instead of `datetime.now()` or `datetime.utcnow()`**

When writing services that need time awareness (news fetching, data queries, etc.), always use `get_current_time()` from `app.services.core.time_context` to support backtesting:

```python
from app.services.core.time_context import get_current_time

# ❌ BAD: Breaks backtesting
end_date = datetime.now(timezone.utc)

# ✅ GOOD: Supports backtesting
end_date = get_current_time()
if end_date.tzinfo is None:
    end_date = end_date.replace(tzinfo=timezone.utc)
```

This ensures that:

- In live mode: Returns real current time
- In backtest mode: Returns the simulated backtest time
- Services can work correctly in both contexts without modification

## Datetime Timezone Consistency

**CRITICAL: We are moving to timezone-aware UTC datetimes everywhere**

### Standard Practice

- ✅ **ALWAYS** use `get_current_time()` which returns `datetime.now(timezone.utc)` (timezone-aware)
- ✅ **ALWAYS** use timezone-aware datetimes for all business logic
- ✅ **ALWAYS** use `DateTime(timezone=True)` in database models that need timezone awareness
- ❌ **NEVER** use `datetime.utcnow()` (returns timezone-naive)
- ❌ **NEVER** use `datetime.now()` without timezone parameter

### Model Defaults

For database models:

- **Timezone-aware columns** (`DateTime(timezone=True)`): Use `utcnow_aware()` helper function

  ```python
  def utcnow_aware() -> datetime:
      return datetime.now(timezone.utc)

  created_at: Mapped[datetime] = mapped_column(
      DateTime(timezone=True),
      default=utcnow_aware
  )
  ```

- **Timezone-naive columns** (`DateTime` without timezone): Use `utcnow_naive()` helper function

  ```python
  def utcnow_naive() -> datetime:
      return datetime.utcnow()

  created_at: Mapped[datetime] = mapped_column(
      DateTime,  # TIMESTAMP WITHOUT TIME ZONE
      default=utcnow_naive
  )
  ```

**Note**: The Event model (`app.models.events`) has been migrated to use `DateTime(timezone=True)` as of migration 038. All datetime columns are now timezone-aware.

### Common Patterns

```python
from app.services.core.time_context import get_current_time

# ✅ Getting current time
now = get_current_time()  # Returns timezone-aware UTC datetime

# ✅ Comparing times (both must be timezone-aware)
if get_current_time() > order.submitted_at:
    # order.submitted_at is timezone-aware from DB
    pass

# ✅ Calculating time differences
age_seconds = (get_current_time() - order.submitted_at).total_seconds()

# ❌ DON'T DO THIS
now = datetime.utcnow()  # Timezone-naive - will cause errors when mixing with aware datetimes
now = datetime.now()  # No timezone - will cause errors
```

### Validation

Startup validation automatically checks for datetime violations. If you see violations, fix them by:

1. Replacing `datetime.utcnow()` with `get_current_time()`
2. Replacing `datetime.now()` with `get_current_time()`
3. Ensuring model defaults use appropriate helper functions
