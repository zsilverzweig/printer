"""Add backtest_events table for lifecycle telemetry.

Revision ID: 051_add_backtest_events_table
Revises: 050_rename_entered_state
Create Date: 2025-11-11 02:15:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "051_add_backtest_events_table"
down_revision: str | None = "050_rename_entered_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "backtest_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("backtest_id", sa.String(length=36), nullable=False),
        sa.Column("fund_id", sa.String(length=36), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("simulated_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.ForeignKeyConstraint(["backtest_id"], ["backtests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["fund_id"], ["funds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_backtest_events_backtest_id",
        "backtest_events",
        ["backtest_id"],
    )
    op.create_index(
        "ix_backtest_events_fund_id",
        "backtest_events",
        ["fund_id"],
    )
    op.create_index(
        "ix_backtest_events_simulated_time",
        "backtest_events",
        ["simulated_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_backtest_events_simulated_time", table_name="backtest_events")
    op.drop_index("ix_backtest_events_fund_id", table_name="backtest_events")
    op.drop_index("ix_backtest_events_backtest_id", table_name="backtest_events")
    op.drop_table("backtest_events")


