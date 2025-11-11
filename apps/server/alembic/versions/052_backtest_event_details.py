"""Rename metadata column to details on backtest_events.

Revision ID: 052_backtest_event_details
Revises: 051_add_backtest_events_table
Create Date: 2025-11-11 18:00:00
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "052_backtest_event_details"
down_revision: str | None = "051_add_backtest_events_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("backtest_events", "metadata", new_column_name="details")


def downgrade() -> None:
    op.alter_column("backtest_events", "details", new_column_name="metadata")


