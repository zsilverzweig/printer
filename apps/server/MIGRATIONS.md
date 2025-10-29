# Database Migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations. Migrations run automatically on server startup.

## How It Works

### Automatic Migrations

**Docker:** Migrations run automatically when the container starts via `docker-start.sh`

**Local:** Migrations run automatically when you start the server via `start_server.sh`

### Migration Files

Migrations are stored in `alembic/versions/`:

- `001_add_task_type_to_asset_loading_status.py` - Adds task_type column for float scraping
- `002_add_float_fields_to_ticker_details.py` - Adds float metrics columns

## Creating New Migrations

### 1. Auto-generate Migration (Recommended)

```bash
cd apps/server
alembic revision --autogenerate -m "description of change"
```

This will detect changes in your SQLAlchemy models and generate a migration automatically.

### 2. Create Empty Migration

```bash
cd apps/server
alembic revision -m "description of change"
```

Then manually edit the generated file in `alembic/versions/`.

## Running Migrations Manually

### Upgrade to Latest

```bash
cd apps/server
python3 run_migrations.py
```

Or using Alembic directly:

```bash
cd apps/server
alembic upgrade head
```

### Downgrade (Rollback)

```bash
cd apps/server
alembic downgrade -1  # Rollback one migration
alembic downgrade <revision>  # Rollback to specific revision
```

### Check Current Version

```bash
cd apps/server
alembic current
```

### View Migration History

```bash
cd apps/server
alembic history
```

## Migration Structure

```
apps/server/
├── alembic/                    # Alembic directory
│   ├── env.py                  # Alembic environment config
│   ├── script.py.mako          # Migration template
│   └── versions/               # Migration files
│       ├── 001_add_task_type_to_asset_loading_status.py
│       └── 002_add_float_fields_to_ticker_details.py
├── alembic.ini                 # Alembic configuration
├── run_migrations.py           # Migration runner script
└── docker-start.sh            # Docker startup script (runs migrations)
```

## Environment Variables

Migrations use the `DATABASE_URL` environment variable to connect to PostgreSQL:

```bash
# Local (env.local)
DATABASE_URL=postgresql+asyncpg://localhost:5432/printer_events

# Docker (docker-compose.yml)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/printer_events
```

## Troubleshooting

### Migration Fails on Startup

If a migration fails, the server will not start. Check the logs for the error message:

```bash
# Docker logs
docker-compose logs server

# Local logs
# Errors will be printed to terminal
```

### Fix: Manually Run Migration

```bash
cd apps/server
python3 run_migrations.py
```

### Reset Database (DANGER: Loses all data)

```bash
# Docker
docker-compose down -v  # Remove volumes
docker-compose up       # Recreate everything

# Local
dropdb printer_events
createdb printer_events
python3 run_migrations.py
```

### Check Database Schema

```bash
# Docker
docker-compose exec db psql -U postgres -d printer_events -c "\d"

# Local
psql printer_events -c "\d"
```

## Best Practices

1. **Always test migrations locally first** before deploying
2. **Never edit existing migration files** - create new ones instead
3. **Include both upgrade() and downgrade()** functions
4. **Use meaningful revision messages** that describe the change
5. **Review auto-generated migrations** - they may need adjustments
6. **Backup production database** before running migrations

## Adding New Database Fields

When you add new fields to a SQLAlchemy model:

1. Update the model in `app/models/`
2. Generate migration: `alembic revision --autogenerate -m "add new fields"`
3. Review the generated migration file
4. Test locally: `python3 run_migrations.py`
5. Commit both the model changes and migration file
6. Deploy - migrations run automatically on startup

## Example: Adding Float Fields

This is what we did for the float scraper feature:

1. **Updated model** (`app/models/assets.py`):

   ```python
   public_float: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
   short_percent_of_float: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
   outstanding_shares_scraped: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
   ```

2. **Created migration** (`alembic/versions/002_add_float_fields_to_ticker_details.py`):

   ```python
   def upgrade() -> None:
       op.add_column('ticker_details', sa.Column('public_float', sa.BigInteger(), nullable=True))
       op.add_column('ticker_details', sa.Column('short_percent_of_float', sa.Float(), nullable=True))
       op.add_column('ticker_details', sa.Column('outstanding_shares_scraped', sa.BigInteger(), nullable=True))
       op.create_index('idx_ticker_details_public_float', 'ticker_details', ['public_float'])
   ```

3. **Deployed** - migration runs automatically on next startup

That's it! No manual database commands needed. 🚀

