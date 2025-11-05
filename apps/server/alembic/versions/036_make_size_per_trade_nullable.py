"""make_size_per_trade_nullable

Revision ID: 036
Revises: 035
Create Date: 2025-01-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, set all existing values to NULL (removing overrides)
    op.execute("""
        UPDATE funds 
        SET size_per_trade = NULL, 
            max_order_age_seconds = NULL
    """)
    
    # Make size_per_trade nullable (remove NOT NULL constraint)
    op.alter_column('funds', 'size_per_trade',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_server_default='1000.0')
    
    # max_order_age_seconds is already nullable, but ensure it's set to NULL
    # (no change needed, just ensuring values are cleared)


def downgrade() -> None:
    # Restore NOT NULL constraint with default value
    # First set any NULL values to the default
    op.execute("""
        UPDATE funds 
        SET size_per_trade = 1000.0 
        WHERE size_per_trade IS NULL
    """)
    
    op.alter_column('funds', 'size_per_trade',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_server_default='1000.0')

