"""add transaction indexes for position queries

Revision ID: 20251104_172549
Revises: 20251104_073000
Create Date: 2025-11-04 17:25:49

Adds composite indexes on transactions table to improve performance of position
calculation queries. Position queries filter by (fund_id, symbol) and often
order by timestamp, so these indexes will significantly speed up position tracking.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20251104_172549'
down_revision: Union[str, None] = '20251104_073000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add composite indexes to transactions table for position queries.
    
    These indexes optimize:
    - Position calculation: queries filter by (fund_id, symbol) and order by timestamp
    - Position tracking: frequent lookups by fund and symbol
    """
    # Composite index on (fund_id, symbol) for position queries
    # This is the most common query pattern: get all transactions for a fund+symbol
    op.create_index(
        'ix_transactions_fund_id_symbol',
        'transactions',
        ['fund_id', 'symbol'],
        unique=False
    )
    
    # Composite index on (fund_id, symbol, timestamp) for ordered position queries
    # Used when calculating positions with chronological ordering
    op.create_index(
        'ix_transactions_fund_id_symbol_timestamp',
        'transactions',
        ['fund_id', 'symbol', 'timestamp'],
        unique=False
    )


def downgrade() -> None:
    """
    Remove composite indexes from transactions table.
    """
    op.drop_index('ix_transactions_fund_id_symbol_timestamp', table_name='transactions')
    op.drop_index('ix_transactions_fund_id_symbol', table_name='transactions')

