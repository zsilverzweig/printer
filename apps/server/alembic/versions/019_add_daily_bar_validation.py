"""Add daily bar validation tracking

Revision ID: 019
Revises: 018
Create Date: 2025-11-02

This migration creates a validation table to track data completeness
for each symbol on each trading date.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '019'
down_revision = '018'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create symbol_date_validation table for tracking data completeness.
    
    This table tracks: "For symbol X on date Y, do we have complete minute bar data?"
    """
    
    # Create symbol_date_validation table
    op.execute("""
        CREATE TABLE IF NOT EXISTS symbol_date_validation (
            symbol VARCHAR(20) NOT NULL,
            date DATE NOT NULL,
            is_complete BOOLEAN NOT NULL DEFAULT FALSE,
            bar_count INTEGER NOT NULL DEFAULT 0,
            expected_bars INTEGER,
            first_bar_time TIMESTAMPTZ,
            last_bar_time TIMESTAMPTZ,
            validated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            PRIMARY KEY (symbol, date)
        );
    """)
    
    # Create indexes for common query patterns
    
    # Index for finding incomplete data
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_symbol_date_validation_incomplete 
        ON symbol_date_validation (date, is_complete) 
        WHERE is_complete = FALSE;
    """)
    
    # Index for recent validation lookups
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_symbol_date_validation_recent 
        ON symbol_date_validation (date DESC, symbol);
    """)
    
    # Index for symbol-specific queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_symbol_date_validation_symbol 
        ON symbol_date_validation (symbol, date DESC);
    """)


def downgrade() -> None:
    """Remove symbol_date_validation table."""
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_symbol_date_validation_symbol;")
    op.execute("DROP INDEX IF EXISTS idx_symbol_date_validation_recent;")
    op.execute("DROP INDEX IF EXISTS idx_symbol_date_validation_incomplete;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS symbol_date_validation;")

