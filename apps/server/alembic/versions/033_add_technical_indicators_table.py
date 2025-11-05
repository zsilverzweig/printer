"""Add technical_indicators table for pre-calculated intraday indicators

Revision ID: 033
Revises: 032
Create Date: 2025-11-05 12:00:00

This migration creates a table to store pre-calculated technical indicators
for intraday timescales (1min, 5min, 15min) to accelerate backtesting performance.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '033'
down_revision: Union[str, None] = '032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Create technical_indicators table for pre-calculated intraday indicators.
    
    This table stores minute-level calculations of technical indicators
    to enable fast backtesting without on-the-fly calculations.
    """
    
    # Create technical_indicators table
    op.execute("""
        CREATE TABLE IF NOT EXISTS technical_indicators (
            symbol VARCHAR(20) NOT NULL,
            timescale VARCHAR(10) NOT NULL,
            time TIMESTAMPTZ NOT NULL,
            
            -- Moving Averages
            ema_12 NUMERIC(12, 4),
            ema_26 NUMERIC(12, 4),
            
            -- Volume Weighted Average Price
            vwap NUMERIC(12, 4),
            
            -- MACD (Moving Average Convergence Divergence)
            macd_line NUMERIC(12, 4),
            macd_signal NUMERIC(12, 4),
            macd_histogram NUMERIC(12, 4),
            
            -- Relative Strength Index
            rsi_14 NUMERIC(6, 2),
            
            -- Average True Range
            atr_14 NUMERIC(12, 4),
            
            -- Metadata
            calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            PRIMARY KEY (symbol, timescale, time)
        );
    """)
    
    # Convert to TimescaleDB hypertable for time-series optimization
    op.execute("""
        SELECT create_hypertable('technical_indicators', 'time', 
            chunk_time_interval => INTERVAL '1 day',
            if_not_exists => TRUE);
    """)
    
    # Create performance indexes
    
    # Index for time-based queries (most common: get indicators for a time range)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_technical_indicators_time_timescale 
        ON technical_indicators (time DESC, timescale);
    """)
    
    # Index for symbol-time lookups (retrieve indicators for specific symbol over time)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_technical_indicators_symbol_timescale_time 
        ON technical_indicators (symbol, timescale, time DESC);
    """)
    
    # Partial index for MACD-based filtering
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_technical_indicators_macd 
        ON technical_indicators (time, timescale, macd_line, macd_histogram) 
        WHERE macd_line IS NOT NULL;
    """)
    
    # Partial index for RSI-based filtering
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_technical_indicators_rsi 
        ON technical_indicators (time, timescale, rsi_14) 
        WHERE rsi_14 IS NOT NULL;
    """)


def downgrade() -> None:
    """Remove technical_indicators table and all indexes."""
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_technical_indicators_rsi;")
    op.execute("DROP INDEX IF EXISTS idx_technical_indicators_macd;")
    op.execute("DROP INDEX IF EXISTS idx_technical_indicators_symbol_timescale_time;")
    op.execute("DROP INDEX IF EXISTS idx_technical_indicators_time_timescale;")
    
    # Drop table (hypertable drop will cascade)
    op.execute("DROP TABLE IF EXISTS technical_indicators CASCADE;")
