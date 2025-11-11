from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, Set


class BacktestProgressBroker:
    """
    Simple in-memory pub/sub broker for streaming backtest events to subscribers.
    """

    def __init__(self) -> None:
        self._subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, backtest_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        async with self._lock:
            self._subscribers[backtest_id].add(queue)
        return queue

    async def unsubscribe(self, backtest_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            subscribers = self._subscribers.get(backtest_id)
            if not subscribers:
                return
            subscribers.discard(queue)
            if not subscribers:
                self._subscribers.pop(backtest_id, None)

    async def publish(self, backtest_id: str, payload: Dict[str, Any]) -> None:
        async with self._lock:
            subscribers = list(self._subscribers.get(backtest_id, set()))

        drop_list = []
        for queue in subscribers:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                drop_list.append(queue)

        for queue in drop_list:
            await self.unsubscribe(backtest_id, queue)

    @asynccontextmanager
    async def stream(self, backtest_id: str) -> AsyncIterator[asyncio.Queue]:
        queue = await self.subscribe(backtest_id)
        try:
            yield queue
        finally:
            await self.unsubscribe(backtest_id, queue)


backtest_progress_broker = BacktestProgressBroker()


