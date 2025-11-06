"""
Screener Connector Service

Interfaces with the screener system and runs strategy analysis phases.
"""

import logging
from typing import List, Dict, Any, Optional

from app.strategies.base import ExecutionStrategy, MarketDataSnapshot, EntryLevel, PositionContext
from app.services.market.market_data_provider import MarketDataProvider
from app.services.strategies.strategy_service import StrategyService
from app.services.strategies.ticker_state_service import get_ticker_state_service
from app.services.strategies.risk_manager import RiskManager
from app.lib.strategy_logger import StrategyLogger
from app.types import ScreenerCriteria, TickerStateTransitionCode

logger = logging.getLogger(__name__)


class ScreenerConnector:
    """
    Connects to screener and runs strategy analysis phases.
    """
    
    def __init__(
        self,
        fund_id: str,
        screening_criteria_id: Optional[str],
        strategy: ExecutionStrategy,
        strategy_service: StrategyService,
        market_data_provider: MarketDataProvider,
        strategy_logger: StrategyLogger,
        risk_manager: RiskManager,
    ):
        """
        Initialize screener connector.
        
        Args:
            fund_id: Fund ID
            screening_criteria_id: Optional screening criteria ID
            strategy: Execution strategy
            strategy_service: Strategy persistence service
            market_data_provider: Market data provider
            strategy_logger: Logging service
            risk_manager: Risk management service
        """
        self.fund_id = fund_id
        self.screening_criteria_id = screening_criteria_id
        self.strategy = strategy
        self.strategy_service = strategy_service
        self.market_data_provider = market_data_provider
        self.strategy_logger = strategy_logger
        self.risk_manager = risk_manager
        self.ticker_state_service = get_ticker_state_service()
    
    async def get_screened_tickers(self) -> List[str]:
        """
        Get list of tickers from screener.
        
        Returns:
            List of ticker symbols that passed screening
        """
        try:
            from app.services.screener.screener import get_screener_service
            from app.services.core.database import get_async_session
            from app.models.strategies import ScreeningCriteria as ScreeningCriteriaModel
            from app.types import ScreenerCriteria
            
            screener = get_screener_service()
            if not screener:
                self.strategy_logger.fund_message("Screener service not available, no candidates", "debug")
                return []
            
            # If fund has specific screening criteria, run screener directly with that criteria
            if self.screening_criteria_id:
                async with get_async_session() as session:
                    criteria_model = await session.get(ScreeningCriteriaModel, self.screening_criteria_id)
                    
                    if not criteria_model:
                        logger.warning(f"[FUND {self.fund_id}] ScreeningCriteria {self.screening_criteria_id} not found")
                        return []
                    
                    screener_name = criteria_model.name or "Unnamed"
                    params = criteria_model.criteria or {}
                    
                    try:
                        criteria = ScreenerCriteria(**params)
                    except Exception as e:
                        logger.error(f"[FUND {self.fund_id}] Invalid screening criteria: {e}")
                        return []
                    
                    # Run screener directly with criteria - this fetches fresh data from TimescaleDB
                    screener_results = await screener.compute_live_from_criteria(criteria)
                    
                    logger.info(
                        f"[FUND {self.fund_id}] 📊 Screened: '{screener_name}' → {len(screener_results)} stocks"
                    )
            else:
                # No specific criteria - use base screener cached payload (default filters)
                if not screener.cached_payload:
                    self.strategy_logger.fund_message("Screener not ready, no candidates", "debug")
                    return []
                
                screener_results = screener.cached_payload
                self.strategy_logger.fund_message(
                    f"Screener has {len(screener_results)} total candidates (default filters)",
                    "debug"
                )
            
            # Extract tickers
            tickers = [c.get("ticker") for c in screener_results if c.get("ticker")]
            
            if tickers:
                self.strategy_logger.fund_message(f"📊 {len(tickers)} ticker(s) from screener")
            
            # Sync ticker states with screener results
            logger.info(
                f"[SCREENER_SYNC] {self.fund_id}: Syncing {len(tickers)} tickers from screener"
            )
            await self.ticker_state_service.sync_screener_tickers(self.fund_id, tickers)
            logger.debug(
                f"[SCREENER_SYNC] {self.fund_id}: Sync complete for {len(tickers)} tickers"
            )
            
            return tickers
        
        except Exception as e:
            logger.error(f"Error getting screened tickers: {e}", exc_info=True)
            return []
    
    async def run_setup_phase(self, tickers: List[str]) -> List[str]:
        """
        Run setup phase - strategy pre-analyzes and filters tickers.
        
        Args:
            tickers: Input tickers from screener
            
        Returns:
            Filtered tickers that passed setup analysis
        """
        try:
            if not tickers:
                return []
            
            # Build market data dict for all tickers
            market_data_dict = {}
            for ticker in tickers:
                try:
                    market_data = await self.market_data_provider.build_market_data(ticker)
                    market_data_dict[ticker] = market_data
                except Exception as e:
                    logger.warning(f"Failed to get market data for {ticker}: {e}")
            
            # Call strategy's setup phase
            filtered_tickers = await self.strategy.analyze_setup(
                tickers,
                market_data_dict
            )
            
            self.strategy_logger.fund_message(
                f"🔍 Setup phase: {len(filtered_tickers)}/{len(tickers)} ticker(s) passed"
            )
            
            # Transition tickers based on setup results
            # Note: Strategy should provide transition codes via setup failures
            # For now, we'll transition all passing tickers to 'setup' state
            # Individual strategies can provide more detailed transition codes
            filtered_set = set(filtered_tickers)
            passed_count = 0
            failed_count = 0
            
            for ticker in tickers:
                if ticker in filtered_set:
                    # Ticker passed setup
                    passed_count += 1
                    logger.info(
                        f"[SETUP_PHASE] {self.fund_id}/{ticker}: PASSED setup → transitioning to 'setup' state"
                    )
                    await self.ticker_state_service.transition_ticker(
                        fund_id=self.fund_id,
                        ticker=ticker,
                        to_state="setup",
                        transition_code=TickerStateTransitionCode.SETUP_PASSED.value,
                        description="Ticker passed setup phase analysis"
                    )
                else:
                    # Ticker failed setup - transition to removed
                    # Note: Strategies should provide specific failure codes
                    # For now, use generic code
                    failed_count += 1
                    logger.debug(
                        f"[SETUP_PHASE] {self.fund_id}/{ticker}: FAILED setup → transitioning to 'removed' state"
                    )
                    await self.ticker_state_service.transition_ticker(
                        fund_id=self.fund_id,
                        ticker=ticker,
                        to_state="removed",
                        transition_code=TickerStateTransitionCode.SETUP_FAILED_OTHER.value,
                        description="Ticker failed setup phase analysis"
                    )
            
            logger.info(
                f"[SETUP_PHASE] {self.fund_id}: Completed transitions - "
                f"{passed_count} passed (→ setup), {failed_count} failed (→ removed)"
            )
            
            return filtered_tickers
        
        except Exception as e:
            logger.error(f"Error in setup phase: {e}", exc_info=True)
            return tickers  # Return original list on error
    
    async def run_entry_analysis(
        self,
        tickers: List[str],
        active_positions: Dict[str, PositionContext],
        can_trade: bool,
        trade_restriction_reason: str
    ) -> None:
        """
        Run entry analysis phase - strategy analyzes tickers and sets entry levels.
        
        Args:
            tickers: Tickers to analyze (from current screener results)
            active_positions: Current active positions
            can_trade: Whether we can enter new trades (from risk check)
            trade_restriction_reason: Reason if can't trade
        """
        try:
            if not can_trade:
                self.strategy_logger.fund_message(
                    f"⚠️ Cannot enter new positions: {trade_restriction_reason}",
                    "warning"
                )
                return
            
            # Check trading hours
            if not self.risk_manager.is_trading_time():
                self.strategy_logger.fund_message(
                    "🕐 Outside trading hours, skipping entry analysis",
                    "debug"
                )
                return
            
            # Get all tickers in "setup" state from database
            # This ensures we analyze tickers that passed setup even if they're no longer in screener
            setup_states = await self.ticker_state_service.get_fund_tickers_by_state(
                self.fund_id,
                state="setup"
            )
            setup_tickers = {state.ticker for state in setup_states}
            
            # Combine current screener tickers with setup state tickers
            # Use a set to avoid duplicates
            all_tickers_to_analyze = set(tickers) | setup_tickers
            
            if not all_tickers_to_analyze:
                logger.debug(f"[ENTRY_ANALYSIS] No tickers to analyze (screener: {len(tickers)}, setup: {len(setup_tickers)})")
                return
            
            logger.info(
                f"[ENTRY_ANALYSIS] Analyzing {len(all_tickers_to_analyze)} ticker(s) "
                f"(from screener: {len(tickers)}, from setup state: {len(setup_tickers)})"
            )
            
            # Get existing active entry levels to avoid re-analyzing
            existing_entry_levels = await self.strategy_service.get_active_entry_levels(self.fund_id)
            existing_entry_symbols = {state.symbol for state in existing_entry_levels}
            
            for ticker in all_tickers_to_analyze:
                # Skip if already have position
                if ticker in active_positions:
                    logger.debug(f"⏭️ Skipping {ticker} - already have position")
                    continue
                
                # Skip if already has an active entry level
                if ticker in existing_entry_symbols:
                    logger.debug(f"⏭️ Skipping {ticker} - already has active entry level")
                    continue
                
                try:
                    # Get market data
                    market_data = await self.market_data_provider.build_market_data(ticker)
                    
                    # Call strategy's entry analysis
                    entry_level = await self.strategy.analyze_entry(ticker, market_data)
                    
                    if entry_level:
                        # Persist to DB
                        state_id = await self.strategy_service.persist_entry_level(
                            self.fund_id,
                            ticker,
                            entry_level
                        )
                        
                        # Transition ticker to 'entered' state
                        await self.ticker_state_service.transition_ticker(
                            fund_id=self.fund_id,
                            ticker=ticker,
                            to_state="entered",
                            transition_code=TickerStateTransitionCode.ENTRY_LEVEL_CREATED.value,
                            description=f"Entry level created: ${entry_level.entry_price:.2f} (stop: ${entry_level.stop_loss:.2f})",
                            entry_level_id=state_id
                        )
                        
                        self.strategy_logger.entry_level_set(
                            ticker,
                            entry_level.entry_price,
                            entry_level.stop_loss,
                            entry_level.confidence
                        )
                
                except Exception as e:
                    logger.error(f"Error analyzing entry for {ticker}: {e}", exc_info=True)
        
        except Exception as e:
            logger.error(f"Error in entry analysis phase: {e}", exc_info=True)

