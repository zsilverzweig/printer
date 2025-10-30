"""add icon fields to funds

Revision ID: 010_add_icon_fields_to_funds
Revises: 009_flatten_strategy_into_fund
Create Date: 2025-10-30

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010_add_icon_fields_to_funds'
down_revision = '009_flatten_strategy_into_fund'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add icon and icon_color columns to funds table
    op.add_column('funds', sa.Column('icon', sa.String(50), nullable=True))
    op.add_column('funds', sa.Column('icon_color', sa.String(50), nullable=True))


def downgrade() -> None:
    # Remove icon and icon_color columns from funds table
    op.drop_column('funds', 'icon_color')
    op.drop_column('funds', 'icon')

