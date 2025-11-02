"""Convert to multi-timescale architecture

Revision ID: 021
Revises: 020
Create Date: 2025-11-02

This migration transforms the market data architecture from continuous aggregates
to a unified multi-timescale table:
- Drops continuous aggregate materialized views and policies
- Renames market_data_minute to market_data
- Adds timescale column to support multiple granularities in one table
- Updates indexes for optimal timescale-aware queries
- Updates validation table to track completeness per timescale
- Backfills existing data with timescale='1min'
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Transform to multi-timescale architecture.
    """
    
    # ========================================================================
    # STEP 1: Drop continuous aggregate infrastructure from migration 020
    # ========================================================================
    
    print("Dropping continuous aggregate policies...")
    
    # Remove refresh policies (if they exist)
    op.execute("""
        DO $$
        BEGIN
            PERFORM remove_continuous_aggregate_policy('market_data_daily', if_exists => true);
        EXCEPTION
            WHEN undefined_table THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            PERFORM remove_continuous_aggregate_policy('market_data_1h', if_exists => true);
        EXCEPTION
            WHEN undefined_table THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            PERFORM remove_continuous_aggregate_policy('market_data_15m', if_exists => true);
        EXCEPTION
            WHEN undefined_table THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            PERFORM remove_continuous_aggregate_policy('market_data_5m', if_exists => true);
        EXCEPTION
            WHEN undefined_table THEN NULL;
        END $$;
    """)
    
    print("Dropping continuous aggregate materialized views...")
    
    # Drop materialized views (CASCADE drops indexes automatically)
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_daily CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_1h CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_15m CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_5m CASCADE;")
    
    # ========================================================================
    # STEP 2: Transform market_data_minute to multi-timescale market_data
    # ========================================================================
    
    print("Checking if market_data_minute exists...")
    
    # Check if table exists, if not we need to create it from scratch
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_data_minute') THEN
                -- Table exists, transform it
                RAISE NOTICE 'market_data_minute exists, transforming...';
                
                -- Drop existing indexes
                DROP INDEX IF EXISTS idx_market_data_regular_hours;
                DROP INDEX IF EXISTS idx_market_data_time_symbol;
                DROP INDEX IF EXISTS idx_market_data_symbol_time;
                
                -- Add timescale column with default value for existing data
                ALTER TABLE market_data_minute 
                ADD COLUMN IF NOT EXISTS timescale VARCHAR(10) DEFAULT '1min' NOT NULL;
                
                -- Drop existing primary key constraint
                ALTER TABLE market_data_minute 
                DROP CONSTRAINT IF EXISTS market_data_minute_pkey;
                
                -- Add new composite primary key with timescale
                ALTER TABLE market_data_minute 
                ADD PRIMARY KEY (time, symbol, timescale);
                
                -- Rename table
                ALTER TABLE market_data_minute 
                RENAME TO market_data;
            ELSE
                -- Table doesn't exist, create it from scratch
                RAISE NOTICE 'market_data_minute does not exist, creating market_data from scratch...';
                
                CREATE TABLE IF NOT EXISTS market_data (
                    time TIMESTAMPTZ NOT NULL,
                    symbol VARCHAR(20) NOT NULL,
                    timescale VARCHAR(10) NOT NULL DEFAULT '1min',
                    open NUMERIC(12, 4) NOT NULL,
                    high NUMERIC(12, 4) NOT NULL,
                    low NUMERIC(12, 4) NOT NULL,
                    close NUMERIC(12, 4) NOT NULL,
                    volume BIGINT NOT NULL,
                    vwap NUMERIC(12, 4),
                    trade_count INTEGER,
                    session_type VARCHAR(10) DEFAULT 'regular',
                    PRIMARY KEY (time, symbol, timescale)
                );
                
                -- Convert to hypertable
                PERFORM create_hypertable(
                    'market_data',
                    'time',
                    chunk_time_interval => INTERVAL '1 week',
                    if_not_exists => TRUE
                );
            END IF;
        END $$;
    """)
    
    print("Creating new optimized indexes...")
    
    # Create new indexes optimized for timescale queries
    # Most common query pattern: get data for symbol at specific timescale
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timescale_time 
        ON market_data (symbol, timescale, time DESC);
    """)
    
    # Cross-sectional queries within a timescale
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_timescale_time_symbol 
        ON market_data (timescale, time DESC, symbol);
    """)
    
    # Partial index for regular hours queries (optimization)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_regular_hours 
        ON market_data (symbol, timescale, time DESC) 
        WHERE session_type = 'regular';
    """)
    
    # ========================================================================
    # STEP 3: Update symbol_date_validation table
    # ========================================================================
    
    print("Updating symbol_date_validation table...")
    
    # Check if table exists, if not create it
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'symbol_date_validation') THEN
                -- Table exists, update it
                RAISE NOTICE 'symbol_date_validation exists, updating...';
                
                -- Add timescale column with default value for existing data
                ALTER TABLE symbol_date_validation 
                ADD COLUMN IF NOT EXISTS timescale VARCHAR(10) DEFAULT '1min' NOT NULL;
                
                -- Drop existing primary key constraint
                ALTER TABLE symbol_date_validation 
                DROP CONSTRAINT IF EXISTS symbol_date_validation_pkey;
                
                -- Add new composite primary key with timescale
                ALTER TABLE symbol_date_validation 
                ADD PRIMARY KEY (symbol, date, timescale);
            ELSE
                -- Table doesn't exist, create it from scratch
                RAISE NOTICE 'symbol_date_validation does not exist, creating from scratch...';
                
                CREATE TABLE IF NOT EXISTS symbol_date_validation (
                    symbol VARCHAR(20) NOT NULL,
                    date DATE NOT NULL,
                    timescale VARCHAR(10) NOT NULL DEFAULT '1min',
                    is_complete BOOLEAN NOT NULL DEFAULT FALSE,
                    bar_count INTEGER NOT NULL DEFAULT 0,
                    expected_bars INTEGER,
                    first_bar_time TIMESTAMPTZ,
                    last_bar_time TIMESTAMPTZ,
                    validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    notes TEXT,
                    PRIMARY KEY (symbol, date, timescale)
                );
            END IF;
        END $$;
    """)
    
    print("Multi-timescale architecture migration complete!")


def downgrade() -> None:
    """
    Revert to continuous aggregate architecture.
    
    WARNING: This will lose any data loaded for non-1min timescales.
    """
    
    print("Reverting symbol_date_validation table...")
    
    # Remove non-1min validation records
    op.execute("""
        DELETE FROM symbol_date_validation 
        WHERE timescale != '1min';
    """)
    
    # Drop and recreate primary key without timescale
    op.execute("""
        ALTER TABLE symbol_date_validation 
        DROP CONSTRAINT IF EXISTS symbol_date_validation_pkey;
    """)
    op.execute("""
        ALTER TABLE symbol_date_validation 
        ADD PRIMARY KEY (symbol, date);
    """)
    
    # Remove timescale column
    op.execute("""
        ALTER TABLE symbol_date_validation 
        DROP COLUMN IF EXISTS timescale;
    """)
    
    print("Reverting market_data table...")
    
    # Remove non-1min data
    op.execute("""
        DELETE FROM market_data 
        WHERE timescale != '1min';
    """)
    
    # Drop new indexes
    op.execute("DROP INDEX IF EXISTS idx_market_data_regular_hours;")
    op.execute("DROP INDEX IF EXISTS idx_market_data_timescale_time_symbol;")
    op.execute("DROP INDEX IF EXISTS idx_market_data_symbol_timescale_time;")
    
    # Drop and recreate primary key without timescale
    op.execute("""
        ALTER TABLE market_data 
        DROP CONSTRAINT IF EXISTS market_data_pkey;
    """)
    op.execute("""
        ALTER TABLE market_data 
        ADD PRIMARY KEY (time, symbol);
    """)
    
    # Remove timescale column
    op.execute("""
        ALTER TABLE market_data 
        DROP COLUMN IF EXISTS timescale;
    """)
    
    # Rename table back
    op.execute("""
        ALTER TABLE market_data 
        RENAME TO market_data_minute;
    """)
    
    # Recreate old indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time 
        ON market_data_minute (symbol, time DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_time_symbol 
        ON market_data_minute (time, symbol);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_regular_hours 
        ON market_data_minute (symbol, time DESC) 
        WHERE session_type = 'regular';
    """)
    
    print("Recreating continuous aggregates (empty, will need refresh)...")
    
    # Recreate continuous aggregates from migration 020
    # Note: These will be empty and need manual refresh
    
    # 5-minute aggregate
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_5m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('5 minutes', time) AS bucket,
            symbol,
            FIRST(open, time) as open,
            MAX(high) as high,
            MIN(low) as low,
            LAST(close, time) as close,
            SUM(volume) as volume,
            SUM(vwap * volume) / NULLIF(SUM(volume), 0) as vwap,
            SUM(trade_count) as trade_count
        FROM market_data_minute
        GROUP BY bucket, symbol
        WITH NO DATA;
    """)
    
    # 15-minute aggregate
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_15m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('15 minutes', time) AS bucket,
            symbol,
            FIRST(open, time) as open,
            MAX(high) as high,
            MIN(low) as low,
            LAST(close, time) as close,
            SUM(volume) as volume,
            SUM(vwap * volume) / NULLIF(SUM(volume), 0) as vwap,
            SUM(trade_count) as trade_count
        FROM market_data_minute
        GROUP BY bucket, symbol
        WITH NO DATA;
    """)
    
    # 1-hour aggregate
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_1h
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 hour', time) AS bucket,
            symbol,
            FIRST(open, time) as open,
            MAX(high) as high,
            MIN(low) as low,
            LAST(close, time) as close,
            SUM(volume) as volume,
            SUM(vwap * volume) / NULLIF(SUM(volume), 0) as vwap,
            SUM(trade_count) as trade_count
        FROM market_data_minute
        GROUP BY bucket, symbol
        WITH NO DATA;
    """)
    
    # Daily aggregate with session breakdown
    op.execute("""
        CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_daily
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 day', time) AS bucket,
            symbol,
            FIRST(open, time) as open,
            MAX(high) as high,
            MIN(low) as low,
            LAST(close, time) as close,
            SUM(volume) as volume,
            SUM(vwap * volume) / NULLIF(SUM(volume), 0) as vwap,
            SUM(trade_count) as trade_count,
            SUM(volume) FILTER (WHERE session_type = 'regular') as regular_volume,
            SUM(volume) FILTER (WHERE session_type = 'pre') as pre_volume,
            SUM(volume) FILTER (WHERE session_type = 'after') as after_volume
        FROM market_data_minute
        GROUP BY bucket, symbol
        WITH NO DATA;
    """)
    
    # Recreate indexes (but don't recreate refresh policies, as they're not working)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_5m_symbol_bucket 
        ON market_data_5m (symbol, bucket DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_15m_symbol_bucket 
        ON market_data_15m (symbol, bucket DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_1h_symbol_bucket 
        ON market_data_1h (symbol, bucket DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_daily_symbol_bucket 
        ON market_data_daily (symbol, bucket DESC);
    """)
    
    print("Downgrade complete. Note: Continuous aggregates are empty and need manual refresh.")

