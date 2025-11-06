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
            tickers: Tickers to analyze
            active_positions: Current active positions
            can_trade: Whether we can enter new trades (from risk check)
            trade_restriction_reason: Reason if can't trade
        """
        try:
            if not tickers:
                return
            
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
            
            for ticker in tickers:
                # Skip if already have position
                if ticker in active_positions:
                    logger.debug(f"⏭️ Skipping {ticker} - already have position")
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
    
    async def _apply_screening_filters(self, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Apply ScreeningCriteria filters to existing candidates.
        
        This filters the candidates that came from the base screener rather than
        running a new query, ensuring the workflow is:
        1. Base screener picks candidates
        2. Fund's screening criteria filters those candidates
        3. Filtered candidates are analyzed for setups
        4. Setup passers are checked for entries
        
        Args:
            candidates: Candidate stocks from screener
            
        Returns:
            Filtered candidates
        """
        if not self.screening_criteria_id:
            return candidates
        
        try:
            from app.services.core.database import get_async_session
            from app.models.strategies import ScreeningCriteria as ScreeningCriteriaModel
            from app.services.screener.screener_filters import (
                passes_price_filter,
                passes_volume_filter,
                is_likely_etf,
            )
            from app.services.screener.ticker_filter import get_filtered_tickers, FilterCriteria
            
            async with get_async_session() as session:
                criteria = await session.get(ScreeningCriteriaModel, self.screening_criteria_id)
                
                if not criteria:
                    logger.warning(f"[FUND {self.fund_id}] ScreeningCriteria {self.screening_criteria_id} not found")
                    return candidates
                
                screener_name = criteria.name or "Unnamed"
                params = criteria.criteria or {}
                
                try:
                    criteria_model = ScreenerCriteria(**params)
                except Exception:
                    criteria_model = None
                
                # Extract filter parameters
                min_price = params.get("min_price")
                max_price = params.get("max_price")
                min_volume = params.get("min_volume")
                min_change_percent = params.get("min_change_percent")
                max_change_percent = params.get("max_change_percent")
                min_relative_volume = params.get("min_relative_volume")
                exclude_etfs = params.get("exclude_etfs", True)
                asset_types = params.get("asset_types")
                market_cap_min = params.get("market_cap_min")
                market_cap_max = params.get("market_cap_max")
                float_min = params.get("float_min")
                float_max = params.get("float_max")
                technical_filters = params.get("technical_filters")
                limit = params.get("limit", 200)
                
                # If we have database filters (market cap, float, asset types), get allowed tickers
                allowed_tickers_set = None
                if market_cap_min is not None or market_cap_max is not None or \
                   float_min is not None or float_max is not None or \
                   asset_types:
                    filter_criteria = FilterCriteria(
                        asset_types=asset_types,
                        market_cap_min=market_cap_min,
                        market_cap_max=market_cap_max,
                        float_min=float_min,
                        float_max=float_max,
                    )
                    allowed_tickers = await get_filtered_tickers(filter_criteria)
                    allowed_tickers_set = set(allowed_tickers)
                
                # Filter candidates
                filtered = []
                for candidate in candidates:
                    ticker = candidate.get("ticker")
                    if not ticker:
                        continue
                    
                    # Apply database filters (market cap, float, asset types)
                    if allowed_tickers_set is not None and ticker not in allowed_tickers_set:
                        continue
                    
                    # Get candidate data
                    current_price = candidate.get("price")
                    yesterday_close = candidate.get("close", current_price)
                    volume = candidate.get("volume") or candidate.get("today_vol", 0.0)
                    rv14 = candidate.get("rv14") or candidate.get("rv", 0.0)
                    change_close_pct = candidate.get("change_close") or candidate.get("change_close_pct", 0.0)
                    
                    # Skip if missing required data
                    if current_price is None:
                        continue
                    
                    # Apply price filter
                    if min_price is not None or max_price is not None:
                        filter_min = min_price if min_price is not None else 0.0
                        filter_max = max_price if max_price is not None else float('inf')
                        if not passes_price_filter(current_price, yesterday_close, filter_min, filter_max):
                            continue
                    
                    # Apply volume filter
                    if min_volume is not None:
                        if not passes_volume_filter(volume, min_volume):
                            continue
                    
                    # Apply relative volume filter
                    if min_relative_volume is not None:
                        if rv14 < min_relative_volume:
                            continue
                    
                    # Apply change percent filters
                    if min_change_percent is not None and change_close_pct < min_change_percent:
                        continue
                    if max_change_percent is not None and change_close_pct > max_change_percent:
                        continue
                    
                    # Apply ETF exclusion
                    if exclude_etfs and is_likely_etf(ticker):
                        continue
                    
                    # Apply technical filters if provided
                    # Note: Technical filters require historical bars, which may not be available
                    # in the candidate data. For now, we skip technical filters on candidates.
                    # This could be enhanced later if needed.
                    if technical_filters:
                        # Technical filters would require additional data/calculations
                        # For now, we'll pass candidates through if basic filters passed
                        # TODO: Implement technical filter evaluation if needed
                        pass
                    
                    filtered.append(candidate)
                
                # Apply limit
                filtered = filtered[:limit]
                
                logger.info(
                    f"[FUND {self.fund_id}] 📊 Screened: '{screener_name}' → {len(filtered)} stocks (from {len(candidates)} candidates)"
                )
                return filtered
        
        except Exception as e:
            logger.error(f"[FUND {self.fund_id}] Error applying screening filters: {e}", exc_info=True)
            return candidates  # Return unfiltered on error

