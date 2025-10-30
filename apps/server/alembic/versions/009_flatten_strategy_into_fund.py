"""flatten strategy into fund

Revision ID: 009
Revises: 008
Create Date: 2025-10-30 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '009'
down_revision: Union[str, None] = '008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Flatten strategy configuration into fund table.
    Drop strategies, orders, and transactions tables and recreate with new schema.
    """
    # Drop dependent tables first (foreign key constraints)
    op.drop_table('transactions')
    op.drop_table('orders')
    op.drop_table('strategies')
    
    # Add strategy configuration columns to funds
    op.add_column('funds', sa.Column('strategy_id', sa.String(50), nullable=True))
    op.add_column('funds', sa.Column('strategy_config', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'))
    op.add_column('funds', sa.Column('screening_criteria_id', sa.String(36), nullable=True))
    
    # Add risk parameters
    op.add_column('funds', sa.Column('max_loss_percent', sa.Float(), nullable=True))
    op.add_column('funds', sa.Column('max_loss_dollars', sa.Float(), nullable=True))
    op.add_column('funds', sa.Column('max_giveback_percent', sa.Float(), nullable=True))
    op.add_column('funds', sa.Column('max_order_age_seconds', sa.Integer(), nullable=True, server_default='60'))
    
    # Add position sizing
    op.add_column('funds', sa.Column('size_per_trade', sa.Float(), nullable=False, server_default='1000.0'))
    op.add_column('funds', sa.Column('min_bet_percent', sa.Float(), nullable=True))
    op.add_column('funds', sa.Column('max_bet_percent', sa.Float(), nullable=True))
    op.add_column('funds', sa.Column('max_total_exposure', sa.Float(), nullable=True))
    
    # Add trading time windows
    op.add_column('funds', sa.Column('trading_start_time', sa.String(10), nullable=True))
    op.add_column('funds', sa.Column('trading_end_time', sa.String(10), nullable=True))
    op.add_column('funds', sa.Column('timezone', sa.String(50), nullable=True))
    
    # Add foreign key for screening_criteria
    op.create_foreign_key('fk_funds_screening_criteria', 'funds', 'screening_criteria', ['screening_criteria_id'], ['id'])
    
    # Recreate orders table without strategy_id
    op.create_table(
        'orders',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('alpaca_order_id', sa.String(100), nullable=True),
        sa.Column('fund_id', sa.String(36), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('side', sa.String(10), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('order_type', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.Column('filled_at', sa.DateTime(), nullable=True),
        sa.Column('filled_qty', sa.Float(), nullable=True),
        sa.Column('filled_avg_price', sa.Float(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'])
    )
    op.create_index('ix_orders_fund_id', 'orders', ['fund_id'])
    op.create_index('ix_orders_status', 'orders', ['status'])
    op.create_index('ix_orders_symbol', 'orders', ['symbol'])
    
    # Recreate transactions table without strategy_id
    op.create_table(
        'transactions',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('order_id', sa.String(36), nullable=False),
        sa.Column('alpaca_order_id', sa.String(100), nullable=True),
        sa.Column('fund_id', sa.String(36), nullable=False),
        sa.Column('symbol', sa.String(10), nullable=False),
        sa.Column('side', sa.String(10), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('total_value', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('high_water_mark', sa.Float(), nullable=True),
        sa.Column('strategy_state', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id']),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'])
    )
    op.create_index('ix_transactions_fund_id', 'transactions', ['fund_id'])
    op.create_index('ix_transactions_symbol', 'transactions', ['symbol'])
    op.create_index('ix_transactions_timestamp', 'transactions', ['timestamp'])


def downgrade() -> None:
    """
    Reverse the flattening - recreate separate strategies table.
    Note: This will lose data as we can't reliably separate the configs back out.
    """
    # Drop new tables
    op.drop_index('ix_transactions_timestamp', 'transactions')
    op.drop_index('ix_transactions_symbol', 'transactions')
    op.drop_index('ix_transactions_fund_id', 'transactions')
    op.drop_table('transactions')
    
    op.drop_index('ix_orders_symbol', 'orders')
    op.drop_index('ix_orders_status', 'orders')
    op.drop_index('ix_orders_fund_id', 'orders')
    op.drop_table('orders')
    
    # Remove columns from funds
    op.drop_constraint('fk_funds_screening_criteria', 'funds', type_='foreignkey')
    op.drop_column('funds', 'timezone')
    op.drop_column('funds', 'trading_end_time')
    op.drop_column('funds', 'trading_start_time')
    op.drop_column('funds', 'max_total_exposure')
    op.drop_column('funds', 'max_bet_percent')
    op.drop_column('funds', 'min_bet_percent')
    op.drop_column('funds', 'size_per_trade')
    op.drop_column('funds', 'max_order_age_seconds')
    op.drop_column('funds', 'max_giveback_percent')
    op.drop_column('funds', 'max_loss_dollars')
    op.drop_column('funds', 'max_loss_percent')
    op.drop_column('funds', 'screening_criteria_id')
    op.drop_column('funds', 'strategy_config')
    op.drop_column('funds', 'strategy_id')
    
    # Recreate old tables (structure only, data will be lost)
    op.create_table(
        'strategies',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('fund_id', sa.String(36), nullable=False),
        sa.Column('execution_strategy_id', sa.String(50), nullable=False),
        sa.Column('screening_criteria_id', sa.String(36), nullable=True),
        sa.Column('max_loss_percent', sa.Float(), nullable=True),
        sa.Column('max_loss_dollars', sa.Float(), nullable=True),
        sa.Column('max_giveback_percent', sa.Float(), nullable=True),
        sa.Column('max_order_age_seconds', sa.Integer(), nullable=True, server_default='60'),
        sa.Column('size_per_trade', sa.Float(), nullable=False, server_default='1000.0'),
        sa.Column('min_bet_percent', sa.Float(), nullable=True),
        sa.Column('max_bet_percent', sa.Float(), nullable=True),
        sa.Column('max_total_exposure', sa.Float(), nullable=True),
        sa.Column('trading_start_time', sa.String(10), nullable=True),
        sa.Column('trading_end_time', sa.String(10), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=True),
        sa.Column('execution_config', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id']),
        sa.ForeignKeyConstraint(['screening_criteria_id'], ['screening_criteria.id'])
    )

