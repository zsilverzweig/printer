"""Add high-utility indexes for market data performance.

Revision ID: 053_add_market_data_indexes
Revises: 052_backtest_event_details
Create Date: 2025-11-11 22:30:00

Adds concurrently-built indexes that accelerate common market data and backtest
lookup queries without blocking writers.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "053_add_market_data_indexes"
down_revision: str | None = "052_backtest_event_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    time_desc = sa.text("time DESC")
    lookup_time_desc = sa.text("lookup_time DESC")

    with op.get_context().autocommit_block():
        op.create_index(
            "idx_market_data_symbol_timescale_time_desc",
            "market_data",
            ["symbol", "timescale", time_desc],
            unique=False,
            if_not_exists=True,
            postgresql_concurrently=True,
        )

    with op.get_context().autocommit_block():
        op.create_index(
            "idx_market_data_timescale_time_desc",
            "market_data",
            ["timescale", time_desc],
            unique=False,
            if_not_exists=True,
            postgresql_concurrently=True,
        )

    with op.get_context().autocommit_block():
        op.create_index(
            "idx_backtest_lookup_timescale_lookup_time_desc",
            "market_data_backtest_lookup",
            ["timescale", lookup_time_desc],
            unique=False,
            if_not_exists=True,
            postgresql_concurrently=True,
        )

    with op.get_context().autocommit_block():
        op.create_index(
            "idx_symbol_date_validation_date",
            "symbol_date_validation",
            ["date"],
            unique=False,
            if_not_exists=True,
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "idx_symbol_date_validation_date",
            table_name="symbol_date_validation",
            postgresql_concurrently=True,
            if_exists=True,
        )

    with op.get_context().autocommit_block():
        op.drop_index(
            "idx_backtest_lookup_timescale_lookup_time_desc",
            table_name="market_data_backtest_lookup",
            postgresql_concurrently=True,
            if_exists=True,
        )

    with op.get_context().autocommit_block():
        op.drop_index(
            "idx_market_data_timescale_time_desc",
            table_name="market_data",
            postgresql_concurrently=True,
            if_exists=True,
        )

    with op.get_context().autocommit_block():
        op.drop_index(
            "idx_market_data_symbol_timescale_time_desc",
            table_name="market_data",
            postgresql_concurrently=True,
            if_exists=True,
        )


