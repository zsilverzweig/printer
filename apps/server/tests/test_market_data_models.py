"""
Tests for TimescaleDB market data models.

Tests the basic model structure and validation tracking.
"""
import pytest
from datetime import date, datetime, timezone

from app.models.market_data import MarketData, SymbolDateValidation


def test_market_data_minute_creation():
    """Test creating a MarketData instance."""
    bar = MarketData(
        time=datetime(2025, 11, 1, 9, 30, 0, tzinfo=timezone.utc),
        symbol="AAPL",
        open=150.0,
        high=151.0,
        low=149.5,
        close=150.5,
        volume=1000000,
        vwap=150.3,
        trade_count=500,
        session_type="regular"
    )
    
    assert bar.symbol == "AAPL"
    assert bar.open == 150.0
    assert bar.volume == 1000000
    assert bar.session_type == "regular"


def test_symbol_date_validation_creation():
    """Test creating a SymbolDateValidation instance."""
    validation = SymbolDateValidation(
        symbol="TSLA",
        date=date(2025, 11, 1),
        first_bar_time=datetime(2025, 11, 1, 9, 30, tzinfo=timezone.utc),
        last_bar_time=datetime(2025, 11, 1, 16, 0, tzinfo=timezone.utc),
        validated_at=datetime.now(timezone.utc),
        notes=None
    )
    
    assert validation.symbol == "TSLA"

    assert validation.bar_count == 390
