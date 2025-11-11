"""Remove is_complete column from symbol_date_validation

Revision ID: 046_remove_is_complete
Revises: 591f62adb479
Create Date: 2025-11-11
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "046_remove_is_complete"
down_revision = "591f62adb479"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop partial index that referenced the is_complete column (if it still exists)
    op.execute("DROP INDEX IF EXISTS idx_symbol_date_validation_incomplete")

    # Drop the is_complete column from the validation table
    op.drop_column("symbol_date_validation", "is_complete")


def downgrade() -> None:
    # Re-add the is_complete column with default False to restore previous schema
    op.add_column(
        "symbol_date_validation",
        sa.Column("is_complete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # Remove the server default so future inserts rely on application logic
    op.alter_column(
        "symbol_date_validation",
        "is_complete",
        server_default=None,
    )

    # Recreate the partial index that existed before removal
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_symbol_date_validation_incomplete
        ON symbol_date_validation (date, is_complete)
        WHERE is_complete = FALSE
        """
    )
