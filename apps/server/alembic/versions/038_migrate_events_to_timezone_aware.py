"""Migrate events table to timezone-aware timestamps

Revision ID: 038_migrate_events_to_timezone_aware
Revises: 037_add_ticker_states_table
Create Date: 2025-11-05 18:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '038'
down_revision = '037'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Convert events table datetime columns from TIMESTAMP WITHOUT TIME ZONE 
    to TIMESTAMP WITH TIME ZONE (timezone-aware).
    
    PostgreSQL automatically converts existing naive timestamps (assumed UTC)
    to timezone-aware when casting to TIMESTAMPTZ.
    """
    # Convert events.timestamp column
    op.execute("""
        ALTER TABLE events 
        ALTER COLUMN timestamp 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING timestamp AT TIME ZONE 'UTC';
    """)
    
    # Convert events.created_at column
    op.execute("""
        ALTER TABLE events 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    
    # Convert alpaca_trade_events.submitted_at column (if it exists)
    op.execute("""
        ALTER TABLE alpaca_trade_events 
        ALTER COLUMN submitted_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING submitted_at AT TIME ZONE 'UTC';
    """)
    
    # Convert alpaca_trade_events.filled_at column (if it exists)
    op.execute("""
        ALTER TABLE alpaca_trade_events 
        ALTER COLUMN filled_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING filled_at AT TIME ZONE 'UTC';
    """)


def downgrade() -> None:
    """
    Convert back to TIMESTAMP WITHOUT TIME ZONE (timezone-naive).
    
    Note: This will lose timezone information, converting to UTC-naive.
    """
    # Convert events.timestamp column back
    op.execute("""
        ALTER TABLE events 
        ALTER COLUMN timestamp 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING timestamp AT TIME ZONE 'UTC';
    """)
    
    # Convert events.created_at column back
    op.execute("""
        ALTER TABLE events 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    
    # Convert alpaca_trade_events.submitted_at column back
    op.execute("""
        ALTER TABLE alpaca_trade_events 
        ALTER COLUMN submitted_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING submitted_at AT TIME ZONE 'UTC';
    """)
    
    # Convert alpaca_trade_events.filled_at column back
    op.execute("""
        ALTER TABLE alpaca_trade_events 
        ALTER COLUMN filled_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING filled_at AT TIME ZONE 'UTC';
    """)

