"""Add progress_pct and tickers_succeeded to asset_loading_status

Revision ID: 018
Revises: 017
Create Date: 2025-11-02 02:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '018'
down_revision = '017'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add progress_pct column
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'asset_loading_status' 
                AND column_name = 'progress_pct'
            ) THEN
                ALTER TABLE asset_loading_status 
                ADD COLUMN progress_pct FLOAT DEFAULT 0.0;
            END IF;
        END $$;
    """)
    
    # Add tickers_succeeded column
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'asset_loading_status' 
                AND column_name = 'tickers_succeeded'
            ) THEN
                ALTER TABLE asset_loading_status 
                ADD COLUMN tickers_succeeded INTEGER NOT NULL DEFAULT 0;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE asset_loading_status DROP COLUMN IF EXISTS progress_pct;")
    op.execute("ALTER TABLE asset_loading_status DROP COLUMN IF EXISTS tickers_succeeded;")

