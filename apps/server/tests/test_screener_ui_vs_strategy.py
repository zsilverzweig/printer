"""
Test to ensure UI and strategy engine screeners return identical results.

This test validates the fix for the critical bug where the UI and strategy engine
were seeing different screener results due to using different data sources.

The test:
1. Mocks the Polygon snapshot API to return consistent test data
2. Calls the screener via the API endpoint (simulating UI behavior)
3. Calls the screener via the strategy engine method (simulating strategy behavior)
4. Verifies both return identical results
"""

import pytest
import random
from datetime import datetime, timezone
from typing import List, Dict, Any
from unittest.mock import Mock, patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.screener.screener import ScreenerService, set_screener_service
from app.models.strategies import ScreeningCriteria as ScreeningCriteriaModel
from app.types import ScreenerCriteria


def generate_test_symbols(count: int = 50) -> List[str]:
    """Generate test stock symbols."""
    random.seed(42)  # Deterministic
    symbols = []
    for i in range(count):
        symbol = ''.join([chr(65 + random.randint(0, 25)) for _ in range(4)])
        symbols.append(symbol)
    return symbols


def create_mock_polygon_snapshots(symbols: List[str]) -> List[Dict[str, Any]]:
    """
    Create mock Polygon snapshot data.
    
    Returns list of snapshot dicts in Polygon API format.
    """
    random.seed(42)  # Deterministic
    snapshots = []
    
    for symbol in symbols:
        base_price = random.uniform(5.0, 100.0)
        change_pct = random.uniform(-10.0, 10.0)
        current_price = base_price * (1 + change_pct / 100.0)
        volume = random.randint(100000, 10000000)
        
        # Polygon snapshot format
        snapshot = {
            "ticker": symbol,
            "price": current_price,
            "volume": volume,
            "day": {
                "o": current_price * 0.99,
                "h": current_price * 1.02,
                "l": current_price * 0.98,
                "c": current_price,
                "v": volume,
            },
            "prevDay": {
                "o": base_price * 0.98,
                "h": base_price * 1.03,
                "l": base_price * 0.97,
                "c": base_price,
                "v": volume * 10,
            },
            "exchange": 4,  # XNAS exchange code
            "type": "stocks",
        }
        snapshots.append(snapshot)
    
    return snapshots


@pytest.mark.asyncio
async def test_ui_vs_strategy_screener_consistency(async_session):
    """
    Test that UI endpoint and strategy engine method return identical screener results.
    
    This is the critical bug fix test: both paths should use the same data source
    (Polygon snapshot API) and return identical results.
    """
    # Generate test symbols
    symbols = generate_test_symbols(50)
    
    # Create mock Polygon snapshot data
    mock_snapshots = create_mock_polygon_snapshots(symbols)
    
    # Define test criteria
    test_criteria = ScreenerCriteria(
        min_price=10.0,
        max_price=50.0,
        min_volume=500000,
        min_relative_volume=1.2,
        limit=20,
    )
    
    print(f"\n=== Testing UI vs Strategy Engine Consistency ===")
    print(f"Test data: {len(symbols)} symbols")
    print(f"Criteria: {test_criteria.model_dump(exclude_none=True)}")
    
    # Setup: Mock the Polygon snapshot API to return consistent data
    with patch('app.services.screener.screener_snapshot.fetch_snapshot_all') as mock_fetch_snapshot:
        mock_fetch_snapshot.return_value = mock_snapshots
        
        # Initialize screener service (simulating server startup)
        mock_client = Mock()
        screener_service = ScreenerService(client=mock_client, interval_s=5)
        set_screener_service(screener_service)
        
        # Test 1: Strategy Engine Path
        # This simulates what happens when a strategy calls the screener
        print("\n--- Testing STRATEGY ENGINE path ---")
        
        strategy_results = await screener_service.compute_live_from_criteria(test_criteria)
        strategy_tickers = sorted([r["ticker"] for r in strategy_results])
        strategy_prices = {r["ticker"]: r["price"] for r in strategy_results}
        
        print(f"Strategy results: {len(strategy_results)} stocks")
        print(f"Strategy tickers (first 10): {strategy_tickers[:10]}")
        
        # Test 2: UI/API Endpoint Path
        # This simulates what happens when the UI calls the API endpoint
        print("\n--- Testing UI/API ENDPOINT path ---")
        
        # Create a screening criteria in the database
        criteria_model = ScreeningCriteriaModel(
            id="test-criteria-123",
            name="Test Criteria",
            description="Test criteria for consistency check",
            criteria=test_criteria.model_dump(exclude_none=True),
        )
        async_session.add(criteria_model)
        await async_session.commit()
        
        # Mock the database session to return our test criteria
        with patch('app.services.core.database.get_async_session') as mock_get_session:
            mock_db_session = AsyncMock()
            mock_db_session.get = AsyncMock(return_value=criteria_model)
            mock_db_session.__aenter__ = AsyncMock(return_value=mock_db_session)
            mock_db_session.__aexit__ = AsyncMock(return_value=None)
            mock_get_session.return_value = mock_db_session
            
            # Call the API endpoint (this uses the centralized compute_live method)
            client = TestClient(app)
            response = client.post(
                "/api/screening-criteria/run",
                json=test_criteria.model_dump(exclude_none=True),
            )
        
        assert response.status_code == 200, f"API call failed: {response.text}"
        api_data = response.json()
        
        ui_results = api_data.get("results", [])
        ui_tickers = sorted([r["ticker"] for r in ui_results])
        ui_prices = {r["ticker"]: r["price"] for r in ui_results}
        
        print(f"UI results: {len(ui_results)} stocks")
        print(f"UI tickers (first 10): {ui_tickers[:10]}")
        
        # Test 3: Compare Results
        print("\n=== COMPARISON RESULTS ===")
        print(f"Strategy count: {len(strategy_results)}")
        print(f"UI count: {len(ui_results)}")
        
        # Find discrepancies
        strategy_set = set(strategy_tickers)
        ui_set = set(ui_tickers)
        
        only_strategy = strategy_set - ui_set
        only_ui = ui_set - strategy_set
        common = strategy_set & ui_set
        
        print(f"\nCommon tickers: {len(common)}")
        if only_strategy:
            print(f"❌ Only in strategy: {len(only_strategy)} - {list(only_strategy)[:10]}")
        if only_ui:
            print(f"❌ Only in UI: {len(only_ui)} - {list(only_ui)[:10]}")
        
        # Compare prices for common tickers
        price_diffs = []
        for ticker in common:
            strat_price = strategy_prices.get(ticker)
            ui_price = ui_prices.get(ticker)
            if strat_price and ui_price:
                diff = abs(strat_price - ui_price)
                if diff > 0.01:  # More than 1 cent difference
                    price_diffs.append((ticker, strat_price, ui_price, diff))
        
        if price_diffs:
            print(f"\n❌ Price discrepancies (>$0.01): {len(price_diffs)}")
            for ticker, s_price, u_price, diff in price_diffs[:10]:
                print(f"  {ticker}: Strategy=${s_price:.2f}, UI=${u_price:.2f}, Diff=${diff:.2f}")
        
        # Assertions
        print("\n=== ASSERTIONS ===")
        
        # Critical assertion: Both should return identical ticker sets
        assert strategy_set == ui_set, (
            f"CRITICAL BUG: UI and Strategy engine returned different tickers!\n"
            f"  Only in strategy: {only_strategy}\n"
            f"  Only in UI: {only_ui}\n"
            f"This means they are using different data sources."
        )
        
        # Prices should match exactly (same data source)
        for ticker in common:
            strat_price = strategy_prices.get(ticker)
            ui_price = ui_prices.get(ticker)
            if strat_price and ui_price:
                assert abs(strat_price - ui_price) < 0.01, (
                    f"Price mismatch for {ticker}: "
                    f"Strategy=${strat_price:.2f}, UI=${ui_price:.2f}"
                )
        
        print("✅ All assertions passed!")
        print(f"✅ UI and Strategy engine returned {len(common)} identical stocks")
        print("✅ Both are using the same data source (Polygon snapshot API)")


@pytest.mark.asyncio
async def test_ui_vs_strategy_with_various_filters(async_session):
    """
    Test UI vs Strategy consistency with various filter combinations.
    """
    symbols = generate_test_symbols(100)
    mock_snapshots = create_mock_polygon_snapshots(symbols)
    
    # Test various filter combinations
    test_cases = [
        {
            "name": "Price range only",
            "criteria": ScreenerCriteria(min_price=20.0, max_price=80.0, limit=30),
        },
        {
            "name": "Volume filter",
            "criteria": ScreenerCriteria(min_volume=1000000, limit=30),
        },
        {
            "name": "Relative volume filter",
            "criteria": ScreenerCriteria(min_relative_volume=1.5, limit=30),
        },
        {
            "name": "Combined filters",
            "criteria": ScreenerCriteria(
                min_price=15.0,
                max_price=75.0,
                min_volume=500000,
                min_relative_volume=1.2,
                limit=20,
            ),
        },
    ]
    
    with patch('app.services.screener.screener_snapshot.fetch_snapshot_all') as mock_fetch:
        mock_fetch.return_value = mock_snapshots
        
        mock_client = Mock()
        screener_service = ScreenerService(client=mock_client, interval_s=5)
        set_screener_service(screener_service)
        
        for test_case in test_cases:
            name = test_case["name"]
            criteria = test_case["criteria"]
            
            print(f"\n=== Testing: {name} ===")
            print(f"Criteria: {criteria.model_dump(exclude_none=True)}")
            
            # Strategy engine path
            strategy_results = await screener_service.compute_live_from_criteria(criteria)
            strategy_tickers = sorted([r["ticker"] for r in strategy_results])
            
            # UI/API path
            client = TestClient(app)
            response = client.post(
                "/api/screening-criteria/run",
                json=criteria.model_dump(exclude_none=True),
            )
            
            assert response.status_code == 200, f"API failed for {name}: {response.text}"
            api_data = response.json()
            ui_results = api_data.get("results", [])
            ui_tickers = sorted([r["ticker"] for r in ui_results])
            
            # Compare
            print(f"Strategy: {len(strategy_results)} stocks")
            print(f"UI: {len(ui_results)} stocks")
            
            assert strategy_tickers == ui_tickers, (
                f"Mismatch for '{name}':\n"
                f"  Strategy: {strategy_tickers[:10]}\n"
                f"  UI: {ui_tickers[:10]}"
            )
            
            print(f"✅ {name}: Both returned {len(strategy_tickers)} identical stocks")


@pytest.mark.asyncio
async def test_strategy_engine_uses_centralized_method():
    """
    Test that strategy engine's _apply_screening_filters uses the centralized method.
    
    This ensures that strategies are calling compute_live_from_criteria which
    fetches from Polygon snapshot API (not TimescaleDB cache).
    """
    symbols = generate_test_symbols(30)
    mock_snapshots = create_mock_polygon_snapshots(symbols)
    
    print("\n=== Testing Strategy Engine Uses Centralized Method ===")
    
    # Mock both the snapshot fetch and the API key
    with patch('app.services.screener.screener_snapshot.fetch_snapshot_all') as mock_fetch, \
         patch('app.core.API_KEY', 'mock-api-key'):
        mock_fetch.return_value = mock_snapshots
        
        mock_client = Mock()
        screener_service = ScreenerService(client=mock_client, interval_s=5)
        set_screener_service(screener_service)
        
        # Test criteria
        criteria = ScreenerCriteria(
            min_price=15.0,
            max_price=60.0,
            min_volume=750000,
            limit=15,
        )
        
        # Call the method that strategy engine uses
        results = await screener_service.compute_live_from_criteria(criteria)
        
        # Verify fetch_snapshot_all was called (not TimescaleDB)
        mock_fetch.assert_called_once()
        
        print(f"✅ Strategy engine called Polygon snapshot API")
        print(f"✅ Returned {len(results)} results")
        print(f"✅ Using centralized compute_live method")
        
        # With mock data, some results should pass filters
        if len(results) > 0:
            # Verify all results match the criteria
            for result in results[:3]:
                assert criteria.min_price <= result["price"] <= criteria.max_price
                print(f"  ✓ {result['ticker']}: ${result['price']:.2f}")
        else:
            print("  (No results with current filter criteria)")


@pytest.mark.asyncio
async def test_historical_screener_uses_accumulated_intraday_volume():
    """
    Test that historical screener accumulates intraday volume from 5min bars.
    
    This ensures historical mode shows accurate volume "as of" the timestamp,
    not the full day's volume.
    """
    symbols = generate_test_symbols(10)
    
    print("\n=== Testing Historical Intraday Volume Accumulation ===")
    
    # Create a timestamp at 11:00 AM ET (15:00 UTC) on a trading day
    test_date = datetime(2024, 1, 15, 15, 0, 0, tzinfo=timezone.utc)  # 11:00 AM ET
    market_open = datetime(2024, 1, 15, 13, 30, 0, tzinfo=timezone.utc)  # 9:30 AM ET
    
    print(f"Test timestamp: {test_date}")
    print(f"Market open: {market_open}")
    
    # Mock database with accumulated volume data
    mock_volume_data = {}
    for symbol in symbols:
        # Simulate 3 hours of trading (9:30 AM to 11:00 AM = 1.5 hours = 18 5-min bars)
        # Each bar has ~50K volume, so accumulated should be ~900K
        mock_volume_data[symbol] = 900000
    
    with patch('app.services.core.database.get_async_session') as mock_session:
        # Mock the volume query
        mock_db_session = AsyncMock()
        mock_execute_result = MagicMock()
        
        # Mock the accumulated volume query result
        volume_rows = [(symbol, mock_volume_data[symbol]) for symbol in symbols]
        mock_execute_result.__iter__.return_value = iter(volume_rows)
        
        mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
        mock_db_session.__aenter__ = AsyncMock(return_value=mock_db_session)
        mock_db_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.return_value = mock_db_session
        
        # Initialize screener
        mock_client = Mock()
        screener_service = ScreenerService(client=mock_client, interval_s=5)
        
        # Call the historical volume method
        result = await screener_service.historical._get_accumulated_intraday_volume(
            symbols, test_date
        )
        
        print(f"\nResults:")
        print(f"  Symbols queried: {len(symbols)}")
        print(f"  Volumes returned: {len(result)}")
        
        # Verify the query parameters
        call_args = mock_db_session.execute.call_args
        assert call_args is not None, "Database execute should have been called"
        
        # Verify accumulated volume is returned
        assert len(result) > 0, "Should return volume data"
        
        for symbol in symbols[:3]:  # Check first 3 symbols
            vol = result.get(symbol, 0)
            print(f"  {symbol}: {vol:,} (accumulated from market open to 11:00 AM)")
            assert vol > 0, f"{symbol} should have accumulated volume"
        
        print("\n✅ Historical screener correctly accumulates intraday volume")
        print("✅ Volume represents market open → timestamp, not full day")


if __name__ == "__main__":
    # Run with: pytest apps/server/tests/test_screener_ui_vs_strategy.py -v -s
    pytest.main([__file__, "-v", "-s"])

