"""Add strategy models for fund management

Revision ID: 003
Revises: 002
Create Date: 2025-10-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create strategy-related tables."""
    
    # Create funds table
    op.create_table(
        'funds',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('mode', sa.String(10), nullable=False),
        sa.Column('balance', sa.Float, nullable=False, server_default='0.0'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create screening_criteria table
    op.create_table(
        'screening_criteria',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('criteria', postgresql.JSON, nullable=False),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    # Create strategies table
    op.create_table(
        'strategies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), nullable=False),
        sa.Column('execution_strategy_id', sa.String(50), nullable=False),
        sa.Column('screening_criteria_id', sa.String(36), nullable=True),
        sa.Column('max_loss_percent', sa.Float, nullable=False, server_default='2.0'),
        sa.Column('max_loss_dollars', sa.Float, nullable=False, server_default='1000.0'),
        sa.Column('max_giveback_percent', sa.Float, nullable=False, server_default='50.0'),
        sa.Column('size_per_trade', sa.Float, nullable=False, server_default='1000.0'),
        sa.Column('min_bet_percent', sa.Float, nullable=False, server_default='1.0'),
        sa.Column('max_bet_percent', sa.Float, nullable=False, server_default='5.0'),
        sa.Column('max_total_exposure', sa.Float, nullable=False, server_default='10000.0'),
        sa.Column('risk_reward_ratio', sa.Float, nullable=False, server_default='2.0'),
        sa.Column('trading_start_time', sa.String(10), nullable=True),
        sa.Column('trading_end_time', sa.String(10), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=True),
        sa.Column('execution_config', postgresql.JSON, nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['screening_criteria_id'], ['screening_criteria.id'], ondelete='SET NULL'),
    )
    
    # Create position_contexts table
    op.create_table(
        'position_contexts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), nullable=False),
        sa.Column('strategy_id', sa.String(36), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('entry_price', sa.Float, nullable=False),
        sa.Column('quantity', sa.Float, nullable=False),
        sa.Column('entry_time', sa.DateTime, nullable=False),
        sa.Column('position_id', sa.String(100), nullable=True),
        sa.Column('exit_price', sa.Float, nullable=True),
        sa.Column('exit_time', sa.DateTime, nullable=True),
        sa.Column('exit_reason', sa.String(50), nullable=True),
        sa.Column('realized_pnl', sa.Float, nullable=True),
        sa.Column('high_water_mark', sa.Float, nullable=False),
        sa.Column('strategy_state', postgresql.JSON, nullable=False, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for common queries
    op.create_index('idx_strategies_fund_id', 'strategies', ['fund_id'])
    op.create_index('idx_strategies_execution_strategy_id', 'strategies', ['execution_strategy_id'])
    op.create_index('idx_position_contexts_fund_id', 'position_contexts', ['fund_id'])
    op.create_index('idx_position_contexts_strategy_id', 'position_contexts', ['strategy_id'])
    op.create_index('idx_position_contexts_symbol', 'position_contexts', ['symbol'])
    op.create_index('idx_position_contexts_status', 'position_contexts', ['status'])


def downgrade() -> None:
    """Drop strategy-related tables."""
    op.drop_index('idx_position_contexts_status', 'position_contexts')
    op.drop_index('idx_position_contexts_symbol', 'position_contexts')
    op.drop_index('idx_position_contexts_strategy_id', 'position_contexts')
    op.drop_index('idx_position_contexts_fund_id', 'position_contexts')
    op.drop_index('idx_strategies_execution_strategy_id', 'strategies')
    op.drop_index('idx_strategies_fund_id', 'strategies')
    
    op.drop_table('position_contexts')
    op.drop_table('strategies')
    op.drop_table('screening_criteria')
    op.drop_table('funds')


