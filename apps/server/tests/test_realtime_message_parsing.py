"""
Tests for Polygon WebSocket message parsing.

Tests the message parser that converts Polygon format to our models.
"""
import pytest
from datetime import datetime, timezone

from app.services.market.realtime_ingestion import RealtimeIngestionService


@pytest.fixture
def ingestion_service():
    """Create a test ingestion service."""
    return RealtimeIngestionService(
        api_key="test_key",
        batch_interval_seconds=10,
        enable_validation=False
    )


def test_parse_valid_minute_bar(ingestion_service):
    """Test parsing a valid Polygon AM (minute aggregate) message."""
    msg = {
        "ev": "AM",
        "sym": "AAPL",
        "v": 1000000,
        "o": 150.0,
        "h": 151.0,
        "l": 149.5,
        "c": 150.5,
        "vw": 150.3,
        "s": 1698854400000,  # Start timestamp
        "n": 500
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is not None
    assert bar.symbol == "AAPL"
    assert bar.open == 150.0
    assert bar.high == 151.0
    assert bar.low == 149.5
    assert bar.close == 150.5
    assert bar.volume == 1000000
    assert bar.vwap == 150.3
    assert bar.trade_count == 500
    assert bar.session_type == "regular"


def test_parse_message_with_alternate_fields(ingestion_service):
    """Test parsing message with alternate field names."""
    msg = {
        "event_type": "A.M",  # Alternate format
        "symbol": "TSLA",  # Alternate field name
        "v": 500000,
        "op": 200.0,  # Alternate open field
        "h": 202.0,
        "l": 199.0,
        "c": 201.0,
        "a": 200.5,  # Alternate VWAP field
        "e": 1698854400000,  # End timestamp (fallback)
        "n": 300
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is not None
    assert bar.symbol == "TSLA"
    assert bar.open == 200.0
    assert bar.vwap == 200.5


def test_parse_message_missing_required_fields(ingestion_service):
    """Test that messages missing required fields return None."""
    # Missing OHLC data
    msg = {
        "ev": "AM",
        "sym": "AAPL",
        "v": 1000000,
        "s": 1698854400000
        # Missing o, h, l, c
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is None


def test_parse_message_wrong_event_type(ingestion_service):
    """Test that non-aggregate messages are ignored."""
    msg = {
        "ev": "T",  # Trade event, not aggregate
        "sym": "AAPL",
        "p": 150.0,
        "s": 100
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is None


def test_parse_message_missing_symbol(ingestion_service):
    """Test that messages without symbol are rejected."""
    msg = {
        "ev": "AM",
        # No sym field
        "v": 1000000,
        "o": 150.0,
        "h": 151.0,
        "l": 149.5,
        "c": 150.5,
        "s": 1698854400000
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is None


def test_parse_message_symbol_uppercase(ingestion_service):
    """Test that symbols are converted to uppercase."""
    msg = {
        "ev": "AM",
        "sym": "aapl",  # Lowercase
        "v": 1000000,
        "o": 150.0,
        "h": 151.0,
        "l": 149.5,
        "c": 150.5,
        "s": 1698854400000,
        "n": 500
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is not None
    assert bar.symbol == "AAPL"  # Should be uppercase


def test_parse_message_with_optional_fields_none(ingestion_service):
    """Test parsing when optional fields are None."""
    msg = {
        "ev": "AM",
        "sym": "NVDA",
        "v": 2000000,
        "o": 300.0,
        "h": 305.0,
        "l": 299.0,
        "c": 303.0,
        "s": 1698854400000
        # vw and n are optional
    }
    
    bar = ingestion_service._parse_polygon_message(msg)
    
    assert bar is not None
    assert bar.symbol == "NVDA"
    assert bar.vwap is None
    assert bar.trade_count is None

