# Custom Lint Rules for Codebase Organization

## Problem Summary

The codebase needs automated enforcement of organizational standards to maintain code quality and consistency:

1. **File size management**: Large files become hard to maintain and violate single responsibility principles
2. **Folder hierarchy violations**: Code placed in wrong locations breaks feature boundaries and makes navigation difficult
3. **Cross-boundary imports**: Features/services importing from each other directly creates tight coupling
4. **Naming inconsistencies**: Inconsistent naming makes code harder to understand and navigate
5. **Standards drift**: Without automated checks, code gradually drifts from established patterns

## Implementation Plan

### Phase 1: TypeScript/ESLint Custom Rules

#### 1.1 File Size Limits

**Location**: `tools/eslint-rules/file-size-limit.js`

- Create custom ESLint rule to enforce maximum file size
- Configure different limits for different file types:
  - Components: 500 lines
  - Services: 1000 lines
  - Types: 300 lines
  - Hooks: 300 lines
  - API routes: 500 lines
- Rule should check file line count and report violations with file type context
- Allow configuration override via ESLint config

#### 1.2 Folder Hierarchy Rules

**Location**: `tools/eslint-rules/folder-hierarchy.js`

- Enforce feature-based structure:
  - Features must be in `src/features/[feature-name]/`
  - Each feature should have: `components/`, `hooks/`, `services/`, `types/`, `utils/`
  - Shared code must be in `src/lib/`
  - API routes must be in `src/app/api/`
- Validate import paths match folder structure
- Prevent files from being placed in wrong directories (e.g., components in services folder)

#### 1.3 Feature Boundaries

**Location**: `tools/eslint-rules/feature-boundaries.js`

- Enforce feature boundaries: prevent cross-feature imports
- Validate that components only import from their feature's services/types
- Ensure API routes only import from `lib/services/` or feature services
- Allow shared lib imports from any feature
- Report violations with clear messages about allowed import paths

#### 1.4 Naming Conventions

**Location**: `tools/eslint-rules/naming-conventions.js`

- Enforce naming conventions:
  - Components: PascalCase (e.g., `FundCard.tsx`)
  - Hooks: camelCase starting with `use` (e.g., `useFundData.ts`)
  - Services: camelCase (e.g., `fundService.ts`)
  - Types: PascalCase (e.g., `Fund.ts`)
  - Utils: camelCase (e.g., `dateUtils.ts`)
- Validate file names match their export names
- Ensure all exports use named exports (no default exports except for pages)

### Phase 2: Python/Pylint Custom Rules

#### 2.1 File Size Limits

**Location**: `tools/pylint-plugins/file_size_checker.py`

- Configure pylint's `too-many-lines` rule with appropriate limits:
  - Services: 1000 lines
  - Routers: 500 lines
  - Models: 500 lines
  - Strategies: 800 lines
- Create custom checker to validate file sizes based on file location/type
- Report violations with file type context

#### 2.2 Folder Hierarchy Rules

**Location**: `tools/pylint-plugins/folder_structure_checker.py`

- Enforce service-based structure:
  - Services must be in `app/services/[domain]/`
  - Routers must be in `app/routers/`
  - Models must be in `app/models/`
  - Strategies must be in `app/strategies/`
- Validate import paths match this structure
- Prevent files from being placed in wrong directories

#### 2.3 Service Boundaries

**Location**: `tools/pylint-plugins/service_boundaries_checker.py`

- Enforce service boundaries: prevent cross-domain service imports
- Validate that routers only import from services, not from other routers
- Ensure models are only imported by services and routers, not by other models
- Allow shared lib imports from any service
- Report violations with clear messages about allowed import paths

#### 2.4 Naming Conventions

**Location**: `tools/pylint-plugins/naming_checker.py`

- Enforce naming conventions:
  - Services: snake_case (e.g., `fund_service.py`)
  - Routers: snake_case (e.g., `funds.py`)
  - Models: snake_case (e.g., `funds.py`)
  - Classes: PascalCase (e.g., `FundService`)
  - Functions: snake_case (e.g., `get_fund_data`)
- Validate that all async functions use `async def`
- Ensure proper use of type hints

### Phase 3: Configuration Updates

#### 3.1 ESLint Configuration

**File**: `.eslintrc.json`

- Add custom rules directory to ESLint config
- Configure all custom rules with appropriate severity levels
- Add file size limits configuration
- Configure import path validation rules
- Ensure custom rules work with existing TypeScript and import plugins

#### 3.2 Pylint Configuration

**File**: `.pylintrc` or `pyproject.toml`

- Create `.pylintrc` file with custom checker configuration
- Configure file size limits
- Set up custom pylint plugin paths
- Configure import path checking
- Ensure custom checkers work with existing pylint rules

#### 3.3 Package Dependencies

**File**: `package.json`

- Add dependencies for custom ESLint rule development:
  - `@typescript-eslint/utils` - For building custom ESLint rules
  - `eslint-plugin-file-size` (if using existing plugin) or custom implementation
- Update lint scripts to ensure custom rules are executed

#### 3.4 Python Dependencies

**File**: `apps/server/requirements.txt`

- Ensure `pylint` is included with appropriate version
- Add any additional pylint plugins if needed

### Phase 4: Integration

#### 4.1 Nx Project Configuration

**Files**:

- `apps/web/project.json`
- `apps/server/project.json`

- Update lint targets to ensure custom rules run
- Configure lint to fail on violations (not just warn)
- Ensure lint runs in CI/CD pipeline

#### 4.2 Pre-commit Hooks (Optional)

- Consider adding pre-commit hooks to run lint before commits
- Use husky or similar tool if desired
- Document how to bypass for emergency fixes

### Phase 5: Documentation

#### 5.1 Linting Rules Documentation

**File**: `docs/linting-rules.md`

- Document all custom rules and their purposes
- Explain file size limits and rationale
- Document folder structure requirements
- Provide examples of correct vs incorrect code
- Explain how to fix common violations
- Document how to add new rules
- Include configuration options and overrides

## Files to Create

**ESLint Custom Rules:**

- `tools/eslint-rules/file-size-limit.js`
- `tools/eslint-rules/folder-hierarchy.js`
- `tools/eslint-rules/feature-boundaries.js`
- `tools/eslint-rules/naming-conventions.js`
- `tools/eslint-rules/index.js` (rule registry)

**Pylint Custom Checkers:**

- `tools/pylint-plugins/file_size_checker.py`
- `tools/pylint-plugins/folder_structure_checker.py`
- `tools/pylint-plugins/service_boundaries_checker.py`
- `tools/pylint-plugins/naming_checker.py`
- `tools/pylint-plugins/__init__.py`

**Configuration:**

- `.pylintrc` (if not using pyproject.toml)
- `docs/linting-rules.md`

## Files to Modify

- `.eslintrc.json` - Add custom rules configuration
- `package.json` - Add dependencies and update scripts
- `apps/web/project.json` - Update lint target
- `apps/server/project.json` - Update lint target
- `pyproject.toml` or create `.pylintrc` - Add pylint configuration

## Success Criteria

1. ✅ File size violations are caught during linting with clear error messages
2. ✅ Folder hierarchy violations are detected and reported
3. ✅ Cross-feature/cross-service imports are prevented with helpful guidance
4. ✅ Naming convention violations are flagged
5. ✅ Rules are documented and easy to understand
6. ✅ Rules can be run via `npm run lint` and `nx lint server`
7. ✅ Rules integrate seamlessly with existing lint setup
8. ✅ Violations block CI/CD pipeline (fail on error)
9. ✅ Rules are maintainable and easy to extend

## Implementation Order

1. **Phase 1** (ESLint Rules) - Start with TypeScript rules as they're more commonly used
2. **Phase 2** (Pylint Rules) - Add Python rules for backend
3. **Phase 3** (Configuration) - Wire everything together
4. **Phase 4** (Integration) - Ensure it works in development and CI
5. **Phase 5** (Documentation) - Document for team

## Dependencies

**TypeScript:**

- `@typescript-eslint/utils` - For custom ESLint rule development
- ESLint rule API (built-in)

**Python:**

- `pylint` - Already configured, ensure version compatibility
- Pylint plugin API (built-in)

## Notes

- Start with warnings, then move to errors once team is familiar
- Allow configuration overrides for special cases
- Consider adding auto-fix capabilities where possible (especially for naming)
- Keep rules focused and avoid over-engineering
- Test rules on existing codebase to ensure they're reasonable
