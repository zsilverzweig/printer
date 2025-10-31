"""Initial database schema

Revision ID: 000
Revises: 
Create Date: 2025-10-31

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '000'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create initial tables."""
    
    # Create ticker_details table
    op.create_table('ticker_details',
        sa.Column('symbol', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('market', sa.String(length=20), nullable=True),
        sa.Column('locale', sa.String(length=10), nullable=True),
        sa.Column('primary_exchange', sa.String(length=20), nullable=True),
        sa.Column('type', sa.String(length=20), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=True),
        sa.Column('currency_name', sa.String(length=20), nullable=True),
        sa.Column('cik', sa.String(length=20), nullable=True),
        sa.Column('sic_code', sa.String(length=10), nullable=True),
        sa.Column('sic_description', sa.String(length=200), nullable=True),
        sa.Column('market_cap', sa.BigInteger(), nullable=True),
        sa.Column('share_class_shares_outstanding', sa.BigInteger(), nullable=True),
        sa.Column('weighted_shares_outstanding', sa.BigInteger(), nullable=True),
        sa.Column('total_employees', sa.Integer(), nullable=True),
        sa.Column('list_date', sa.Date(), nullable=True),
        sa.Column('homepage_url', sa.String(length=500), nullable=True),
        sa.Column('phone_number', sa.String(length=50), nullable=True),
        sa.Column('address_line1', sa.String(length=200), nullable=True),
        sa.Column('address_city', sa.String(length=100), nullable=True),
        sa.Column('address_state', sa.String(length=50), nullable=True),
        sa.Column('address_postal_code', sa.String(length=20), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('logo_url', sa.String(length=500), nullable=True),
        sa.Column('icon_url', sa.String(length=500), nullable=True),
        sa.Column('tradable', sa.Boolean(), nullable=True),
        sa.Column('marginable', sa.Boolean(), nullable=True),
        sa.Column('shortable', sa.Boolean(), nullable=True),
        sa.Column('easy_to_borrow', sa.Boolean(), nullable=True),
        sa.Column('fractionable', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('symbol')
    )
    op.create_index('idx_ticker_details_exchange', 'ticker_details', ['primary_exchange'], unique=False)
    op.create_index('idx_ticker_details_type', 'ticker_details', ['type'], unique=False)
    op.create_index('idx_ticker_details_market_cap', 'ticker_details', ['market_cap'], unique=False)
    op.create_index('idx_ticker_details_active', 'ticker_details', ['active'], unique=False)
    op.create_index('idx_ticker_details_tradable', 'ticker_details', ['tradable'], unique=False)
    op.create_index('idx_ticker_details_market_locale', 'ticker_details', ['market', 'locale'], unique=False)

    # Create asset_loading_status table (without task_type - that's added in migration 001)
    op.create_table('asset_loading_status',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='idle'),
        sa.Column('total_tickers', sa.Integer(), nullable=True),
        sa.Column('processed_tickers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_tickers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_phase', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('last_updated', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_asset_loading_status', 'asset_loading_status', ['status'], unique=False)


def downgrade() -> None:
    """Drop initial tables."""
    op.drop_index('idx_asset_loading_status', table_name='asset_loading_status')
    op.drop_table('asset_loading_status')
    
    op.drop_index('idx_ticker_details_market_locale', table_name='ticker_details')
    op.drop_index('idx_ticker_details_tradable', table_name='ticker_details')
    op.drop_index('idx_ticker_details_active', table_name='ticker_details')
    op.drop_index('idx_ticker_details_market_cap', table_name='ticker_details')
    op.drop_index('idx_ticker_details_type', table_name='ticker_details')
    op.drop_index('idx_ticker_details_exchange', table_name='ticker_details')
    op.drop_table('ticker_details')

