from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select

from app.services.backtest.backtest_coordinator import BacktestCoordinator
from app.models.strategies import Fund, ScreeningCriteria, Backtest, Order, Trade, Transaction

class TimelineMarketDataProvider:
    def __init__(self, symbol: str, timeline: dict[datetime, dict[str, float]]):
        self.symbol = symbol
        self.timeline = timeline

    async def build_market_data(self, symbol: str):
        from app.strategies.base import MarketDataSnapshot
        from app.services.core.time_context import get_current_time

        if symbol != self.symbol:
            raise ValueError(f"No data for symbol {symbol}")

        now = get_current_time()
        timestamps = sorted(self.timeline.keys())
        past_times = [ts for ts in timestamps if ts < now]

        if not timestamps:
            raise ValueError("Timeline is empty")

        if not past_times:
            bars = []
        else:
            bars = [
                {
                    "open": self.timeline[ts]["open"],
                    "high": self.timeline[ts]["high"],
                    "low": self.timeline[ts]["low"],
                    "close": self.timeline[ts]["close"],
                    "volume": self.timeline[ts].get("volume", 1),
                }
                for ts in past_times[-60:]
            ]

        current_key = now if now in self.timeline else (past_times[-1] if past_times else timestamps[0])
        current_bar = self.timeline[current_key]

        return MarketDataSnapshot(
            symbol=self.symbol,
            price=current_bar["close"],
            timestamp=now,
            volume=current_bar.get("volume", 1),
            bars=bars,
        )


@pytest.mark.asyncio
async def test_backtest_four_red_candles(monkeypatch, test_engine):
    symbol = "TEST"
    start = datetime(2024, 1, 2, 9, 30, tzinfo=timezone.utc)

    def add_minute(minute_offset: int, open_price: float, high: float, low: float, close: float):
        ts = start + timedelta(minutes=minute_offset)
        timeline[ts] = {
            "open": open_price,
            "high": high,
            "low": low,
            "close": close,
            "volume": 1000,
        }

    timeline: dict[datetime, dict[str, float]] = {}
    add_minute(0, 100.0, 100.5, 99.0, 99.0)
    add_minute(1, 99.0, 99.2, 98.0, 98.0)
    add_minute(2, 98.0, 98.5, 97.0, 97.0)
    add_minute(3, 97.0, 97.4, 96.0, 96.0)
    add_minute(4, 96.0, 96.5, 95.0, 95.0)
    add_minute(5, 96.6, 97.5, 95.5, 97.5)  # Breakout minute (fills at open 96.6)

    session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    @asynccontextmanager
    async def override_get_async_session():
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    # Patch database session accessor everywhere
    import app.services.core.database as database_module
    monkeypatch.setattr(database_module, "get_async_session", override_get_async_session)

    for target in [
        "app.services.backtest.backtest_coordinator.get_async_session",
        "app.services.backtest.order_simulator.get_async_session",
        "app.services.strategies.strategy_service.get_async_session",
        "app.services.strategies.order_executor.get_async_session",
        "app.services.strategies.strategy_engine.get_async_session",
        "app.services.strategies.ticker_state_service.get_async_session",
        "app.services.market.market_data_service.get_async_session",
    ]:
        monkeypatch.setattr(target, override_get_async_session)

    # Patch lookup coverage to bypass data bootstrap
    import app.services.backtest.backtest_lookup_service as lookup_service

    async def fake_check_lookup_coverage(_date):
        return {"has_data": True, "total_rows": 1, "symbols": 1, "minutes": 391, "expected_minutes": 391}

    async def fake_populate_lookup_for_date(_date, timescale="1min"):
        return {"total_rows": 1, "symbols": 1, "size": "1 MB"}

    monkeypatch.setattr(lookup_service, "check_lookup_coverage", fake_check_lookup_coverage)
    monkeypatch.setattr(lookup_service, "populate_lookup_for_date", fake_populate_lookup_for_date)

    # Patch screener service to always return our test symbol
    import app.services.screener.screener as screener_module

    class DummyScreener:
        async def compute_historical(self, *args, **kwargs):
            return [{"ticker": symbol}]

    monkeypatch.setattr(screener_module, "get_screener_service", lambda: DummyScreener())

    # Patch market data provider factory
    import app.services.market.market_data_provider as market_data_provider_module
    monkeypatch.setattr(
        market_data_provider_module,
        "MarketDataProvider",
        lambda: TimelineMarketDataProvider(symbol, timeline),
    )

    # Patch coordinator minute bars to use timeline data
    async def fake_get_minute_bars(self, timestamp: datetime):
        bar = timeline.get(timestamp)
        if not bar:
            return {}
        return {
            symbol: {
                "time": timestamp,
                "open": bar["open"],
                "high": bar["high"],
                "low": bar["low"],
                "close": bar["close"],
                "volume": bar.get("volume", 1),
            }
        }

    monkeypatch.setattr(BacktestCoordinator, "_get_minute_bars", fake_get_minute_bars)

    # Patch reconciliation service and event logging to no-ops
    import app.services.strategies.order_executor as order_executor_module
    monkeypatch.setattr(order_executor_module, "get_reconciliation_service", lambda: None)

    from app.services.events import event_service

    async def noop_event(*args, **kwargs):
        return None

    monkeypatch.setattr(event_service, "log_strategy_engine_event", noop_event)

    # Seed database with fund and screening criteria
    async with session_factory() as session:
        screener = ScreeningCriteria(
            id="criteria-test",
            name="Test Screener",
            criteria={"limit": 5},
        )
        session.add(screener)

        fund = Fund(
            id="fund-test",
            name="Test Fund",
            mode="sim",
            balance=10000.0,
            strategy_id="four_red_candles",
            strategy_config={},
            screening_criteria_id=screener.id,
            size_per_trade=1000.0,
            trading_start_time="09:30",
            trading_end_time="16:00",
            timezone="America/New_York",
            status="paused",
        )
        session.add(fund)
        await session.commit()

    coordinator = BacktestCoordinator()
    backtest_date = date(2024, 1, 2)

    backtest_id = await coordinator.run_backtest(
        "fund-test",
        backtest_date,
        monitoring_interval_minutes=1,
        duration_minutes=10,
    )

    async with session_factory() as session:
        backtest = await session.get(Backtest, backtest_id)
        assert backtest is not None
        assert backtest.status == "completed"
        assert backtest.total_trades == 1

        orders = (await session.execute(select(Order).where(Order.backtest_id == backtest_id))).scalars().all()
        assert orders, "expected at least one order"
        assert any(order.status == "filled" and order.side == "buy" for order in orders)

        transactions = (
            await session.execute(select(Transaction).where(Transaction.backtest_id == backtest_id))
        ).scalars().all()
        assert transactions, "expected transactions recorded for backtest"

        trades = (await session.execute(select(Trade).where(Trade.backtest_id == backtest_id))).scalars().all()
        assert len(trades) == 1
        trade = trades[0]
        assert trade.entry_price > 0
        assert trade.entry_quantity > 0


