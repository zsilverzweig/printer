"""Add background metrics flag to symbol_date_validation

Revision ID: 048_add_background_metrics_flag
Revises: 047_add_today_volume
Create Date: 2025-11-11
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "048_add_background_metrics_flag"
down_revision = "047_add_today_volume"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "symbol_date_validation",
        sa.Column(
            "background_metrics_calculated",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.alter_column(
        "symbol_date_validation",
        "background_metrics_calculated",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("symbol_date_validation", "background_metrics_calculated")

