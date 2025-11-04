#!/bin/bash
# Fast test watch mode - cancels immediately on file change
# Usage: ./scripts/run_tests_watch_fast.sh [pytest args]
#
# This version uses even faster cancellation and minimal output
# Best for rapid development cycles

cd "$(dirname "$0")/.."

# Trap Ctrl+C to clean up
cleanup() {
    echo ""
    echo "🛑 Stopping test watcher..."
    pkill -P $$ pytest 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

echo "⚡ Fast test watch mode"
echo "📝 Tests auto-run on save, previous runs cancel immediately"
echo ""

# Aggressive cancellation settings:
# - Very short delay (0.1s) - almost instant
# - Exit on first failure
# - Minimal output
ptw \
  --runner "pytest --testmon --exitfirst -q" \
  --ignore htmlcov/ \
  --ignore .pytest_cache/ \
  --ignore __pycache__/ \
  --ignore .testmondata \
  --ignore .git/ \
  --clear \
  --nobeep \
  --delay 0.1 \
  --onpass "echo '✅'" \
  --onfail "echo '❌'" \
  -- \
  --tb=line \
  --maxfail=1 \
  "$@"

