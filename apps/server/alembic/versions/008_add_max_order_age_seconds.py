"""add max_order_age_seconds to strategies

Revision ID: 008
Revises: 007
Create Date: 2025-10-30 13:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008'
down_revision: Union[str, None] = '007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add max_order_age_seconds column to strategies table (risk parameter)."""
    op.add_column(
        'strategies',
        sa.Column('max_order_age_seconds', sa.Integer(), nullable=True, server_default='60')
    )


def downgrade() -> None:
    """Remove max_order_age_seconds column from strategies table."""
    op.drop_column('strategies', 'max_order_age_seconds')

