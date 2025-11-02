"""Add TimescaleDB market data hypertables

Revision ID: 017
Revises: 016
Create Date: 2025-11-02

This migration sets up TimescaleDB for historical market data storage:
- Enables TimescaleDB extension (done manually)
- Creates market_data_minute hypertable for 1-minute bars
- Creates indexes for time-series, cross-sectional, and pattern matching queries
- Sets up compression policy

Note: Continuous aggregates will be added in a separate migration to avoid
transaction issues with TimescaleDB.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '017'
down_revision = '016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Set up TimescaleDB market data infrastructure (phase 1).
    
    Creates:
    - market_data_minute hypertable
    - Optimized indexes for various query patterns
    - Compression policy
    """
    
    # Create market_data_minute table
    op.execute("""
        CREATE TABLE IF NOT EXISTS market_data_minute (
            time TIMESTAMPTZ NOT NULL,
            symbol VARCHAR(20) NOT NULL,
            open NUMERIC(12, 4) NOT NULL,
            high NUMERIC(12, 4) NOT NULL,
            low NUMERIC(12, 4) NOT NULL,
            close NUMERIC(12, 4) NOT NULL,
            volume BIGINT NOT NULL,
            vwap NUMERIC(12, 4),
            trade_count INTEGER,
            session_type VARCHAR(10) DEFAULT 'regular',
            PRIMARY KEY (time, symbol)
        );
    """)
    
    # Convert to hypertable (partitioned by time with 1-week chunks)
    # Use IF NOT EXISTS pattern with exception handling
    op.execute("""
        DO $$
        BEGIN
            PERFORM create_hypertable(
                'market_data_minute',
                'time',
                chunk_time_interval => INTERVAL '1 week',
                if_not_exists => TRUE
            );
        EXCEPTION
            WHEN others THEN
                -- Table might already be a hypertable, that's okay
                RAISE NOTICE 'Hypertable might already exist: %', SQLERRM;
        END $$;
    """)
    
    # Create indexes for optimal query performance
    
    # Index for single-ticker time-series queries (most common)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time 
        ON market_data_minute (symbol, time DESC);
    """)
    
    # Index for cross-sectional analysis (all tickers at specific time)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_time_symbol 
        ON market_data_minute (time, symbol);
    """)
    
    # Partial index for regular hours queries (optimization)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_regular_hours 
        ON market_data_minute (symbol, time DESC) 
        WHERE session_type = 'regular';
    """)
    
    # Enable compression on the hypertable
    op.execute("""
        DO $$
        BEGIN
            ALTER TABLE market_data_minute SET (
                timescaledb.compress,
                timescaledb.compress_segmentby = 'symbol',
                timescaledb.compress_orderby = 'time DESC'
            );
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Compression might already be enabled: %', SQLERRM;
        END $$;
    """)
    
    # Add compression policy (compress chunks older than 7 days)
    op.execute("""
        DO $$
        BEGIN
            PERFORM add_compression_policy(
                'market_data_minute',
                INTERVAL '7 days',
                if_not_exists => TRUE
            );
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Compression policy might already exist: %', SQLERRM;
        END $$;
    """)


def downgrade() -> None:
    """Remove TimescaleDB market data infrastructure."""
    
    # Drop compression policy
    op.execute("""
        SELECT remove_compression_policy('market_data_minute', if_exists => true);
    """)
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_market_data_regular_hours;")
    op.execute("DROP INDEX IF EXISTS idx_market_data_time_symbol;")
    op.execute("DROP INDEX IF EXISTS idx_market_data_symbol_time;")
    
    # Drop hypertable (this also drops the underlying table)
    op.execute("DROP TABLE IF EXISTS market_data_minute CASCADE;")
