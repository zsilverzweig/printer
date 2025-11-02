"""Drop unused idx_market_data_regular_hours index

Revision ID: 023
Revises: 022
Create Date: 2025-11-02

This migration drops the idx_market_data_regular_hours index which was found
to be unused (0 scans) and consuming ~1.1 GB of disk space across all chunks.
The index was intended for filtering regular trading hours but queries don't
actually use it. Removing it frees disk space and improves write performance.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Drop the unused idx_market_data_regular_hours index.
    
    This index was created for regular trading hours queries but analysis
    showed it has never been used (0 index scans). Removing it:
    - Frees ~1.1 GB of disk space
    - Improves INSERT/UPDATE performance (no index maintenance)
    - Has no impact on query performance (wasn't being used)
    """
    
    # Drop the main index on the hypertable
    op.execute("""
        DROP INDEX IF EXISTS public.idx_market_data_regular_hours;
    """)
    
    # Drop indexes on all existing chunks
    # TimescaleDB automatically creates indexes on chunks when they exist on the hypertable
    # We need to drop them from chunks too
    op.execute("""
        DO $$
        DECLARE
            index_rec RECORD;
        BEGIN
            FOR index_rec IN 
                SELECT 
                    n.nspname as schema_name,
                    c.relname as index_name
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'i'
                  AND c.relname LIKE '%idx_market_data_regular_hours%'
            LOOP
                EXECUTE format('DROP INDEX IF EXISTS %I.%I', 
                              index_rec.schema_name, 
                              index_rec.index_name);
                RAISE NOTICE 'Dropped index: %.%', 
                            index_rec.schema_name, 
                            index_rec.index_name;
            END LOOP;
        END $$;
    """)


def downgrade() -> None:
    """
    Recreate the idx_market_data_regular_hours index if downgrading.
    
    Note: This will be slow as it needs to scan all data and create the index.
    """
    
    # Recreate the index on the hypertable
    # TimescaleDB will automatically create it on all chunks
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_market_data_regular_hours 
        ON market_data (symbol, timescale, time DESC) 
        WHERE session_type = 'regular';
    """)

