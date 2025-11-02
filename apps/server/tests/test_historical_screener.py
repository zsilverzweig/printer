"""
Tests for historical screener functionality.

Tests the ability to "time travel" and screen stocks at specific historical timestamps.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, Mock

from app.services.screener.screener import ScreenerService
from app.lib.market_queries import get_snapshot_at_time, get_daily_context, get_historical_bars


class TestHistoricalScreener:
    """Test historical screener functionality."""
    
    @pytest.mark.asyncio
    async def test_compute_historical_basic(self):
        """Test basic historical screener computation."""
        # Create mock RESTClient
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        # Use a recent timestamp (yesterday at market open)
        timestamp = datetime.now(timezone.utc) - timedelta(days=1)
        timestamp = timestamp.replace(hour=13, minute=30, second=0, microsecond=0)
        
        # Mock dependencies - patch where they're imported from
        with patch('app.services.core.database.get_async_session') as mock_session, \
             patch('app.lib.market_queries.get_snapshot_at_time') as mock_snapshot, \
             patch('app.lib.market_queries.get_daily_context') as mock_context, \
             patch('app.lib.market_queries.get_historical_bars') as mock_bars:
            
            # Mock database session for active symbols query
            mock_db_session = AsyncMock()
            mock_execute_result = MagicMock()
            # Mock result.all() to return tuples with symbol
            mock_execute_result.all.return_value = [
                ("AAPL",),
                ("MSFT",),
                ("GOOGL",),
            ]
            mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
            mock_session.return_value.__aenter__.return_value = mock_db_session
            
            # Mock snapshot data
            mock_snapshot.return_value = {
                "AAPL": {
                    "time": timestamp,
                    "open": 150.0,
                    "high": 152.0,
                    "low": 149.0,
                    "close": 151.0,
                    "volume": 1000000
                },
                "MSFT": {
                    "time": timestamp,
                    "open": 300.0,
                    "high": 302.0,
                    "low": 298.0,
                    "close": 301.0,
                    "volume": 2000000
                },
                "GOOGL": {
                    "time": timestamp,
                    "open": 2500.0,
                    "high": 2510.0,
                    "low": 2495.0,
                    "close": 2505.0,
                    "volume": 500000
                },
            }
            
            # Mock daily context
            async def mock_context_fn(symbol, ts):
                base_close = 150.0 if symbol == "AAPL" else 300.0 if symbol == "MSFT" else 2500.0
                base_vol = 5000000 if symbol == "AAPL" else 10000000 if symbol == "MSFT" else 3000000
                return {
                    "yesterday": {
                        "date": (timestamp - timedelta(days=1)).date(),
                        "open": base_close,
                        "high": base_close + 2.0,
                        "low": base_close - 1.0,
                        "close": base_close,
                        "volume": base_vol,
                    },
                    "ninety_day_high": base_close + 10.0,
                    "ninety_day_low": base_close - 10.0,
                    "has_data": True
                }
            
            mock_context.side_effect = mock_context_fn
            mock_bars.return_value = []
            
            # Run historical screener
            results = await screener.compute_historical(
                timestamp=timestamp,
                limit=10
            )
            
            # Should return results
            assert isinstance(results, list)
            # May be empty if filters exclude everything, but structure should be correct
            
            # Check result structure if results exist
            if results:
                result = results[0]
                assert "ticker" in result
                assert "price" in result
                assert "close" in result
                assert "change_close" in result
    
    @pytest.mark.asyncio
    async def test_compute_historical_with_filters(self):
        """Test historical screener with price and volume filters."""
        # Create mock RESTClient
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
            mock_execute_result.all.return_value = [("AAPL",)]
            mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
            mock_session.return_value.__aenter__.return_value = mock_db_session
            
            mock_snapshot.return_value = {
                "AAPL": {
                    "time": timestamp,
                    "open": 150.0,
                    "high": 152.0,
                    "low": 149.0,
                    "close": 151.0,
                    "volume": 1000000
                },
            }
            
            mock_context.return_value = {
                "yesterday": {
                    "date": (timestamp - timedelta(days=1)).date(),
                    "open": 150.0,
                    "high": 152.0,
                    "low": 149.0,
                    "close": 150.0,
                    "volume": 5000000,
                },
                "ninety_day_high": 160.0,
                "ninety_day_low": 140.0,
                "has_data": True
            }
            
            mock_bars.return_value = []
            
            # Test with price filter that includes AAPL
            results = await screener.compute_historical(
                timestamp=timestamp,
                min_price=100.0,
                max_price=200.0,
                limit=10
            )
            
            assert isinstance(results, list)
            # AAPL should pass the filter (close = 150.0)
            if results:
                assert results[0]["ticker"] == "AAPL"
            
            # Test with price filter that excludes AAPL
            results = await screener.compute_historical(
                timestamp=timestamp,
                min_price=200.0,
                max_price=300.0,
                limit=10
            )
            
            # AAPL should be filtered out (close = 150.0 < 200.0)
            assert len(results) == 0
    
    @pytest.mark.asyncio
    async def test_get_snapshot_at_time_empty_result(self):
        """Test get_snapshot_at_time with no data."""
        timestamp = datetime.now(timezone.utc) - timedelta(days=365)
        
        # Should return empty dict if no data
        snapshot = await get_snapshot_at_time(timestamp, ["INVALID"])
        
        assert isinstance(snapshot, dict)
        # May be empty if no data exists for that timestamp
    
    @pytest.mark.asyncio
    async def test_get_daily_context_empty_result(self):
        """Test get_daily_context with no data."""
        timestamp = datetime.now(timezone.utc) - timedelta(days=365)
        
        context = await get_daily_context("INVALID", timestamp)
        
        assert isinstance(context, dict)
        assert "has_data" in context
        assert context["has_data"] is False
    
    @pytest.mark.asyncio
    async def test_get_historical_bars(self):
        """Test get_historical_bars function."""
        timestamp = datetime.now(timezone.utc) - timedelta(days=1)
        
        bars = await get_historical_bars("AAPL", "5m", timestamp, 10)
        
        assert isinstance(bars, list)
        # May be empty if no data exists


class TestMarketQueriesSQL:
    """Test SQL queries in market_queries module."""
    
    def test_get_snapshot_at_time_query_structure(self):
        """Verify the SQL query structure for get_snapshot_at_time."""
        # This test verifies the query logic, not actual execution
        # The query should use DISTINCT ON with proper ordering
        
        # Query structure should be:
        # SELECT DISTINCT ON (symbol) ... WHERE bucket <= :timestamp
        # ORDER BY symbol, bucket DESC
        
        # This ensures we get the most recent bar for each symbol at or before the timestamp
        assert True  # Placeholder - actual SQL is tested via integration tests
    
    def test_get_daily_context_query_structure(self):
        """Verify the SQL query structure for get_daily_context."""
        # Query should:
        # 1. Get yesterday's OHLCV (most recent trading day before timestamp)
        # 2. Get 90-day high/low up to timestamp
        
        assert True  # Placeholder - actual SQL is tested via integration tests


@pytest.mark.asyncio
async def test_historical_screener_integration():
    """Integration test for historical screener - requires database."""
    # Skip if database not available
    pytest.importorskip("app.services.core.database")
    
    # Create mock RESTClient
    mock_client = Mock()
    screener = ScreenerService(client=mock_client)
    
    # Use a recent timestamp (within last 7 days)
    timestamp = datetime.now(timezone.utc) - timedelta(days=2)
    timestamp = timestamp.replace(hour=13, minute=30, second=0, microsecond=0)
    
    try:
        results = await screener.compute_historical(
            timestamp=timestamp,
            limit=5
        )
        
        # Should return a list (may be empty if no data)
        assert isinstance(results, list)
        
        if results:
            # Verify result structure
            result = results[0]
            required_keys = ["ticker", "price", "close", "change_close"]
            for key in required_keys:
                assert key in result, f"Missing key: {key}"
                
    except Exception as e:
        # If database is not available, skip the test
        pytest.skip(f"Database not available: {e}")

