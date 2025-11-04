#!/bin/bash
# Auto-run tests on file changes
# Usage: ./scripts/run_tests_watch.sh [pytest args]
#
# Examples:
#   ./scripts/run_tests_watch.sh                    # Watch all tests
#   ./scripts/run_tests_watch.sh tests/test_funds*  # Watch only fund tests
#   ./scripts/run_tests_watch.sh -k "test_trading"  # Watch tests matching pattern

cd "$(dirname "$0")/.."

# Trap Ctrl+C and SIGTERM to clean up
cleanup() {
    echo ""
    echo "🛑 Stopping test watcher..."
    # Kill any running pytest processes
    pkill -P $$ pytest 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "🔍 Starting pytest-watch..."
echo "📝 Tests will auto-run when you save files in app/ or tests/"
echo "⚠️  File changes will cancel the current test run and start a new one"
echo ""

# Use pytest-watch with testmon for selective test execution
# Key flags:
#   --exitfirst: Exit after first failure (faster cancellation)
#   --maxfail=1: Same as above, but clearer
#   --tb=short: Short traceback for faster output
#   --testmon: Only run affected tests
ptw \
  --runner "pytest --testmon --exitfirst --tb=short" \
  --ignore htmlcov/ \
  --ignore .pytest_cache/ \
  --ignore __pycache__/ \
  --ignore .testmondata \
  --ignore .git/ \
  --clear \
  --nobeep \
  --onpass "echo '✅ All tests passed!'" \
  --onfail "echo '❌ Tests failed - check output above'" \
  -- \
  -v \
  --maxfail=1 \
  "$@"

