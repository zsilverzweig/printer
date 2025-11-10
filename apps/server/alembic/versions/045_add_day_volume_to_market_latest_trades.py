"""Add day_volume to market_latest_trades.

Revision ID: 045_add_day_volume
Revises: 044
Create Date: 2025-11-10 18:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "045_add_day_volume"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "market_latest_trades",
        sa.Column("day_volume", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("market_latest_trades", "day_volume")


