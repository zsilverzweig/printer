"""
Tests for BackgroundMetricsLoader.
"""

import asyncio
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.market.background_metrics_loader import BackgroundMetricsLoader, ProcessingStats
from app.models.market_data import MarketData
from app.services.market.metrics_calculator import METRIC_FIELDS


class TestBackgroundMetricsLoader:
    """Test the BackgroundMetricsLoader service."""

    @pytest.fixture
    def loader(self):
        """Create a test loader."""
        return BackgroundMetricsLoader(
            batch_size=10,
            max_concurrent_symbols=1,
        )

    @pytest.fixture
    def sample_bar(self):
        """Create a sample market data bar."""
        return MarketData(
            time=datetime(2024, 1, 1, 10, 0, tzinfo=timezone.utc),
            symbol="AAPL",
            timescale="5min",
            open=150.0,
            high=151.0,
            low=149.0,
            close=150.5,
            volume=1000,
            vwap=150.25,
            trade_count=100,
        )

    def test_initialization(self, loader):
        """Test loader initialization."""
        assert loader.batch_size == 10
        assert hasattr(loader, '_calculator')


    def test_processing_stats(self):
        """Test ProcessingStats dataclass."""
        stats = ProcessingStats()
        assert stats.symbols_scanned == 0
        assert stats.bars_processed == 0
        assert stats.metrics_calculated == 0
        assert stats.database_updates == 0
        assert stats.errors == 0

        # Test with values
        stats = ProcessingStats(
            symbols_scanned=5,
            bars_processed=100,
            metrics_calculated=2100,  # 100 bars * 21 metrics
            database_updates=1,
            errors=2,
        )
        assert stats.symbols_scanned == 5
        assert stats.bars_processed == 100
        assert stats.metrics_calculated == 2100
        assert stats.database_updates == 1
        assert stats.errors == 2

    def test_update_bar_metrics(self, loader, sample_bar):
        """Test updating bar metrics."""
        metrics = {
            "ema_12": 150.2,
            "ema_26": 149.8,
            "rsi_14": 55.0,
            "bb_upper": 152.0,
            "bb_middle": 150.5,
            "bb_lower": 149.0,
        }

        # Initially all metrics should be None
        for field in METRIC_FIELDS:
            assert getattr(sample_bar, field) is None

        # Update metrics
        loader._update_bar_metrics(sample_bar, metrics)

        # Check that specified metrics were set
        from decimal import Decimal
        assert sample_bar.ema_12 == Decimal('150.2')
        assert sample_bar.ema_26 == Decimal('149.8')
        assert sample_bar.rsi_14 == Decimal('55.0')
        assert sample_bar.bb_upper == Decimal('152.0')
        assert sample_bar.bb_middle == Decimal('150.5')
        assert sample_bar.bb_lower == Decimal('149.0')

        # Check that unspecified metrics remain None
        assert sample_bar.ema_50 is None
        assert sample_bar.ema_200 is None
        assert sample_bar.macd_line is None

    @pytest.mark.asyncio
    async def test_process_cycle_no_targets(self, loader):
        """Test processing cycle when no targets are found."""
        # Mock _find_targets to return empty list
        loader._find_targets = AsyncMock(return_value=[])

        stats = await loader._process_cycle()

        assert stats.symbols_scanned == 0
        assert stats.bars_processed == 0
        assert stats.errors == 0

        # Should not have called _process_symbol
        loader._find_targets.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_cycle_with_targets(self, loader):
        """Test processing cycle with targets."""
        # Mock dependencies
        loader._find_targets = AsyncMock(return_value=[
            ("AAPL", "1day", 100),
            ("TSLA", "1day", 50),
        ])
        loader._process_symbol = AsyncMock(side_effect=[25, 30])  # Return processed counts

        stats = await loader._process_cycle()

        assert stats.symbols_scanned == 2
        assert stats.bars_processed == 55  # 25 + 30
        assert stats.errors == 0

        # Should have called _process_symbol for each target
        assert loader._process_symbol.call_count == 2
        loader._process_symbol.assert_any_call("AAPL", "1day")
        loader._process_symbol.assert_any_call("TSLA", "1day")

    @pytest.mark.asyncio
    async def test_process_cycle_with_errors(self, loader):
        """Test processing cycle with errors."""
        # Mock dependencies
        loader._find_targets = AsyncMock(return_value=[
            ("AAPL", "1day", 100),
            ("TSLA", "1day", 50),
        ])
        loader._process_symbol = AsyncMock(side_effect=[Exception("Test error"), 30])

        stats = await loader._process_cycle()

        assert stats.symbols_scanned == 2
        assert stats.bars_processed == 30  # Only second call succeeded
        assert stats.errors == 1

    @pytest.mark.asyncio
    async def test_process_symbol_no_bars(self, loader):
        """Test processing symbol with no missing bars."""
        loader._find_missing_bars = AsyncMock(return_value=[])
        loader._seed_calculator = AsyncMock()

        result = await loader._process_symbol("AAPL", "1day")

        assert result == 0
        loader._find_missing_bars.assert_called_once_with("AAPL", "1day")
        loader._seed_calculator.assert_not_called()  # No bars to seed for

    # Note: Integration test for _process_symbol_with_bars would require full database mocking
    # The core functionality is tested through the other unit tests above
