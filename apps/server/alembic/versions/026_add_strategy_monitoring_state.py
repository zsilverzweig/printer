"""Add strategy_monitoring_state table for persistent level tracking

Revision ID: 026
Revises: 025
Create Date: 2025-11-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '026'
down_revision: Union[str, None] = '025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Create strategy_monitoring_state table for persistent storage of:
    - Entry levels being watched (for candidates)
    - Exit levels for open positions (stops, targets)
    - Strategy-specific state that must survive restarts
    """
    op.create_table(
        'strategy_monitoring_state',
        sa.Column('id', sa.String(), nullable=False, primary_key=True),
        sa.Column('fund_id', sa.String(), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('state_type', sa.String(20), nullable=False),  # 'entry_level' or 'exit_level'
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        
        # Entry level fields (for candidates being monitored)
        sa.Column('entry_price', sa.Float(), nullable=True),
        sa.Column('stop_loss', sa.Float(), nullable=True),
        sa.Column('take_profit', sa.Float(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('order_type', sa.String(10), nullable=True),  # 'market', 'limit'
        sa.Column('limit_price', sa.Float(), nullable=True),
        
        # Exit level fields (for open positions)
        sa.Column('position_entry_price', sa.Float(), nullable=True),
        sa.Column('position_entry_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_stop_loss', sa.Float(), nullable=True),
        sa.Column('current_take_profit', sa.Float(), nullable=True),
        sa.Column('trailing_stop_percent', sa.Float(), nullable=True),
        sa.Column('high_water_mark', sa.Float(), nullable=True),
        
        # Strategy-specific state (JSON for flexibility)
        sa.Column('strategy_metadata', postgresql.JSONB(), nullable=True, server_default='{}'),
        
        # Monitoring state
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_price_check', sa.Float(), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        
        # Audit
        sa.Column('triggered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trigger_price', sa.Float(), nullable=True),
        sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deactivation_reason', sa.String(100), nullable=True),
        
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for fast lookups
    op.create_index(
        'ix_strategy_monitoring_state_fund_symbol',
        'strategy_monitoring_state',
        ['fund_id', 'symbol', 'state_type', 'is_active']
    )
    
    op.create_index(
        'ix_strategy_monitoring_state_active',
        'strategy_monitoring_state',
        ['is_active', 'state_type']
    )


def downgrade() -> None:
    """Drop strategy_monitoring_state table."""
    op.drop_index('ix_strategy_monitoring_state_active')
    op.drop_index('ix_strategy_monitoring_state_fund_symbol')
    op.drop_table('strategy_monitoring_state')

