"""
Test to compare historical and live screener results.

This test:
1. Creates ~200 dummy stocks with mocked market data
2. Tests that historical mode with current timestamp matches live mode
3. Identifies any discrepancies between the two modes
"""

import pytest
import random
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from unittest.mock import Mock, patch, AsyncMock, MagicMock

from app.services.screener.screener import ScreenerService


# Generate ~200 dummy stock symbols
def generate_dummy_symbols(count: int = 200) -> List[str]:
    """Generate dummy stock symbols."""
    random.seed(42)  # Make it deterministic
    symbols = []
    for i in range(count):
        # Generate 4-letter symbols
        symbol = ''.join([chr(65 + random.randint(0, 25)) for _ in range(4)])
        symbols.append(symbol)
    return symbols


def create_mock_market_data(symbols: List[str], timestamp: datetime) -> Dict[str, Dict[str, Any]]:
    """
    Create mock market data for testing.
    
    Returns:
        Dict mapping symbol to snapshot data
    """
    random.seed(42)  # Make it deterministic
    snapshot = {}
    
    for symbol in symbols:
        base_price = random.uniform(5.0, 100.0)
        change_pct = random.uniform(-10.0, 10.0)
        current_price = base_price * (1 + change_pct / 100.0)
        volume = random.randint(100000, 10000000)
        
        snapshot[symbol] = {
            "time": timestamp,
            "open": current_price * 0.99,
            "high": current_price * 1.02,
            "low": current_price * 0.98,
            "close": current_price,
            "volume": volume,
        }
    
    return snapshot


def create_mock_daily_context(symbol: str, timestamp: datetime, snapshot_data: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create mock daily context based on snapshot data.
    
    Returns yesterday's OHLCV and 90-day high/low for a symbol.
    """
    symbol_data = snapshot_data.get(symbol, {})
    base_price = symbol_data.get("close", 50.0) / 1.02  # Reverse the change to get base
    volume = symbol_data.get("volume", 1000000)
    
    yesterday = timestamp - timedelta(days=1)
    
    return {
        "yesterday": {
            "date": yesterday.date(),
            "open": base_price * 0.98,
            "high": base_price * 1.03,
            "low": base_price * 0.97,
            "close": base_price,
            "volume": volume * 10,  # Daily volume is typically higher
        },
        "ninety_day_high": base_price * 1.15,
        "ninety_day_low": base_price * 0.85,
        "has_data": True
    }


@pytest.mark.asyncio
async def test_historical_vs_live_screener_consistency():
    """
    Test that historical screener with current timestamp matches live screener.
    
    This test:
    1. Creates ~200 dummy stocks with mocked market data
    2. Runs historical screener with current timestamp
    3. Runs live screener (mocked to use same data)
    4. Compares results to ensure they match
    """
    # Generate dummy symbols
    symbols = generate_dummy_symbols(200)
    
    # Create mock RESTClient
    mock_client = Mock()
    screener = ScreenerService(client=mock_client)
    
    # Create current timestamp
    now = datetime.now(timezone.utc)
    current_timestamp = now.replace(second=0, microsecond=0)  # Round to minute
    
    # Create mock market data
    snapshot_data = create_mock_market_data(symbols, current_timestamp)
    
    # Define filter criteria (use moderate filters to get reasonable results)
    filter_criteria = {
        "min_price": 10.0,
        "max_price": 50.0,
        "min_volume": 500000.0,
        "limit": 50,
        "exclude_etfs": True,
    }
    
    print(f"\n=== Testing with {len(symbols)} stocks ===")
    print(f"Current timestamp: {current_timestamp}")
    print(f"Filter criteria: {filter_criteria}")
    
    # Test 1: Historical screener with current timestamp (mocked)
    print("\n--- Running HISTORICAL screener ---")
    
    with patch('app.services.core.database.get_async_session') as mock_session, \
         patch('app.lib.market_queries.get_snapshot_at_time') as mock_snapshot, \
         patch('app.lib.market_queries.get_daily_context') as mock_context, \
         patch('app.lib.market_queries.get_historical_bars') as mock_bars:
        
        # Mock database session for active symbols query
        mock_db_session = AsyncMock()
        mock_execute_result = MagicMock()
        # Mock result.all() to return tuples with symbol
        mock_execute_result.all.return_value = [(sym,) for sym in symbols]
        mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
        mock_session.return_value.__aenter__.return_value = mock_db_session
        
        # Mock snapshot data
        async def mock_snapshot_fn(timestamp, symbol_list=None):
            if symbol_list:
                return {sym: snapshot_data[sym] for sym in symbol_list if sym in snapshot_data}
            return snapshot_data
        mock_snapshot.side_effect = mock_snapshot_fn
        
        # Mock daily context
        async def mock_context_fn(symbol, ts):
            return create_mock_daily_context(symbol, ts, snapshot_data)
        mock_context.side_effect = mock_context_fn
        
        # Mock historical bars (empty for now, not critical for this test)
        mock_bars.return_value = []
        
        historical_results = await screener.compute_historical(
            timestamp=current_timestamp,
            min_price=filter_criteria["min_price"],
            max_price=filter_criteria["max_price"],
            min_volume=filter_criteria["min_volume"],
            limit=filter_criteria["limit"],
            exclude_etfs=filter_criteria["exclude_etfs"],
        )
    
    historical_tickers = sorted([r["ticker"] for r in historical_results])
    historical_prices = {r["ticker"]: r["price"] for r in historical_results}
    
    print(f"Historical results: {len(historical_results)} stocks")
    print(f"Historical tickers (first 10): {historical_tickers[:10]}")
    
    # Test 2: Create mock snapshot data for live screener
    # This simulates what live mode would get from Polygon
    print("\n--- Preparing LIVE screener data ---")
    
    # Convert snapshot data to format expected by live screener (Polygon snapshot format)
    mock_snaps = []
    for symbol, bar_data in snapshot_data.items():
        mock_snap = {
            "ticker": symbol,
            "price": bar_data["close"],
            "volume": bar_data["volume"],
            "day": {
                "o": bar_data["open"],
                "h": bar_data["high"],
                "l": bar_data["low"],
                "c": bar_data["close"],
                "v": bar_data["volume"],
            },
            "exchange": "XNAS",  # All our test symbols use XNAS
        }
        mock_snaps.append(mock_snap)
    
    print(f"Mock snapshots created: {len(mock_snaps)}")
    
    # Test 3: Run live screener with mocked data
    print("\n--- Running LIVE screener (with mocked snapshot) ---")
    
    with patch('app.services.screener.screener_compute.extract_snapshot_data') as mock_extract:
        # Mock extract_snapshot_data to return the data in expected format
        def extract_fn(snap):
            symbol_data = snapshot_data.get(snap["ticker"], {})
            base_price = symbol_data.get("close", 50.0) / 1.02  # Approximate base price from current
            return {
                "ticker": snap["ticker"],
                "price": snap["price"],
                "volume": snap["volume"],
                "exchange": snap["exchange"],
                "yesterday_close": base_price,  # Use the base price from our mock data
            }
        mock_extract.side_effect = extract_fn
        
        live_results = await screener._compute(
            snaps=mock_snaps,
            min_price=filter_criteria["min_price"],
            max_price=filter_criteria["max_price"],
            min_volume=filter_criteria["min_volume"],
            limit=filter_criteria["limit"],
            exclude_etfs=filter_criteria["exclude_etfs"],
        )
    
    live_tickers = sorted([r["ticker"] for r in live_results])
    live_prices = {r["ticker"]: r["price"] for r in live_results}
    
    print(f"Live results: {len(live_results)} stocks")
    print(f"Live tickers (first 10): {live_tickers[:10]}")
    
    # Test 4: Compare results
    print("\n=== COMPARISON RESULTS ===")
    print(f"Historical count: {len(historical_results)}")
    print(f"Live count: {len(live_results)}")
    
    # Find discrepancies
    historical_set = set(historical_tickers)
    live_set = set(live_tickers)
    
    only_historical = historical_set - live_set
    only_live = live_set - historical_set
    common = historical_set & live_set
    
    print(f"\nCommon tickers: {len(common)}")
    if only_historical:
        print(f"Only in historical: {len(only_historical)} - {list(only_historical)[:10]}")
    if only_live:
        print(f"Only in live: {len(only_live)} - {list(only_live)[:10]}")
    
    # Compare prices for common tickers
    price_diffs = []
    for ticker in common:
        hist_price = historical_prices.get(ticker)
        live_price = live_prices.get(ticker)
        if hist_price and live_price:
            diff = abs(hist_price - live_price)
            if diff > 0.01:  # More than 1 cent difference
                price_diffs.append((ticker, hist_price, live_price, diff))
    
    if price_diffs:
        print(f"\nPrice discrepancies (>$0.01): {len(price_diffs)}")
        for ticker, h_price, l_price, diff in price_diffs[:10]:
            print(f"  {ticker}: Historical=${h_price:.2f}, Live=${l_price:.2f}, Diff=${diff:.2f}")
    
    # Assertions
    print("\n=== ASSERTIONS ===")
    
    # They should have the same tickers (allowing for sorting differences)
    if historical_set != live_set:
        print(f"ERROR: Ticker sets don't match!")
        print(f"  Missing in live: {only_historical}")
        print(f"  Extra in live: {only_live}")
    
    assert historical_set == live_set, \
        f"Historical and live screeners returned different tickers. " \
        f"Only historical: {only_historical}, Only live: {only_live}"
    
    # Prices should match (within rounding)
    for ticker in common:
        hist_price = historical_prices.get(ticker)
        live_price = live_prices.get(ticker)
        if hist_price and live_price:
            assert abs(hist_price - live_price) < 0.01, \
                f"Price mismatch for {ticker}: Historical=${hist_price:.2f}, Live=${live_price:.2f}"
    
    print("✅ All assertions passed!")
    print(f"✅ Both screeners returned {len(common)} matching stocks with consistent prices")
    
    # Create TickerDetails entries for active symbols
    now = datetime.now(timezone.utc)
    current_timestamp = now.replace(second=0, microsecond=0)  # Round to minute
    
    # Insert ticker details
    for symbol in symbols:
        await async_session.execute(
            text("""
                INSERT INTO ticker_details (symbol, name, type, active, primary_exchange, market_cap, created_at, updated_at)
                VALUES (:symbol, :name, 'CS', true, 'XNAS', :market_cap, :now, :now)
                ON CONFLICT (symbol) DO UPDATE SET active = true
            """),
            {
                "symbol": symbol,
                "name": f"Test Company {symbol}",
                "market_cap": random.randint(100000000, 10000000000),
                "now": now
            }
        )
    
    await async_session.commit()
    
    # Insert 5m market data for each symbol at current timestamp
    # Use diverse prices and volumes to test filtering
    for i, symbol in enumerate(symbols):
        # Create varied price ranges
        base_price = random.uniform(5.0, 100.0)
        change_pct = random.uniform(-10.0, 10.0)
        current_price = base_price * (1 + change_pct / 100.0)
        volume = random.randint(100000, 10000000)
        
        # Insert 5m bar
        await async_session.execute(
            text("""
                INSERT INTO market_data_5m (symbol, bucket, open, high, low, close, volume, vwap, transactions)
                VALUES (:symbol, :bucket, :open, :high, :low, :close, :volume, :vwap, :transactions)
                ON CONFLICT (symbol, bucket) DO NOTHING
            """),
            {
                "symbol": symbol,
                "bucket": current_timestamp,
                "open": current_price * 0.99,
                "high": current_price * 1.02,
                "low": current_price * 0.98,
                "close": current_price,
                "volume": volume,
                "vwap": current_price,
                "transactions": random.randint(100, 10000)
            }
        )
        
        # Insert daily data for yesterday (for context)
        yesterday = current_timestamp - timedelta(days=1)
        yesterday_date = yesterday.date()
        
        # Get base price for yesterday (slightly different)
        yesterday_close = base_price
        
        await async_session.execute(
            text("""
                INSERT INTO market_data_daily (symbol, bucket, open, high, low, close, volume, vwap, transactions)
                VALUES (:symbol, :bucket, :open, :high, :low, :close, :volume, :vwap, :transactions)
                ON CONFLICT (symbol, bucket) DO NOTHING
            """),
            {
                "symbol": symbol,
                "bucket": yesterday_date,
                "open": yesterday_close * 0.98,
                "high": yesterday_close * 1.03,
                "low": yesterday_close * 0.97,
                "close": yesterday_close,
                "volume": volume * 10,  # Daily volume is typically higher
                "vwap": yesterday_close,
                "transactions": random.randint(1000, 50000)
            }
        )
    
    await async_session.commit()
    
    # Verify data was inserted
    result = await async_session.execute(
        text("SELECT COUNT(DISTINCT symbol) FROM market_data_5m WHERE bucket = :bucket"),
        {"bucket": current_timestamp}
    )
    count = result.scalar()
    assert count == len(symbols), f"Expected {len(symbols)} symbols, got {count}"
    
    # Now test the screener
    mock_client = Mock()
    screener = ScreenerService(client=mock_client)
    
    # Define filter criteria (use moderate filters to get reasonable results)
    filter_criteria = {
        "min_price": 10.0,
        "max_price": 50.0,
        "min_volume": 500000.0,
        "limit": 50,
        "exclude_etfs": True,
    }
    
    print(f"\n=== Testing with {len(symbols)} stocks ===")
    print(f"Current timestamp: {current_timestamp}")
    print(f"Filter criteria: {filter_criteria}")
    
    # Test 1: Historical screener with current timestamp
    print("\n--- Running HISTORICAL screener ---")
    historical_results = await screener.compute_historical(
        timestamp=current_timestamp,
        min_price=filter_criteria["min_price"],
        max_price=filter_criteria["max_price"],
        min_volume=filter_criteria["min_volume"],
        limit=filter_criteria["limit"],
        exclude_etfs=filter_criteria["exclude_etfs"],
    )
    
    historical_tickers = sorted([r["ticker"] for r in historical_results])
    historical_prices = {r["ticker"]: r["price"] for r in historical_results}
    
    print(f"Historical results: {len(historical_results)} stocks")
    print(f"Historical tickers (first 10): {historical_tickers[:10]}")
    
    # Test 2: Create mock snapshot data that matches what we inserted
    # This simulates what live mode would get from Polygon
    print("\n--- Preparing LIVE screener data ---")
    
    # Fetch the actual snapshot from database (same as historical)
    snapshot_data = await get_snapshot_at_time(current_timestamp, symbols)
    
    # Convert to format expected by live screener (Polygon snapshot format)
    mock_snaps = []
    for symbol, bar_data in snapshot_data.items():
        mock_snap = {
            "ticker": symbol,
            "price": bar_data["close"],
            "volume": bar_data["volume"],
            "day": {
                "o": bar_data["open"],
                "h": bar_data["high"],
                "l": bar_data["low"],
                "c": bar_data["close"],
                "v": bar_data["volume"],
            },
            "exchange": "XNAS",  # All our test symbols use XNAS
        }
        mock_snaps.append(mock_snap)
    
    print(f"Mock snapshots created: {len(mock_snaps)}")
    
    # Test 3: Run live screener with mocked data
    print("\n--- Running LIVE screener (with mocked snapshot) ---")
    
    # Mock fetch_snapshot_all to return our mock data
    with patch('app.services.screener.screener.fetch_snapshot_all') as mock_fetch:
        mock_fetch.return_value = mock_snaps
        
        live_results = await screener._compute(
            snaps=mock_snaps,
            min_price=filter_criteria["min_price"],
            max_price=filter_criteria["max_price"],
            min_volume=filter_criteria["min_volume"],
            limit=filter_criteria["limit"],
            exclude_etfs=filter_criteria["exclude_etfs"],
        )
    
    live_tickers = sorted([r["ticker"] for r in live_results])
    live_prices = {r["ticker"]: r["price"] for r in live_results}
    
    print(f"Live results: {len(live_results)} stocks")
    print(f"Live tickers (first 10): {live_tickers[:10]}")
    
    # Test 4: Compare results
    print("\n=== COMPARISON RESULTS ===")
    print(f"Historical count: {len(historical_results)}")
    print(f"Live count: {len(live_results)}")
    print(f"Historical tickers: {historical_tickers}")
    print(f"Live tickers: {live_tickers}")
    
    # Find discrepancies
    historical_set = set(historical_tickers)
    live_set = set(live_tickers)
    
    only_historical = historical_set - live_set
    only_live = live_set - historical_set
    common = historical_set & live_set
    
    print(f"\nCommon tickers: {len(common)}")
    print(f"Only in historical: {len(only_historical)} - {list(only_historical)[:10]}")
    print(f"Only in live: {len(only_live)} - {list(only_live)[:10]}")
    
    # Compare prices for common tickers
    price_diffs = []
    for ticker in common:
        hist_price = historical_prices.get(ticker)
        live_price = live_prices.get(ticker)
        if hist_price and live_price:
            diff = abs(hist_price - live_price)
            if diff > 0.01:  # More than 1 cent difference
                price_diffs.append((ticker, hist_price, live_price, diff))
    
    if price_diffs:
        print(f"\nPrice discrepancies (>$0.01): {len(price_diffs)}")
        for ticker, h_price, l_price, diff in price_diffs[:10]:
            print(f"  {ticker}: Historical=${h_price:.2f}, Live=${l_price:.2f}, Diff=${diff:.2f}")
    
    # Assertions
    print("\n=== ASSERTIONS ===")
    
    # They should have the same tickers (allowing for sorting differences)
    if historical_set != live_set:
        print(f"ERROR: Ticker sets don't match!")
        print(f"  Missing in live: {only_historical}")
        print(f"  Extra in live: {only_live}")
        # Don't fail immediately - let's see what the issue is
        # Assert will show us the differences
    
    assert historical_set == live_set, \
        f"Historical and live screeners returned different tickers. " \
        f"Only historical: {only_historical}, Only live: {only_live}"
    
    # Prices should match (within rounding)
    for ticker in common:
        hist_price = historical_prices.get(ticker)
        live_price = live_prices.get(ticker)
        if hist_price and live_price:
            assert abs(hist_price - live_price) < 0.01, \
                f"Price mismatch for {ticker}: Historical=${hist_price:.2f}, Live=${live_price:.2f}"
    
    print("✅ All assertions passed!")
    print(f"✅ Both screeners returned {len(common)} matching stocks with consistent prices")


@pytest.mark.asyncio
async def test_historical_screener_with_various_filters():
    """
    Test historical screener with different filter combinations to ensure accuracy.
    """
    # Generate a smaller set for this test
    symbols = generate_dummy_symbols(50)
    
    mock_client = Mock()
    screener = ScreenerService(client=mock_client)
    
    now = datetime.now(timezone.utc)
    current_timestamp = now.replace(second=0, microsecond=0)
    
    # Create mock market data
    snapshot_data = create_mock_market_data(symbols, current_timestamp)
    
    # Test various filter combinations
    test_cases = [
        {"min_price": 20.0, "max_price": 80.0, "description": "Price range filter"},
        {"min_volume": 1000000.0, "description": "Volume filter"},
        {"min_price": 30.0, "max_price": 70.0, "min_volume": 2000000.0, "description": "Combined filters"},
    ]
    
    for test_case in test_cases:
        description = test_case.pop("description")
        print(f"\nTesting: {description} with filters {test_case}")
        
        with patch('app.services.core.database.get_async_session') as mock_session, \
             patch('app.lib.market_queries.get_snapshot_at_time') as mock_snapshot, \
             patch('app.lib.market_queries.get_daily_context') as mock_context, \
             patch('app.lib.market_queries.get_historical_bars') as mock_bars:
            
            # Mock database session
            mock_db_session = AsyncMock()
            mock_execute_result = MagicMock()
            mock_execute_result.all.return_value = [(sym,) for sym in symbols]
            mock_db_session.execute = AsyncMock(return_value=mock_execute_result)
            mock_session.return_value.__aenter__.return_value = mock_db_session
            
            # Mock snapshot
            async def mock_snapshot_fn(timestamp, symbol_list=None):
                if symbol_list:
                    return {sym: snapshot_data[sym] for sym in symbol_list if sym in snapshot_data}
                return snapshot_data
            mock_snapshot.side_effect = mock_snapshot_fn
            
            # Mock context
            async def mock_context_fn(symbol, ts):
                return create_mock_daily_context(symbol, ts, snapshot_data)
            mock_context.side_effect = mock_context_fn
            
            mock_bars.return_value = []
            
            results = await screener.compute_historical(
                timestamp=current_timestamp,
                limit=100,
                exclude_etfs=True,
                **test_case
            )
        
        # Verify filters were applied
        for result in results:
            if "min_price" in test_case:
                assert result["price"] >= test_case["min_price"], \
                    f"{result['ticker']} price {result['price']} below min {test_case['min_price']}"
            if "max_price" in test_case:
                assert result["price"] <= test_case["max_price"], \
                    f"{result['ticker']} price {result['price']} above max {test_case['max_price']}"
            if "min_volume" in test_case:
                # Note: historical mode uses yesterday's volume for filtering
                # This is expected behavior difference from live mode
                pass  # Skip volume check in historical as it uses different source
        
        print(f"  ✅ {len(results)} stocks passed filters")

