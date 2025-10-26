#!/bin/bash

# Kill the printer-server

echo "Stopping printer-server..."
echo "=========================="

# Find and kill process on port 8000
PORT_PID=$(lsof -ti:8000)

if [ -n "$PORT_PID" ]; then
    echo "🔍 Found server process on port 8000 (PID: $PORT_PID)"
    kill -9 $PORT_PID 2>/dev/null
    echo "✅ Server stopped successfully"
else
    echo "ℹ️  No server process found on port 8000"
fi

# Also check for any lingering uvicorn processes
UVICORN_PIDS=$(ps aux | grep "uvicorn app.main" | grep -v grep | awk '{print $2}')

if [ -n "$UVICORN_PIDS" ]; then
    echo "🔍 Found lingering uvicorn processes: $UVICORN_PIDS"
    echo "$UVICORN_PIDS" | xargs kill -9 2>/dev/null
    echo "✅ Cleaned up uvicorn processes"
fi

echo "✅ Server shutdown complete"

