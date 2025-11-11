from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.strategies import Base, utcnow_aware


class BacktestEvent(Base):
    """
    Persisted lifecycle event emitted during backtest execution.
    """

    __tablename__ = "backtest_events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    backtest_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("backtests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    fund_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("funds.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    simulated_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata: Mapped[Dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow_aware)


