"""add_transfers_table

Revision ID: 011
Revises: 010
Create Date: 2025-10-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '011'
down_revision: Union[str, None] = '010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create transfers table
    op.create_table(
        'transfers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('fund_id', sa.String(36), sa.ForeignKey('funds.id'), nullable=False, index=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('transfer_type', sa.String(20), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False, index=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    # Drop transfers table
    op.drop_table('transfers')
