"""Migrate all remaining datetime columns to timezone-aware

Revision ID: 039
Revises: 038
Create Date: 2025-11-05 19:05:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '039'
down_revision = '038'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Convert all remaining datetime columns from TIMESTAMP WITHOUT TIME ZONE 
    to TIMESTAMP WITH TIME ZONE (timezone-aware).
    
    PostgreSQL automatically converts existing naive timestamps (assumed UTC)
    to timezone-aware when casting to TIMESTAMPTZ.
    """
    # ai_costs table
    op.execute("""
        ALTER TABLE ai_costs 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE ai_costs 
        ALTER COLUMN timestamp 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING timestamp AT TIME ZONE 'UTC';
    """)
    
    # asset_loading_status table
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN started_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING started_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN completed_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING completed_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN last_updated 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING last_updated AT TIME ZONE 'UTC';
    """)
    
    # default_risk_settings table
    op.execute("""
        ALTER TABLE default_risk_settings 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE default_risk_settings 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # funds table
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN last_ai_cost_reset 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING last_ai_cost_reset AT TIME ZONE 'UTC';
    """)
    
    # orders table
    op.execute("""
        ALTER TABLE orders 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE orders 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # screening_criteria table
    op.execute("""
        ALTER TABLE screening_criteria 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE screening_criteria 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # ticker_details table
    op.execute("""
        ALTER TABLE ticker_details 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE ticker_details 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # trades table
    op.execute("""
        ALTER TABLE trades 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE trades 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # transactions table
    op.execute("""
        ALTER TABLE transactions 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    
    # transfers table
    op.execute("""
        ALTER TABLE transfers 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITH TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)


def downgrade() -> None:
    """
    Convert back to TIMESTAMP WITHOUT TIME ZONE (timezone-naive).
    
    Note: This will lose timezone information, converting to UTC-naive.
    """
    # ai_costs table
    op.execute("""
        ALTER TABLE ai_costs 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE ai_costs 
        ALTER COLUMN timestamp 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING timestamp AT TIME ZONE 'UTC';
    """)
    
    # asset_loading_status table
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN started_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING started_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN completed_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING completed_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE asset_loading_status 
        ALTER COLUMN last_updated 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING last_updated AT TIME ZONE 'UTC';
    """)
    
    # default_risk_settings table
    op.execute("""
        ALTER TABLE default_risk_settings 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE default_risk_settings 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # funds table
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE funds 
        ALTER COLUMN last_ai_cost_reset 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING last_ai_cost_reset AT TIME ZONE 'UTC';
    """)
    
    # orders table
    op.execute("""
        ALTER TABLE orders 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE orders 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # screening_criteria table
    op.execute("""
        ALTER TABLE screening_criteria 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE screening_criteria 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # ticker_details table
    op.execute("""
        ALTER TABLE ticker_details 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE ticker_details 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # trades table
    op.execute("""
        ALTER TABLE trades 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    op.execute("""
        ALTER TABLE trades 
        ALTER COLUMN updated_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING updated_at AT TIME ZONE 'UTC';
    """)
    
    # transactions table
    op.execute("""
        ALTER TABLE transactions 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)
    
    # transfers table
    op.execute("""
        ALTER TABLE transfers 
        ALTER COLUMN created_at 
        TYPE TIMESTAMP WITHOUT TIME ZONE 
        USING created_at AT TIME ZONE 'UTC';
    """)

