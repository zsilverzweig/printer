"""add ai costs tracking

Revision ID: 016
Revises: 015
Create Date: 2025-11-02 14:00:00.000000

Adds AI cost tracking to funds and creates ai_costs table for detailed usage logs.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add AI cost tracking fields to funds table and create ai_costs table."""
    
    # Add AI cost tracking fields to funds table
    with op.batch_alter_table('funds', schema=None) as batch_op:
        batch_op.add_column(sa.Column('total_ai_cost', sa.Float(), nullable=False, server_default='0.0'))
        batch_op.add_column(sa.Column('ai_cost_mtd', sa.Float(), nullable=False, server_default='0.0'))
        batch_op.add_column(sa.Column('ai_cost_ytd', sa.Float(), nullable=False, server_default='0.0'))
        batch_op.add_column(sa.Column('last_ai_cost_reset', sa.DateTime(), nullable=True))
    
    # Create ai_costs table for detailed usage logs
    op.create_table(
        'ai_costs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id'), nullable=False, index=True),
        sa.Column('symbol', sa.String(10), nullable=True, index=True),
        sa.Column('operation', sa.String(50), nullable=False),  # e.g., "entry_analysis", "stop_update", "trade_thesis"
        sa.Column('model', sa.String(50), nullable=False),  # e.g., "gpt-4o-mini"
        sa.Column('prompt_tokens', sa.Integer(), nullable=False),
        sa.Column('completion_tokens', sa.Integer(), nullable=False),
        sa.Column('total_tokens', sa.Integer(), nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False, index=True),
        sa.Column('metadata', sa.JSON(), nullable=True),  # Additional context (strategy_id, etc.)
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'))
    )
    
    # Create index for efficient querying by fund and date
    op.create_index('idx_ai_costs_fund_timestamp', 'ai_costs', ['fund_id', 'timestamp'])


def downgrade() -> None:
    """Remove AI cost tracking."""
    
    # Drop ai_costs table
    op.drop_index('idx_ai_costs_fund_timestamp', table_name='ai_costs')
    op.drop_table('ai_costs')
    
    # Remove AI cost fields from funds table
    with op.batch_alter_table('funds', schema=None) as batch_op:
        batch_op.drop_column('last_ai_cost_reset')
        batch_op.drop_column('ai_cost_ytd')
        batch_op.drop_column('ai_cost_mtd')
        batch_op.drop_column('total_ai_cost')

