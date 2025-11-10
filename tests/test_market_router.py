"""Tests for market router historical bars endpoint."""

from __future__ import annotations

import sqlite3
import sys
import types
import typing
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_ROOT = PROJECT_ROOT / "apps" / "server"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))


# Provide minimal stubs for optional dependencies used only for typing
if "app.lib" not in sys.modules:
    lib_module = types.ModuleType("app.lib")
    lib_module.__path__ = []  # mark as package
    sys.modules["app.lib"] = lib_module

if "app.lib.dependencies" not in sys.modules:
    deps_module = types.ModuleType("app.lib.dependencies")
    deps_module.PolygonClient = typing.Any
    deps_module.PolygonClientNoPagination = typing.Any
    sys.modules["app.lib.dependencies"] = deps_module


from app.models.market_data import Base, MarketData
from app.routers.market import get_historical_bars, router as market_router
from app.services.core import database as database_module


@pytest_asyncio.fixture(scope="module")
async def test_engine():
    """Create an in-memory SQLite engine for API tests."""

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={
            "check_same_thread": False,
            "detect_types": sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        },
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(test_engine):
    """Async session factory bound to the test engine."""

    return async_sessionmaker(
        test_engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )


@pytest_asyncio.fixture
async def db_session(session_factory):
    """Yield an async session for preparing test data."""

    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def api_client(session_factory, monkeypatch):
    """FastAPI test client with database session override."""

    @asynccontextmanager
    async def override_get_async_session():
        async with session_factory() as session:
            yield session

    monkeypatch.setattr(
        database_module,
        "get_async_session",
        override_get_async_session,
        raising=False,
    )

    app = FastAPI()
    app.include_router(market_router, prefix="/api/market")

    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_get_historical_bars_includes_metrics(api_client, db_session, session_factory):
    """Ensure the bars endpoint returns calculated metrics in the payload."""

    bar_time = datetime(2024, 1, 1, 15, 30)

    sample_bar = MarketData(
        time=bar_time,
        symbol="AAPL",
        timescale="1min",
        open=Decimal("100.0"),
        high=Decimal("101.0"),
        low=Decimal("99.5"),
        close=Decimal("100.5"),
        volume=1_000,
        vwap=Decimal("100.4"),
        trade_count=120,
        ema_12=Decimal("100.2"),
        ema_26=Decimal("100.1"),
        macd_line=Decimal("0.1"),
        macd_signal=Decimal("0.05"),
        macd_histogram=Decimal("0.05"),
        rsi_14=Decimal("55.5"),
        volume_ma_20=Decimal("1.5"),
    )

    db_session.add(sample_bar)
    await db_session.commit()

    async with session_factory() as verify_session:
        result = await verify_session.execute(
            select(MarketData.time, MarketData.symbol, MarketData.timescale)
        )
        row = result.first()
        assert row is not None
        assert row.time == bar_time

    start_time = bar_time - timedelta(minutes=5)
    end_time = bar_time + timedelta(minutes=5)

    direct_result = await get_historical_bars(
        symbol="AAPL",
        from_time=start_time.isoformat(sep=" "),
        to_time=end_time.isoformat(sep=" "),
        timeframe="1m",
        limit=10,
    )
    assert direct_result["count"] == 1

    response = await api_client.get(
        "/api/market/bars/AAPL",
        params={
            "from_time": start_time.isoformat(sep=" "),
            "to_time": end_time.isoformat(sep=" "),
            "timeframe": "1m",
            "limit": 10,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["symbol"] == "AAPL"
    assert payload["count"] == 1
    assert payload["bars"], "Expected bar data in API response"

    bar = payload["bars"][0]
    metrics = bar.get("metrics", {})
    assert metrics, "Expected metrics to be present in bar payload"
    assert metrics["ema_12"] == pytest.approx(100.2)
    assert metrics["macd_line"] == pytest.approx(0.1)
    assert metrics["volume_ma_20"] == pytest.approx(1.5)
    assert metrics["rsi_14"] == pytest.approx(55.5)
