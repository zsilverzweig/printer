# Minimal FastAPI + Polygon backend

This is a minimal FastAPI service that proxies a few Polygon.io endpoints and provides a simple WebSocket pass-through.

Reference: [polygon-io/client-python](https://github.com/polygon-io/client-python)

## Endpoints

- `GET /health` → `{ "status": "ok" }`
- `GET /aggs/{ticker}`
  - Query: `multiplier`, `timespan`, `from`, `to`, `limit=50000`, `paginate=true`
- `GET /last-trade/{ticker}`
- `GET /last-quote/{ticker}`
- `GET /trades/{ticker}`
  - Query: `timestamp`, `limit=100`, `paginate=true`
- `GET /quotes/{ticker}`
  - Query: `timestamp`, `limit=100`, `paginate=true`
- `WS /ws?subs=T.AAPL,T.META` → forwards Polygon messages
- `GET /news`
  - Query: `ticker`, `published_utc`, `order`, `limit=10`, `sort`, `paginate=true`
- `GET /stock-history`
  - Query: `date=YYYY-MM-DD` (optional; defaults to last trading day), `days=7`, `limit=20`, `adjusted=true`, `min_price=2.0`, `max_price=20.0`, `order_by=avg_volume|rv`
  - Returns only one trading day’s grouped rows (latest by default), enriched with `rv` for ranking when requested.
  - `WS /screener/ws` → real-time screener top 200 (refresh ~20s)

### Real-time Screener WS

Connect and receive the top 200 (objects with `ticker`, `price`, `today_vol`, `rv14`, `rv30`, `rv60`).

```bash
websocat 'ws://127.0.0.1:8000/screener/ws'
```

Notes:

- Uses last ~60 trading days of grouped data for averages; ensures ≥14 days.
- Snapshot updates drive refresh (~20s).

## Quick Start

If you just want to get the server running quickly:

```bash
# 1. Set up PostgreSQL database (required)
createdb printer_events
# See DATABASE_SETUP.md for detailed instructions

# 2. Set up your environment variables
cp env.template env.local
# Edit env.local with your API keys and DATABASE_URL

# 3. Start the server (this will handle everything else automatically)
./start_server.sh
```

**Note:** PostgreSQL is now required for event tracking. See [DATABASE_SETUP.md](DATABASE_SETUP.md) for complete setup instructions.

## Setup & Installation

### Prerequisites
- Python 3.8 or higher
- PostgreSQL 14+ (see [DATABASE_SETUP.md](DATABASE_SETUP.md))
- Virtual environment (recommended)

### Installation Steps

1. **Create and activate a virtual environment:**
```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Set up PostgreSQL database:**
```bash
# Create the database
createdb printer_events

# For detailed instructions (Windows, Linux, etc.), see:
# DATABASE_SETUP.md
```

4. **Set up environment variables:**
```bash
# Copy the template and edit with your API keys and database URL
cp env.template env.local
# Edit env.local with your actual API keys and DATABASE_URL
```

Required variables in `env.local`:
- `OPENAI_API_KEY` - OpenAI API key for AI analysis
- `POLYGON_API_KEY` - Polygon.io API key for market data
- `ALPACA_API_KEY` - Alpaca paper trading API key
- `ALPACA_SECRET_KEY` - Alpaca paper trading secret key
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql+asyncpg://localhost:5432/printer_events`)

5. **Verify your setup:**
```bash
python3 setup_env.py
```

## Run

### Option 1: Using the start/stop scripts (recommended)

**Start the server:**
```bash
./start_server.sh
```

**What the start script does:**
1. 📦 Creates virtual environment if missing
2. 🔧 Activates the virtual environment
3. 📋 Checks if dependencies are installed
4. 📦 Installs dependencies from `requirements.txt` if needed
5. ✅ Verifies environment variables are set
6. 🚀 Starts the server on `http://0.0.0.0:8000`

**Stop the server:**
```bash
./kill_server.sh
```

**What the kill script does:**
1. 🔍 Finds process running on port 8000
2. 🧹 Cleans up any lingering uvicorn processes
3. ✅ Confirms server shutdown

### Option 2: Manual start/stop

**Manual start:**
```bash
# Activate virtual environment
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Manual stop:**
```bash
# Find and kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

The server will be available at `http://localhost:8000`

## Database Event Tracking

The server now tracks all AI trading decisions and Alpaca trade executions in PostgreSQL. Events are automatically logged when:

1. **AI analyzes a stock** → `AITradeEvent` created with action, confidence, reasoning
2. **Alpaca trade executed** → `AlpacaTradeEvent` created with order details
3. **Trade fails** → `AlpacaTradeEvent` with error_message

For complete database setup and verification instructions, see [DATABASE_SETUP.md](DATABASE_SETUP.md).

## Notes

- Pagination is enabled by default per Polygon client. Set `paginate=false` to limit to a single page.
- Responses are pass-through from the official client, encoded to JSON.
- PostgreSQL database tables are created automatically on server startup.
- The server will fail loudly if `DATABASE_URL` is not configured correctly.
