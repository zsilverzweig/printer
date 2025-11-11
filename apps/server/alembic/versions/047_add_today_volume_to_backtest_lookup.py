"""Add today_volume column to backtest lookup table.

Revision ID: 047_add_today_volume
Revises: 046_remove_is_complete
Create Date: 2025-11-11
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "047_add_today_volume"
down_revision = "046_remove_is_complete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "market_data_backtest_lookup",
        sa.Column("today_volume", sa.BigInteger(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("market_data_backtest_lookup", "today_volume")


