# PostgreSQL Event Tracking Setup

## Overview

The printer-server now uses PostgreSQL to track application events using an event-driven architecture:

- **AI Trade Events**: Logs AI trading analysis decisions
- **Alpaca Trade Events**: Logs actual trade executions via Alpaca API

## Database Schema

### Base Event Table
- `id`: Primary key
- `event_type`: Discriminator ('ai_trade', 'alpaca_trade')
- `timestamp`: Event timestamp
- `created_at`: Database record creation time

### AI Trade Events Table (extends Event)
- `ticker`: Stock symbol analyzed
- `action`: AI recommendation ('buy', 'hold', 'no_trade')
- `confidence`: Confidence score (0.0 to 1.0)
- `reasoning`: AI's explanation
- `chart_data_present`: Whether chart was included
- `news_data_present`: Whether news was included
- `financial_data_present`: Whether financials were included

### Alpaca Trade Events Table (extends Event)
- `ticker`: Stock symbol traded
- `order_id`: Alpaca order ID
- `client_order_id`: Alpaca client order ID
- `side`: 'buy' or 'sell'
- `notional`: Dollar amount
- `filled_qty`: Shares filled
- `filled_avg_price`: Average fill price
- `status`: Order status
- `submitted_at`: Submission timestamp
- `filled_at`: Fill timestamp
- `error_message`: Error if failed

## Setup Instructions

### 1. Install PostgreSQL

#### macOS (using Homebrew)

```bash
# Install Homebrew if you don't have it
# /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PostgreSQL
brew install postgresql@16

# Start PostgreSQL service
brew services start postgresql@16

# Verify it's running
brew services list | grep postgresql
```

#### Ubuntu/Debian Linux

```bash
# Update package list
sudo apt-get update

# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Auto-start on boot

# Verify it's running
sudo systemctl status postgresql
```

#### Windows

Download and install from: https://www.postgresql.org/download/windows/

Or use PostgreSQL installer (EDB):
1. Download from: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
2. Run installer (PostgreSQL 16 recommended)
3. Remember the password you set for the `postgres` user
4. Keep default port (5432)
5. PostgreSQL will start automatically as a service

### 2. Create Database

#### macOS/Linux (Default Setup - No Password)

```bash
# Create the database (works if PostgreSQL installed via Homebrew on macOS)
createdb printer_events

# Verify it was created
psql -l | grep printer_events
```

If `createdb` command doesn't work, try:

```bash
# Connect to PostgreSQL as your user
psql postgres

# In the psql prompt, create the database:
CREATE DATABASE printer_events;

# Verify it exists
\l

# Exit psql
\q
```

#### Windows or PostgreSQL with Password

```bash
# Connect to PostgreSQL using the postgres superuser
# You'll be prompted for the password you set during installation
psql -U postgres

# In the psql prompt, create the database:
CREATE DATABASE printer_events;

# Verify it exists
\l

# Exit psql
\q
```

### 3. Configure Database Connection

Edit `env.local` and update the `DATABASE_URL`:

#### Default Setup (macOS Homebrew, or Linux with current user)

```bash
DATABASE_URL=postgresql+asyncpg://localhost:5432/printer_events
```

#### With Username/Password (Windows, or custom PostgreSQL setup)

```bash
# Format: postgresql+asyncpg://username:password@host:port/database_name
DATABASE_URL=postgresql+asyncpg://postgres:your_password@localhost:5432/printer_events
```

**Common Configurations:**

| Setup | DATABASE_URL |
|-------|-------------|
| macOS Homebrew | `postgresql+asyncpg://localhost:5432/printer_events` |
| Linux (current user) | `postgresql+asyncpg://localhost:5432/printer_events` |
| Windows (default) | `postgresql+asyncpg://postgres:your_password@localhost:5432/printer_events` |
| Custom user | `postgresql+asyncpg://myuser:mypass@localhost:5432/printer_events` |
| Remote database | `postgresql+asyncpg://user:pass@192.168.1.100:5432/printer_events` |

### 4. Install Python Dependencies

```bash
# Make sure you're in the printer-server directory and have your venv activated
cd /Users/silverzweig/Repos/printer-server
source .venv/bin/activate

# Install new dependencies
pip install -r requirements.txt
```

This will install:
- `sqlalchemy>=2.0.0` - ORM for database operations
- `asyncpg>=0.29.0` - Async PostgreSQL driver
- `alembic>=1.13.0` - Database migrations (for future use)

### 5. Start the Server

```bash
./start_server.sh
```

The server will:
1. ✅ Check and install Python dependencies
2. ✅ Connect to PostgreSQL
3. ✅ Automatically create all required tables
4. ❌ **Fail loudly if DATABASE_URL is not set or connection fails**

Look for these log messages:
```
INFO app.database: Initializing database engine: localhost:5432/printer_events
INFO app.database: Creating database tables...
INFO app.database: ✅ Database tables created successfully
```

## Verify Setup

### Option 1: Check Tables Using psql

```bash
# macOS/Linux (default setup)
psql printer_events

# Windows or with password
psql -U postgres printer_events
# (enter password when prompted)

# Once connected, list tables
\dt

# Should show:
#  events
#  ai_trade_events
#  alpaca_trade_events

# View table structure
\d events
\d ai_trade_events
\d alpaca_trade_events

# Exit
\q
```

### Option 2: Check Using Python

Create a simple verification script:

```bash
cd /Users/silverzweig/Repos/printer-server
source .venv/bin/activate
python3 -c "
import asyncio
from app.services.database import get_async_engine, get_async_session
from sqlalchemy import text

async def check():
    async with get_async_session() as session:
        result = await session.execute(text('SELECT tablename FROM pg_tables WHERE schemaname = \\'public\\''))
        tables = [row[0] for row in result]
        print('Tables:', tables)

asyncio.run(check())
"
```

### Option 3: Query Database Without Installing psql

If you don't want to install `psql`, you can use a GUI tool:

**macOS:**
- [Postico](https://eggerapps.at/postico/) (free version available)
- [pgAdmin](https://www.pgadmin.org/download/pgadmin-4-macos/) (free)

**Windows:**
- [pgAdmin](https://www.pgadmin.org/download/pgadmin-4-windows/) (free, usually bundled with PostgreSQL installer)
- [DBeaver](https://dbeaver.io/download/) (free)

**Linux:**
- [pgAdmin](https://www.pgadmin.org/download/pgadmin-4-apt/) (free)
- [DBeaver](https://dbeaver.io/download/) (free)

Connection details:
- Host: `localhost`
- Port: `5432`
- Database: `printer_events`
- Username: Your system username (macOS/Linux) or `postgres` (Windows)
- Password: Leave blank (macOS/Linux default) or your PostgreSQL password

### Check Events After Trading

After triggering a trade analysis via the API, verify events are being logged:

**Using psql:**
```sql
-- Connect to database
psql printer_events  # or: psql -U postgres printer_events

-- View recent events
SELECT id, event_type, timestamp FROM events ORDER BY created_at DESC LIMIT 5;

-- View AI trade decisions
SELECT ticker, action, confidence, reasoning FROM ai_trade_events ORDER BY id DESC LIMIT 3;

-- View Alpaca trades
SELECT ticker, side, notional, status, filled_qty FROM alpaca_trade_events ORDER BY id DESC LIMIT 3;
```

**Using Python:**
```bash
python3 -c "
import asyncio
from app.services.database import get_async_session
from sqlalchemy import text

async def check():
    async with get_async_session() as session:
        result = await session.execute(text('SELECT COUNT(*) FROM events'))
        count = result.scalar()
        print(f'Total events logged: {count}')

asyncio.run(check())
"
```

## Troubleshooting

### Connection Failed

If you see: `ValueError: DATABASE_URL environment variable is not set`
- Ensure `env.local` has `DATABASE_URL` configured
- Restart the server

### Permission Denied

If PostgreSQL denies access:
```bash
# Create a PostgreSQL user (optional)
psql postgres
CREATE USER printer WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE printer_events TO printer;

# Update DATABASE_URL in env.local
DATABASE_URL=postgresql+asyncpg://printer:your_password@localhost:5432/printer_events
```

### Tables Not Created

Check server logs for errors during startup. The database initialization happens in `app/core.py` and will log any failures.

## Event Logging

Events are automatically logged when:
1. **AI analyzes a stock** → `AITradeEvent` created
2. **Alpaca trade executed** → `AlpacaTradeEvent` created
3. **Trade fails** → `AlpacaTradeEvent` with error_message

All event logging is handled in `app/services/event_service.py` with error handling that won't break the main application flow.

## Files Modified/Created

### New Files
- `app/models/__init__.py` - Models package init
- `app/models/events.py` - SQLAlchemy event models
- `app/services/database.py` - Database connection management
- `app/services/event_service.py` - Event logging service

### Modified Files
- `requirements.txt` - Added SQLAlchemy, asyncpg, alembic
- `env.template` - Added DATABASE_URL configuration
- `env.local` - Added DATABASE_URL with your local config
- `app/core.py` - Database initialization on startup
- `app/main.py` - Made startup_init async
- `app/routers/rest.py` - Integrated event logging into trade analysis endpoint

