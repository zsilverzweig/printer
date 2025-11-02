# AI Agent Guidance for Building Printer

**This file contains guidance for AI assistants (like Cursor) to help code the Printer application. It should not be displayed in the web interface.**

## Core Principles

**Keep responses under 1,000 tokens** - Be concise and focused. Break complex topics into multiple responses if needed.

Follow Single Responsibility Principles

When working in IDE modes, never commit files unless explicitly directed to.

Assume that there is a pattern already in place to solve problems, don't create a new one. If you can't find a pattern, ask the user for more guidance.

## Testing and Development Workflow

**CRITICAL: Always test endpoints with curl before assuming they work!**

### Testing API Endpoints

When working on backend features:

1. ✅ **ALWAYS** test endpoints with `curl` after making changes
2. ✅ **ALWAYS** verify the response matches expectations
3. ✅ **ALWAYS** check server logs for errors: `nx docker:logs:server printer --follow`
4. ✅ **ALWAYS** verify database state with direct queries when relevant

Example testing workflow:

```bash
# Test the endpoint
curl -X POST "http://localhost:8000/api/screening-criteria/run?timestamp=2025-10-29T14:30:00Z" \
  -H "Content-Type: application/json" \
  -d '{"min_price": 5, "max_price": 100, "limit": 5}' | jq '.'

# Watch server logs in another terminal
nx docker:logs:server printer --follow

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
