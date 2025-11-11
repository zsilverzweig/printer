"""
Backtest Event Logger.

Utility helpers to persist structured backtest lifecycle events.
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from app.models.backtests import BacktestEvent
from app.services.core.database import get_async_session
from app.services.backtest.progress_broker import backtest_progress_broker
from app.services.core.time_context import (
    get_backtest_id,
    get_backtest_context,
    next_backtest_sequence,
)

logger = logging.getLogger(__name__)


async def log_event(
    fund_id: str,
    event_type: str,
    *,
    sequence: Optional[int] = None,
    message: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    simulated_time: Optional[datetime] = None,
) -> None:
    """
    Persist an event for the active backtest (if any).
    """
    backtest_id = get_backtest_id()
    if not backtest_id:
        return

    ctx = get_backtest_context()
    if simulated_time is None and ctx:
        simulated_time = ctx.current_time

    if sequence is None:
        sequence = next_backtest_sequence()

    event = BacktestEvent(
        backtest_id=backtest_id,
        fund_id=fund_id,
        event_type=event_type,
        simulated_time=simulated_time,
        sequence=sequence,
        message=message,
        details=details or {},
    )

    async with get_async_session() as session:
        session.add(event)
        try:
            await session.commit()
            await session.refresh(event)

            payload = {
                "id": event.id,
                "backtest_id": event.backtest_id,
                "fund_id": event.fund_id,
                "event_type": event.event_type,
                "simulated_time": event.simulated_time.isoformat() if event.simulated_time else None,
                "sequence": event.sequence,
                "message": event.message,
                "details": event.details or {},
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            await backtest_progress_broker.publish(backtest_id, payload)
        except Exception:
            logger.exception("Failed to record backtest event '%s'", event_type)

