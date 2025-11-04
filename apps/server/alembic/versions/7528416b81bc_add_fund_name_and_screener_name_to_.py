"""add_fund_name_and_screener_name_to_backtest

Revision ID: 7528416b81bc
Revises: 20251104_073000
Create Date: 2025-11-04 03:18:20.416966

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7528416b81bc'
down_revision = '20251104_073000'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add fund_name and screening_criteria_name columns to backtests table.
    
    These columns store snapshots of the fund name and screener name at the time
    the backtest was run, allowing the UI to display friendly names even if
    the fund or screener is later renamed or deleted.
    """
    # Add fund_name column (nullable for backward compatibility with existing records)
    op.add_column('backtests', sa.Column('fund_name', sa.String(200), nullable=True))
    
    # Add screening_criteria_name column (nullable for backward compatibility)
    op.add_column('backtests', sa.Column('screening_criteria_name', sa.String(200), nullable=True))


def downgrade() -> None:
    """
    Remove fund_name and screening_criteria_name columns from backtests table.
    """
    op.drop_column('backtests', 'screening_criteria_name')
    op.drop_column('backtests', 'fund_name')


