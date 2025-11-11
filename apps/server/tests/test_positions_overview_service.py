"""
Tests for grouped positions overview helper.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.models.strategies import Position
from app.services.finance.positions_overview import get_grouped_open_positions
from tests.test_builders import build_fund


@pytest.mark.asyncio
async def test_get_grouped_open_positions_returns_grouped_data(async_session):
    """Grouped positions helper returns totals and per-fund breakdown sorted by symbol and fund name."""
    fund_alpha = build_fund(name="Alpha Fund")
    fund_bravo = build_fund(name="Bravo Fund")

    async_session.add_all([fund_alpha, fund_bravo])

    positions = [
        Position(
            id=str(uuid.uuid4()),
            fund_id=fund_alpha.id,
            symbol="AAPL",
            trade_id=None,
            quantity=5.0,
            avg_entry_price=100.0,
            cost_basis=500.0,
        ),
        Position(
            id=str(uuid.uuid4()),
            fund_id=fund_bravo.id,
            symbol="AAPL",
            trade_id=None,
            quantity=3.0,
            avg_entry_price=120.0,
            cost_basis=360.0,
        ),
        Position(
            id=str(uuid.uuid4()),
            fund_id=fund_alpha.id,
            symbol="MSFT",
            trade_id=None,
            quantity=2.0,
            avg_entry_price=200.0,
            cost_basis=400.0,
        ),
        # Quantity is zero - should be filtered out
        Position(
            id=str(uuid.uuid4()),
            fund_id=fund_alpha.id,
            symbol="TSLA",
            trade_id=None,
            quantity=0.0,
            avg_entry_price=250.0,
            cost_basis=0.0,
        ),
    ]

    async_session.add_all(positions)
    await async_session.commit()

    mock_price_service = AsyncMock()
    mock_price_service.get_latest_prices_batch = AsyncMock(
        return_value={
            "AAPL": 120.0,
            "MSFT": 250.0,
        }
    )

    with patch(
        "app.services.finance.positions_overview.get_async_session"
    ) as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch(
            "app.services.finance.positions_overview.get_price_service",
            return_value=mock_price_service,
        ):
            grouped_positions = await get_grouped_open_positions()

    assert [group["symbol"] for group in grouped_positions] == ["AAPL", "MSFT"]

    aapl_group = grouped_positions[0]
    assert aapl_group["total_quantity"] == pytest.approx(8.0)
    assert aapl_group["total_cost_basis"] == pytest.approx(860.0)
    assert aapl_group["total_market_value"] == pytest.approx(960.0)
    assert aapl_group["total_unrealized_pl"] == pytest.approx(100.0)
    assert aapl_group["total_unrealized_pl_percent"] == pytest.approx(
        (100.0 / 860.0) * 100
    )

    funds = aapl_group["funds"]
    assert [fund["fund_name"] for fund in funds] == ["Alpha Fund", "Bravo Fund"]
    alpha_row = next(fund for fund in funds if fund["fund_id"] == fund_alpha.id)
    bravo_row = next(fund for fund in funds if fund["fund_id"] == fund_bravo.id)

    assert alpha_row["quantity"] == pytest.approx(5.0)
    assert alpha_row["cost_basis"] == pytest.approx(500.0)
    assert alpha_row["market_value"] == pytest.approx(600.0)
    assert alpha_row["unrealized_pl"] == pytest.approx(100.0)
    assert alpha_row["unrealized_pl_percent"] == pytest.approx(20.0)

    assert bravo_row["quantity"] == pytest.approx(3.0)
    assert bravo_row["cost_basis"] == pytest.approx(360.0)
    assert bravo_row["market_value"] == pytest.approx(360.0)
    assert bravo_row["unrealized_pl"] == pytest.approx(0.0)
    assert bravo_row["unrealized_pl_percent"] == pytest.approx(0.0)

    msft_group = grouped_positions[1]
    assert msft_group["total_quantity"] == pytest.approx(2.0)
    assert msft_group["funds"][0]["fund_id"] == fund_alpha.id
    assert msft_group["funds"][0]["unrealized_pl"] == pytest.approx(100.0)


@pytest.mark.asyncio
async def test_get_grouped_open_positions_empty(async_session):
    """No positions returns empty list without querying prices."""
    mock_price_service = AsyncMock()
    mock_price_service.get_latest_prices_batch = AsyncMock(return_value={})

    with patch(
        "app.services.finance.positions_overview.get_async_session"
    ) as mock_session:
        mock_session.return_value.__aenter__.return_value = async_session
        with patch(
            "app.services.finance.positions_overview.get_price_service",
            return_value=mock_price_service,
        ):
            grouped_positions = await get_grouped_open_positions()

    assert grouped_positions == []
    mock_price_service.get_latest_prices_batch.assert_not_called()


