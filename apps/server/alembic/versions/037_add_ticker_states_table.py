"""add_ticker_states_table

Revision ID: 037
Revises: 036
Create Date: 2025-01-27 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ticker_states table
    op.create_table(
        'ticker_states',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ticker', sa.String(10), nullable=False),
        sa.Column('current_state', sa.String(20), nullable=False),
        sa.Column('state_transitions', JSONB().with_variant(sa.JSON(), 'sqlite'), nullable=False, server_default='[]'),
        sa.Column('last_screened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('entry_level_id', sa.String(36), sa.ForeignKey('strategy_monitoring_state.id', ondelete='SET NULL'), nullable=True),
        sa.Column('trade_id', sa.String(36), sa.ForeignKey('trades.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    
    # Create indexes
    op.create_index('ix_ticker_states_fund_id', 'ticker_states', ['fund_id'])
    op.create_index('ix_ticker_states_ticker', 'ticker_states', ['ticker'])
    op.create_index('ix_ticker_states_current_state', 'ticker_states', ['current_state'])
    op.create_index('ix_ticker_states_last_screened_at', 'ticker_states', ['last_screened_at'])
    op.create_index('ix_ticker_states_fund_ticker', 'ticker_states', ['fund_id', 'ticker'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_ticker_states_fund_ticker', 'ticker_states')
    op.drop_index('ix_ticker_states_last_screened_at', 'ticker_states')
    op.drop_index('ix_ticker_states_current_state', 'ticker_states')
    op.drop_index('ix_ticker_states_ticker', 'ticker_states')
    op.drop_index('ix_ticker_states_fund_id', 'ticker_states')
    op.drop_table('ticker_states')

