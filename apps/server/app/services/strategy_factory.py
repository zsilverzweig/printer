"""
Strategy Engine Factory

Factory functions for creating StrategyEngine instances with proper
safety checks and service dependencies.
"""

import logging
from typing import Dict, Any

from app.models.strategies import Fund
from app.services.alpaca_service import AlpacaService
from app.services.market_data_provider import MarketDataProvider
from app.services.strategy_engine import StrategyEngine
from app.strategies.registry import get_strategy
import app.core as core

logger = logging.getLogger(__name__)


async def create_strategy_engine(
    fund: Fund
) -> StrategyEngine:
    """
    Factory function to create a StrategyEngine with all dependencies.
    
    This function:
    1. Creates the appropriate AlpacaService based on fund mode (sim/real)
    2. Verifies the fund mode matches the trading credentials
    3. Creates MarketDataProvider
    4. Instantiates the ExecutionStrategy
    5. Creates and returns the StrategyEngine
    
    Args:
        fund: Fund object with all configuration (strategy, risk params, position sizing)
        
    Returns:
        Configured StrategyEngine instance
        
    Raises:
        ValueError: If fund mode doesn't match available credentials or strategy_id is missing
        RuntimeError: If strategy instantiation fails
    """
    logger.info(
        f"🏗️  Creating strategy engine for fund {fund.id} "
        f"(name={fund.name}, mode={fund.mode}, balance=${fund.balance:.2f})"
    )
    
    if not fund.strategy_id:
        raise ValueError(f"Fund {fund.id} has no strategy_id configured")
    
    logger.info(
        f"🏗️  Strategy parameters: strategy_id={fund.strategy_id}, "
        f"size_per_trade=${fund.size_per_trade:.2f}, "
        f"max_bet_percent={fund.max_bet_percent}"
    )
    
    # Determine if this is paper trading based on fund mode
    is_paper_trading = (fund.mode == "sim")
    
    # Create AlpacaService with appropriate mode
    try:
        alpaca_service = AlpacaService(paper_trading=is_paper_trading)
        
        if not alpaca_service.is_available():
            mode_label = "paper" if is_paper_trading else "real"
            raise RuntimeError(
                f"Alpaca {mode_label} trading credentials not configured. "
                f"Fund mode is '{fund.mode}' but required environment variables are missing."
            )
        
        logger.info(
            f"✓ Alpaca service created in {'paper' if is_paper_trading else 'real'} trading mode"
        )
    except Exception as e:
        logger.error(f"Failed to create Alpaca service: {e}")
        raise
    
    # Create MarketDataProvider
    try:
        market_data_provider = MarketDataProvider(
            polygon_client=core.get_client(),
            alpaca_data_client=alpaca_service.data_client,
        )
        logger.info("✓ Market data provider created")
    except Exception as e:
        logger.error(f"Failed to create market data provider: {e}")
        raise
    
    # Instantiate ExecutionStrategy
    try:
        execution_strategy = get_strategy(
            fund.strategy_id,
            fund.strategy_config
        )
        logger.info(
            f"✓ Execution strategy '{fund.strategy_id}' instantiated"
        )
    except Exception as e:
        logger.error(f"Failed to instantiate execution strategy: {e}")
        raise
    
    # Create StrategyEngine (will verify mode match in constructor)
    try:
        engine = StrategyEngine(
            fund=fund,
            execution_strategy=execution_strategy,
            market_data_provider=market_data_provider,
            alpaca_service=alpaca_service,
        )
        logger.info(f"✓ Strategy engine created successfully for fund {fund.id}")
        return engine
    except Exception as e:
        logger.error(f"Failed to create strategy engine: {e}")
        raise


def validate_fund_credentials(fund: Fund) -> bool:
    """
    Validate that appropriate trading credentials exist for the fund mode.
    
    Args:
        fund: Fund to validate
        
    Returns:
        True if credentials are available, False otherwise
    """
    import os
    
    if fund.mode == "sim":
        # Paper trading requires ALPACA_API_KEY and ALPACA_SECRET_KEY
        has_creds = bool(
            os.getenv("ALPACA_API_KEY") and 
            os.getenv("ALPACA_SECRET_KEY")
        )
        if not has_creds:
            logger.warning(f"Paper trading credentials missing for fund {fund.id}")
        return has_creds
    else:
        # Real trading requires ALPACA_REAL_API_KEY and ALPACA_REAL_SECRET_KEY
        has_creds = bool(
            os.getenv("ALPACA_REAL_API_KEY") and 
            os.getenv("ALPACA_REAL_SECRET_KEY")
        )
        if not has_creds:
            logger.warning(f"Real trading credentials missing for fund {fund.id}")
        return has_creds


