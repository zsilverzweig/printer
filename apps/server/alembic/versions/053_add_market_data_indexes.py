"""Add high-utility indexes for market data performance.

Revision ID: 053_add_market_data_indexes
Revises: 052_backtest_event_details
Create Date: 2025-11-11 22:30:00

Adds supporting indexes that accelerate common market data and backtest lookup
queries.
"""

from __future__ import annotations

from textwrap import dedent

import psycopg2
from alembic import op
from sqlalchemy.engine.url import URL


# revision identifiers, used by Alembic.
revision: str = "053_add_market_data_indexes"
down_revision: str | None = "052_backtest_event_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clean up invalid leftover from prior attempts, if present.
    _run_sql("DROP INDEX IF EXISTS idx_market_data_symbol_timescale_time_desc;")

    _create_index_if_missing(
        "idx_market_data_timescale_time_desc",
        """
        CREATE INDEX idx_market_data_timescale_time_desc
        ON market_data (timescale, time DESC)
        """,
    )

    _create_index_if_missing(
        "idx_backtest_lookup_timescale_lookup_time_desc",
        """
        CREATE INDEX idx_backtest_lookup_timescale_lookup_time_desc
        ON market_data_backtest_lookup (timescale, lookup_time DESC)
        """,
    )

    _create_index_if_missing(
        "idx_symbol_date_validation_date",
        """
        CREATE INDEX idx_symbol_date_validation_date
        ON symbol_date_validation (date)
        """,
    )


def downgrade() -> None:
    _run_sql("DROP INDEX IF EXISTS idx_symbol_date_validation_date;")
    _run_sql("DROP INDEX IF EXISTS idx_backtest_lookup_timescale_lookup_time_desc;")
    _run_sql("DROP INDEX IF EXISTS idx_market_data_timescale_time_desc;")


def _create_index_if_missing(index_name: str, create_sql: str) -> None:
    _run_sql(
        dedent(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relkind = 'i'
                      AND c.relname = '{index_name}'
                      AND n.nspname = 'public'
                ) THEN
                    {create_sql};
                END IF;
            END;
            $$;
            """
        )
    )


def _run_sql(sql: str) -> None:
    bind = op.get_bind()
    url: URL = bind.engine.url
    sync_url = url.set(drivername="postgresql")
    dsn = sync_url.render_as_string(hide_password=False)

    with psycopg2.connect(dsn) as conn:
        conn.autocommit = True
        with conn.cursor() as cursor:
            cursor.execute(sql)
