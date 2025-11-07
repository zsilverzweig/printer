"""Drop legacy metrics tables

Revision ID: 044
Revises: 043
Create Date: 2025-11-06

Removes the legacy technical_indicators and screener_metrics tables now that all
metrics are stored directly on market_data rows.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    metric_fields = [
        "ema_12",
        "ema_26",
        "ema_50",
        "ema_200",
        "sma_20",
        "sma_50",
        "sma_200",
        "macd_line",
        "macd_signal",
        "macd_histogram",
        "rsi_14",
        "atr_14",
        "bb_upper",
        "bb_middle",
        "bb_lower",
        "rv14",
        "rv30",
        "rv60",
        "volume_ma_20",
    ]

    set_clause = ", ".join(f"{field} = NULL" for field in metric_fields)
    op.execute(f"UPDATE market_data SET {set_clause} WHERE timescale = '1min';")

    op.execute("DROP TABLE IF EXISTS technical_indicators CASCADE;")
    op.execute("DROP TABLE IF EXISTS screener_metrics CASCADE;")


def downgrade() -> None:
    op.create_table(
        "technical_indicators",
        sa.Column("time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("timescale", sa.String(length=10), nullable=False),
        sa.Column("ema_12", sa.Numeric(12, 4)),
        sa.Column("ema_26", sa.Numeric(12, 4)),
        sa.Column("vwap", sa.Numeric(12, 4)),
        sa.Column("macd_line", sa.Numeric(12, 4)),
        sa.Column("macd_signal", sa.Numeric(12, 4)),
        sa.Column("macd_histogram", sa.Numeric(12, 4)),
        sa.Column("rsi_14", sa.Numeric(12, 4)),
        sa.Column("atr_14", sa.Numeric(12, 4)),
        sa.PrimaryKeyConstraint("time", "symbol", "timescale"),
    )

    op.create_table(
        "screener_metrics",
        sa.Column("symbol", sa.String(length=20), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("rv14", sa.Numeric(10, 2)),
        sa.Column("rv30", sa.Numeric(10, 2)),
        sa.Column("rv60", sa.Numeric(10, 2)),
        sa.Column("high_90d", sa.Numeric(12, 4)),
        sa.Column("low_90d", sa.Numeric(12, 4)),
        sa.Column("sma_20", sa.Numeric(12, 4)),
        sa.Column("sma_50", sa.Numeric(12, 4)),
        sa.Column("sma_200", sa.Numeric(12, 4)),
        sa.Column("rsi_14", sa.Numeric(6, 2)),
        sa.Column("macd_line", sa.Numeric(12, 4)),
        sa.Column("macd_signal", sa.Numeric(12, 4)),
        sa.Column("macd_histogram", sa.Numeric(12, 4)),
        sa.Column("bb_upper", sa.Numeric(12, 4)),
        sa.Column("bb_middle", sa.Numeric(12, 4)),
        sa.Column("bb_lower", sa.Numeric(12, 4)),
        sa.Column("atr_14", sa.Numeric(12, 4)),
        sa.Column("volume_ma_20", sa.Numeric(20, 2)),
        sa.Column("volume_trend", sa.String(length=10)),
        sa.Column(
            "calculated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("symbol", "date"),
    )

