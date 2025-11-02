"""Add screener_metrics table for pre-calculated indicators

Revision ID: 024
Revises: 023
Create Date: 2025-11-02

This migration creates a table to store pre-calculated technical indicators
for fast screener performance. All indicators calculated from daily bars.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create screener_metrics table for pre-calculated technical indicators.
    
    This table stores daily calculations of all major technical indicators
    to enable sub-second screening performance across 10K+ symbols.
    """
    
    # Create screener_metrics table
    op.execute("""
        CREATE TABLE IF NOT EXISTS screener_metrics (
            symbol VARCHAR(20) NOT NULL,
            date DATE NOT NULL,
            
            -- Relative Volume (calculated from daily volume bars)
            rv14 NUMERIC(10, 2),
            rv30 NUMERIC(10, 2),
            rv60 NUMERIC(10, 2),
            
            -- Price Levels (calculated from daily OHLC bars)
            high_90d NUMERIC(12, 4),
            low_90d NUMERIC(12, 4),
            
            -- Moving Averages (calculated from daily close prices)
            sma_20 NUMERIC(12, 4),
            sma_50 NUMERIC(12, 4),
            sma_200 NUMERIC(12, 4),
            
            -- Momentum Indicators (calculated from daily prices)
            rsi_14 NUMERIC(6, 2),
            macd_line NUMERIC(12, 4),
            macd_signal NUMERIC(12, 4),
            macd_histogram NUMERIC(12, 4),
            
            -- Volatility Indicators (calculated from daily OHLC)
            bb_upper NUMERIC(12, 4),
            bb_middle NUMERIC(12, 4),
            bb_lower NUMERIC(12, 4),
            atr_14 NUMERIC(12, 4),
            
            -- Volume Trends (calculated from daily volume)
            volume_ma_20 NUMERIC(20, 2),
            volume_trend VARCHAR(10),  -- 'rising', 'falling', 'neutral'
            
            -- Metadata
            calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            PRIMARY KEY (symbol, date)
        );
    """)
    
    # Create performance indexes
    
    # Index for date-based queries (most common: get all metrics for a date)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_screener_metrics_date 
        ON screener_metrics (date DESC);
    """)
    
    # Index for symbol-date lookups (retrieve metrics for specific symbol over time)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_screener_metrics_symbol_date 
        ON screener_metrics (symbol, date DESC);
    """)
    
    # Partial index for RSI-based filtering (screener: find overbought/oversold)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_screener_metrics_rsi 
        ON screener_metrics (date, rsi_14) 
        WHERE rsi_14 IS NOT NULL;
    """)
    
    # Partial index for RV-based filtering (screener: find high relative volume)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_screener_metrics_rv 
        ON screener_metrics (date, rv14) 
        WHERE rv14 IS NOT NULL;
    """)


def downgrade() -> None:
    """Remove screener_metrics table and all indexes."""
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_screener_metrics_rv;")
    op.execute("DROP INDEX IF EXISTS idx_screener_metrics_rsi;")
    op.execute("DROP INDEX IF EXISTS idx_screener_metrics_symbol_date;")
    op.execute("DROP INDEX IF EXISTS idx_screener_metrics_date;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS screener_metrics CASCADE;")

