"""Add task_type column to asset_loading_status

Revision ID: 001
Revises: 
Create Date: 2025-10-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add task_type column to asset_loading_status table."""
    # Add task_type column with default value
    op.add_column('asset_loading_status', 
                  sa.Column('task_type', sa.String(length=30), 
                           nullable=False, 
                           server_default='asset_loading'))
    
    # Create new index for status and task_type
    op.create_index('idx_asset_loading_status_type', 'asset_loading_status', 
                   ['status', 'task_type'], unique=False)
    
    # Drop old index if it exists
    try:
        op.drop_index('idx_asset_loading_status', table_name='asset_loading_status')
    except:
        # Index might not exist, ignore
        pass


def downgrade() -> None:
    """Remove task_type column from asset_loading_status table."""
    # Drop the new index
    op.drop_index('idx_asset_loading_status_type', table_name='asset_loading_status')
    
    # Recreate the old index
    op.create_index('idx_asset_loading_status', 'asset_loading_status', 
                   ['status'], unique=False)
    
    # Drop the task_type column
    op.drop_column('asset_loading_status', 'task_type')

