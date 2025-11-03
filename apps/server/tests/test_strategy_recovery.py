"""
Test crash recovery for level-based strategy system.

Critical tests to ensure that entry/exit levels survive restarts
and strategies can recover from outages without losing state.
"""

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import uuid

from app.strategies.base import EntryLevel, StopUpdate, MarketDataSnapshot, PositionContext
from app.strategies.gpt_5min import GPTFiveGuyStrategy
from app.models.monitoring_state import StrategyMonitoringState
from app.services.strategies.strategy_service import StrategyService


@pytest.mark.asyncio
async def test_entry_level_survives_restart():
    """Test that entry levels are persisted and recovered after restart."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Persist an entry level
    entry_level = EntryLevel(
        entry_price=120.50,
        stop_loss=118.00,
        confidence=0.85,
        order_type="market",
        metadata={"patterns": ["ema_support"], "reasoning": "Test entry"}
    )
    
    state_id = await service.persist_entry_level(fund_id, "TSLA", entry_level)
    assert state_id
    
    # Simulate restart - recover state
    entry_levels, exit_levels = await service.recover_fund_state(fund_id)
    
    # Verify entry level was recovered
    assert len(entry_levels) == 1
    assert len(exit_levels) == 0
    
    recovered = entry_levels[0]
    assert recovered.symbol == "TSLA"
    assert recovered.entry_price == 120.50
    assert recovered.stop_loss == 118.00
    assert recovered.confidence == 0.85
    assert recovered.order_type == "market"
    assert recovered.is_active
    
    # Clean up
    await service.deactivate_level(state_id, "test_cleanup")


@pytest.mark.asyncio
async def test_exit_level_survives_restart():
    """Test that exit levels (stops) are persisted and recovered after restart."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Persist a management state for an open position
    stop_update = StopUpdate(current_stop=119.50)
    
    state_id = await service.persist_management_state(
        fund_id,
        "AAPL",
        position_entry_price=115.00,
        position_entry_time=datetime.now(timezone.utc),
        stop_update=stop_update
    )
    assert state_id
    
    # Simulate restart - recover state
    entry_levels, exit_levels = await service.recover_fund_state(fund_id)
    
    # Verify exit level was recovered
    assert len(entry_levels) == 0
    assert len(exit_levels) == 1
    
    assert "AAPL" in exit_levels
    recovered = exit_levels["AAPL"]
    assert recovered.symbol == "AAPL"
    assert recovered.current_stop_loss == 119.50
    assert recovered.position_entry_price == 115.00
    assert recovered.is_active
    
    # Clean up
    await service.deactivate_level(state_id, "test_cleanup")


@pytest.mark.asyncio
async def test_entry_trigger_detection():
    """Test that entry levels are correctly triggered when price crosses."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Persist entry level at $120
    entry_level = EntryLevel(
        entry_price=120.00,
        stop_loss=118.00,
        confidence=0.9,
        order_type="market"
    )
    
    state_id = await service.persist_entry_level(fund_id, "NVDA", entry_level)
    
    # Get the state
    entry_levels = await service.get_active_entry_levels(fund_id)
    state = entry_levels[0]
    
    # Test: Price above entry (not triggered)
    triggered = await service.check_entry_triggered(state, 125.00, None)
    assert not triggered
    
    # Test: Price crosses entry (triggered)
    triggered = await service.check_entry_triggered(state, 119.50, 121.00)
    assert triggered
    
    # Mark as triggered
    await service.mark_triggered(state_id, 119.50)
    
    # Verify it's no longer active
    entry_levels = await service.get_active_entry_levels(fund_id)
    assert len(entry_levels) == 0


@pytest.mark.asyncio
async def test_stop_hit_detection():
    """Test that stops are correctly detected when price falls."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Persist management state with stop at $118
    stop_update = StopUpdate(current_stop=118.00)
    
    state_id = await service.persist_management_state(
        fund_id,
        "TSLA",
        position_entry_price=115.00,
        position_entry_time=datetime.now(timezone.utc),
        stop_update=stop_update
    )
    
    # Get the state
    exit_levels = await service.get_active_exit_levels(fund_id)
    state = exit_levels["TSLA"]
    
    # Test: Price above stop (not hit)
    stop_hit = await service.check_stop_hit(state, 120.00)
    assert not stop_hit
    
    # Test: Price hits stop (triggered)
    stop_hit = await service.check_stop_hit(state, 117.50)
    assert stop_hit
    
    # Mark as triggered
    await service.mark_triggered(state_id, 117.50)
    
    # Verify it's no longer active
    exit_levels = await service.get_active_exit_levels(fund_id)
    assert len(exit_levels) == 0


@pytest.mark.asyncio
async def test_multiple_funds_independent_state():
    """Test that multiple funds maintain independent monitoring state."""
    
    service = StrategyService()
    fund1_id = str(uuid.uuid4())
    fund2_id = str(uuid.uuid4())
    
    # Fund 1: Set entry level for TSLA
    entry1 = EntryLevel(entry_price=250.00, stop_loss=245.00, confidence=0.8)
    state1_id = await service.persist_entry_level(fund1_id, "TSLA", entry1)
    
    # Fund 2: Set entry level for TSLA (different level)
    entry2 = EntryLevel(entry_price=255.00, stop_loss=250.00, confidence=0.7)
    state2_id = await service.persist_entry_level(fund2_id, "TSLA", entry2)
    
    # Recover state for each fund
    fund1_entry, fund1_exit = await service.recover_fund_state(fund1_id)
    fund2_entry, fund2_exit = await service.recover_fund_state(fund2_id)
    
    # Verify funds have independent state
    assert len(fund1_entry) == 1
    assert len(fund2_entry) == 1
    
    assert fund1_entry[0].entry_price == 250.00
    assert fund2_entry[0].entry_price == 255.00
    
    # Clean up
    await service.deactivate_level(state1_id, "test_cleanup")
    await service.deactivate_level(state2_id, "test_cleanup")


@pytest.mark.asyncio
async def test_stop_update_preserves_history():
    """Test that stop updates preserve audit trail."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Initial stop at $118
    stop1 = StopUpdate(current_stop=118.00)
    state_id = await service.persist_management_state(
        fund_id,
        "AAPL",
        position_entry_price=115.00,
        position_entry_time=datetime.now(timezone.utc),
        stop_update=stop1
    )
    
    # Update stop to $120 (raised to lock profits)
    stop2 = StopUpdate(current_stop=120.00)
    state_id2 = await service.persist_management_state(
        fund_id,
        "AAPL",
        position_entry_price=115.00,
        position_entry_time=datetime.now(timezone.utc),
        stop_update=stop2
    )
    
    # Should be same state ID (update, not create new)
    assert state_id == state_id2
    
    # Verify current stop is updated
    exit_levels = await service.get_active_exit_levels(fund_id)
    assert exit_levels["AAPL"].current_stop_loss == 120.00
    
    # Clean up
    await service.deactivate_level(state_id, "test_cleanup")


@pytest.mark.asyncio
async def test_deactivate_symbol_cleans_all_levels():
    """Test that deactivating a symbol removes both entry and exit levels."""
    
    service = StrategyService()
    fund_id = str(uuid.uuid4())
    
    # Create both entry and exit level for TSLA
    entry = EntryLevel(entry_price=250.00, stop_loss=245.00, confidence=0.8)
    await service.persist_entry_level(fund_id, "TSLA", entry)
    
    stop = StopUpdate(current_stop=248.00)
    await service.persist_management_state(
        fund_id,
        "TSLA",
        position_entry_price=250.00,
        position_entry_time=datetime.now(timezone.utc),
        stop_update=stop
    )
    
    # Verify both exist
    entry_levels, exit_levels = await service.recover_fund_state(fund_id)
    assert len(entry_levels) == 1
    assert len(exit_levels) == 1
    
    # Deactivate all levels for TSLA
    await service.deactivate_symbol_levels(fund_id, "TSLA", "position_closed")
    
    # Verify both are gone
    entry_levels, exit_levels = await service.recover_fund_state(fund_id)
    assert len(entry_levels) == 0
    assert len(exit_levels) == 0


@pytest.mark.asyncio
async def test_gpt_strategy_uses_interval_tracker():
    """Test that GPT strategy respects interval tracking for entry analysis."""
    
    config = {
        "evaluation_interval_minutes": 5,
        "min_confidence": 0.7,
        "max_concurrent_positions": 5,
    }
    strategy = GPTFiveGuyStrategy(config, fund_id="test-fund")
    
    market_data = MarketDataSnapshot(
        symbol="TSLA",
        price=250.00,
        timestamp=datetime.now(timezone.utc)
    )
    
    # Mock GPT helper and candlestick fetching
    with patch.object(strategy, '_get_candlesticks', new_callable=AsyncMock) as mock_candlesticks:
        with patch.object(strategy, '_get_gpt_helper') as mock_gpt:
            # Mock successful GPT response
            mock_helper = MagicMock()
            mock_gpt.return_value = mock_helper
            
            from app.strategies.gpt_5min import GPTTradeSignal
            mock_response = GPTTradeSignal(
                entry_price=248.00,
                stop_loss=245.00,
                confidence=0.85,
                reasoning="Test",
                patterns_identified=["test"]
            )
            mock_helper.get_structured_response = AsyncMock(return_value=mock_response)
            
            # Mock candlesticks
            mock_candlesticks.return_value = [
                {
                    "timestamp": datetime.now(timezone.utc),
                    "open": 249.00,
                    "high": 251.00,
                    "low": 248.00,
                    "close": 250.00,
                    "volume": 1000000
                }
            ]
            
            # First call: should analyze (first time)
            result1 = await strategy.analyze_entry("TSLA", market_data)
            assert result1 is not None
            assert result1.entry_price == 248.00
            
            # Second call immediately: should skip (interval not elapsed)
            result2 = await strategy.analyze_entry("TSLA", market_data)
            assert result2 is None
            
            # Verify GPT was only called once
            assert mock_helper.get_structured_response.call_count == 1

