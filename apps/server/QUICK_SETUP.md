# Quick Setup Guide - printer-server

Use this guide to set up the server on a new machine. For detailed explanations, see [DATABASE_SETUP.md](DATABASE_SETUP.md).

## 1. Install PostgreSQL

### macOS
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Windows
Download and run installer: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- Use PostgreSQL 16
- Remember the password for `postgres` user
- Keep port 5432

## 2. Create Database

### macOS/Linux
```bash
createdb printer_events
```

### Windows
```bash
psql -U postgres
CREATE DATABASE printer_events;
\q
```

## 3. Clone and Setup Project

```bash
# Clone the repository
cd /path/to/your/repos
git clone <your-repo-url> printer-server
cd printer-server

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## 4. Configure Environment

```bash
# Copy environment template
cp env.template env.local

# Edit env.local with your API keys
```

**Required in env.local:**

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Polygon
POLYGON_API_KEY=...

# Alpaca Paper Trading
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...

# Database - Choose your setup:

# macOS/Linux (default):
DATABASE_URL=postgresql+asyncpg://localhost:5432/printer_events

# Windows (with password):
DATABASE_URL=postgresql+asyncpg://postgres:your_password@localhost:5432/printer_events
```

## 5. Start Server

```bash
./start_server.sh
```

Look for:
```
✅ Database tables created successfully
🚀 Starting server on http://0.0.0.0:8000
```

## 6. Verify Setup

### Option 1: Check with psql
```bash
# macOS/Linux
psql printer_events -c "\dt"

# Windows
psql -U postgres printer_events -c "\dt"

# Should show: events, ai_trade_events, alpaca_trade_events
```

### Option 2: Check with Python
```bash
python3 -c "
import asyncio
from app.services.database import get_async_session
from sqlalchemy import text

async def check():
    async with get_async_session() as session:
        result = await session.execute(text('SELECT COUNT(*) FROM events'))
        print(f'Events table accessible: {result.scalar() == 0}')

asyncio.run(check())
"
```

## Troubleshooting

### "DATABASE_URL environment variable is not set"
- Make sure `env.local` exists and has `DATABASE_URL` configured
- Restart the server

### "psql: command not found"
- macOS: `brew install postgresql@16` (includes psql)
- Linux: `sudo apt-get install postgresql-client`
- Windows: psql should be in PATH after PostgreSQL installation

### Can't connect to PostgreSQL
```bash
# Check if PostgreSQL is running
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql

# Windows
# Check Services app for "postgresql" service
```

### Wrong password
If using password authentication, make sure DATABASE_URL has correct format:
```bash
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/printer_events
```

## What Gets Tracked

The database automatically logs:

1. **AI Analysis Events** (`ai_trade_events`)
   - Every AI trading decision
   - Ticker, action (buy/hold/no_trade), confidence, reasoning

2. **Alpaca Trade Events** (`alpaca_trade_events`)
   - Every trade execution attempt
   - Order details, fill prices, status, errors

## GUI Database Tools (Optional)

If you prefer a visual interface instead of psql:

- **macOS:** [Postico](https://eggerapps.at/postico/) (free)
- **Windows:** pgAdmin (bundled with PostgreSQL installer)
- **Cross-platform:** [DBeaver](https://dbeaver.io/) (free)

Connection:
- Host: `localhost`
- Port: `5432`
- Database: `printer_events`
- User: Your system username (macOS/Linux) or `postgres` (Windows)
- Password: Blank (macOS/Linux) or your PostgreSQL password (Windows)

## Done! 🎉

Your server is now tracking all trading events in PostgreSQL.

For more details, see:
- [DATABASE_SETUP.md](DATABASE_SETUP.md) - Complete database documentation
- [README.md](README.md) - Full server documentation

