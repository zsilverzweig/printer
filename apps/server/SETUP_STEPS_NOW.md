# Setup Steps for Your Current Machine

Follow these steps to get PostgreSQL set up and running on your Mac right now.

## 1. Install PostgreSQL (if not already installed)

```bash
# Install PostgreSQL via Homebrew
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Verify it's running
brew services list | grep postgresql
# Should show: postgresql@16 started
```

## 2. Create the Database

```bash
# Create the database (simple one-liner)
createdb printer_events

# Verify it was created
psql -l | grep printer_events
# Should show: printer_events
```

## 3. Your DATABASE_URL is Already Configured

Your `env.local` already has:
```
DATABASE_URL=postgresql+asyncpg://localhost:5432/printer_events
```

This is correct for macOS with Homebrew PostgreSQL! ✅

## 4. Install New Python Dependencies

```bash
# Make sure you're in printer-server directory
cd /Users/silverzweig/Repos/printer-server

# Activate your virtual environment
source .venv/bin/activate

# Install the new dependencies (SQLAlchemy, asyncpg, alembic)
pip install -r requirements.txt
```

## 5. Start the Server

```bash
# Still in printer-server directory with venv activated
./start_server.sh
```

## What You Should See

When the server starts, look for these log messages:

```
INFO app.core: Initializing Polygon client with API key: W3pL0iVWmP...
INFO app.core: Polygon client initialized successfully
INFO app.core: Initializing database...
INFO app.database: Initializing database engine: localhost:5432/printer_events
INFO app.database: Creating database tables...
INFO app.database: ✅ Database tables created successfully
INFO app.core: Database initialized successfully
INFO app.main: FastAPI application started, WebSocket endpoints registered
🚀 Starting server on http://0.0.0.0:8000
```

The key things to verify:
- ✅ "Database tables created successfully"
- ✅ No errors about DATABASE_URL
- ✅ Server starts on port 8000

## 6. Verify Tables Were Created (Optional)

```bash
# In another terminal, check the database
psql printer_events

# Once connected, list tables
\dt

# You should see:
#   events
#   ai_trade_events
#   alpaca_trade_events

# Exit psql
\q
```

Or without psql:

```bash
python3 -c "
import asyncio
from app.services.database import get_async_session
from sqlalchemy import text

async def check():
    async with get_async_session() as session:
        result = await session.execute(text('SELECT tablename FROM pg_tables WHERE schemaname = \'public\''))
        tables = [row[0] for row in result]
        print('Tables created:', tables)

asyncio.run(check())
"
```

## 7. Test Event Logging

After the server is running, trigger a trade analysis and check if events are logged:

```bash
# Check event count
python3 -c "
import asyncio
from app.services.database import get_async_session
from sqlalchemy import text

async def check():
    async with get_async_session() as session:
        result = await session.execute(text('SELECT COUNT(*) FROM events'))
        print(f'Total events logged: {result.scalar()}')

asyncio.run(check())
"
```

## If Something Goes Wrong

### PostgreSQL not installed
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Database creation fails
```bash
# Try connecting to postgres first
psql postgres

# Then create database manually
CREATE DATABASE printer_events;
\q
```

### Python dependencies fail to install
```bash
# Make sure you're in the venv
source .venv/bin/activate

# Upgrade pip first
pip install --upgrade pip

# Try again
pip install -r requirements.txt
```

### Server fails to start with database error
Check your DATABASE_URL in `env.local`:
```bash
DATABASE_URL=postgresql+asyncpg://localhost:5432/printer_events
```

Make sure there are no typos or extra spaces.

## That's It! 🎉

Your server is now set up with PostgreSQL event tracking. Every AI analysis and trade will be logged automatically.

## For Your Other Computer

See [QUICK_SETUP.md](QUICK_SETUP.md) for a condensed setup guide to use on other machines.

