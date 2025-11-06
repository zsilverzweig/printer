# Strategy Error Isolation Feature

## Problem

Currently, when strategies have compilation errors (syntax errors, import failures, etc.), the entire system can break:

1. **Import-time failures**: Strategies are imported at module load time in `registry.py` (`_auto_register_strategies()`). Syntax errors during compilation cause the registry module itself to fail, breaking the entire server.

2. **No error isolation**: The registry only catches `ImportError`, but syntax errors occur during Python's compilation phase, not as import errors. This means syntax errors can crash the registry.

3. **Cascading failures**: Since the registry is imported widely (main.py, routers, services), a broken strategy can prevent the server from starting.

4. **Running funds affected**: If a strategy file is modified and breaks, it can affect funds that are already running.

5. **Watcher/reload failures**: The uvicorn `--reload` watcher (used in Docker dev environment) automatically restarts the server when files change. If a strategy file is edited with a syntax error, the watcher triggers a reload, but the server fails to start because the registry import fails during the reload process.

## Solution

Implement isolated strategy loading with graceful degradation:

1. **Lazy loading with compilation validation**: Load strategies on-demand rather than at import time, with syntax validation before importing.

2. **Error isolation**: Catch all errors (syntax, import, runtime) and mark strategies as "broken" without crashing the system.

3. **Graceful degradation**: Broken strategies are marked unavailable but don't prevent other strategies or the system from working.

4. **Hot reloading**: Add API endpoints to reload strategies during development without restarting the server.

5. **Status visibility**: Provide API endpoints to check which strategies are available vs broken.

## Implementation Plan

### Phase 1: Enhanced Registry with Error Isolation

**File**: `apps/server/app/strategies/registry.py`

- Add `_BROKEN_STRATEGIES` dict to track broken strategies with error messages
- Add `_safe_import_strategy()` function that:
  - Catches `SyntaxError`, `ImportError`, and other exceptions
  - Returns `(strategy_class, error_message)` tuple
  - Validates syntax using `ast.parse()` before importing
  - Logs errors without crashing
- Modify `_auto_register_strategies()` to use safe imports and continue on failure
  - **CRITICAL**: This must work at module import time (when registry.py is first imported) to prevent watcher/reload failures
  - Wrap the entire auto-registration in try/except to ensure the module can be imported even if all strategies are broken
- Add `list_all_strategies()` to return both working and broken strategies
- Add `reload_strategy()` function for hot-reloading

**Key Requirement**: The registry module itself must be importable even if strategy files have syntax errors. This ensures:

- Server can start successfully
- Uvicorn `--reload` watcher can successfully restart the server
- Other parts of the system that import the registry don't break

### Phase 2: Lazy Loading Support

**File**: `apps/server/app/strategies/registry.py`

- Add `_lazy_load_strategy()` function that maps strategy IDs to module paths
- Modify `get_strategy()` to attempt lazy loading if strategy not found
- Add rate limiting to prevent rapid retry loops (5 second cooldown)

### Phase 3: API Endpoints

**File**: `apps/server/app/routers/strategies.py`

- Add `GET /api/strategies/status` endpoint returning all strategies with status
- Add `POST /api/strategies/reload/{strategy_id}` endpoint for hot-reloading
- Return proper error messages when strategies are broken

### Phase 4: Enhanced Error Handling in Factory

**File**: `apps/server/app/services/strategies/strategy_factory.py`

- Enhance error messages in `create_strategy_engine()` to distinguish broken strategies
- Provide clear guidance when a strategy is unavailable due to compilation errors

### Phase 5: Testing

- Test with intentionally broken strategy files (syntax errors)
- Verify other strategies still work when one is broken
- Test hot-reload functionality
- Verify running funds continue when their strategy file is broken (they should fail gracefully)
- **Test watcher/reload scenario**:
  - Start server with `--reload` flag
  - Edit a strategy file to introduce a syntax error
  - Verify the watcher detects the change and successfully restarts the server (server should start, strategy should be marked broken)
  - Fix the syntax error and verify the watcher reloads and the strategy becomes available again

## Files to Modify

1. `apps/server/app/strategies/registry.py` - Core error isolation logic
2. `apps/server/app/routers/strategies.py` - API endpoints for status and reload
3. `apps/server/app/services/strategies/strategy_factory.py` - Enhanced error handling

## Success Criteria

- System starts successfully even if one or more strategy files have syntax errors
- Broken strategies are clearly marked and reported via API
- Other strategies continue to work normally
- Hot-reload allows fixing strategies without server restart
- Running funds fail gracefully with clear error messages if their strategy breaks
- **Watcher/reload resilience**: Uvicorn `--reload` watcher can successfully restart the server even when strategy files have syntax errors (server starts, broken strategies are marked, other functionality works)
