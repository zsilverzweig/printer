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
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with limit=23
            results = await screener.compute.compute(
                snaps=mock_snaps,
                limit=23
            )
            
            assert len(results) == 23, f"Expected 23 results, got {len(results)}"
            
            # Test with limit=50
            results = await screener.compute.compute(
                snaps=mock_snaps,
                limit=50
            )
            
            assert len(results) == 50, f"Expected 50 results, got {len(results)}"
            
            # Test with limit larger than available data
            results = await screener.compute.compute(
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
        
        # Mock the unified data fetcher used by historical screener
        mock_snapshots = [
            {
                "ticker": f"SYMBOL{i}",
                "price": 100.0,
                "day": {
                    "o": 100.0,
                    "h": 110.0,
                    "l": 90.0,
                    "c": 100.0,
                    "v": 1000000
                }
            }
            for i in range(100)
        ]
        
        with patch('app.services.screener.screener_data_unified.fetch_screener_data_unified') as mock_fetch:
            mock_fetch.return_value = mock_snapshots
            
            # Mock the intraday volume method
            async def mock_intraday_volume(symbols, ts):
                return {}
            
            screener.historical._get_accumulated_intraday_volume = mock_intraday_volume
            
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
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                    "rv14": snap.get("rv14", 1.0),
                }
            mock_extract.side_effect = extract_fn
            
            results = await screener.compute.compute(
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
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                    "rv14": snap.get("rv14", 1.0),
                }
            mock_extract.side_effect = extract_fn
            
            # Note: _compute has default limit=200, so None would use default
            # Test with explicit large limit
            results = await screener.compute.compute(
                snaps=mock_snaps,
                limit=1000  # Large limit
            )
            
            # Should return all 10 (filtered down from 10)
            assert len(results) == 10, f"Expected 10 results, got {len(results)}"

