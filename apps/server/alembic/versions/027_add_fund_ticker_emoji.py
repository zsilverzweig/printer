"""Add ticker and emoji to funds

Revision ID: 027
Revises: 026
Create Date: 2025-11-03 16:57:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '027'
down_revision: Union[str, None] = '026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add ticker and emoji columns to funds table."""
    op.add_column('funds', sa.Column('ticker', sa.String(10), nullable=True))
    op.add_column('funds', sa.Column('emoji', sa.String(10), nullable=True))


def downgrade() -> None:
    """Remove ticker and emoji columns from funds table."""
    op.drop_column('funds', 'emoji')
    op.drop_column('funds', 'ticker')

