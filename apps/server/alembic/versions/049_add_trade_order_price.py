"""Add order price snapshot to trades.

Revision ID: 049_add_trade_order_price
Revises: 048_add_background_metrics_flag
Create Date: 2025-11-11 00:00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "049_add_trade_order_price"
down_revision: Union[str, None] = "048_add_background_metrics_flag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("order_price_at_submission", sa.Float(), nullable=True))
    op.execute(
        """
        UPDATE trades
        SET order_price_at_submission = entry_price
        WHERE order_price_at_submission IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("trades", "order_price_at_submission")

