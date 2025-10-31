"""remove_screening_criteria

Revision ID: 014
Revises: 012
Create Date: 2025-10-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '014'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop foreign key constraint before removing column
    op.drop_constraint('fk_funds_screening_criteria', 'funds', type_='foreignkey')

    # Remove fund columns now owned by strategy config
    op.drop_column('funds', 'screening_criteria_id')
    op.drop_column('funds', 'trading_start_time')
    op.drop_column('funds', 'trading_end_time')
    op.drop_column('funds', 'timezone')
    op.drop_column('funds', 'max_order_age_seconds')

    # Drop screening_criteria table entirely
    op.drop_table('screening_criteria')


def downgrade() -> None:
    # Recreate screening_criteria table
    op.create_table(
        'screening_criteria',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('criteria', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Restore fund columns
    op.add_column('funds', sa.Column('screening_criteria_id', sa.String(length=36), nullable=True))
    op.add_column('funds', sa.Column('trading_start_time', sa.String(length=10), nullable=True))
    op.add_column('funds', sa.Column('trading_end_time', sa.String(length=10), nullable=True))
    op.add_column('funds', sa.Column('timezone', sa.String(length=50), nullable=True))
    op.add_column(
        'funds',
        sa.Column('max_order_age_seconds', sa.Integer(), nullable=True, server_default='60')
    )

    # Reinstate foreign key constraint
    op.create_foreign_key(
        'fk_funds_screening_criteria',
        'funds',
        'screening_criteria',
        ['screening_criteria_id'],
        ['id']
    )
