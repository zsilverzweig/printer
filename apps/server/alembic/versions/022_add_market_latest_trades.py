"""Add market_latest_trades table for real-time pricing

Revision ID: 022
Revises: 021
Create Date: 2025-11-02

This migration creates a table to store the latest trade data from Polygon
snapshots, providing real-time pricing between official 1-minute bars.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create market_latest_trades table for real-time last trade data.
    
    This table stores one row per symbol with the most recent trade information
    from Polygon snapshots, updated every 5 seconds.
    """
    
    # Create market_latest_trades table
    op.execute("""
        CREATE TABLE IF NOT EXISTS market_latest_trades (
            symbol VARCHAR(20) PRIMARY KEY,
            price NUMERIC(12, 4) NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,
            size INTEGER,
            exchange VARCHAR(10),
            conditions TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    
    # Create index for timestamp queries (finding stale data)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_latest_trades_timestamp 
        ON market_latest_trades (timestamp DESC);
    """)
    
    # Create index for updated_at queries (monitoring ingestion lag)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_latest_trades_updated_at 
        ON market_latest_trades (updated_at DESC);
    """)


def downgrade() -> None:
    """Remove market_latest_trades table."""
    
    op.execute("DROP INDEX IF EXISTS idx_market_latest_trades_updated_at;")
    op.execute("DROP INDEX IF EXISTS idx_market_latest_trades_timestamp;")
    op.execute("DROP TABLE IF EXISTS market_latest_trades CASCADE;")

