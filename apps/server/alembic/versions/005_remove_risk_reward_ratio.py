"""remove risk_reward_ratio from strategies

Revision ID: 005
Revises: 004
Create Date: 2025-10-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove risk_reward_ratio column from strategies table."""
    op.drop_column('strategies', 'risk_reward_ratio')


def downgrade() -> None:
    """Re-add risk_reward_ratio column to strategies table."""
    op.add_column('strategies', sa.Column('risk_reward_ratio', sa.Float(), nullable=False, server_default='2.0'))

