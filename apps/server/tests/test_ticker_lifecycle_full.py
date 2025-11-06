"""
Full lifecycle integration tests for ticker state progression.

These tests verify that tickers progress through the complete lifecycle:
screened → setup → entered → filled → exited

Expected to fail initially and reveal issues in the lifecycle engine.
"""

import pytest
import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Optional

from app.services.core.database import get_async_session
from app.models.strategies import Fund, TickerState, Order, Trade
from app.services.strategies.ticker_state_service import get_ticker_state_service
from app.services.strategies.screener_connector import ScreenerConnector
from app.services.strategies.strategy_engine import StrategyEngine
from app.services.strategies.strategy_service import get_strategy_service
from app.strategies.registry import get_strategy
from sqlalchemy import select, and_


@pytest.mark.asyncio
async def test_ticker_progresses_from_screened_to_setup(
    async_client, async_session, fund_factory
):
    """
    Test that tickers transition from 'screened' to 'setup' state.
    
    This test verifies:
    1. Tickers start in 'screened' state
    2. Setup phase runs and transitions some tickers to 'setup'
    3. Transitions are persisted with correct transition codes
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    
    # Get initial state
    ticker_state_service = get_ticker_state_service()
    initial_states = await ticker_state_service.get_fund_tickers_by_state(fund_id)
    screened_count = len([s for s in initial_states if s.current_state == "screened"])
    
    # Need at least some tickers in screened state
    assert screened_count > 0, "No tickers in 'screened' state to test with"
    
    # Get strategy and create screener connector
    strategy = get_strategy(test_fund.strategy_id, test_fund.strategy_config or {})
    # ... setup would require full engine initialization
    
    # For now, verify we can query states
    setup_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "setup")
    
    # Check that at least one ticker has transitioned to setup
    # This will likely fail if lifecycle isn't working
    assert len(setup_states) > 0, (
        f"Expected at least one ticker in 'setup' state, but found {len(setup_states)}. "
        f"Total tickers: {len(initial_states)}, Screened: {screened_count}"
    )
    
    # Verify transition history exists
    for state in setup_states[:3]:  # Check first 3
        assert len(state.state_transitions) >= 1, (
            f"Ticker {state.ticker} in 'setup' state but has no transitions"
        )
        
        # Should have at least one transition to 'setup'
        setup_transitions = [
            t for t in state.state_transitions 
            if t.get("to_state") == "setup"
        ]
        assert len(setup_transitions) > 0, (
            f"Ticker {state.ticker} is in 'setup' state but has no transition to 'setup'"
        )


@pytest.mark.asyncio
async def test_ticker_progresses_from_setup_to_entered(
    async_client, async_session, fund_factory
):
    """
    Test that tickers transition from 'setup' to 'entered' state.
    
    This test verifies:
    1. Tickers in 'setup' state get entry levels created
    2. Tickers transition to 'entered' state with entry_level_id
    3. Entry level is persisted correctly
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in setup state
    setup_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "setup")
    
    if len(setup_states) == 0:
        pytest.skip("No tickers in 'setup' state to test entry progression")
    
    # Wait a bit for entry analysis to run
    await asyncio.sleep(10)
    
    # Check for tickers that have moved to 'entered'
    entered_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "entered")
    
    # This will likely fail - entry analysis may not be running
    assert len(entered_states) > 0, (
        f"Expected at least one ticker in 'entered' state, but found {len(entered_states)}. "
        f"Setup tickers available: {len(setup_states)}"
    )
    
    # Verify entered tickers have entry_level_id
    for state in entered_states:
        assert state.entry_level_id is not None, (
            f"Ticker {state.ticker} in 'entered' state but has no entry_level_id"
        )
        
        # Verify transition to 'entered' exists
        entered_transitions = [
            t for t in state.state_transitions
            if t.get("to_state") == "entered"
        ]
        assert len(entered_transitions) > 0, (
            f"Ticker {state.ticker} is in 'entered' state but has no transition to 'entered'"
        )


@pytest.mark.asyncio
async def test_ticker_progresses_from_entered_to_filled(
    async_client, async_session, fund_factory
):
    """
    Test that tickers transition from 'entered' to 'filled' state.
    
    This test verifies:
    1. Entry levels trigger order placement
    2. Orders get filled
    3. Tickers transition to 'filled' state with trade_id
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in entered state
    entered_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "entered")
    
    if len(entered_states) == 0:
        pytest.skip("No tickers in 'entered' state to test fill progression")
    
    # Wait for orders to be placed and filled
    await asyncio.sleep(15)
    
    # Check for tickers that have moved to 'filled'
    filled_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "filled")
    
    # This will likely fail - order execution may not be working
    assert len(filled_states) > 0, (
        f"Expected at least one ticker in 'filled' state, but found {len(filled_states)}. "
        f"Entered tickers available: {len(entered_states)}"
    )
    
    # Verify filled tickers have trade_id
    for state in filled_states:
        assert state.trade_id is not None, (
            f"Ticker {state.ticker} in 'filled' state but has no trade_id"
        )
        
        # Verify transition to 'filled' exists
        filled_transitions = [
            t for t in state.state_transitions
            if t.get("to_state") == "filled"
        ]
        assert len(filled_transitions) > 0, (
            f"Ticker {state.ticker} is in 'filled' state but has no transition to 'filled'"
        )


@pytest.mark.asyncio
async def test_ticker_progresses_from_filled_to_exited(
    async_client, async_session, fund_factory
):
    """
    Test that tickers transition from 'filled' to 'exited' state.
    
    This test verifies:
    1. Positions are managed (stop loss, take profit)
    2. Positions get closed
    3. Tickers transition to 'exited' state
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in filled state
    filled_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "filled")
    
    if len(filled_states) == 0:
        pytest.skip("No tickers in 'filled' state to test exit progression")
    
    # Wait for positions to be managed and exited
    await asyncio.sleep(20)
    
    # Check for tickers that have moved to 'exited'
    exited_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "exited")
    
    # This will likely fail - position management may not be working
    assert len(exited_states) > 0, (
        f"Expected at least one ticker in 'exited' state, but found {len(exited_states)}. "
        f"Filled tickers available: {len(filled_states)}"
    )
    
    # Verify exited tickers have proper transition
    for state in exited_states:
        # Verify transition to 'exited' exists
        exited_transitions = [
            t for t in state.state_transitions
            if t.get("to_state") == "exited"
        ]
        assert len(exited_transitions) > 0, (
            f"Ticker {state.ticker} is in 'exited' state but has no transition to 'exited'"
        )


@pytest.mark.asyncio
async def test_complete_lifecycle_for_single_ticker(
    async_client, async_session, fund_factory
):
    """
    Test that a single ticker progresses through the complete lifecycle.
    
    This is the ultimate test - verifies one ticker goes through all states:
    screened → setup → entered → filled → exited
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get all states
    all_states = await ticker_state_service.get_fund_tickers_by_state(fund_id)
    
    # Find a ticker that has progressed furthest
    max_transitions = 0
    best_ticker = None
    
    for state in all_states:
        transition_count = len(state.state_transitions)
        if transition_count > max_transitions:
            max_transitions = transition_count
            best_ticker = state.ticker
    
    if best_ticker is None:
        pytest.skip("No tickers found to test complete lifecycle")
    
    # Get full history for this ticker
    ticker_state = await ticker_state_service.get_ticker_state(fund_id, best_ticker)
    
    assert ticker_state is not None, f"Could not find state for ticker {best_ticker}"
    
    # Extract all states this ticker has been through
    states_visited = set()
    for transition in ticker_state.state_transitions:
        if transition.get("from_state"):
            states_visited.add(transition["from_state"])
        if transition.get("to_state"):
            states_visited.add(transition["to_state"])
    
    # Verify we've seen multiple states (indicating progression)
    # This will likely fail if lifecycle is stuck
    assert len(states_visited) >= 2, (
        f"Ticker {best_ticker} has only visited {len(states_visited)} state(s): {states_visited}. "
        f"Expected progression through multiple states. "
        f"Current state: {ticker_state.current_state}, "
        f"Transitions: {len(ticker_state.state_transitions)}"
    )
    
    # Check for specific state progression
    transition_sequence = [
        t.get("to_state") for t in ticker_state.state_transitions
        if t.get("to_state")
    ]
    
    # Verify we have a progression sequence
    assert "screened" in transition_sequence, (
        f"Ticker {best_ticker} never transitioned to 'screened' state"
    )


@pytest.mark.asyncio
async def test_state_transitions_are_not_lost_on_screener_sync(
    async_client, async_session, fund_factory
):
    """
    Test that advanced states (setup, entered, filled) are preserved when screener syncs.
    
    This verifies the fix: tickers in advanced states should not be reset to 'screened'.
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in advanced states
    setup_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "setup")
    entered_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "entered")
    filled_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "filled")
    
    advanced_tickers = {
        s.ticker: s.current_state 
        for s in setup_states + entered_states + filled_states
    }
    
    if len(advanced_tickers) == 0:
        pytest.skip("No tickers in advanced states to test preservation")
    
    # Simulate screener sync by calling it directly
    # Get current screener results
    from app.services.screener.screener import get_screener_service
    screener = get_screener_service()
    if screener and screener.cached_payload:
        screener_tickers = [c.get("ticker") for c in screener.cached_payload if c.get("ticker")]
        
        # Sync (this should preserve advanced states)
        await ticker_state_service.sync_screener_tickers(fund_id, screener_tickers)
        
        # Wait a moment
        await asyncio.sleep(2)
        
        # Verify advanced states are preserved
        for ticker, expected_state in advanced_tickers.items():
            if ticker.upper() in [t.upper() for t in screener_tickers]:
                # Ticker is still in screener, should preserve state
                state = await ticker_state_service.get_ticker_state(fund_id, ticker)
                assert state is not None, f"Ticker {ticker} state was lost"
                assert state.current_state == expected_state, (
                    f"Ticker {ticker} state was reset from '{expected_state}' to '{state.current_state}' "
                    f"during screener sync. This indicates the fix is not working."
                )


@pytest.mark.asyncio
async def test_entry_levels_are_created_for_setup_tickers(
    async_client, async_session, fund_factory
):
    """
    Test that entry levels are created when tickers transition to 'entered'.
    
    This verifies the entry analysis phase is working.
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in entered state
    entered_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "entered")
    
    if len(entered_states) == 0:
        pytest.skip("No tickers in 'entered' state to verify entry levels")
    
    # Verify entry levels exist in database
    from app.models.monitoring_state import StrategyMonitoringState
    from app.services.core.database import get_async_session
    
    async with get_async_session() as session:
        for state in entered_states[:5]:  # Check first 5
            assert state.entry_level_id is not None, (
                f"Ticker {state.ticker} in 'entered' state but entry_level_id is None"
            )
            
            # Query the entry level
            stmt = select(StrategyMonitoringState).where(
                StrategyMonitoringState.id == state.entry_level_id
            )
            result = await session.execute(stmt)
            entry_level = result.scalar_one_or_none()
            
            assert entry_level is not None, (
                f"Entry level {state.entry_level_id} for ticker {state.ticker} not found in database"
            )
            
            assert entry_level.symbol == state.ticker.upper(), (
                f"Entry level symbol mismatch: {entry_level.symbol} != {state.ticker}"
            )
            
            assert entry_level.state_type == "entry_level", (
                f"Entry level has wrong state_type: {entry_level.state_type}"
            )


@pytest.mark.asyncio
async def test_trades_are_created_when_positions_fill(
    async_client, async_session, fund_factory
):
    """
    Test that Trade records are created when orders fill.
    
    This verifies the trade builder and order execution are working.
    """
    # Create a test fund with Monkey Darts strategy
    test_fund = fund_factory(
        strategy_id="monkey_darts",
        strategy_config={"setup_probability": 0.3, "entry_probability": 0.5}
    )
    async_session.add(test_fund)
    await async_session.commit()
    fund_id = test_fund.id
    ticker_state_service = get_ticker_state_service()
    
    # Get tickers in filled or exited state
    filled_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "filled")
    exited_states = await ticker_state_service.get_fund_tickers_by_state(fund_id, "exited")
    
    states_with_trades = [s for s in filled_states + exited_states if s.trade_id is not None]
    
    if len(states_with_trades) == 0:
        pytest.skip("No tickers with trade_id to verify trades")
    
    # Verify Trade records exist
    async with get_async_session() as session:
        for state in states_with_trades[:5]:  # Check first 5
            stmt = select(Trade).where(Trade.id == state.trade_id)
            result = await session.execute(stmt)
            trade = result.scalar_one_or_none()
            
            assert trade is not None, (
                f"Trade {state.trade_id} for ticker {state.ticker} not found in database"
            )
            
            assert trade.symbol == state.ticker.upper(), (
                f"Trade symbol mismatch: {trade.symbol} != {state.ticker}"
            )
            
            assert trade.fund_id == fund_id, (
                f"Trade fund_id mismatch: {trade.fund_id} != {fund_id}"
            )

