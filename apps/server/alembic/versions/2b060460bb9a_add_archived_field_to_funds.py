"""add_archived_field_to_funds

Revision ID: 2b060460bb9a
Revises: c06a6e3520a1
Create Date: 2025-10-30 12:32:02.387001

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2b060460bb9a'
down_revision = 'c06a6e3520a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add archived column to funds table with default value False
    op.add_column('funds', sa.Column('archived', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    # Remove archived column from funds table
    op.drop_column('funds', 'archived')


