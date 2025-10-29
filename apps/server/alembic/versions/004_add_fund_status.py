"""add fund status field

Revision ID: 004
Revises: 003
Create Date: 2025-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add status column to funds table."""
    op.add_column('funds', sa.Column('status', sa.String(20), nullable=False, server_default='paused'))


def downgrade() -> None:
    """Remove status column from funds table."""
    op.drop_column('funds', 'status')

