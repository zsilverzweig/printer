"""add_positions_table

Revision ID: 042
Revises: 041
Create Date: 2025-01-30 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create positions table
    op.create_table(
        'positions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('trade_id', sa.String(36), sa.ForeignKey('trades.id', ondelete='SET NULL'), nullable=True),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('avg_entry_price', sa.Float(), nullable=False),
        sa.Column('cost_basis', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Create indexes
    op.create_index('ix_positions_fund_id', 'positions', ['fund_id'])
    op.create_index('ix_positions_symbol', 'positions', ['symbol'])
    op.create_index('ix_positions_trade_id', 'positions', ['trade_id'])
    
    # Create unique constraint on (fund_id, symbol)
    op.create_unique_constraint('uq_positions_fund_symbol', 'positions', ['fund_id', 'symbol'])


def downgrade() -> None:
    op.drop_constraint('uq_positions_fund_symbol', 'positions', type_='unique')
    op.drop_index('ix_positions_trade_id', 'positions')
    op.drop_index('ix_positions_symbol', 'positions')
    op.drop_index('ix_positions_fund_id', 'positions')
    op.drop_table('positions')


