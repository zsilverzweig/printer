"""add strategy engine events table

Revision ID: 014
Revises: 013
Create Date: 2025-10-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '014'
down_revision: Union[str, None] = '013a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add strategy_engine_events table for comprehensive engine logging."""
    op.create_table(
        'strategy_engine_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fund_id', sa.String(length=100), nullable=False),
        sa.Column('event_category', sa.String(length=50), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=True),
        sa.Column('event_data', sa.Text(), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='info'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['id'], ['events.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add indexes for common query patterns
    op.create_index('idx_strategy_engine_events_fund_id', 'strategy_engine_events', ['fund_id'])
    op.create_index('idx_strategy_engine_events_symbol', 'strategy_engine_events', ['symbol'])
    op.create_index('idx_strategy_engine_events_category', 'strategy_engine_events', ['event_category'])
    op.create_index('idx_strategy_engine_events_severity', 'strategy_engine_events', ['severity'])


def downgrade() -> None:
    """Remove strategy_engine_events table."""
    op.drop_index('idx_strategy_engine_events_severity', table_name='strategy_engine_events')
    op.drop_index('idx_strategy_engine_events_category', table_name='strategy_engine_events')
    op.drop_index('idx_strategy_engine_events_symbol', table_name='strategy_engine_events')
    op.drop_index('idx_strategy_engine_events_fund_id', table_name='strategy_engine_events')
    op.drop_table('strategy_engine_events')

