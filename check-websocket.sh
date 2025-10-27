#!/bin/bash

# WebSocket Connection Check Script
# This script verifies that the WebSocket server is running and accessible

echo "🔍 Checking WebSocket Server..."
echo ""

# Check if server is running on port 8000
echo "1. Checking if server is running on port 8000..."
if lsof -i :8000 > /dev/null 2>&1; then
  echo "   ✅ Port 8000 is open"
  lsof -i :8000 | grep LISTEN
else
  echo "   ❌ Port 8000 is not open - server may not be running"
  echo "   💡 Start the server with: cd apps/server && ./start_server.sh"
  exit 1
fi

echo ""

# Check HTTP endpoint
echo "2. Checking HTTP endpoint (http://localhost:8000/docs)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs | grep -q "200"; then
  echo "   ✅ HTTP endpoint is responding"
else
  echo "   ❌ HTTP endpoint is not responding"
  exit 1
fi

echo ""

# Check environment variable
echo "3. Checking NEXT_PUBLIC_WS_URL environment variable..."
if [ -f "apps/web/.env.local" ]; then
  if grep -q "NEXT_PUBLIC_WS_URL" apps/web/.env.local; then
    WS_URL=$(grep "NEXT_PUBLIC_WS_URL" apps/web/.env.local | cut -d '=' -f2)
    echo "   ✅ NEXT_PUBLIC_WS_URL is set to: $WS_URL"
  else
    echo "   ⚠️  NEXT_PUBLIC_WS_URL not found in .env.local"
    echo "   💡 Add this line: NEXT_PUBLIC_WS_URL=ws://localhost:8000"
  fi
else
  echo "   ⚠️  apps/web/.env.local not found"
  echo "   💡 Create it with: cp apps/web/env.template apps/web/.env.local"
fi

echo ""
echo "=========================================="
echo "✅ Basic checks complete!"
echo ""
echo "Next steps:"
echo "1. Open browser to http://localhost:3000"
echo "2. Open DevTools (F12) and check Console"
echo "3. Run: diagnoseWebSocket() in console"
echo ""
echo "If still having issues, see:"
echo "apps/web/docs/websocket-troubleshooting.md"
echo "=========================================="

