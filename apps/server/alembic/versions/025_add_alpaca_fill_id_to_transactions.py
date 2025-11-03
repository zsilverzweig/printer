"""add alpaca_fill_id to transactions

Revision ID: 025
Revises: 024
Create Date: 2025-11-03

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '025'
down_revision = '024'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add alpaca_fill_id column to transactions table."""
    op.add_column('transactions', sa.Column('alpaca_fill_id', sa.String(length=100), nullable=True))
    op.create_index(op.f('ix_transactions_alpaca_fill_id'), 'transactions', ['alpaca_fill_id'], unique=False)


def downgrade() -> None:
    """Remove alpaca_fill_id column from transactions table."""
    op.drop_index(op.f('ix_transactions_alpaca_fill_id'), table_name='transactions')
    op.drop_column('transactions', 'alpaca_fill_id')

