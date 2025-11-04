"""add backtest support

Revision ID: 20251104_055008
Revises: 
Create Date: 2025-11-04 05:50:08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20251104_055008'
down_revision: Union[str, None] = '028'  # Previous migration: add_trade_model
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add backtest support:
    1. Add backtest_id column to orders, transactions, and trades tables
    2. Create backtests table
    """
    
    # Add backtest_id column to orders table
    op.add_column('orders', sa.Column('backtest_id', sa.String(36), nullable=True))
    op.create_index('ix_orders_backtest_id', 'orders', ['backtest_id'])
    
    # Add backtest_id column to transactions table
    op.add_column('transactions', sa.Column('backtest_id', sa.String(36), nullable=True))
    op.create_index('ix_transactions_backtest_id', 'transactions', ['backtest_id'])
    
    # Add backtest_id column to trades table
    op.add_column('trades', sa.Column('backtest_id', sa.String(36), nullable=True))
    op.create_index('ix_trades_backtest_id', 'trades', ['backtest_id'])
    
    # Create backtests table
    op.create_table(
        'backtests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id'), nullable=False),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),  # Use timezone-aware datetime
        sa.Column('status', sa.String(20), nullable=False, server_default='running'),
        
        # Configuration snapshot
        sa.Column('strategy_id', sa.String(50), nullable=True),
        sa.Column('strategy_config', postgresql.JSON(), nullable=False, server_default='{}'),
        sa.Column('screening_criteria_id', sa.String(36), nullable=True),
        
        # Results
        sa.Column('starting_balance', sa.Float(), nullable=False),
        sa.Column('ending_balance', sa.Float(), nullable=True),
        sa.Column('total_trades', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('winning_trades', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('losing_trades', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_pnl', sa.Float(), nullable=True),
        sa.Column('total_pnl_percent', sa.Float(), nullable=True),
        
        # Execution stats
        sa.Column('total_orders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('filled_orders', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('cancelled_orders', sa.Integer(), nullable=False, server_default='0'),
        
        # Timing
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Error tracking
        sa.Column('error_message', sa.Text(), nullable=True),
        
        # Additional metadata (renamed from 'metadata' to avoid SQLAlchemy reserved name)
        sa.Column('backtest_metadata', postgresql.JSON(), nullable=False, server_default='{}'),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
    )
    
    # Create indexes on backtests table
    op.create_index('ix_backtests_fund_id', 'backtests', ['fund_id'])
    op.create_index('ix_backtests_date', 'backtests', ['date'])
    op.create_index('ix_backtests_status', 'backtests', ['status'])


def downgrade() -> None:
    """
    Remove backtest support:
    1. Drop backtests table
    2. Remove backtest_id columns from orders, transactions, and trades
    """
    
    # Drop backtests table (indexes will be dropped automatically)
    op.drop_table('backtests')
    
    # Remove backtest_id column from trades table
    op.drop_index('ix_trades_backtest_id', 'trades')
    op.drop_column('trades', 'backtest_id')
    
    # Remove backtest_id column from transactions table
    op.drop_index('ix_transactions_backtest_id', 'transactions')
    op.drop_column('transactions', 'backtest_id')
    
    # Remove backtest_id column from orders table
    op.drop_index('ix_orders_backtest_id', 'orders')
    op.drop_column('orders', 'backtest_id')

