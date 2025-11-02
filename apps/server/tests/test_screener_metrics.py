"""
Tests for screener metrics calculation.

Following TDD approach: Write tests first, then implement to make them pass.
All tests should FAIL initially (red state).
"""

import pytest
from datetime import date, timedelta
from decimal import Decimal


@pytest.mark.asyncio
async def test_calculate_rv14_single_symbol():
    """Test RV14 calculation for a single symbol with known data."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: Create 16 days of volume data (1 current + 15 historical)
    # Day 1-14: avg 100K volume, Day 15: 200K volume
    # Expected RV14: 200K / 100K = 2.0
    
    result = await calc.calculate_rv_metrics(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["rv14"] == pytest.approx(2.0, rel=0.01)


@pytest.mark.asyncio
async def test_calculate_sma_20_50_200():
    """Test SMA calculations with known price series."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 200 days of prices, all $100
    # Expected: SMA20 = SMA50 = SMA200 = $100
    
    result = await calc.calculate_sma(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["sma_20"] == pytest.approx(100.0, rel=0.01)
    assert result["AAPL"]["sma_50"] == pytest.approx(100.0, rel=0.01)
    assert result["AAPL"]["sma_200"] == pytest.approx(100.0, rel=0.01)


@pytest.mark.asyncio
async def test_calculate_rsi_overbought():
    """Test RSI calculation for overbought condition."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 14 days of continuous gains
    # Expected: RSI approaching 100
    
    result = await calc.calculate_rsi(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["rsi_14"] > 70  # Overbought threshold


@pytest.mark.asyncio
async def test_calculate_macd_signal():
    """Test MACD calculation with known trend."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: Uptrend price series
    # Expected: MACD line > signal line (positive histogram)
    
    result = await calc.calculate_macd(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["macd_histogram"] > 0


@pytest.mark.asyncio
async def test_calculate_bollinger_bands():
    """Test Bollinger Bands calculation."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 20 days with low volatility around $100
    # Expected: Narrow bands around $100
    
    result = await calc.calculate_bollinger_bands(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["bb_middle"] == pytest.approx(100.0, rel=0.01)
    assert result["AAPL"]["bb_upper"] > result["AAPL"]["bb_middle"]
    assert result["AAPL"]["bb_lower"] < result["AAPL"]["bb_middle"]


@pytest.mark.asyncio
async def test_calculate_atr():
    """Test ATR calculation for volatility."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 14 days with known ranges
    # Expected: ATR equals average true range
    
    result = await calc.calculate_atr(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["atr_14"] > 0


@pytest.mark.asyncio
async def test_calculate_90day_levels():
    """Test 90-day high/low calculation."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 90 days with high=$110, low=$90
    # Expected: Correct extremes
    
    result = await calc.calculate_price_levels(["AAPL"], date(2025, 11, 1))
    
    assert result["AAPL"]["high_90d"] == pytest.approx(110.0, rel=0.01)
    assert result["AAPL"]["low_90d"] == pytest.approx(90.0, rel=0.01)


@pytest.mark.asyncio
async def test_batch_calculation_1000_symbols():
    """Test batch calculation performance for 1000 symbols."""
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    calc = TimescaleIndicatorCalculator()
    
    # Setup: 1000 active symbols with data
    symbols = [f"SYM{i:04d}" for i in range(1000)]
    
    import time
    start = time.time()
    result = await calc.calculate_all_metrics_batch(symbols, date(2025, 11, 1))
    elapsed = time.time() - start
    
    assert len(result) == 1000
    assert elapsed < 10.0  # Should complete in under 10 seconds


@pytest.mark.asyncio
async def test_metrics_persistence():
    """Test saving and retrieving metrics from database."""
    from app.services.screener.screener_metrics_storage import upsert_metrics, get_metrics
    from app.services.screener.screener_indicators import TimescaleIndicatorCalculator
    
    # Setup: Calculate metrics for AAPL
    calc = TimescaleIndicatorCalculator()
    metrics = await calc.calculate_all_metrics_batch(["AAPL"], date(2025, 11, 1))
    
    # Save to database
    await upsert_metrics(metrics, date(2025, 11, 1))
    
    # Retrieve and verify
    retrieved = await get_metrics(["AAPL"], date(2025, 11, 1))
    
    assert retrieved["AAPL"]["rv14"] == metrics["AAPL"]["rv14"]
    assert retrieved["AAPL"]["sma_20"] == metrics["AAPL"]["sma_20"]


@pytest.mark.asyncio
async def test_unified_fetcher_includes_metrics():
    """Test that unified fetcher joins metrics correctly."""
    from app.services.screener.screener_data_unified import fetch_screener_data_unified
    
    # Setup: Ensure metrics exist for target date
    target_date = date(2025, 10, 31)
    
    # Fetch snapshots
    snapshots = await fetch_screener_data_unified(target_date=target_date)
    
    # Verify metrics are included
    assert len(snapshots) > 0
    first = snapshots[0]
    assert "rv14" in first
    assert "sma_20" in first
    assert "rsi_14" in first

