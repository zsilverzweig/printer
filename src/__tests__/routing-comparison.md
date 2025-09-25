# Routing Architecture Comparison

## Current Problem: Duplication Between `useUserRouting` and `AppRouter`

### Issues with Current Approach

1. **Duplicated Logic**: Both components determine routing based on user status
2. **Conflicting Responsibilities**: `AppRouter` handles both routing AND rendering
3. **Inconsistent Behavior**: Different parts of app might handle routing differently
4. **Hard to Test**: Complex interdependencies
5. **Maintenance Burden**: Changes need to be made in multiple places

## Recommended Solution: Simplified Architecture

### Keep: `useUserRouting` Hook

**Purpose**: Pure routing logic - determines where users should go
**Responsibilities**:

- ✅ Determine user status (admin, waitlist, active, pending)
- ✅ Return route object with path and reason
- ✅ Handle all routing decision logic

**Benefits**:

- Single responsibility
- Reusable across components
- Easy to test
- Clear API

### Simplify: `AppRouter` Component

**Purpose**: Layout wrapper that handles loading and redirects
**Responsibilities**:

- ✅ Show loading states
- ✅ Handle automatic redirects (using `useUserRouting`)
- ✅ Render children for authenticated users

**Benefits**:

- Simple and focused
- No complex conditional rendering
- Easy to understand

### Add: `AccessControl` Component

**Purpose**: Page-level access control with proper UI feedback
**Responsibilities**:

- ✅ Enforce access restrictions per page
- ✅ Show appropriate error messages
- ✅ Provide navigation options

**Benefits**:

- Flexible per-page access control
- Consistent error UI
- Reusable across pages

## Usage Examples

### Before (Complex AppRouter)

```tsx
// AppRouter had to handle everything
export function AppRouter({ children }) {
  // 200+ lines of complex logic
  // Hard-coded UI components
  // Multiple responsibilities
  // Hard to customize
}
```

### After (Simplified Approach)

```tsx
// AppRouter: Simple redirects only
export function AppRouter({ children }) {
  const { route } = useUserRouting();

  useEffect(() => {
    if (route) router.push(route.path);
  }, [route]);

  return <>{children}</>;
}

// Individual pages: Use AccessControl
export function PortfoliosPage() {
  return (
    <AccessControl requiredAccess="app">
      <div>Portfolio content</div>
    </AccessControl>
  );
}
```

## Benefits of New Approach

### 1. **Separation of Concerns**

- `useUserRouting`: Pure routing logic
- `AppRouter`: Layout and redirects
- `AccessControl`: Page-level access control

### 2. **Flexibility**

- Pages can customize access control behavior
- Easy to add new access levels
- Can override default error UI

### 3. **Testability**

- Each component has single responsibility
- Easy to unit test routing logic
- Easy to test access control scenarios

### 4. **Maintainability**

- Changes to routing logic only need to be made in one place
- Clear boundaries between components
- Easy to understand and debug

### 5. **Reusability**

- `useUserRouting` can be used by any component
- `AccessControl` can be used by any page
- Consistent behavior across the app

## Migration Strategy

1. **Phase 1**: Create new simplified components
2. **Phase 2**: Update individual pages to use `AccessControl`
3. **Phase 3**: Replace `AppRouter` with simplified version
4. **Phase 4**: Remove old complex logic

## Testing Benefits

### Before

```tsx
// Hard to test - complex interdependencies
test("AppRouter handles all scenarios", () => {
  // Need to mock everything
  // Complex setup
  // Hard to isolate specific behaviors
});
```

### After

```tsx
// Easy to test - focused responsibilities
test("useUserRouting determines correct route", () => {
  // Simple input/output testing
  // No complex mocking needed
});

test("AccessControl shows correct UI", () => {
  // Test specific access scenarios
  // Easy to verify UI behavior
});
```

## Conclusion

The new approach eliminates duplication, improves maintainability, and provides better separation of concerns. Each component has a clear, single responsibility, making the codebase easier to understand, test, and maintain.
