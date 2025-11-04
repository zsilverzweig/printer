# Test Automation Guide

This guide explains how to automatically run tests and see failures in your IDE's Problems panel.

## Quick Start

### Option 1: Watch Mode (Recommended for Development)

Run tests automatically when you save files:

```bash
cd apps/server
./scripts/run_tests_watch.sh
```

This will:

- ✅ Auto-run tests when you save files in `app/` or `tests/`
- ✅ Only run affected tests (using pytest-testmon)
- ✅ Stop on first failure for faster feedback
- ✅ Clear output between runs for clarity

### Option 2: VS Code Tasks

Use built-in VS Code tasks (press `Cmd+Shift+P` / `Ctrl+Shift+P` → "Run Task"):

1. **Run Tests (All)** - Run all tests once
2. **Run Tests (Watch Mode)** - Auto-run tests on save
3. **Run Tests (Current File)** - Run tests in current file
4. **Run Tests (Selective)** - Run only affected tests

Failures will appear in the **Problems panel** (`Cmd+Shift+M` / `Ctrl+Shift+M`).

### Option 3: Manual with Problem Output

```bash
cd apps/server
python scripts/pytest_to_problems.py tests/
```

## How It Works

### 1. pytest-watch (ptw)

Watches for file changes and auto-runs tests:

```bash
# Watch all tests
ptw

# Watch specific tests
ptw tests/test_funds.py

# Watch with pattern
ptw -- -k "test_balance"
```

### 2. pytest-testmon

Tracks which tests depend on which code, only running affected tests:

```bash
# First run: tracks dependencies
pytest --testmon

# Subsequent runs: only runs tests affected by changes
pytest --testmon
```

This is **much faster** for large test suites!

### 3. VS Code Problem Matcher

The `.vscode/tasks.json` includes problem matchers that parse pytest output and show failures in the Problems panel.

## Configuration

### pytest.watch.ini

Configure pytest-watch behavior:

```ini
[pytest-watch]
# What to watch
watch = app/,tests/

# What to ignore
ignore = htmlcov/,*.md

# How to run pytest
runner_args = --tb=short -v

# Clear screen between runs
clear = True
```

### Customize Watch Script

Edit `scripts/run_tests_watch.sh` to:

- Change pytest arguments
- Add custom hooks (e.g., send notifications)
- Filter which tests to run

```bash
# Example: Only watch fund-related tests
./scripts/run_tests_watch.sh tests/test_funds*.py
```

## Best Practices

### 1. Use Watch Mode During Development

Keep `ptw` running in a terminal while you code. You'll get instant feedback when tests break.

### 2. Use Selective Testing for Speed

`pytest-testmon` dramatically speeds up test runs by only running affected tests:

```bash
# Initial run (tracks all dependencies)
pytest --testmon

# Make changes to app/services/funds.py
# This will only run tests that import/use funds.py
pytest --testmon
```

### 3. Run Full Suite Before Commits

Always run the full suite before committing:

```bash
pytest tests/ -v
```

Or use pre-commit hooks (see below).

### 4. Keep Tests Fast

Slow tests = slow feedback loop. Tips:

- Use mocks for external services
- Avoid actual database calls when possible
- Use `pytest-xdist` for parallel execution:
  ```bash
  pytest -n auto  # Auto-detect CPU cores
  ```

## Integration with Git Hooks

Add to `.git/hooks/pre-commit` (make executable with `chmod +x`):

```bash
#!/bin/bash
# Run tests before allowing commit

echo "Running tests..."
docker exec printer-server pytest tests/ -v --tb=short --maxfail=5

if [ $? -ne 0 ]; then
    echo "❌ Tests failed! Commit aborted."
    echo "Fix tests or use 'git commit --no-verify' to skip (not recommended)"
    exit 1
fi

echo "✅ All tests passed!"
exit 0
```

## Troubleshooting

### Tests not auto-running on save

1. Check pytest-watch is installed:

   ```bash
   docker exec printer-server pip show pytest-watch
   ```

2. Verify you're in the correct directory:

   ```bash
   cd apps/server
   ```

3. Check file watching isn't disabled:
   ```bash
   # Should not have --exitfirst or similar flags
   ptw --help
   ```

### Failures not showing in Problems panel

1. Ensure you're running the task from VS Code (`Run Task` menu)
2. Check `.vscode/tasks.json` exists
3. Verify problem matcher pattern matches your pytest output:
   ```bash
   # Run pytest manually and check output format
   docker exec printer-server pytest -v
   ```

### testmon not detecting changes

Reset testmon database if it gets out of sync:

```bash
pytest --testmon --testmon-nocache
```

Or delete the cache:

```bash
rm -rf .testmondata
```

## Advanced: CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: |
          docker-compose up -d
          docker exec printer-server pytest tests/ -v --cov --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Pre-push Hook (More Thorough)

Add to `.git/hooks/pre-push`:

```bash
#!/bin/bash
echo "Running full test suite before push..."
docker exec printer-server pytest tests/ -v --cov --cov-report=term-missing

if [ $? -ne 0 ]; then
    echo "❌ Tests failed! Push aborted."
    exit 1
fi

echo "✅ All tests passed with coverage!"
exit 0
```

## Summary

**For Day-to-Day Development:**

```bash
# Terminal 1: Watch tests
cd apps/server && ./scripts/run_tests_watch.sh

# Terminal 2: Your normal development
# Tests auto-run as you save!
```

**Before Commits:**

```bash
# Full test suite
docker exec printer-server pytest tests/ -v
```

**For Speed:**

```bash
# Only run affected tests
docker exec printer-server pytest --testmon -v
```

This setup gives you **instant feedback** on test failures without manually running tests! 🚀
