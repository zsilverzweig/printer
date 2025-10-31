"""add_estimated_price_to_orders

Revision ID: 013
Revises: 012
Create Date: 2025-10-31

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add estimated_price column to orders table
    op.add_column('orders', sa.Column('estimated_price', sa.Float(), nullable=True))


def downgrade() -> None:
    # Remove estimated_price column from orders table
    op.drop_column('orders', 'estimated_price')

