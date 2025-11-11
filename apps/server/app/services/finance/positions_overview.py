"""
Positions overview helpers.

Provides aggregated position data grouped by symbol across all funds so the
web experience can highlight cross-fund exposure and potential reconciliation
issues.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import Any, Dict, List

from sqlalchemy import select

from app.models.strategies import Fund, Position
from app.services.core.database import get_async_session
from app.services.market.price_service import get_price_service
from app.services.trading.constants import FLOAT_COMPARISON_EPSILON

logger = logging.getLogger(__name__)


@dataclass
class FundPositionRow:
    fund_id: str
    fund_name: str
    fund_mode: str
    fund_status: str
    icon: str | None
    icon_color: str | None
    ticker: str | None
    quantity: float
    avg_entry_price: float
    cost_basis: float
    updated_at: str | None
    market_value: float | None = None
    unrealized_pl: float | None = None
    unrealized_pl_percent: float | None = None


@dataclass
class SymbolPositions:
    symbol: str
    latest_price: float | None
    total_quantity: float
    total_cost_basis: float
    total_market_value: float | None
    total_unrealized_pl: float | None
    total_unrealized_pl_percent: float | None
    funds: List[FundPositionRow]


async def get_grouped_open_positions() -> List[Dict[str, Any]]:
    """
    Collect all open positions grouped by symbol across funds.

    Returns:
        List of dictionaries sorted by symbol where each entry contains:
            - symbol
            - latest_price
            - aggregated totals
            - list of per-fund position details
    """
    async with get_async_session() as session:
        stmt = (
            select(
                Position.symbol,
                Position.fund_id,
                Position.quantity,
                Position.avg_entry_price,
                Position.cost_basis,
                Position.updated_at,
                Fund.name,
                Fund.status,
                Fund.mode,
                Fund.icon,
                Fund.icon_color,
                Fund.ticker,
            )
            .join(Fund, Position.fund_id == Fund.id)
            .where(Position.quantity > FLOAT_COMPARISON_EPSILON)
        )

        result = await session.execute(stmt)
        rows = result.all()

    if not rows:
        return []

    symbols = sorted({row.symbol for row in rows})
    price_service = get_price_service()
    latest_prices = await price_service.get_latest_prices_batch(symbols)

    grouped: Dict[str, List[FundPositionRow]] = defaultdict(list)
    for row in rows:
        updated_at_iso = row.updated_at.isoformat() if row.updated_at else None
        latest_price = latest_prices.get(row.symbol)

        market_value = None
        unrealized_pl = None
        unrealized_pl_percent = None
        if latest_price is not None:
            market_value = latest_price * float(row.quantity)
            unrealized_pl = market_value - float(row.cost_basis)
            if row.cost_basis:
                unrealized_pl_percent = (
                    (market_value - float(row.cost_basis)) / float(row.cost_basis) * 100
                )

        grouped[row.symbol].append(
            FundPositionRow(
                fund_id=row.fund_id,
                fund_name=row.name,
                fund_mode=row.mode,
                fund_status=row.status,
                icon=row.icon,
                icon_color=row.icon_color,
                ticker=row.ticker,
                quantity=float(row.quantity),
                avg_entry_price=float(row.avg_entry_price),
                cost_basis=float(row.cost_basis),
                updated_at=updated_at_iso,
                market_value=market_value,
                unrealized_pl=unrealized_pl,
                unrealized_pl_percent=unrealized_pl_percent,
            )
        )

    overview: List[Dict[str, Any]] = []
    for symbol in sorted(grouped.keys()):
        latest_price = latest_prices.get(symbol)
        fund_rows = grouped[symbol]
        fund_rows_sorted = sorted(
            fund_rows,
            key=lambda row: (
                (row.fund_name or "").lower(),
                row.fund_id,
            ),
        )

        total_quantity = sum(row.quantity for row in fund_rows)
        total_cost_basis = sum(row.cost_basis for row in fund_rows)

        total_market_value = None
        total_unrealized_pl = None
        total_unrealized_pl_percent = None
        if latest_price is not None:
            total_market_value = latest_price * total_quantity
            total_unrealized_pl = total_market_value - total_cost_basis
            if total_cost_basis:
                total_unrealized_pl_percent = (
                    total_unrealized_pl / total_cost_basis
                ) * 100

        overview.append(
            asdict(
                SymbolPositions(
                    symbol=symbol,
                    latest_price=latest_price,
                    total_quantity=total_quantity,
                    total_cost_basis=total_cost_basis,
                    total_market_value=total_market_value,
                    total_unrealized_pl=total_unrealized_pl,
                    total_unrealized_pl_percent=total_unrealized_pl_percent,
                    funds=[row for row in fund_rows_sorted],
                )
            )
        )

    return overview


