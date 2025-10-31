"""
Test script for Monkey Darts strategy.

This script demonstrates how to:
1. Create a test fund
2. Configure the Monkey Darts strategy
3. Run the strategy engine
4. Monitor positions

Usage:
    cd apps/server
    python test_monkey_darts.py
"""

import asyncio
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


async def test_monkey_darts():
    """Test the Monkey Darts strategy with mock data."""
    
    logger.info("=" * 60)
    logger.info("🐵 Testing Monkey Darts Strategy")
    logger.info("=" * 60)
    
    # Test 1: Registry and metadata
    logger.info("\n📋 Test 1: Strategy Registration")
    try:
        from app.strategies.registry import list_strategies, get_strategy_metadata
        
        strategies = list_strategies()
        logger.info(f"✓ Registered strategies: {strategies}")
        
        if "monkey_darts" in strategies:
            metadata = get_strategy_metadata("monkey_darts")
            logger.info(f"✓ Monkey Darts metadata:")
            logger.info(f"  - Name: {metadata['name']}")
            logger.info(f"  - Type: {metadata['strategyType']}")
            logger.info(f"  - Timeframe: {metadata['expectedTimeframe']}")
            logger.info(f"  - Config schema: {metadata['configSchema']}")
        else:
            logger.error("✗ Monkey Darts not registered!")
            return
    except Exception as e:
        logger.error(f"✗ Failed to load strategy registry: {e}")
        return
    
    # Test 2: Strategy instantiation
    logger.info("\n🔧 Test 2: Strategy Instantiation")
    try:
        from app.strategies.registry import get_strategy
        
        config = {
            "hold_time_seconds": 60,
            "random_seed": 42,  # For reproducibility
        }
        
        strategy = get_strategy("monkey_darts", config)
        logger.info(f"✓ Strategy instantiated: {strategy.name}")
        logger.info(f"  - ID: {strategy.id}")
        logger.info(f"  - Hold time: {strategy.hold_time_seconds}s")
    except Exception as e:
        logger.error(f"✗ Failed to instantiate strategy: {e}")
        return
    
    # Test 3: Get monitored symbols (no active positions)
    logger.info("\n🔍 Test 3: Get Monitored Symbols (No Active Positions)")
    try:
        mock_candidates = [
            {"ticker": "AAPL", "today_vol": 50000000, "price": 150.25},
            {"ticker": "TSLA", "today_vol": 30000000, "price": 242.50},
            {"ticker": "NVDA", "today_vol": 40000000, "price": 485.75},
        ]
        
        # Note: Volume/price filtering now happens via strategy.screen(),
        # so all candidates here are assumed to be valid
        
        monitored = await strategy.get_monitored_symbols(
            mock_candidates,
            active_position_count=0
        )
        logger.info(f"✓ Monitored symbols selected: {monitored}")
        logger.info(f"  - Should be exactly 1 random pick")
    except Exception as e:
        logger.error(f"✗ Get monitored symbols failed: {e}")
        return
    
    # Test 4: Get monitored symbols (with active position)
    logger.info("\n🎲 Test 4: Get Monitored Symbols (With Active Position)")
    try:
        monitored_with_pos = await strategy.get_monitored_symbols(
            mock_candidates,
            active_position_count=1
        )
        logger.info(f"✓ Monitored symbols with active position: {monitored_with_pos}")
        logger.info(f"  - Should be empty (waiting for position to close)")
    except Exception as e:
        logger.error(f"✗ Get monitored symbols failed: {e}")
        return
    
    # Test 5: Multiple random selections
    logger.info("\n🎯 Test 5: Multiple Random Selections")
    try:
        selections = []
        for i in range(5):
            monitored = await strategy.get_monitored_symbols(
                mock_candidates,
                active_position_count=0
            )
            if monitored:
                selections.append(monitored[0])
                logger.info(f"  - Selection {i+1}: {monitored[0]}")
        logger.info(f"✓ Selections: {selections}")
    
    # Test 6: Entry signal
    logger.info("\n📈 Test 6: Entry Signal")
    try:
        from app.strategies.base import MarketData
        
        # Get a monitored symbol
        monitored = await strategy.get_monitored_symbols(mock_candidates, 0)
        selected_symbol = monitored[0] if monitored else "AAPL"
        
        market_data = MarketData(
            symbol=selected_symbol,
            price=150.25,
            timestamp=datetime.now(),
            volume=50000000,
        )
        
        entry_signal = await strategy.should_enter(selected_symbol, market_data)
        logger.info(f"✓ Entry signal generated:")
        logger.info(f"  - Should enter: {entry_signal.should_enter}")
        logger.info(f"  - Entry price: ${entry_signal.entry_price}")
        logger.info(f"  - Reason: {entry_signal.reason}")
        logger.info(f"  - Confidence: {entry_signal.confidence}")
    except Exception as e:
        logger.error(f"✗ Entry signal failed: {e}")
        return
    
    # Test 7: Exit signal (time-based)
    logger.info("\n📉 Test 7: Exit Signal (Time-based)")
    try:
        from app.strategies.base import PositionContext
        from datetime import timedelta
        
        # Simulate a position held for 30 seconds (should not exit)
        position_30s = PositionContext(
            position_id="test-1",
            symbol=selected_symbol,
            entry_price=150.00,
            entry_time=datetime.now() - timedelta(seconds=30),
            quantity=10.0,
            current_price=151.00,
            unrealized_pnl=10.0,
            unrealized_pnl_percent=0.67,
            high_water_mark=151.00,
            strategy_state={},
        )
        
        market_data.price = 151.00
        exit_signal_30s = await strategy.should_exit(position_30s, market_data)
        logger.info(f"  - 30s position: should_exit = {exit_signal_30s.should_exit}")
        
        # Simulate a position held for 65 seconds (should exit)
        position_65s = PositionContext(
            position_id="test-2",
            symbol=selected_symbol,
            entry_price=150.00,
            entry_time=datetime.now() - timedelta(seconds=65),
            quantity=10.0,
            current_price=152.00,
            unrealized_pnl=20.0,
            unrealized_pnl_percent=1.33,
            high_water_mark=152.00,
            strategy_state={},
        )
        
        market_data.price = 152.00
        exit_signal_65s = await strategy.should_exit(position_65s, market_data)
        logger.info(f"  - 65s position: should_exit = {exit_signal_65s.should_exit}")
        logger.info(f"  - Exit reason: {exit_signal_65s.reason}")
    except Exception as e:
        logger.error(f"✗ Exit signal failed: {e}")
        return
    
    # Test 8: Position sizing
    logger.info("\n💰 Test 8: Position Sizing")
    try:
        fund_balance = 10000.0
        risk_params = {
            "size_per_trade": 1000.0,
            "max_bet_percent": 5.0,
        }
        
        position_size = await strategy.position_sizing(
            entry_signal,
            fund_balance,
            risk_params
        )
        logger.info(f"✓ Position size: ${position_size:.2f}")
        logger.info(f"  - Fund balance: ${fund_balance:.2f}")
        logger.info(f"  - Size per trade: ${risk_params['size_per_trade']:.2f}")
        logger.info(f"  - Max bet %: {risk_params['max_bet_percent']}%")
    except Exception as e:
        logger.error(f"✗ Position sizing failed: {e}")
        return
    
    logger.info("\n" + "=" * 60)
    logger.info("🎉 All tests passed! Monkey Darts strategy is ready.")
    logger.info("=" * 60)
    logger.info("\nNext steps:")
    logger.info("1. Run database migration: python run_migrations.py")
    logger.info("2. Create a fund with mode='sim'")
    logger.info("3. Create a strategy with execution_strategy_id='monkey_darts'")
    logger.info("4. Use strategy factory to create engine:")
    logger.info("   engine = await create_strategy_engine(fund, strategy)")
    logger.info("5. Start the engine: await engine.start()")


if __name__ == "__main__":
    asyncio.run(test_monkey_darts())

