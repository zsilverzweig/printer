"""add_events_table

Revision ID: 013a
Revises: 013
Create Date: 2025-11-06 04:31:20.749830

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '013a'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create events table for event inheritance pattern."""
    op.create_table(
        'events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_events_event_type', 'events', ['event_type'])
    op.create_index('idx_events_timestamp', 'events', ['timestamp'])


def downgrade() -> None:
    """Remove events table."""
    op.drop_index('idx_events_timestamp', table_name='events')
    op.drop_index('idx_events_event_type', table_name='events')
    op.drop_table('events')


