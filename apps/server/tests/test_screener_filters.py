"""
Comprehensive tests for all screener filters.

Tests that all filter types are correctly applied in both live and historical modes.
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch, Mock

from app.services.screener.screener import ScreenerService
from app.services.screener.screener_filters import (
    passes_price_filter,
    passes_volume_filter,
    is_likely_etf,
    is_allowed_exchange,
)
from app.services.screener.ticker_filter import FilterCriteria


class TestBasicFilters:
    """Test basic filtering functions."""
    
    def test_passes_price_filter(self):
        """Test price filter logic."""
        # Test min/max price range
        assert passes_price_filter(150.0, 150.0, min_price=100.0, max_price=200.0) == True
        assert passes_price_filter(150.0, 150.0, min_price=200.0, max_price=300.0) == False  # Below min
        assert passes_price_filter(150.0, 150.0, min_price=50.0, max_price=100.0) == False  # Above max
        
        # Test penny stock filter - REMOVED, penny stocks now pass
        assert passes_price_filter(0.50, 0.50, min_price=0.0, max_price=float('inf')) == True
        assert passes_price_filter(1.50, 1.50, min_price=0.0, max_price=float('inf')) == True
        
        # Test edge cases
        assert passes_price_filter(1.0, 1.0, min_price=1.0, max_price=1.0) == True
        assert passes_price_filter(0.99, 0.99, min_price=0.0, max_price=float('inf')) == True  # Penny stocks now pass
    
    def test_passes_volume_filter(self):
        """Test volume filter logic."""
        assert passes_volume_filter(1000000.0, min_volume=500000.0) == True
        assert passes_volume_filter(100000.0, min_volume=500000.0) == False
        assert passes_volume_filter(500000.0, min_volume=500000.0) == True  # Edge case
        
        # Test default min_volume
        assert passes_volume_filter(100000.0) == True  # Default is 50000
        assert passes_volume_filter(10000.0) == False  # Below default
    
    def test_is_likely_etf(self):
        """Test ETF detection."""
        # Known ETFs (matches patterns in ticker)
        assert is_likely_etf("SPY") == True
        assert is_likely_etf("QQQ") == True
        assert is_likely_etf("VIX") == True
        
        # Leveraged products - SOXL is 4 chars ending with XL, not XX
        # TQQQ contains QQQ pattern
        assert is_likely_etf("SOXL") == False  # Doesn't match current patterns (ends with XL, not XX)
        assert is_likely_etf("TQQQ") == True  # Contains QQQ pattern
        
        # Test patterns that do match
        assert is_likely_etf("XXX") == True  # Ends with XXX
        assert is_likely_etf("TXXX") == True  # Ends with XXX
        
        # Regular stocks
        assert is_likely_etf("AAPL") == False
        assert is_likely_etf("MSFT") == False
        assert is_likely_etf("TSLA") == False
    
    def test_is_allowed_exchange(self):
        """Test exchange filter."""
        assert is_allowed_exchange("XNAS") == True  # NASDAQ
        assert is_allowed_exchange("XNYS") == True  # NYSE
        assert is_allowed_exchange("ARCX") == True  # NYSE Arca
        assert is_allowed_exchange("XASE") == True  # NYSE American
        
        assert is_allowed_exchange("OTCMKTS") == False  # OTC markets
        assert is_allowed_exchange("OTHER") == False
        
        # Edge cases
        assert is_allowed_exchange(None) == True  # Allows if not available
        assert is_allowed_exchange("") == True


class TestScreenerFilters:
    """Test that screener correctly applies all filters."""
    
    @pytest.mark.asyncio
    async def test_min_price_filter(self):
        """Test minimum price filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "LOW",
                "price": 50.0,
                "volume": 1000000,
                "day": {"o": 50.0, "h": 55.0, "l": 45.0, "c": 50.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "MED",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "HIGH",
                "price": 200.0,
                "volume": 1000000,
                "day": {"o": 200.0, "h": 205.0, "l": 195.0, "c": 200.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with min_price=100
            results = await screener._compute(
                snaps=mock_snaps,
                min_price=100.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "LOW" not in tickers, "LOW price stock should be filtered out"
            assert "MED" in tickers, "MED price stock should pass"
            assert "HIGH" in tickers, "HIGH price stock should pass"
    
    @pytest.mark.asyncio
    async def test_max_price_filter(self):
        """Test maximum price filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "LOW",
                "price": 50.0,
                "volume": 1000000,
                "day": {"o": 50.0, "h": 55.0, "l": 45.0, "c": 50.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "MED",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "HIGH",
                "price": 200.0,
                "volume": 1000000,
                "day": {"o": 200.0, "h": 205.0, "l": 195.0, "c": 200.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with max_price=150
            results = await screener._compute(
                snaps=mock_snaps,
                max_price=150.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "LOW" in tickers, "LOW price stock should pass"
            assert "MED" in tickers, "MED price stock should pass"
            assert "HIGH" not in tickers, "HIGH price stock should be filtered out"
    
    @pytest.mark.asyncio
    async def test_min_volume_filter(self):
        """Test minimum volume filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "LOWVOL",
                "price": 100.0,
                "volume": 100000,  # Low volume
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 100000},
                "exchange": "XNAS",
            },
            {
                "ticker": "HIGHVOL",
                "price": 100.0,
                "volume": 5000000,  # High volume
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with min_volume=1000000
            results = await screener._compute(
                snaps=mock_snaps,
                min_volume=1000000.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "LOWVOL" not in tickers, "Low volume stock should be filtered out"
            assert "HIGHVOL" in tickers, "High volume stock should pass"
    
    @pytest.mark.asyncio
    async def test_min_change_percent_filter(self):
        """Test minimum change percent filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        # Stock that moves 2% (should pass 1% filter, fail 5% filter)
        mock_snaps = [
            {
                "ticker": "SMALLMOVE",
                "price": 102.0,  # 2% move from 100
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "BIGMOVE",
                "price": 110.0,  # 10% move from 100
                "volume": 1000000,
                "day": {"o": 100.0, "h": 115.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with min_change_percent=5.0 (absolute value)
            results = await screener._compute(
                snaps=mock_snaps,
                min_change_percent=5.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "SMALLMOVE" not in tickers, "Small move (2%) should be filtered out"
            assert "BIGMOVE" in tickers, "Big move (10%) should pass"
    
    @pytest.mark.asyncio
    async def test_max_change_percent_filter(self):
        """Test maximum change percent filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "SMALLMOVE",
                "price": 102.0,  # 2% move from 100
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "BIGMOVE",
                "price": 110.0,  # 10% move from 100
                "volume": 1000000,
                "day": {"o": 100.0, "h": 115.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Test with max_change_percent=5.0 (absolute value)
            results = await screener._compute(
                snaps=mock_snaps,
                max_change_percent=5.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "SMALLMOVE" in tickers, "Small move (2%) should pass"
            assert "BIGMOVE" not in tickers, "Big move (10%) should be filtered out"
    
    @pytest.mark.asyncio
    async def test_asset_type_filter(self):
        """Test filtering by asset types."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "SPY",  # ETF
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
                "type": "ETF",
            },
            {
                "ticker": "AAPL",  # Regular stock
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
                "type": "CS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            # Filter for common stock only
            results = await screener._compute(
                snaps=mock_snaps,
                limit=100,
                asset_types=["CS"]
            )
            
            tickers = [r["ticker"] for r in results]
            assert "SPY" not in tickers, "ETF should be filtered out when asset_types excludes it"
            assert "AAPL" in tickers, "Common stock should pass when asset_types includes it"
            
            # Allow both common stock and ETFs
            results = await screener._compute(
                snaps=mock_snaps,
                limit=100,
                asset_types=["CS", "ETF"]
            )
            
            tickers = [r["ticker"] for r in results]
            assert "SPY" in tickers, "ETF should pass when asset_types includes it"
            assert "AAPL" in tickers, "Common stock should pass when asset_types includes it"
    
    @pytest.mark.asyncio
    async def test_penny_stock_filter(self):
        """Test penny stock filter - REMOVED: penny stocks are no longer auto-filtered."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "PENNY",
                "price": 0.50,  # Penny stock - should now pass (filter removed)
                "volume": 1000000,
                "day": {"o": 0.50, "h": 0.55, "l": 0.45, "c": 0.50, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "NORMAL",
                "price": 10.0,  # Normal stock
                "volume": 1000000,
                "day": {"o": 10.0, "h": 10.5, "l": 9.5, "c": 10.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            results = await screener._compute(
                snaps=mock_snaps,
                limit=100,
            )
            
            tickers = [r["ticker"] for r in results]
            # Both should pass - penny stock filter removed
            assert "PENNY" in tickers, "Penny stock should now pass (filter removed)"
            assert "NORMAL" in tickers, "Normal stock should pass"
    
    @pytest.mark.asyncio
    async def test_exchange_filter(self):
        """Test exchange filter."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "NASDAQ",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",  # Allowed
            },
            {
                "ticker": "OTC",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "OTCMKTS",  # Not allowed
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            results = await screener._compute(
                snaps=mock_snaps,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "NASDAQ" in tickers, "NASDAQ stock should pass"
            assert "OTC" not in tickers, "OTC stock should be filtered out"
    
    @pytest.mark.asyncio
    async def test_combined_filters(self):
        """Test multiple filters applied together."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        mock_snaps = [
            {
                "ticker": "PASS",
                "price": 150.0,  # In range, good volume, good move
                "volume": 2000000,
                "day": {"o": 100.0, "h": 155.0, "l": 95.0, "c": 100.0, "v": 2000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "FAIL_PRICE",
                "price": 50.0,  # Below min_price
                "volume": 2000000,
                "day": {"o": 50.0, "h": 55.0, "l": 45.0, "c": 50.0, "v": 2000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "FAIL_VOL",
                "price": 150.0,
                "volume": 100000,  # Below min_volume
                "day": {"o": 100.0, "h": 155.0, "l": 95.0, "c": 100.0, "v": 100000},
                "exchange": "XNAS",
            },
            {
                "ticker": "FAIL_CHANGE",
                "price": 101.0,  # Only 1% move, below min_change_percent
                "volume": 2000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 2000000},
                "exchange": "XNAS",
            },
        ]
        
        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn
            
            results = await screener._compute(
                snaps=mock_snaps,
                min_price=100.0,
                min_volume=500000.0,
                min_change_percent=5.0,
                limit=100
            )
            
            tickers = [r["ticker"] for r in results]
            assert "PASS" in tickers, "PASS should pass all filters"
            assert "FAIL_PRICE" not in tickers, "Should fail price filter"
            assert "FAIL_VOL" not in tickers, "Should fail volume filter"
            assert "FAIL_CHANGE" not in tickers, "Should fail change filter"

    @pytest.mark.asyncio
    async def test_market_cap_filter(self):
        """Test market cap filtering."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)

        mock_snaps = [
            {
                "ticker": "SMALL",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "LARGE",
                "price": 200.0,
                "volume": 1000000,
                "day": {"o": 200.0, "h": 205.0, "l": 195.0, "c": 200.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]

        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract, \
             patch('app.services.screener.ticker_filter.get_filtered_tickers') as mock_get_filtered:

            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn

            # Mock the ticker filter to return only SMALL (small cap stock)
            mock_get_filtered.return_value = ["SMALL"]

            # Test with market_cap_max=50000000000 (50B)
            results = await screener._compute(
                snaps=mock_snaps,
                market_cap_max=50000000000,  # 50B
                limit=100
            )

            # Verify ticker filter was called with correct criteria
            mock_get_filtered.assert_called_once()
            args, kwargs = mock_get_filtered.call_args
            criteria = args[0]  # First positional argument should be FilterCriteria
            assert isinstance(criteria, FilterCriteria)
            assert criteria.market_cap_max == 50000000000

            tickers = [r["ticker"] for r in results]
            assert "SMALL" in tickers, "SMALL should pass market cap filter"
            assert "LARGE" not in tickers, "LARGE should be filtered out by market cap"

    @pytest.mark.asyncio
    async def test_market_cap_min_filter(self):
        """Test minimum market cap filtering."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)

        mock_snaps = [
            {
                "ticker": "SMALL",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
            },
            {
                "ticker": "LARGE",
                "price": 200.0,
                "volume": 1000000,
                "day": {"o": 200.0, "h": 205.0, "l": 195.0, "c": 200.0, "v": 5000000},
                "exchange": "XNAS",
            },
        ]

        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract, \
             patch('app.services.screener.ticker_filter.get_filtered_tickers') as mock_get_filtered:

            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                }
            mock_extract.side_effect = extract_fn

            # Mock the ticker filter to return only LARGE (large cap stock)
            mock_get_filtered.return_value = ["LARGE"]

            # Test with market_cap_min=100000000000 (100B)
            results = await screener._compute(
                snaps=mock_snaps,
                market_cap_min=100000000000,  # 100B
                limit=100
            )

            # Verify ticker filter was called with correct criteria
            mock_get_filtered.assert_called_once()
            args, kwargs = mock_get_filtered.call_args
            criteria = args[0]
            assert isinstance(criteria, FilterCriteria)
            assert criteria.market_cap_min == 100000000000

            tickers = [r["ticker"] for r in results]
            assert "SMALL" not in tickers, "SMALL should be filtered out by min market cap"
            assert "LARGE" in tickers, "LARGE should pass min market cap filter"

    @pytest.mark.asyncio
    async def test_relative_volume_filter(self):
        """Test relative volume filtering."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)

        mock_snaps = [
            {
                "ticker": "LOWVOL",
                "price": 100.0,
                "volume": 1000000,
                "day": {"o": 100.0, "h": 105.0, "l": 95.0, "c": 100.0, "v": 5000000},
                "exchange": "XNAS",
                "rv14": 1.2,  # Below threshold
            },
            {
                "ticker": "HIGHVOL",
                "price": 200.0,
                "volume": 1000000,
                "day": {"o": 200.0, "h": 205.0, "l": 195.0, "c": 200.0, "v": 5000000},
                "exchange": "XNAS",
                "rv14": 2.5,  # Above threshold
            },
        ]

        with patch('app.services.screener.screener_snapshot.extract_snapshot_data') as mock_extract:
            def extract_fn(snap):
                return {
                    "ticker": snap["ticker"],
                    "price": snap["price"],
                    "volume": snap["volume"],
                    "exchange": snap["exchange"],
                    "rv14": snap.get("rv14", 0.0),  # Include rv14 for relative volume filter
                }
            mock_extract.side_effect = extract_fn

            # Test with min_relative_volume=2.0
            results = await screener._compute(
                snaps=mock_snaps,
                min_relative_volume=2.0,
                limit=100
            )

            tickers = [r["ticker"] for r in results]
            assert "LOWVOL" not in tickers, "LOWVOL should be filtered out by RV filter (1.2 < 2.0)"
            assert "HIGHVOL" in tickers, "HIGHVOL should pass RV filter (2.5 >= 2.0)"


class TestHistoricalFilters:
    """Test filters in historical mode."""
    
    @pytest.mark.asyncio
    async def test_historical_price_filter(self):
        """Test price filters in historical mode."""
        mock_client = Mock()
        screener = ScreenerService(client=mock_client)
        
        timestamp = datetime.now(timezone.utc) - timedelta(days=1)
        timestamp = timestamp.replace(hour=13, minute=30, second=0, microsecond=0)
        
        # Mock the unified data fetcher used by historical screener
        mock_snapshots = [
            {
                "ticker": "LOW",
                "price": 50.0,
                "day": {
                    "o": 50.0,
                    "h": 55.0,
                    "l": 45.0,
                    "c": 50.0,
                    "v": 1000000
                }
            },
            {
                "ticker": "HIGH",
                "price": 200.0,
                "day": {
                    "o": 200.0,
                    "h": 205.0,
                    "l": 195.0,
                    "c": 200.0,
                    "v": 1000000
                }
            },
        ]
        
        with patch('app.services.screener.screener_data_unified.fetch_screener_data_unified') as mock_fetch:
            mock_fetch.return_value = mock_snapshots
            
            # Mock the intraday volume method
            async def mock_intraday_volume(symbols, ts):
                return {}
            
            # Patch the method on the historical screener instance
            original_method = getattr(screener.historical, '_get_accumulated_intraday_volume', None)
            if original_method:
                screener.historical._get_accumulated_intraday_volume = mock_intraday_volume
            
            results = await screener.compute_historical(
                timestamp=timestamp,
                min_price=100.0,
                limit=100,
                exclude_etfs=False  # Don't exclude ETFs for this test
            )
            
            tickers = [r["ticker"] for r in results]
            assert "LOW" not in tickers, "LOW should be filtered out"
            assert "HIGH" in tickers, "HIGH should pass"

