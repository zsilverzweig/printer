# WebSocket Troubleshooting Guide

## Connection Architecture

The WebSocket connection flows like this:

```
Browser Client
   ↓ (Direct WebSocket Connection)
   → ws://localhost:8000/realtime
      ↓
   FastAPI Python Server (apps/server)
      ↓ (Connects to Polygon for market data)
   → wss://socket.polygon.io/stocks
```

**Important**: The connection is **direct from browser to Python backend**, NOT through the Next.js web server.

## Quick Diagnostic

1. **Check if Python server is running**:
   ```bash
   # From project root
   cd apps/server
   python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Check browser console**:
   - Open DevTools (F12)
   - Look for WebSocket connection messages
   - Run this command in console:
   ```javascript
   diagnoseWebSocket()
   ```

3. **Check environment variable**:
   ```bash
   # Make sure .env.local has:
   NEXT_PUBLIC_WS_URL=ws://localhost:8000
   ```

## Common Issues & Solutions

### Issue 1: "Disconnected" Status

**Symptoms**: Red dot showing "Disconnected" in UI

**Causes**:
- Python server not running
- Wrong `NEXT_PUBLIC_WS_URL` value
- Firewall blocking WebSocket connections
- Server crashed or returned error

**Solutions**:
1. Verify Python server is running on port 8000
2. Check server logs for errors
3. Run `diagnoseWebSocket()` in browser console
4. Verify `.env.local` has correct `NEXT_PUBLIC_WS_URL`

### Issue 2: Connection Keeps Dropping

**Symptoms**: Connects then quickly disconnects

**Causes**:
- Server crashing on connection
- Network instability
- Polygon API key issues

**Solutions**:
1. Check Python server logs for exceptions
2. Verify Polygon API key is valid
3. Check server memory/resources
4. Look for Python errors in terminal

### Issue 3: Data Not Updating

**Symptoms**: Connected but no data flowing

**Causes**:
- Not subscribed to any symbols
- Server-side service not started
- Polygon WebSocket not connected

**Solutions**:
1. Check WebSocket Status panel for service statuses
2. Verify you've selected a stock symbol
3. Check Python server logs for service initialization

## Automatic Reconnection

The client now has aggressive reconnection built in:

- **Auto-reconnect**: Enabled (never gives up)
- **Reconnect interval**: 2 seconds
- **Heartbeat**: Every 20 seconds
- **Timeout**: 45 seconds before considering dead
- **Force reconnect**: After 10 seconds of being disconnected

## Manual Troubleshooting Commands

### Browser Console

```javascript
// Run full diagnostics
diagnoseWebSocket()

// Check current connection status
// (Open React DevTools and look for WebSocketProvider)
```

### Server-Side

```bash
# Check if server is running
curl http://localhost:8000/docs

# Check WebSocket endpoint
# (Use a WebSocket client like websocat or wscat)
websocat ws://localhost:8000/realtime
```

## Configuration Files

### 1. Environment Variables (`apps/web/.env.local`)
```env
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### 2. Docker Compose (`docker-compose.yml`)
```yaml
environment:
  - NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Monitoring Connection Health

The WebSocket Status component (bottom-right of screen) shows:
- **Overall connection**: Green = connected, Red = disconnected
- **Service status**: Individual dots for NOC, Screener, Market Data
- **Last update**: Time since last data received
- **Subscriptions**: What symbols you're monitoring

## Development vs Production

### Development (localhost)
- URL: `ws://localhost:8000`
- Server: Run manually or via npm scripts
- Logs: Visible in terminal

### Production
- URL: `wss://your-domain.com` (or custom URL)
- Server: Should be deployed and always running
- Logs: Check server logs/monitoring

## Need More Help?

1. Check browser console for WebSocket messages
2. Check Python server terminal for errors
3. Run `diagnoseWebSocket()` in browser console
4. Check the WebSocket Status panel (bottom-right)
5. Verify all services are green in the status panel

