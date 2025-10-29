"""Add float metrics fields to ticker_details

Revision ID: 002
Revises: 001
Create Date: 2025-10-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add float metrics columns to ticker_details table."""
    # Add float metrics columns
    op.add_column('ticker_details', 
                  sa.Column('public_float', sa.BigInteger(), nullable=True))
    op.add_column('ticker_details', 
                  sa.Column('short_percent_of_float', sa.Float(), nullable=True))
    op.add_column('ticker_details', 
                  sa.Column('outstanding_shares_scraped', sa.BigInteger(), nullable=True))
    
    # Create index for public_float filtering
    op.create_index('idx_ticker_details_public_float', 'ticker_details', 
                   ['public_float'], unique=False)


def downgrade() -> None:
    """Remove float metrics columns from ticker_details table."""
    # Drop the index
    op.drop_index('idx_ticker_details_public_float', table_name='ticker_details')
    
    # Drop the columns
    op.drop_column('ticker_details', 'outstanding_shares_scraped')
    op.drop_column('ticker_details', 'short_percent_of_float')
    op.drop_column('ticker_details', 'public_float')


