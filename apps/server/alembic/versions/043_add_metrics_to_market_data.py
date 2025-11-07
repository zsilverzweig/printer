"""Add technical metric columns to market_data table

Revision ID: 043
Revises: 042
Create Date: 2025-11-06

Consolidates all technical indicators into the primary market_data table so
metrics are stored alongside their corresponding bars and timescales.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add metric columns and supporting indexes to market_data."""

    metric_columns = [
        sa.Column("ema_12", sa.Numeric(12, 4), nullable=True),
        sa.Column("ema_26", sa.Numeric(12, 4), nullable=True),
        sa.Column("ema_50", sa.Numeric(12, 4), nullable=True),
        sa.Column("ema_200", sa.Numeric(12, 4), nullable=True),
        sa.Column("sma_20", sa.Numeric(12, 4), nullable=True),
        sa.Column("sma_50", sa.Numeric(12, 4), nullable=True),
        sa.Column("sma_200", sa.Numeric(12, 4), nullable=True),
        sa.Column("macd_line", sa.Numeric(12, 4), nullable=True),
        sa.Column("macd_signal", sa.Numeric(12, 4), nullable=True),
        sa.Column("macd_histogram", sa.Numeric(12, 4), nullable=True),
        sa.Column("rsi_14", sa.Numeric(12, 4), nullable=True),
        sa.Column("atr_14", sa.Numeric(12, 4), nullable=True),
        sa.Column("bb_upper", sa.Numeric(12, 4), nullable=True),
        sa.Column("bb_middle", sa.Numeric(12, 4), nullable=True),
        sa.Column("bb_lower", sa.Numeric(12, 4), nullable=True),
        sa.Column("rv14", sa.Numeric(12, 4), nullable=True),
        sa.Column("rv30", sa.Numeric(12, 4), nullable=True),
        sa.Column("rv60", sa.Numeric(12, 4), nullable=True),
        sa.Column("volume_ma_20", sa.Numeric(16, 4), nullable=True),
    ]

    for column in metric_columns:
        op.add_column("market_data", column)

    op.create_index(
        "idx_market_data_rv14",
        "market_data",
        ["symbol", "timescale", "time", "rv14"],
        unique=False,
        postgresql_where=sa.text("rv14 IS NOT NULL"),
    )
    op.create_index(
        "idx_market_data_macd_line",
        "market_data",
        ["symbol", "timescale", "time", "macd_line"],
        unique=False,
        postgresql_where=sa.text("macd_line IS NOT NULL"),
    )
    op.create_index(
        "idx_market_data_rsi_14",
        "market_data",
        ["symbol", "timescale", "time", "rsi_14"],
        unique=False,
        postgresql_where=sa.text("rsi_14 IS NOT NULL"),
    )


def downgrade() -> None:
    """Remove metric indexes and columns from market_data."""

    op.drop_index("idx_market_data_rsi_14", table_name="market_data")
    op.drop_index("idx_market_data_macd_line", table_name="market_data")
    op.drop_index("idx_market_data_rv14", table_name="market_data")

    column_names = [
        "volume_ma_20",
        "rv60",
        "rv30",
        "rv14",
        "bb_lower",
        "bb_middle",
        "bb_upper",
        "atr_14",
        "rsi_14",
        "macd_histogram",
        "macd_signal",
        "macd_line",
        "sma_200",
        "sma_50",
        "sma_20",
        "ema_200",
        "ema_50",
        "ema_26",
        "ema_12",
    ]

    for name in column_names:
        op.drop_column("market_data", name)

