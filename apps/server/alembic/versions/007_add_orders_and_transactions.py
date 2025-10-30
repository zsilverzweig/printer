"""add orders and transactions tables

Revision ID: 007
Revises: 006
Create Date: 2025-10-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Create orders and transactions tables.
    Drop position_contexts table (replaced by orders + transactions).
    """
    # Create orders table
    op.create_table(
        'orders',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('alpaca_order_id', sa.String(length=100), nullable=False),
        sa.Column('fund_id', sa.String(length=36), nullable=False),
        sa.Column('strategy_id', sa.String(length=36), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('side', sa.String(length=10), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('order_type', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('submitted_at', sa.DateTime(), nullable=False),
        sa.Column('filled_at', sa.DateTime(), nullable=True),
        sa.Column('filled_qty', sa.Float(), nullable=True),
        sa.Column('filled_avg_price', sa.Float(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ),
        sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('alpaca_order_id')
    )
    op.create_index(op.f('ix_orders_alpaca_order_id'), 'orders', ['alpaca_order_id'], unique=True)
    op.create_index(op.f('ix_orders_fund_id'), 'orders', ['fund_id'], unique=False)
    op.create_index(op.f('ix_orders_status'), 'orders', ['status'], unique=False)
    op.create_index(op.f('ix_orders_symbol'), 'orders', ['symbol'], unique=False)
    
    # Create transactions table
    op.create_table(
        'transactions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('order_id', sa.String(length=36), nullable=False),
        sa.Column('alpaca_order_id', sa.String(length=100), nullable=False),
        sa.Column('fund_id', sa.String(length=36), nullable=False),
        sa.Column('strategy_id', sa.String(length=36), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('side', sa.String(length=10), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('total_value', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('high_water_mark', sa.Float(), nullable=True),
        sa.Column('strategy_state', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ),
        sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_transactions_alpaca_order_id'), 'transactions', ['alpaca_order_id'], unique=False)
    op.create_index(op.f('ix_transactions_fund_id'), 'transactions', ['fund_id'], unique=False)
    op.create_index(op.f('ix_transactions_order_id'), 'transactions', ['order_id'], unique=False)
    op.create_index(op.f('ix_transactions_symbol'), 'transactions', ['symbol'], unique=False)
    op.create_index(op.f('ix_transactions_timestamp'), 'transactions', ['timestamp'], unique=False)
    
    # Drop old position_contexts table
    op.drop_table('position_contexts')


def downgrade() -> None:
    """
    Restore position_contexts table.
    Drop orders and transactions tables.
    """
    # Recreate position_contexts table
    op.create_table(
        'position_contexts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('fund_id', sa.String(length=36), nullable=False),
        sa.Column('strategy_id', sa.String(length=36), nullable=False),
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('entry_price', sa.Float(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=False),
        sa.Column('entry_time', sa.DateTime(), nullable=False),
        sa.Column('position_id', sa.String(length=100), nullable=True),
        sa.Column('exit_price', sa.Float(), nullable=True),
        sa.Column('exit_time', sa.DateTime(), nullable=True),
        sa.Column('exit_reason', sa.String(length=50), nullable=True),
        sa.Column('realized_pnl', sa.Float(), nullable=True),
        sa.Column('high_water_mark', sa.Float(), nullable=False),
        sa.Column('strategy_state', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['fund_id'], ['funds.id'], ),
        sa.ForeignKeyConstraint(['strategy_id'], ['strategies.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Drop new tables
    op.drop_index(op.f('ix_transactions_timestamp'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_symbol'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_order_id'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_fund_id'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_alpaca_order_id'), table_name='transactions')
    op.drop_table('transactions')
    
    op.drop_index(op.f('ix_orders_symbol'), table_name='orders')
    op.drop_index(op.f('ix_orders_status'), table_name='orders')
    op.drop_index(op.f('ix_orders_fund_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_alpaca_order_id'), table_name='orders')
    op.drop_table('orders')

