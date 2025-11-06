"""
Tests for Three Red Candles Strategy

Tests the entry and exit logic for the three red candles strategy.
"""

import pytest
from datetime import datetime, timezone
from typing import Dict, Any, List

from app.strategies.four_red_candles import FourRedCandlesStrategy
from app.strategies.base import MarketDataSnapshot, PositionContext
from app.lib.technical_analysis import is_red_candle


def create_bar(open_price: float, high: float, low: float, close: float, volume: int = 1000000, timestamp: int = None) -> Dict[str, Any]:
    """Helper to create a bar dict."""
    if timestamp is None:
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {
        'open': open_price,
        'high': high,
        'low': low,
        'close': close,
        'volume': volume,
        'o': open_price,
        'h': high,
        'l': low,
        'c': close,
        'v': volume,
        'timestamp': timestamp,
        't': timestamp,
    }


def create_market_data_snapshot(
    symbol: str,
    price: float,
    bars: List[Dict[str, Any]],
    timestamp: datetime = None
) -> MarketDataSnapshot:
    """Helper to create MarketDataSnapshot."""
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    return MarketDataSnapshot(
        symbol=symbol,
        price=price,
        timestamp=timestamp,
        bars=bars,
    )


class TestFourRedCandlesStrategy:
    """Test suite for FourRedCandlesStrategy."""
    
    @pytest.fixture
    def strategy(self):
        """Create strategy instance."""
        return FourRedCandlesStrategy({})
    
    # ========== Entry Analysis Tests ==========
    
    @pytest.mark.asyncio
    async def test_analyze_entry_four_red_candles_creates_entry(self, strategy):
        """Test entry creation when 3 red candles detected (regardless of current price)."""
        # Create 3 red candles (close < open)
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),  # Red: close 99.5 < open 100.0
            create_bar(99.5, 100.0, 98.5, 99.0),   # Red: close 99.0 < open 99.5
            create_bar(99.0, 99.5, 98.0, 98.5),    # Red: close 98.5 < open 99.0 (3rd candle)
        ]
        
        # Current price can be anything - entry should still be created
        current_price = 98.0  # Below entry (99.0), but entry should still be created
        
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is not None, "Should create entry level when 3 red candles detected"
        assert result.entry_price == 99.0, "Entry should be open of 3rd red candle"
        assert result.stop_loss < result.entry_price, "Stop loss should be below entry"
        assert result.order_type == "market", "Should use market order"
        assert result.confidence == 0.8, "Should have confidence of 0.8"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_four_red_candles_price_above_entry(self, strategy):
        """Test entry creation when price is above entry (engine will execute immediately)."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),
            create_bar(99.5, 100.0, 98.5, 99.0),
            create_bar(99.0, 99.5, 98.0, 98.5),  # 3rd candle open = 99.0
        ]
        
        # Current price is above entry
        current_price = 99.5  # Above entry (99.0)
        
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is not None, "Should create entry when 3 reds detected, even if price above entry"
        assert result.entry_price == 99.0, "Entry should be open of 3rd red candle"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_four_red_candles_price_below_entry(self, strategy):
        """Test entry creation when price is below entry (engine will wait for price to cross above)."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),
            create_bar(99.5, 100.0, 98.5, 99.0),
            create_bar(99.0, 99.5, 98.0, 98.5),  # 3rd candle open = 99.0
        ]
        
        # Current price is below entry
        current_price = 98.5  # Below entry (99.0)
        
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is not None, "Should create entry when 3 reds detected, even if price below entry"
        assert result.entry_price == 99.0, "Entry should be open of 3rd red candle"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_two_red_candles(self, strategy):
        """Test that entry is NOT created with only 2 red candles."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),  # Red
            create_bar(99.5, 100.0, 98.5, 99.0),   # Red
            # Missing 3rd red candle
        ]
        
        current_price = 100.0
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is None, "Should NOT create entry with only 2 red candles"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_mixed_candles(self, strategy):
        """Test that entry is NOT created when candles are not all red."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),  # Red
            create_bar(99.5, 100.0, 98.5, 99.0),   # Red
            create_bar(99.0, 100.5, 98.0, 100.0),  # Green: close 100.0 > open 99.0
        ]
        
        current_price = 101.0
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is None, "Should NOT create entry when not all 3 candles are red"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_insufficient_bars(self, strategy):
        """Test that entry is NOT created with insufficient bars."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),
            create_bar(99.5, 100.0, 98.5, 99.0),
            # Only 2 bars
        ]
        
        current_price = 100.0
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is None, "Should NOT create entry with insufficient bars"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_no_bars(self, strategy):
        """Test that entry is NOT created with no bars."""
        market_data = create_market_data_snapshot("TEST", 100.0, [])
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is None, "Should NOT create entry with no bars"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_stop_loss_calculation(self, strategy):
        """Test that stop loss is calculated correctly (2% below entry by default)."""
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),
            create_bar(99.5, 100.0, 98.5, 99.0),
            create_bar(99.0, 99.5, 98.0, 98.5),  # Entry = 99.0
        ]
        
        current_price = 99.5  # Above entry
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await strategy.analyze_entry("TEST", market_data)
        
        assert result is not None
        expected_stop = 99.0 * 0.98  # 2% below entry
        assert abs(result.stop_loss - expected_stop) < 0.01, f"Stop loss should be 2% below entry: expected {expected_stop}, got {result.stop_loss}"
    
    @pytest.mark.asyncio
    async def test_analyze_entry_custom_stop_loss_percent(self, strategy):
        """Test that custom stop loss percent is used when configured."""
        custom_strategy = FourRedCandlesStrategy({"stop_loss_percent": 5.0})  # 5% stop
        
        bars = [
            create_bar(100.0, 101.0, 99.0, 99.5),
            create_bar(99.5, 100.0, 98.5, 99.0),
            create_bar(99.0, 99.5, 98.0, 98.5),  # Entry = 99.0
        ]
        
        current_price = 99.5
        market_data = create_market_data_snapshot("TEST", current_price, bars)
        
        result = await custom_strategy.analyze_entry("TEST", market_data)
        
        assert result is not None
        expected_stop = 99.0 * 0.95  # 5% below entry
        assert abs(result.stop_loss - expected_stop) < 0.01, f"Stop loss should be 5% below entry: expected {expected_stop}, got {result.stop_loss}"
    
    # ========== Exit/Position Management Tests ==========
    
    @pytest.mark.asyncio
    async def test_manage_position_exit_on_red_candle(self, strategy):
        """Test that position exits when a red 1-minute candle closes."""
        # Create position context
        position = PositionContext(
            symbol="TEST",
            entry_price=98.5,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=99.0,
            unrealized_pnl=50.0,
            unrealized_pnl_percent=0.51,
            strategy_state={"stop_loss": 96.5}
        )
        
        # Market data with red candle (most recent)
        bars = [
            create_bar(99.0, 99.5, 98.5, 98.8),  # Green
            create_bar(98.8, 99.0, 98.0, 98.5),  # Red: close 98.5 < open 98.8
        ]
        
        market_data = create_market_data_snapshot("TEST", 98.5, bars)
        
        result = await strategy.manage_position(position, market_data)
        
        assert result.force_exit is True, "Should force exit on red candle"
        assert result.exit_reason == "red_1min_candle_close", "Should have correct exit reason"
        assert result.current_stop == position.current_price, "Stop should be set to current price to trigger exit"
    
    @pytest.mark.asyncio
    async def test_manage_position_no_exit_on_green_candle(self, strategy):
        """Test that position does NOT exit when candle is green."""
        position = PositionContext(
            symbol="TEST",
            entry_price=98.5,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=99.0,
            unrealized_pnl=50.0,
            unrealized_pnl_percent=0.51,
            strategy_state={"stop_loss": 96.5}
        )
        
        # Market data with green candle (most recent)
        bars = [
            create_bar(99.0, 99.5, 98.5, 98.8),  # Green
            create_bar(98.8, 99.5, 98.5, 99.2),  # Green: close 99.2 > open 98.8
        ]
        
        market_data = create_market_data_snapshot("TEST", 99.2, bars)
        
        result = await strategy.manage_position(position, market_data)
        
        assert result.force_exit is False, "Should NOT exit on green candle"
        assert result.exit_reason is None, "Should not have exit reason"
        assert result.current_stop == 96.5, "Should maintain current stop"
    
    @pytest.mark.asyncio
    async def test_manage_position_insufficient_bars(self, strategy):
        """Test that position management handles insufficient bars gracefully."""
        position = PositionContext(
            symbol="TEST",
            entry_price=98.5,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=99.0,
            unrealized_pnl=50.0,
            unrealized_pnl_percent=0.51,
            strategy_state={"stop_loss": 96.5}
        )
        
        # Only 1 bar (need at least 2)
        bars = [create_bar(99.0, 99.5, 98.5, 98.8)]
        market_data = create_market_data_snapshot("TEST", 99.0, bars)
        
        result = await strategy.manage_position(position, market_data)
        
        assert result.force_exit is False, "Should NOT exit with insufficient bars"
        assert result.current_stop == 96.5, "Should maintain current stop"
    
    @pytest.mark.asyncio
    async def test_manage_position_no_bars(self, strategy):
        """Test that position management handles no bars gracefully."""
        position = PositionContext(
            symbol="TEST",
            entry_price=98.5,
            entry_time=datetime.now(timezone.utc),
            quantity=100.0,
            current_price=99.0,
            unrealized_pnl=50.0,
            unrealized_pnl_percent=0.51,
            strategy_state={"stop_loss": 96.5}
        )
        
        market_data = create_market_data_snapshot("TEST", 99.0, [])
        
        result = await strategy.manage_position(position, market_data)
        
        assert result.force_exit is False, "Should NOT exit with no bars"
        assert result.current_stop == 96.5, "Should maintain current stop"
    
    # ========== Helper Function Tests ==========
    
    def test_is_red_candle(self):
        """Test the is_red_candle helper function."""
        # Red candle: close < open
        red_bar = create_bar(100.0, 101.0, 99.0, 99.5)
        assert is_red_candle(red_bar) is True, "Should identify red candle"
        
        # Green candle: close > open
        green_bar = create_bar(100.0, 101.0, 99.0, 100.5)
        assert is_red_candle(green_bar) is False, "Should identify green candle"
        
        # Doji: close == open
        doji_bar = create_bar(100.0, 101.0, 99.0, 100.0)
        assert is_red_candle(doji_bar) is False, "Doji should not be red"
    
    def test_is_red_candle_alternative_keys(self):
        """Test is_red_candle with alternative key names (o, c instead of open, close)."""
        bar_with_alt_keys = {
            'o': 100.0,
            'h': 101.0,
            'l': 99.0,
            'c': 99.5,  # close < open
        }
        assert is_red_candle(bar_with_alt_keys) is True, "Should work with o/c keys"
    
    # ========== Strategy Metadata Tests ==========
    
    def test_strategy_properties(self, strategy):
        """Test strategy metadata properties."""
        assert strategy.id == "four_red_candles"
        assert strategy.name == "Three Red Candles"
        assert strategy.strategy_type == "math-based"
        assert strategy.expected_timeframe == "1-5 minutes"
        assert strategy.requires_setup is False
    
    def test_strategy_description(self, strategy):
        """Test strategy description."""
        desc = strategy.description
        assert "3 consecutive red 1-minute candles" in desc
        assert "open of the 3rd red candle" in desc
        assert "Engine subscribes and executes buy when price crosses above entry" in desc
        assert "red 1-minute candle close" in desc

