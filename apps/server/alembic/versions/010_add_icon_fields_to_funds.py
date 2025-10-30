"""add icon fields to funds

Revision ID: 010
Revises: 009
Create Date: 2025-10-30

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010'
down_revision = '009'
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

