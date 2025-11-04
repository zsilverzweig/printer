"""
Trading Hours & Timezone Tests

Tests that time window restrictions are properly enforced:
- Orders only placed during trading_start_time to trading_end_time
- Timezone conversions work correctly (America/New_York, UTC, etc.)
- Exit monitoring continues outside trading hours (can close, not open)
- DST transitions handled correctly

These tests are designed to identify timezone bugs and trading hour enforcement issues.
Many tests may FAIL initially - that's expected and helps document issues.
"""

import pytest
from datetime import datetime, time as dt_time
from unittest.mock import AsyncMock, Mock, patch
import pytz

from tests.test_builders import build_fund, build_position_context, build_market_data
from tests.test_assertions import assert_trading_hours_respected


def test_trading_hours_respected_within_window(fund_factory):
    """
    Test that trading is allowed within configured trading hours.
    
    Expected: Trading should be allowed between trading_start_time and trading_end_time.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # Create time at 10:30 AM ET (within window)
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 10, 30))  # Monday 10:30 AM
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_trading_hours_respected_before_window(fund_factory):
    """
    Test that trading is blocked before trading hours.
    
    Expected: Trading should be blocked before trading_start_time.
    
    This test will likely FAIL if trading hour checks are not implemented.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # Create time at 9:00 AM ET (before window)
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 9, 0))  # Monday 9:00 AM
    
    # Should not allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=False)


def test_trading_hours_respected_after_window(fund_factory):
    """
    Test that trading is blocked after trading hours.
    
    Expected: Trading should be blocked after trading_end_time.
    
    This test will likely FAIL if trading hour checks are not implemented.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # Create time at 4:30 PM ET (after window)
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 16, 30))  # Monday 4:30 PM
    
    # Should not allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=False)


def test_no_trading_hours_always_allows(fund_factory):
    """
    Test that funds without trading hours configured can trade anytime.
    
    Expected: If trading_start_time and trading_end_time are None,
    trading should be allowed 24/7.
    """
    fund = fund_factory(
        trading_start_time=None,
        trading_end_time=None,
        timezone=None
    )
    
    # Any time should work
    test_time = datetime(2024, 1, 15, 3, 0)  # 3 AM
    
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_utc_to_eastern_conversion(fund_factory):
    """
    Test that UTC times are correctly converted to Eastern time.
    
    Expected: A UTC time should be converted to ET for trading hour checks.
    
    This test will likely FAIL if timezone conversion is broken.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # 10:30 AM ET = 3:30 PM UTC (during EST, -5 hours)
    utc_time = pytz.UTC.localize(datetime(2024, 1, 15, 15, 30))
    
    # Should allow trading (10:30 AM ET is within window)
    assert_trading_hours_respected(fund, utc_time, should_allow_trading=True)


def test_utc_to_eastern_conversion_before_hours(fund_factory):
    """
    Test UTC to ET conversion when before trading hours.
    
    Expected: UTC time that converts to before trading hours should block trading.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # 9:00 AM ET = 2:00 PM UTC (during EST, -5 hours)
    utc_time = pytz.UTC.localize(datetime(2024, 1, 15, 14, 0))
    
    # Should not allow trading (9:00 AM ET is before 9:30 AM window)
    assert_trading_hours_respected(fund, utc_time, should_allow_trading=False)


@pytest.mark.asyncio
async def test_strategy_engine_respects_trading_hours():
    """
    Test that StrategyEngine._is_trading_time correctly checks trading hours.
    
    This tests the actual implementation in StrategyEngine.
    """
    from app.services.strategies.strategy_engine import StrategyEngine
    
    fund = build_fund(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    # Create a minimal mock engine
    mock_market_data = Mock()
    mock_alpaca = Mock(paper_trading=True)
    mock_strategy = Mock()
    
    engine = StrategyEngine(
        fund=fund,
        execution_strategy=mock_strategy,
        market_data_provider=mock_market_data,
        alpaca_service=mock_alpaca,
    )
    
    # Test with mocked time - patch in risk_manager where it's actually used
    with patch('app.services.strategies.risk_manager.datetime') as mock_datetime:
        ny_tz = pytz.timezone("America/New_York")
        
        # Test during trading hours (10:30 AM ET)
        mock_datetime.now.return_value = ny_tz.localize(datetime(2024, 1, 15, 10, 30))
        assert engine._is_trading_time() is True, "Should allow trading at 10:30 AM ET"
        
        # Test before trading hours (9:00 AM ET)
        mock_datetime.now.return_value = ny_tz.localize(datetime(2024, 1, 15, 9, 0))
        assert engine._is_trading_time() is False, "Should not allow trading at 9:00 AM ET"
        
        # Test after trading hours (4:30 PM ET)
        mock_datetime.now.return_value = ny_tz.localize(datetime(2024, 1, 15, 16, 30))
        assert engine._is_trading_time() is False, "Should not allow trading at 4:30 PM ET"


def test_pacific_timezone(fund_factory):
    """
    Test trading hours with Pacific timezone.
    
    Expected: Trading hours should work with any timezone, not just Eastern.
    """
    fund = fund_factory(
        trading_start_time="06:30",  # 6:30 AM PT
        trading_end_time="13:00",    # 1:00 PM PT (matches 9:30-4:00 ET)
        timezone="America/Los_Angeles"
    )
    
    # Create time at 10:30 AM PT (within window)
    pt_tz = pytz.timezone("America/Los_Angeles")
    test_time = pt_tz.localize(datetime(2024, 1, 15, 10, 30))
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_utc_timezone(fund_factory):
    """
    Test trading hours with UTC timezone.
    
    Expected: Trading hours in UTC should work correctly.
    """
    fund = fund_factory(
        trading_start_time="14:30",  # 2:30 PM UTC (9:30 AM ET during EST)
        trading_end_time="21:00",    # 9:00 PM UTC (4:00 PM ET during EST)
        timezone="UTC"
    )
    
    # Create time at 3:30 PM UTC (within window)
    utc_time = pytz.UTC.localize(datetime(2024, 1, 15, 15, 30))
    
    # Should allow trading
    assert_trading_hours_respected(fund, utc_time, should_allow_trading=True)


def test_dst_spring_forward(fund_factory):
    """
    Test that DST spring forward (2 AM -> 3 AM) is handled correctly.
    
    Expected: Trading hours should work correctly during DST transitions.
    
    In 2024, DST starts on March 10 at 2:00 AM (clocks spring forward to 3:00 AM).
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    ny_tz = pytz.timezone("America/New_York")
    
    # Test on DST transition day at 10:30 AM EDT (after spring forward)
    # Note: After DST, ET is -4 hours from UTC (EDT) instead of -5 (EST)
    test_time = ny_tz.localize(datetime(2024, 3, 10, 10, 30), is_dst=True)
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_dst_fall_back(fund_factory):
    """
    Test that DST fall back (2 AM -> 1 AM) is handled correctly.
    
    Expected: Trading hours should work correctly during DST transitions.
    
    In 2024, DST ends on November 3 at 2:00 AM (clocks fall back to 1:00 AM).
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    ny_tz = pytz.timezone("America/New_York")
    
    # Test on DST transition day at 10:30 AM EST (after fall back)
    test_time = ny_tz.localize(datetime(2024, 11, 3, 10, 30), is_dst=False)
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_edge_case_at_start_time(fund_factory):
    """
    Test trading at exactly the start time.
    
    Expected: Trading should be allowed at exactly trading_start_time.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 9, 30))  # Exactly 9:30 AM
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_edge_case_at_end_time(fund_factory):
    """
    Test trading at exactly the end time.
    
    Expected: Trading should be allowed at exactly trading_end_time.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 16, 0))  # Exactly 4:00 PM
    
    # Should allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)


def test_edge_case_one_second_after_end(fund_factory):
    """
    Test trading one second after end time.
    
    Expected: Trading should be blocked one second after trading_end_time.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone="America/New_York"
    )
    
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 16, 0, 1))  # 4:00:01 PM
    
    # Should not allow trading
    assert_trading_hours_respected(fund, test_time, should_allow_trading=False)


def test_default_timezone_is_eastern(fund_factory):
    """
    Test that default timezone is America/New_York when not specified.
    
    Expected: If timezone is None, should default to America/New_York.
    """
    fund = fund_factory(
        trading_start_time="09:30",
        trading_end_time="16:00",
        timezone=None  # Not specified
    )
    
    # The actual implementation should default to America/New_York
    # Test with Eastern time
    ny_tz = pytz.timezone("America/New_York")
    test_time = ny_tz.localize(datetime(2024, 1, 15, 10, 30))
    
    # Should allow trading (assumes default is ET)
    assert_trading_hours_respected(fund, test_time, should_allow_trading=True)

