# Refactoring Plan: `apps/server/app/routers/funds.py`

## Current State Analysis

**File Size**: 3,040 lines
**Issues Identified**:

- Violates Single Responsibility Principle (SRP)
- Mixes API routing, business logic, serialization, and data access
- Difficult to test individual components
- Hard to maintain and extend
- Complex helper functions embedded in router

## Refactoring Strategy

The goal is to break down this monolithic router into smaller, focused modules following the existing project structure and patterns.

### Phase 1: Extract Schemas/Models (Low Risk)

**Target**: Lines 40-198 (Pydantic models)

**Action**: Move to `app/routers/schemas/fund_schemas.py`

**Files to Create**:

- `app/routers/schemas/__init__.py`
- `app/routers/schemas/fund_schemas.py` - All Pydantic request/response models

**Benefits**:

- Reusable across routers if needed
- Easier to maintain type definitions
- Clear separation of concerns

**Estimated Lines**: ~160 lines

---

### Phase 2: Extract Serializers (Low Risk)

**Target**: Lines 200-309 (Serialization functions)

**Action**: Move to `app/lib/serializers/fund_serializers.py`

**Files to Create**:

- `app/lib/serializers/__init__.py`
- `app/lib/serializers/fund_serializers.py` - All serialize\_\* functions

**Functions to Extract**:

- `serialize_fund()`
- `serialize_order()`
- `serialize_transaction()`
- `serialize_transfer()`
- `serialize_trade()`

**Benefits**:

- Centralized serialization logic
- Easier to test
- Can be reused by other routers

**Estimated Lines**: ~110 lines

---

### Phase 3: Extract Position Service (Medium Risk)

**Target**: Lines 370-491 (`_get_positions_for_websocket`)

**Action**: Move to `app/services/funds/position_service.py`

**Files to Create**:

- `app/services/funds/__init__.py`
- `app/services/funds/position_service.py`

**Functions to Extract**:

- `_get_positions_for_websocket()` → `get_positions_for_fund()`

**Benefits**:

- Business logic separated from routing
- Reusable by other services
- Easier to test position calculations

**Estimated Lines**: ~120 lines

---

### Phase 4: Extract Performance Service (Medium Risk)

**Target**: Lines 494-645 (`_calculate_fund_performance`)

**Action**: Move to `app/services/funds/performance_service.py`

**Files to Create**:

- `app/services/funds/performance_service.py`

**Functions to Extract**:

- `_calculate_fund_performance()` → `calculate_fund_performance()`

**Benefits**:

- Complex business logic isolated
- Can be extended with caching
- Easier to optimize performance calculations

**Estimated Lines**: ~150 lines

---

### Phase 5: Extract Fund Service (High Value, Medium Risk)

**Target**: Core fund operations and complex business logic

**Action**: Create `app/services/funds/fund_service.py`

**Files to Create**:

- `app/services/funds/fund_service.py`

**Functions to Extract**:

- `get_fund_snapshot()` → Move to service
- Fund creation logic (from `create_fund`)
- Fund update logic (from `update_fund`)
- Fund deletion logic (from `delete_fund`)
- Fund reset logic (from `reset_fund`)

**Benefits**:

- Centralizes fund business logic
- Easier to add features like caching
- Better testability

**Estimated Lines**: ~300-400 lines

---

### Phase 6: Extract Trade Reconciliation Service (Medium Risk)

**Target**: Lines 1536-1714 (`_recreate_missing_trade`)

**Action**: Move to `app/services/funds/trade_reconciliation_service.py`

**Files to Create**:

- `app/services/funds/trade_reconciliation_service.py`

**Functions to Extract**:

- `_recreate_missing_trade()` → `recreate_missing_trade()`

**Benefits**:

- Complex reconciliation logic isolated
- Can be reused by other services
- Easier to test edge cases

**Estimated Lines**: ~180 lines

---

### Phase 7: Extract Position Reconciliation Service (Medium Risk)

**Target**: Lines 2148-2575 (close_orphaned_position, close_all_orphaned_positions)

**Action**: Move to `app/services/funds/position_reconciliation_service.py`

**Files to Create**:

- `app/services/funds/position_reconciliation_service.py`

**Functions to Extract**:

- Position closing logic
- Orphaned position detection

**Benefits**:

- Separation of reconciliation concerns
- Reusable by admin tools
- Better error handling

**Estimated Lines**: ~400 lines

---

### Phase 8: Simplify Router (Low Risk After Phases 1-7)

**Target**: All endpoint handlers

**Action**: Refactor router to be thin - delegate to services

**Structure**:

```python
# Router becomes thin - just handles HTTP concerns
@router.post("/funds")
async def create_fund(fund_data: CreateFundInput):
    return await fund_service.create_fund(fund_data)

@router.get("/funds/{fund_id}")
async def get_fund(fund_id: str):
    fund = await fund_service.get_fund(fund_id)
    return serialize_fund(fund)
```

**Benefits**:

- Router focuses only on HTTP layer
- Easier to read and understand
- Better error handling consistency

**Estimated Lines**: ~800-1000 lines (down from 3,040)

---

## Proposed File Structure

```
apps/server/app/
├── routers/
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── fund_schemas.py        # Pydantic models
│   ├── funds.py                   # Thin router (~800-1000 lines)
│   └── ...
├── services/
│   ├── funds/
│   │   ├── __init__.py
│   │   ├── fund_service.py        # Core fund operations
│   │   ├── position_service.py    # Position calculations
│   │   ├── performance_service.py # Performance metrics
│   │   ├── trade_reconciliation_service.py  # Trade reconciliation
│   │   └── position_reconciliation_service.py  # Position reconciliation
│   └── ...
└── lib/
    └── serializers/
        ├── __init__.py
        └── fund_serializers.py    # Serialization functions
```

---

## Implementation Order (Recommended)

1. **Phase 1**: Extract Schemas (Lowest risk, no dependencies)
2. **Phase 2**: Extract Serializers (Low risk, no business logic)
3. **Phase 3**: Extract Position Service (Medium risk)
4. **Phase 4**: Extract Performance Service (Medium risk)
5. **Phase 5**: Extract Fund Service (Core business logic)
6. **Phase 6**: Extract Trade Reconciliation (Medium risk)
7. **Phase 7**: Extract Position Reconciliation (Medium risk)
8. **Phase 8**: Simplify Router (Low risk after other phases)

---

## Testing Strategy

For each phase:

1. Extract code to new module
2. Update imports in router
3. Run existing tests
4. Add unit tests for extracted services
5. Test API endpoints still work

**Key Test Areas**:

- All API endpoints continue to work
- Serialization produces same output
- Position calculations are correct
- Performance metrics are accurate
- Reconciliation logic works correctly

---

## Risk Mitigation

1. **Incremental Refactoring**: One phase at a time
2. **Preserve Behavior**: No functional changes, only structural
3. **Test Coverage**: Run tests after each phase
4. **Backward Compatibility**: Keep same API contracts
5. **Git Commits**: Commit after each successful phase

---

## Benefits After Refactoring

1. **Maintainability**: Each file has single responsibility
2. **Testability**: Services can be unit tested independently
3. **Reusability**: Services can be used by other routers/background jobs
4. **Readability**: Router is easier to understand
5. **Performance**: Can add caching to services without touching router
6. **Scalability**: Easier to add new features

---

## Estimated Timeline

- Phase 1-2: 1-2 hours (Schemas + Serializers)
- Phase 3-4: 2-3 hours (Position + Performance)
- Phase 5: 3-4 hours (Fund Service)
- Phase 6-7: 3-4 hours (Reconciliation services)
- Phase 8: 2-3 hours (Router simplification)

**Total**: ~12-16 hours of focused work

---

## Notes

- Follow existing patterns in `app/services/` directory
- Use dependency injection for services (via FastAPI Depends if needed)
- Keep async/await patterns consistent
- Maintain error handling standards
- Preserve logging at current levels
