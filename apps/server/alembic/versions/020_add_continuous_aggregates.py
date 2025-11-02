"""Add TimescaleDB continuous aggregates

Revision ID: 020
Revises: 019
Create Date: 2025-11-02

This migration creates TimescaleDB continuous aggregates (materialized views)
for common time-series aggregations:
- 5-minute OHLCV bars
- 15-minute OHLCV bars  
- 1-hour OHLCV bars
- Daily OHLCV bars with session breakdown

These views auto-refresh to provide fast queries for historical data.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '020'
down_revision = '019'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create continuous aggregates for time-series data.
    
    Continuous aggregates are TimescaleDB's materialized views that
    automatically and incrementally refresh as new data arrives.
    """
    
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
    
    # Create indexes on continuous aggregates for fast lookups
    
    # 5-minute indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_5m_symbol_bucket 
        ON market_data_5m (symbol, bucket DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_5m_bucket 
        ON market_data_5m (bucket DESC);
    """)
    
    # 15-minute indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_15m_symbol_bucket 
        ON market_data_15m (symbol, bucket DESC);
    """)
    
    # 1-hour indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_1h_symbol_bucket 
        ON market_data_1h (symbol, bucket DESC);
    """)
    
    # Daily indexes
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_daily_symbol_bucket 
        ON market_data_daily (symbol, bucket DESC);
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_daily_bucket 
        ON market_data_daily (bucket DESC);
    """)
    
    # Add refresh policies - these auto-update the materialized views
    
    # 5-minute refresh: every 1 minute, lag 10 minutes behind real-time
    op.execute("""
        SELECT add_continuous_aggregate_policy('market_data_5m',
            start_offset => INTERVAL '1 hour',
            end_offset => INTERVAL '10 minutes',
            schedule_interval => INTERVAL '1 minute');
    """)
    
    # 15-minute refresh: every 2 minutes, lag 20 minutes behind
    op.execute("""
        SELECT add_continuous_aggregate_policy('market_data_15m',
            start_offset => INTERVAL '2 hours',
            end_offset => INTERVAL '20 minutes',
            schedule_interval => INTERVAL '2 minutes');
    """)
    
    # 1-hour refresh: every 5 minutes, lag 1 hour behind
    op.execute("""
        SELECT add_continuous_aggregate_policy('market_data_1h',
            start_offset => INTERVAL '1 day',
            end_offset => INTERVAL '1 hour',
            schedule_interval => INTERVAL '5 minutes');
    """)
    
    # Daily refresh: every 10 minutes, lag 2 hours behind
    op.execute("""
        SELECT add_continuous_aggregate_policy('market_data_daily',
            start_offset => INTERVAL '7 days',
            end_offset => INTERVAL '2 hours',
            schedule_interval => INTERVAL '10 minutes');
    """)


def downgrade() -> None:
    """Remove continuous aggregates and their policies."""
    
    # Remove refresh policies
    op.execute("""
        SELECT remove_continuous_aggregate_policy('market_data_daily', if_exists => true);
    """)
    op.execute("""
        SELECT remove_continuous_aggregate_policy('market_data_1h', if_exists => true);
    """)
    op.execute("""
        SELECT remove_continuous_aggregate_policy('market_data_15m', if_exists => true);
    """)
    op.execute("""
        SELECT remove_continuous_aggregate_policy('market_data_5m', if_exists => true);
    """)
    
    # Drop materialized views (CASCADE drops indexes automatically)
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_daily CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_1h CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_15m CASCADE;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS market_data_5m CASCADE;")

