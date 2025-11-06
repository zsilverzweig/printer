"""enable_pg_stat_statements

Revision ID: 040
Revises: 039
Create Date: 2025-01-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '040'
down_revision = '039'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pg_stat_statements extension for query performance tracking
    # This allows us to analyze slow queries and optimize database performance
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")


def downgrade() -> None:
    # Drop the extension (note: this will lose all collected statistics)
    op.execute("DROP EXTENSION IF EXISTS pg_stat_statements")

