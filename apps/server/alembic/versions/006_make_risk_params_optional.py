"""make risk parameters optional

Revision ID: 006
Revises: 005
Create Date: 2025-10-29

Changes:
- Make risk management parameters nullable in strategies table
- Allows users to disable specific risk checks by setting them to NULL
- Affects: max_loss_percent, max_loss_dollars, max_giveback_percent,
          min_bet_percent, max_bet_percent, max_total_exposure
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Make risk parameters nullable in strategies table."""
    # Make risk parameters nullable
    op.alter_column('strategies', 'max_loss_percent',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)
    
    op.alter_column('strategies', 'max_loss_dollars',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)
    
    op.alter_column('strategies', 'max_giveback_percent',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)
    
    op.alter_column('strategies', 'min_bet_percent',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)
    
    op.alter_column('strategies', 'max_bet_percent',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)
    
    op.alter_column('strategies', 'max_total_exposure',
                    existing_type=sa.Float(),
                    nullable=True,
                    existing_nullable=False)


def downgrade() -> None:
    """Revert risk parameters to non-nullable with defaults."""
    # Set NULL values to defaults before making non-nullable
    op.execute("""
        UPDATE strategies 
        SET max_loss_percent = 2.0 
        WHERE max_loss_percent IS NULL
    """)
    op.execute("""
        UPDATE strategies 
        SET max_loss_dollars = 1000.0 
        WHERE max_loss_dollars IS NULL
    """)
    op.execute("""
        UPDATE strategies 
        SET max_giveback_percent = 50.0 
        WHERE max_giveback_percent IS NULL
    """)
    op.execute("""
        UPDATE strategies 
        SET min_bet_percent = 1.0 
        WHERE min_bet_percent IS NULL
    """)
    op.execute("""
        UPDATE strategies 
        SET max_bet_percent = 5.0 
        WHERE max_bet_percent IS NULL
    """)
    op.execute("""
        UPDATE strategies 
        SET max_total_exposure = 10000.0 
        WHERE max_total_exposure IS NULL
    """)
    
    # Make non-nullable
    op.alter_column('strategies', 'max_loss_percent',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)
    
    op.alter_column('strategies', 'max_loss_dollars',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)
    
    op.alter_column('strategies', 'max_giveback_percent',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)
    
    op.alter_column('strategies', 'min_bet_percent',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)
    
    op.alter_column('strategies', 'max_bet_percent',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)
    
    op.alter_column('strategies', 'max_total_exposure',
                    existing_type=sa.Float(),
                    nullable=False,
                    existing_nullable=True)

