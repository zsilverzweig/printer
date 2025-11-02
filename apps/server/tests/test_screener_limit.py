"""
Tests for screener limit functionality.

Verifies that limits are correctly applied in both live and historical modes.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, Mock

from app.services.screener.screener import ScreenerService


class TestScreenerLimit:
    """Test that screener limits are correctly applied."""
    
    @pytest.mark.asyncio
    async def test_compute_respects_limit(self):
        """Test that _compute respects the limit parameter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        # Create mock snapshot data with many items - match actual snapshot format
        # The extract_snapshot_data function expects ticker/price/volume/day fields
        mock_snaps = []
        for i in range(1000):
            mock_snaps.append({
                "ticker": f"TICKER{i}",
                "price": 100.0 + i,
                "volume": 1000000 + i,
                "day": {
                    "o": 100.0,
                    "h": 110.0,
                    "l": 90.0,
                    "c": 100.0,
                    "v": 5000000,
                },
                "exchange": "XNAS",
            })
        
        # Mock extract_snapshot_data to return the data correctly
        with patch('app.services.screener.screener.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with limit=23
            results = await screener._compute(
                snaps=mock_snaps,
                limit=23
            )
            
            assert len(results) == 23, f"Expected 23 results, got {len(results)}"
            
            # Test with limit=50
            results = await screener._compute(
                snaps=mock_snaps,
                limit=50
            )
            
            assert len(results) == 50, f"Expected 50 results, got {len(results)}"
            
            # Test with limit larger than available data
            results = await screener._compute(
                snaps=mock_snaps[:10],  # Only 10 snapshots
                limit=100
            )
            
            assert len(results) <= 10, f"Expected <= 10 results, got {len(results)}"
    
    @pytest.mark.asyncio
    async def test_compute_historical_respects_limit(self):
        """Test that compute_historical respects the limit parameter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        timestamp = datetime.now(timezone.utc) - timedelta(days=1)
        timestamp = timestamp.replace(hour=13, minute=30, second=0, microsecond=0)
        
        with patch('app.services.core.database.get_async_session') as mock_session, \
             patch('app.lib.market_queries.get_snapshot_at_time') as mock_snapshot, \
             patch('app.lib.market_queries.get_daily_context') as mock_context, \
             patch('app.lib.market_queries.get_historical_bars') as mock_bars:
            
            # Mock database session
            mock_db_session = AsyncMock()
            mock_execute_result = MagicMock()
            # Create 100 mock symbols
            mock_execute_result.all.return_value = [(f"SYMBOL{i}",) for i in range(100)]
            mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
            mock_session.return_value.__aenter__.return_value = mock_db_session
            
            # Mock snapshot data with 100 symbols
            mock_snapshot.return_value = {
                f"SYMBOL{i}": {
                    "time": timestamp,
                    "open": 100.0,
                    "high": 110.0,
                    "low": 90.0,
                    "close": 100.0,
                    "volume": 1000000
                }
                for i in range(100)
            }
            
            # Mock daily context
            mock_context.return_value = {
                "yesterday": {
                    "date": (timestamp - timedelta(days=1)).date(),
                    "open": 100.0,
                    "high": 110.0,
                    "low": 90.0,
                    "close": 100.0,
                    "volume": 5000000,
                },
                "ninety_day_high": 120.0,
                "ninety_day_low": 80.0,
                "has_data": True
            }
            
            mock_bars.return_value = []
            
            # Test with limit=23
            results = await screener.compute_historical(
                timestamp=timestamp,
                limit=23
            )
            
            assert len(results) == 23, f"Expected 23 results, got {len(results)}"
            
            # Test with limit=50
            results = await screener.compute_historical(
                timestamp=timestamp,
                limit=50
            )
            
            assert len(results) == 50, f"Expected 50 results, got {len(results)}"
    
    @pytest.mark.asyncio
    async def test_limit_zero_returns_empty(self):
        """Test that limit=0 returns empty list."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "AAPL",
                "price": 150.0,
                "volume": 1000000,
                "day": {
                    "o": 150.0,
                    "h": 155.0,
                    "l": 145.0,
                    "c": 150.0,
                    "v": 5000000,
                },
                "exchange": "XNAS",
            }
        ]
        
        results = await screener._compute(
            snaps=mock_snaps,
            limit=0
        )
        
        assert len(results) == 0, f"Expected 0 results with limit=0, got {len(results)}"
    
    @pytest.mark.asyncio
    async def test_limit_none_returns_all(self):
        """Test that limit=None returns all results (no limit)."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        # Create 10 mock snapshots
        mock_snaps = []
        for i in range(10):
            mock_snaps.append({
                "ticker": f"TICKER{i}",
                "price": 100.0 + i,
                "volume": 1000000 + i,
                "day": {
                    "o": 100.0,
                    "h": 110.0,
                    "l": 90.0,
                    "c": 100.0,
                    "v": 5000000,
                },
                "exchange": "XNAS",
            })
        
        # Mock extract_snapshot_data
        with patch('app.services.screener.screener.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Note: _compute has default limit=200, so None would use default
            # Test with explicit large limit
            results = await screener._compute(
                snaps=mock_snaps,
                limit=1000  # Large limit
            )
            
            # Should return all 10 (filtered down from 10)
            assert len(results) == 10, f"Expected 10 results, got {len(results)}"

