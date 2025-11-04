"""add backtest lookup table

Revision ID: 20251104_073000
Revises: 20251104_055008
Create Date: 2025-11-04 07:30:00

Creates a pre-computed 1min lookup table for instant "latest price as-of" queries
during backtesting. Stores latest bar data for every trading minute, enabling
O(1) lookups instead of backward scans through history.

Dense storage: Every minute 09:30-16:00 for all active symbols.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251104_073000'
down_revision: Union[str, None] = '20251104_055008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Create backtest lookup table for instant price queries.
    
    This table stores pre-computed "latest price as-of" data for every symbol
    at regular intervals, making backtest queries instant instead of requiring
    backward scans through history.
    """
    
    # Check if table already exists
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)
    
    if 'market_data_backtest_lookup' in inspector.get_table_names():
        print("Table market_data_backtest_lookup already exists, skipping creation")
        return
    
    op.create_table(
        'market_data_backtest_lookup',
        sa.Column('symbol', sa.String(20), nullable=False),
        sa.Column('timescale', sa.String(10), nullable=False),
        sa.Column('lookup_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('latest_bar_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('close', sa.Numeric(12, 4), nullable=True),
        sa.Column('open', sa.Numeric(12, 4), nullable=True),
        sa.Column('high', sa.Numeric(12, 4), nullable=True),
        sa.Column('low', sa.Numeric(12, 4), nullable=True),
        sa.Column('volume', sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint('symbol', 'timescale', 'lookup_time')
    )
    
    # Create indexes for fast queries
    op.create_index(
        'idx_backtest_lookup_time_timescale',
        'market_data_backtest_lookup',
        ['lookup_time', 'timescale']
    )
    op.create_index(
        'idx_backtest_lookup_timescale_symbol',
        'market_data_backtest_lookup',
        ['timescale', 'symbol']
    )


def downgrade() -> None:
    """Remove backtest lookup table."""
    op.drop_table('market_data_backtest_lookup')

