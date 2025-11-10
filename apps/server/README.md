# Minimal FastAPI + Polygon backend

> **🐳 Note for AI Assistants**: This server runs in Docker. See [AGENTS.md](../../AGENTS.md) for Docker-specific operational guidance.

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

Connect and receive the top 200 (objects with `ticker`, `price`, `today_vol`, `rv14`, `rv_lw`).

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

## Testing

### Running Tests

```bash
# Activate virtual environment
source .venv/bin/activate

# Run all tests
pytest

# Run tests with verbose output
pytest -v

# Run specific test file
pytest tests/test_position_sizing.py

# Run tests matching a pattern
pytest -k "position_sizing"

# Run with coverage
pytest --cov=app --cov-report=html
```

### Test Infrastructure

The test suite provides builders and assertions to make tests clear and concise:

**Test Builders** (`tests/test_builders.py`) - Factory functions for creating test objects:

```python
from tests.test_builders import build_fund, build_order, build_position_context

def test_example(fund_factory):
    # Create a fund with specific parameters
    fund = fund_factory(
        balance=10000.0,
        max_bet_percent=5.0,
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
```

**Test Assertions** (`tests/test_assertions.py`) - Helper functions for complex validations:

```python
from tests.test_assertions import assert_position_size_valid, assert_trading_hours_respected

def test_position_sizing(fund_factory):
    fund = fund_factory(size_per_trade=1000.0, max_bet_percent=5.0)
    calculated_size = 500.0

    # Validates size respects all fund constraints
    assert_position_size_valid(fund, calculated_size, share_price=100.0)
```

### Common Test Patterns

**Testing with Database:**

```python
@pytest.mark.asyncio
async def test_with_database(async_session, fund_factory):
    fund = fund_factory()
    async_session.add(fund)
    await async_session.commit()
    # Test database operations
```

**Testing Strategy Engine:**

```python
@pytest.mark.asyncio
async def test_strategy(mock_strategy_engine, fund_factory):
    fund = fund_factory(balance=10000.0)
    engine = mock_strategy_engine(fund)
    # Test strategy logic
```

**Testing Time-Dependent Logic:**

```python
def test_trading_hours(fund_factory, frozen_time):
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )

    with frozen_time("2024-01-15 10:00:00", tz_offset=-5):
        # Test logic at 10 AM ET
        pass
```

### Writing New Tests

1. Use **test builders** instead of creating objects manually
2. Use **test assertions** for complex validations
3. Use **fixtures** for common setup (fund_factory, mock_strategy_engine, etc.)
4. Mark async tests with `@pytest.mark.asyncio`
5. Keep tests focused on one behavior

Example test structure:

```python
@pytest.mark.asyncio
async def test_risk_limit_enforcement(fund_factory, position_factory):
    """Test that max_loss_dollars prevents trading when hit."""
    # Arrange
    fund = fund_factory(balance=10000.0, max_loss_dollars=500.0)
    positions = {
        "AAPL": position_factory(
            entry_price=150.0,
            current_price=140.0,  # Loss of $100
            quantity=10  # Total loss: $100
        )
    }

    # Act & Assert
    from tests.test_assertions import assert_risk_limits_enforced
    assert_risk_limits_enforced(fund, positions, should_allow_trading=True)
```

## Notes

- Pagination is enabled by default per Polygon client. Set `paginate=false` to limit to a single page.
- Responses are pass-through from the official client, encoded to JSON.
- PostgreSQL database tables are created automatically on server startup.
- The server will fail loudly if `DATABASE_URL` is not configured correctly.
