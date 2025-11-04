"""Add Trade model with trade_id tracking

Revision ID: 028
Revises: 027
Create Date: 2025-11-04 00:00:00.000000

Adds trade_id to orders and transactions, creates trades table for
comprehensive trade performance tracking and reconciliation.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add trade_id columns and create trades table."""
    
    # Add trade_id to orders table
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('trade_id', sa.String(36), nullable=True))
        batch_op.create_index('ix_orders_trade_id', ['trade_id'])
    
    # Add trade_id to transactions table
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('trade_id', sa.String(36), nullable=True))
        batch_op.create_index('ix_transactions_trade_id', ['trade_id'])
    
    # Create trades table
    op.create_table(
        'trades',
        # Identification
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id'), nullable=False, index=True),
        sa.Column('symbol', sa.String(10), nullable=False, index=True),
        
        # Entry information
        sa.Column('entry_order_id', sa.String(36), sa.ForeignKey('orders.id'), nullable=True),
        sa.Column('entry_time', sa.DateTime(), nullable=False, index=True),
        sa.Column('entry_price', sa.Float(), nullable=False),
        sa.Column('entry_quantity', sa.Float(), nullable=False),
        
        # Exit information (nullable for open trades)
        sa.Column('exit_order_id', sa.String(36), sa.ForeignKey('orders.id'), nullable=True),
        sa.Column('exit_time', sa.DateTime(), nullable=True, index=True),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('exit_quantity', sa.Float(), nullable=True),
        
        # Strategy context
        sa.Column('strategy_id', sa.String(50), nullable=True, index=True),
        sa.Column('screening_criteria_id', sa.String(36), sa.ForeignKey('screening_criteria.id'), nullable=True, index=True),
        sa.Column('ai_confidence', sa.Float(), nullable=True),
        sa.Column('ai_reasoning', sa.Text(), nullable=True),
        
        # Performance metrics
        sa.Column('realized_pnl', sa.Float(), nullable=True),  # Null until closed
        sa.Column('realized_pnl_percent', sa.Float(), nullable=True),
        sa.Column('hold_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('max_adverse_excursion', sa.Float(), nullable=True),  # MAE
        sa.Column('max_favorable_excursion', sa.Float(), nullable=True),  # MFE
        sa.Column('commission_fees', sa.Float(), nullable=False, server_default='0.0'),
        
        # Status
        sa.Column('status', sa.String(20), nullable=False, server_default='open', index=True),
        
        # Additional context
        sa.Column('trade_metadata', sa.JSON(), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'))
    )
    
    # Create composite indexes for efficient querying
    op.create_index('idx_trades_fund_symbol', 'trades', ['fund_id', 'symbol'])
    op.create_index('idx_trades_fund_status', 'trades', ['fund_id', 'status'])
    op.create_index('idx_trades_entry_time', 'trades', ['entry_time'])
    op.create_index('idx_trades_screening_criteria', 'trades', ['screening_criteria_id'])
    
    # Add foreign key constraint from transactions to trades
    # Note: This can only be added after trades table exists
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.create_foreign_key('fk_transactions_trade_id', 'trades', ['trade_id'], ['id'])


def downgrade() -> None:
    """Remove trade_id columns and trades table."""
    
    # Remove foreign key from transactions to trades
    with op.batch_alter_table('transactions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_transactions_trade_id', type_='foreignkey')
        batch_op.drop_index('ix_transactions_trade_id')
        batch_op.drop_column('trade_id')
    
    # Remove trade_id from orders
    with op.batch_alter_table('orders', schema=None) as batch_op:
        batch_op.drop_index('ix_orders_trade_id')
        batch_op.drop_column('trade_id')
    
    # Drop trades table indexes
    op.drop_index('idx_trades_screening_criteria', table_name='trades')
    op.drop_index('idx_trades_entry_time', table_name='trades')
    op.drop_index('idx_trades_fund_status', table_name='trades')
    op.drop_index('idx_trades_fund_symbol', table_name='trades')
    
    # Drop trades table
    op.drop_table('trades')

