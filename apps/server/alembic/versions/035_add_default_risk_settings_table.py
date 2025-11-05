"""add_default_risk_settings_table

Revision ID: 035
Revises: 034
Create Date: 2025-11-05 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create default_risk_settings table
    op.create_table(
        'default_risk_settings',
        sa.Column('id', sa.String(36), primary_key=True, server_default='default'),
        sa.Column('max_loss_percent', sa.Float(), nullable=True),
        sa.Column('max_loss_dollars', sa.Float(), nullable=True),
        sa.Column('max_giveback_percent', sa.Float(), nullable=True),
        sa.Column('max_order_age_seconds', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('size_per_trade', sa.Float(), nullable=False, server_default='1000.0'),
        sa.Column('min_bet_percent', sa.Float(), nullable=True),
        sa.Column('max_bet_percent', sa.Float(), nullable=True),
        sa.Column('max_total_exposure', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    
    # Insert default record with default values
    op.execute("""
        INSERT INTO default_risk_settings (id, max_order_age_seconds, size_per_trade)
        VALUES ('default', 60, 1000.0)
    """)


def downgrade() -> None:
    op.drop_table('default_risk_settings')

