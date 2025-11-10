"""Remove expected_bars column from symbol_date_validation

Revision ID: 045
Revises: 044
Create Date: 2025-11-12
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("symbol_date_validation", "expected_bars")


def downgrade() -> None:
    op.add_column(
        "symbol_date_validation",
        sa.Column("expected_bars", sa.Integer(), nullable=True),
    )
