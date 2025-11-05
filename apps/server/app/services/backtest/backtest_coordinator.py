"""
Backtest Coordinator.

Orchestrates the execution of a backtest by:
1. Validating data availability for the target date
2. Setting up the time context
3. Running the strategy engine minute-by-minute
4. Simulating order fills
5. Collecting and storing results
"""

import logging
import uuid
from datetime import datetime, date, timedelta, timezone, time as dt_time

from app.services.core.time_context import get_current_time
from typing import Dict, List, Optional, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategies import Fund, Backtest, Order, Transaction, Trade, ScreeningCriteria
from app.services.analytics.trade_builder import TradeBuilder
from app.models.market_data import MarketData
from app.services.core.database import get_async_session
from app.services.core.time_context import (
    set_backtest_context,
    update_backtest_time,
    clear_backtest_context,
    get_backtest_id
)
from app.services.backtest.order_simulator import OrderSimulator
from app.services.backtest.backtest_lookup_service import check_lookup_coverage, populate_lookup_for_date
from app.services.strategies.strategy_factory import create_strategy_engine
from app.services.trading.alpaca_backtest_wrapper import AlpacaBacktestWrapper
from app.services.events.event_service import event_service

logger = logging.getLogger(__name__)


async def create_backtest_fund_from_template(
    template_fund: Fund,
    strategy_id: str,
    strategy_config: dict,
    screening_criteria_id: Optional[str],
    parent_run_id: str,
    combo_index: int
) -> str:
    """
    Create a temporary backtest fund from a template fund.
    
    Args:
        template_fund: The fund template to copy from
        strategy_id: Strategy ID for this combination
        strategy_config: Strategy configuration
        screening_criteria_id: Screening criteria ID for this combination
        parent_run_id: Parent run ID for grouping
        combo_index: Index of this combination in the run
        
    Returns:
        Created fund ID
    """
    fund_id = str(uuid.uuid4())
    
    # Get screening criteria name if exists
    screening_criteria_name = None
    if screening_criteria_id:
        async with get_async_session() as session:
            criteria = await session.get(ScreeningCriteria, screening_criteria_id)
            if criteria:
                screening_criteria_name = criteria.name
    
    # Create fund name
    fund_name = f"{template_fund.name}_backtest_{parent_run_id[:8]}_{strategy_id}_{combo_index}"
    
    # Default values for backtest funds
    DEFAULT_BALANCE = 10000.0  # $10k default starting balance
    DEFAULT_SIZE_PER_TRADE = 500.0  # $500 per trade (5% of $10k)
    DEFAULT_TRADING_START = "09:30"
    DEFAULT_TRADING_END = "16:00"
    DEFAULT_TIMEZONE = "America/New_York"
    
    # Use template's balance if > 0, otherwise use default
    initial_balance = template_fund.balance if template_fund.balance > 0 else DEFAULT_BALANCE
    
    # Use template's size_per_trade if set, otherwise use default
    # Note: size_per_trade is now an override, so None means use default
    size_per_trade = template_fund.size_per_trade if template_fund.size_per_trade is not None else DEFAULT_SIZE_PER_TRADE
    
    # Use template's trading hours if set, otherwise use defaults
    trading_start_time = template_fund.trading_start_time or DEFAULT_TRADING_START
    trading_end_time = template_fund.trading_end_time or DEFAULT_TRADING_END
    timezone = template_fund.timezone or DEFAULT_TIMEZONE
    
    async with get_async_session() as session:
        backtest_fund = Fund(
            id=fund_id,
            name=fund_name,
            description=f"Backtest fund for {template_fund.name}",
            mode=template_fund.mode,
            balance=initial_balance,  # Use default if template has no balance
            status="paused",  # Must be paused for backtests
            archived=True,  # Hide from normal fund lists
            icon=template_fund.icon,
            icon_color=template_fund.icon_color,
            strategy_id=strategy_id,
            strategy_config=strategy_config,
            screening_criteria_id=screening_criteria_id,
            max_loss_percent=template_fund.max_loss_percent,
            max_loss_dollars=template_fund.max_loss_dollars,
            max_giveback_percent=template_fund.max_giveback_percent,
            max_order_age_seconds=template_fund.max_order_age_seconds,
            size_per_trade=size_per_trade,
            min_bet_percent=template_fund.min_bet_percent,
            max_bet_percent=template_fund.max_bet_percent,
            max_total_exposure=template_fund.max_total_exposure,
            trading_start_time=trading_start_time,
            trading_end_time=trading_end_time,
            timezone=timezone,
        )
        session.add(backtest_fund)
        await session.commit()
        
        logger.info(
            f"Created backtest fund: {fund_id} ({fund_name}) "
            f"with balance=${initial_balance:,.2f}, size_per_trade=${size_per_trade:,.2f}"
        )
        return fund_id


class BacktestCoordinator:
    """
    Orchestrates backtest execution for a fund.
    
    Manages the complete lifecycle of a backtest from data validation
    through execution to results collection.
    """
    
    def __init__(self):
        """Initialize coordinator with order simulator."""
        self.order_simulator = OrderSimulator()
    
    async def run_backtest(
        self,
        fund_id: str,
        backtest_date: date,
    ) -> str:
        """
        Run backtest for a single trading day.
        
        Args:
            fund_id: Fund to backtest
            backtest_date: Trading day to simulate (date object)
            
        Returns:
            Backtest ID
            
        Raises:
            ValueError: If fund not found or data not available
        """
        backtest_id = str(uuid.uuid4())
        
        try:
            # Get fund and validate
            async with get_async_session() as session:
                fund = await session.get(Fund, fund_id)
                if not fund:
                    raise ValueError(f"Fund {fund_id} not found")
                
                # Check if fund is active
                if fund.status == 'active':
                    raise ValueError(f"Cannot backtest while fund is active. Please pause fund first.")
                
                # Check if there's already a running backtest for this fund
                existing_backtest = await session.execute(
                    select(Backtest).where(
                        Backtest.fund_id == fund_id,
                        Backtest.status == 'running'
                    )
                )
                existing = existing_backtest.scalar_one_or_none()
                if existing:
                    raise ValueError(
                        f"Backtest already running for this fund (backtest_id: {existing.id}). "
                        f"Only one backtest per fund allowed at a time."
                    )
                
                # Get screening criteria name if exists
                screening_criteria_name = None
                if fund.screening_criteria_id:
                    screening_criteria = await session.get(ScreeningCriteria, fund.screening_criteria_id)
                    if screening_criteria:
                        screening_criteria_name = screening_criteria.name
                
                # Create backtest record with snapshot of fund/screener names
                backtest = Backtest(
                    id=backtest_id,
                    fund_id=fund_id,
                    fund_name=fund.name,  # Snapshot fund name
                    date=datetime.combine(backtest_date, dt_time.min).replace(tzinfo=timezone.utc),
                    status='running',
                    strategy_id=fund.strategy_id,
                    strategy_config=fund.strategy_config or {},
                    screening_criteria_id=fund.screening_criteria_id,
                    screening_criteria_name=screening_criteria_name,  # Snapshot screener name
                    starting_balance=fund.balance,
                    started_at=get_current_time()
                )
                session.add(backtest)
                await session.commit()
            
            logger.info(
                f"🚀 [BT:{backtest_id[:8]}] Starting backtest for {fund.name} on {backtest_date}"
            )
            
            # Log backtest start event
            await event_service.log_strategy_engine_event(
                fund_id=fund_id,
                event_category="validation",
                message=f"Backtest started for {backtest_date}",
                event_data={
                    "backtest_id": backtest_id,
                    "backtest_date": backtest_date.isoformat(),
                    "starting_balance": fund.balance,
                    "strategy_id": fund.strategy_id,
                },
                severity="info",
                timestamp=datetime.now(timezone.utc)
            )
            
            # Step 1: Ensure data availability
            await self._ensure_data_available(fund, backtest_date)
            
            # Step 2: Run trading day
            await self._run_trading_day(backtest_id, fund, backtest_date)
            
            # Step 3: Finalize results
            await self._finalize_backtest(backtest_id)
            
            logger.info(f"✅ [BT:{backtest_id[:8]}] Backtest completed successfully")
            return backtest_id
            
        except Exception as e:
            logger.error(f"❌ Backtest {backtest_id} failed: {e}", exc_info=True)
            
            # Mark backtest as failed
            async with get_async_session() as session:
                backtest = await session.get(Backtest, backtest_id)
                if backtest:
                    backtest.status = 'failed'
                    backtest.error_message = str(e)
                    backtest.completed_at = get_current_time()
                    await session.commit()
            
            raise
        finally:
            # Always clear backtest context
            clear_backtest_context()
    
    async def run_multi_strategy_backtest(
        self,
        template_fund_id: str,
        backtest_date: date,
        combinations: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Run backtests for multiple strategy/screener combinations on the same day.
        
        Each combination:
        - Gets its own temporary backtest fund (created from template)
        - Runs independently with the same starting balance
        - Results are linked via parent_run_id
        
        Args:
            template_fund_id: Fund template to use as base configuration
            backtest_date: Trading day to simulate
            combinations: List of dicts with keys:
                - strategy_id: str
                - strategy_config: dict (optional)
                - screening_criteria_id: Optional[str]
                
        Returns:
            Dict with:
                - parent_run_id: str
                - backtests: List of backtest results
                - summary: Aggregated statistics
        """
        parent_run_id = str(uuid.uuid4())
        backtest_results = []
        backtest_fund_ids = []
        
        try:
            # Get template fund
            async with get_async_session() as session:
                template_fund = await session.get(Fund, template_fund_id)
                if not template_fund:
                    raise ValueError(f"Template fund {template_fund_id} not found")
                
                # Validate template is paused
                if template_fund.status == 'active':
                    raise ValueError(f"Cannot backtest while template fund is active. Please pause fund first.")
            
            logger.info(
                f"🚀 [MULTI-BT:{parent_run_id[:8]}] Starting multi-strategy backtest for {template_fund.name} "
                f"on {backtest_date} with {len(combinations)} combinations"
            )
            
            # Run each combination
            for idx, combo in enumerate(combinations):
                strategy_id = combo.get("strategy_id")
                strategy_config = combo.get("strategy_config", {})
                screening_criteria_id = combo.get("screening_criteria_id")
                
                if not strategy_id:
                    logger.warning(f"Skipping combination {idx}: missing strategy_id")
                    continue
                
                try:
                    logger.info(
                        f"[MULTI-BT:{parent_run_id[:8]}] Running combination {idx+1}/{len(combinations)}: "
                        f"strategy={strategy_id}, screener={screening_criteria_id}"
                    )
                    
                    # Create temporary backtest fund
                    backtest_fund_id = await create_backtest_fund_from_template(
                        template_fund=template_fund,
                        strategy_id=strategy_id,
                        strategy_config=strategy_config,
                        screening_criteria_id=screening_criteria_id,
                        parent_run_id=parent_run_id,
                        combo_index=idx
                    )
                    backtest_fund_ids.append(backtest_fund_id)
                    
                    # Run backtest
                    backtest_id = await self.run_backtest(backtest_fund_id, backtest_date)
                    
                    # Update backtest metadata with parent_run_id
                    async with get_async_session() as session:
                        backtest = await session.get(Backtest, backtest_id)
                        if backtest:
                            backtest.backtest_metadata = backtest.backtest_metadata or {}
                            backtest.backtest_metadata["parent_run_id"] = parent_run_id
                            backtest.backtest_metadata["combo_index"] = idx
                            backtest.backtest_metadata["strategy_id"] = strategy_id
                            backtest.backtest_metadata["screening_criteria_id"] = screening_criteria_id
                            await session.commit()
                            
                            # Get serialized backtest
                            backtest_results.append({
                                "backtest_id": backtest_id,
                                "fund_id": backtest_fund_id,
                                "strategy_id": strategy_id,
                                "screening_criteria_id": screening_criteria_id,
                                "status": backtest.status,
                                "starting_balance": backtest.starting_balance,
                                "ending_balance": backtest.ending_balance,
                                "total_pnl": backtest.total_pnl,
                                "total_pnl_percent": backtest.total_pnl_percent,
                                "total_trades": backtest.total_trades,
                                "winning_trades": backtest.winning_trades,
                                "losing_trades": backtest.losing_trades,
                            })
                    
                    logger.info(
                        f"[MULTI-BT:{parent_run_id[:8]}] ✅ Combination {idx+1} completed: "
                        f"backtest_id={backtest_id[:8]}, P&L={backtest.total_pnl_percent:+.2f}%"
                    )
                    
                except Exception as e:
                    logger.error(
                        f"[MULTI-BT:{parent_run_id[:8]}] ❌ Combination {idx+1} failed: {e}",
                        exc_info=True
                    )
                    # Continue with other combinations
                    backtest_results.append({
                        "backtest_id": None,
                        "fund_id": None,
                        "strategy_id": strategy_id,
                        "screening_criteria_id": screening_criteria_id,
                        "status": "failed",
                        "error": str(e),
                    })
            
            # Calculate summary statistics
            successful_backtests = [r for r in backtest_results if r.get("status") == "completed"]
            total_pnl = sum(r.get("total_pnl", 0) for r in successful_backtests)
            total_trades = sum(r.get("total_trades", 0) for r in successful_backtests)
            winning_trades = sum(r.get("winning_trades", 0) for r in successful_backtests)
            
            summary = {
                "total_combinations": len(combinations),
                "successful": len(successful_backtests),
                "failed": len(backtest_results) - len(successful_backtests),
                "total_pnl": total_pnl,
                "total_trades": total_trades,
                "winning_trades": winning_trades,
                "losing_trades": sum(r.get("losing_trades", 0) for r in successful_backtests),
                "win_rate": (winning_trades / total_trades * 100) if total_trades > 0 else 0,
            }
            
            logger.info(
                f"✅ [MULTI-BT:{parent_run_id[:8]}] Multi-strategy backtest complete: "
                f"{summary['successful']}/{summary['total_combinations']} successful, "
                f"Total P&L: ${total_pnl:+.2f}"
            )
            
            return {
                "parent_run_id": parent_run_id,
                "backtests": backtest_results,
                "summary": summary,
            }
            
        except Exception as e:
            logger.error(f"❌ Multi-strategy backtest {parent_run_id} failed: {e}", exc_info=True)
            raise
    
    async def _ensure_data_available(
        self,
        fund: Fund,
        backtest_date: date
    ) -> None:
        """
        Ensure minute bar data is available for backtest date.
        
        Checks if lookup table data exists for the date, and populates it
        if missing. This ensures fast backtest queries.
        
        Args:
            fund: Fund being backtested
            backtest_date: Date to check
            
        Raises:
            ValueError: If data cannot be loaded
        """
        logger.info(f"📊 Checking data availability for {backtest_date}")
        
        # Check if lookup table has data for this date
        coverage = await check_lookup_coverage(backtest_date)
        
        if not coverage["has_data"]:
            logger.info(f"⚠️  Lookup data not found for {backtest_date}, populating...")
            try:
                # Populate the lookup table for this date
                result = await populate_lookup_for_date(backtest_date, timescale='1min')
                logger.info(f"✅ Lookup table populated: {result['total_rows']:,} rows for {result['symbols']} symbols")
            except Exception as e:
                logger.error(f"❌ Failed to populate lookup table: {e}", exc_info=True)
                raise ValueError(f"Failed to populate lookup data for {backtest_date}: {str(e)}")
        else:
            logger.info(f"✅ Lookup data exists: {coverage['total_rows']:,} rows, {coverage['symbols']} symbols, {coverage['minutes']} minutes")
        
        logger.info(f"✅ Data check complete for {backtest_date}")
    
    async def _run_trading_day(
        self,
        backtest_id: str,
        fund: Fund,
        backtest_date: date
    ) -> None:
        """
        Run the trading day minute-by-minute.
        
        Args:
            backtest_id: Backtest ID
            fund: Fund being tested
            backtest_date: Date to simulate
        """
        logger.info(f"📈 Running trading day: {backtest_date}")
        
        # Define trading hours (9:30 AM to 4:00 PM ET)
        start_time = datetime.combine(
            backtest_date,
            dt_time(9, 30)
        ).replace(tzinfo=timezone.utc)
        
        end_time = datetime.combine(
            backtest_date,
            dt_time(16, 0)
        ).replace(tzinfo=timezone.utc)
        
        # Initialize backtest context
        set_backtest_context(backtest_id, start_time)
        
        # Create backtest-mode Alpaca wrapper
        from app.services.trading.alpaca_service import AlpacaService
        from app.services.market.market_data_provider import MarketDataProvider
        from app.strategies.registry import get_strategy
        from app.services.strategies.strategy_engine import StrategyEngine
        
        alpaca_service = AlpacaService(paper_trading=True)
        alpaca_wrapper = AlpacaBacktestWrapper(alpaca_service, fund_id=fund.id)
        
        # Create strategy engine
        logger.info(f"🎯 Initializing strategy engine for backtest")
        
        try:
            # Get strategy instance
            if not fund.strategy_id:
                logger.warning("Fund has no strategy configured, backtest will be empty")
                return
            
            execution_strategy = get_strategy(
                fund.strategy_id,
                fund.strategy_config or {},
                fund_id=fund.id
            )
            
            # Create market data provider
            market_data_provider = MarketDataProvider()
            
            # Create strategy engine with backtest wrapper
            strategy_engine = StrategyEngine(
                fund=fund,
                execution_strategy=execution_strategy,
                market_data_provider=market_data_provider,
                alpaca_service=alpaca_wrapper,  # Use backtest wrapper!
            )
            
            # Don't start the engine (we'll manually call iterations)
            # Just recover state and sync positions
            logger.info(f"📊 Recovering fund state for backtest")
            from app.services.strategies.strategy_service import get_strategy_service
            strategy_service = get_strategy_service()
            entry_levels, exit_levels = await strategy_service.recover_fund_state(fund.id)
            logger.info(f"Recovered {len(entry_levels)} entry, {len(exit_levels)} exit levels")
            
            # Initialize position cache (should be empty for backtest start)
            strategy_engine._position_cache = {}
            
            logger.info(f"⏱️  Backtest time window: {start_time} to {end_time}")
            
            # Track balance separately for this backtest (don't modify real fund balance)
            # Store original balance to restore later
            original_fund_balance = fund.balance
            
            # Create a simulated balance tracker for this backtest
            backtest_balance = original_fund_balance
            
            # PRE-COMPUTE all screener results for the day (much faster than running during loop!)
            logger.info(f"🔍 Pre-computing screener results for entire trading day...")
            screener_cache = await self._precompute_screener_results(
                fund,
                start_time,
                end_time,
                MONITORING_INTERVAL_MINUTES=5
            )
            total_tickers_in_cache = sum(len(tickers) for tickers in screener_cache.values())
            logger.info(
                f"✅ Pre-computed {len(screener_cache)} screener results "
                f"with {total_tickers_in_cache} total ticker entries "
                f"(avg {total_tickers_in_cache/len(screener_cache) if screener_cache else 0:.1f} tickers per iteration)"
            )
            
            if not fund.screening_criteria_id:
                logger.warning(f"[BT:{backtest_id[:8]}] ⚠️  Fund has no screening_criteria_id - strategy will not receive any tickers!")
            elif total_tickers_in_cache == 0:
                logger.warning(f"[BT:{backtest_id[:8]}] ⚠️  Screener returned 0 tickers for entire day! Check screener criteria and data availability.")
            
            current_time = start_time
            minute_count = 0
            iteration_count = 0
            
            # Run strategy monitoring every N minutes (not every minute - too expensive)
            MONITORING_INTERVAL_MINUTES = 5
            
            while current_time <= end_time:
                # Update backtest time context
                update_backtest_time(current_time)
                
                # Log progress every 30 minutes  
                if minute_count % 30 == 0:
                    progress_pct = minute_count / 391 * 100
                    logger.info(f"[BT:{backtest_id[:8]}] ⏰ {current_time.strftime('%H:%M')} | {minute_count}/391 min ({progress_pct:.1f}%)")
                
                # Run strategy monitoring iteration every N minutes
                if minute_count % MONITORING_INTERVAL_MINUTES == 0:
                    try:
                        iteration_count += 1
                        logger.info(f"[BT:{backtest_id[:8]}] 🔄 Iter {iteration_count} @ {current_time.strftime('%H:%M')} | {minute_count}/391 ({minute_count/391*100:.1f}%)")
                        
                        # Get screened tickers using HISTORICAL screener at backtest time
                        from app.services.screener.screener import get_screener_service
                        screener = get_screener_service()
                        tickers = []
                        
                        # Check cache first (historical data never changes for a given timestamp!)
                        cache_key = current_time.isoformat()
                        if cache_key in screener_cache:
                            tickers = screener_cache[cache_key]
                            logger.debug(f"📋 Using cached screener results for {current_time.strftime('%H:%M')}: {len(tickers)} tickers")
                        elif screener and fund.screening_criteria_id:
                            try:
                                # Get screening criteria configuration
                                async with get_async_session() as session:
                                    from app.models.strategies import ScreeningCriteria
                                    criteria_obj = await session.get(ScreeningCriteria, fund.screening_criteria_id)
                                    
                                    if criteria_obj and criteria_obj.criteria:
                                        # Run historical screener at current backtest time
                                        criteria_dict = criteria_obj.criteria
                                        
                                        logger.debug(f"🔍 Running historical screener at {current_time}")
                                        results = await screener.compute_historical(
                                            timestamp=current_time,
                                            min_price=criteria_dict.get('min_price', 5),
                                            max_price=criteria_dict.get('max_price', 100),
                                            min_volume=criteria_dict.get('min_volume'),
                                            min_change_percent=criteria_dict.get('min_change_percent'),
                                            max_change_percent=criteria_dict.get('max_change_percent'),
                                            min_relative_volume=criteria_dict.get('min_relative_volume', 1.5),
                                            order_by=criteria_dict.get('order_by', 'rv14'),
                                            limit=criteria_dict.get('limit', 10),
                                            technical_filters=criteria_dict.get('technical_filters'),
                                            exclude_etfs=criteria_dict.get('exclude_etfs', True),
                                            asset_types=criteria_dict.get('asset_types'),
                                            market_cap_min=criteria_dict.get('market_cap_min'),
                                            market_cap_max=criteria_dict.get('market_cap_max')
                                        )
                                        
                                        if results:
                                            tickers = [r.get('ticker') or r.get('symbol') for r in results[:10]]  # Limit to top 10
                                            logger.info(f"[BT:{backtest_id[:8]}] 📋 Historical screener found {len(tickers)} tickers at {current_time.strftime('%H:%M')}: {tickers}")
                                            # Cache for future use
                                            screener_cache[cache_key] = tickers
                                        else:
                                            logger.info(f"[BT:{backtest_id[:8]}] 📋 Historical screener found no results at {current_time.strftime('%H:%M')}")
                                            screener_cache[cache_key] = []
                                        logger.info(f"[BT:{backtest_id[:8]}] 📊 Screener returned {len(tickers)} tickers for iteration {iteration_count}")
                                    else:
                                        logger.warning(f"Screening criteria {fund.screening_criteria_id} not found or empty")
                            except Exception as e:
                                logger.warning(f"Could not run historical screener: {e}", exc_info=True)
                        
                        if not tickers:
                            # No screener results, skip this iteration
                            logger.warning(f"[BT:{backtest_id[:8]}] ⚠️  No tickers from screener at {current_time.strftime('%H:%M')}, skipping iteration")
                        else:
                            logger.info(f"[BT:{backtest_id[:8]}] 📋 Analyzing {len(tickers)} tickers from screener: {tickers[:5]}{'...' if len(tickers) > 5 else ''}")
                            entry_signals_found = 0
                            # Run entry analysis for each ticker
                            if not tickers:
                                logger.warning(f"[BT:{backtest_id[:8]}] ⚠️  No tickers to process for iteration {iteration_count}")
                            
                            for ticker in tickers:
                                try:
                                    logger.debug(f"[BT:{backtest_id[:8]}] 📊 Analyzing {ticker} for entry signal")
                                    # Get market data snapshot
                                    market_data = await market_data_provider.build_market_data(ticker)
                                    
                                    # Run strategy entry analysis
                                    entry_level = await execution_strategy.analyze_entry(ticker, market_data)
                                    
                                    if entry_level:
                                        entry_signals_found += 1
                                        logger.info(f"[BT:{backtest_id[:8]}] 📊 {ticker}: Entry signal at ${entry_level.entry_price:.2f}, stop=${entry_level.stop_loss:.2f}")
                                        
                                        # For backtest, immediately execute market orders
                                        # (In live mode, we'd persist levels and wait for triggers)
                                        if entry_level.order_type == "market":
                                            # Calculate position size
                                            # Use fund override if set, otherwise use default
                                            effective_size = fund.size_per_trade if fund.size_per_trade is not None else DEFAULT_SIZE_PER_TRADE
                                            position_size = effective_size / entry_level.entry_price
                                            
                                            # Check if we have enough cash
                                            if backtest_balance < effective_size:
                                                logger.warning(f"[BT:{backtest_id[:8]}] ⚠️  Insufficient balance (${backtest_balance:.2f}) for trade (${effective_size:.2f}), skipping")
                                                continue
                                            
                                            # Submit order via backtest wrapper
                                            logger.info(f"[BT:{backtest_id[:8]}] 🎯 Submitting buy order: {position_size:.2f} shares of {ticker} @ ${entry_level.entry_price:.2f} (${effective_size:.2f})")
                                            try:
                                                order_result = await alpaca_wrapper.submit_order(
                                                    symbol=ticker,
                                                    qty=position_size,
                                                    side='buy',
                                                    order_type='market'
                                                )
                                                logger.info(f"[BT:{backtest_id[:8]}] ✅ Order submitted: {order_result['id']}")
                                            except Exception as order_error:
                                                logger.error(
                                                    f"[BT:{backtest_id[:8]}] ❌ Failed to submit order for {ticker}: {order_error}",
                                                    exc_info=True
                                                )
                                                # Continue with other tickers even if one fails
                                                continue
                                    else:
                                        logger.debug(f"[BT:{backtest_id[:8]}] ❌ {ticker}: No entry signal from strategy")
                                
                                except ValueError as e:
                                    # Expected: No bar data for low-volume stocks
                                    if "No bar data available" in str(e):
                                        # Silent skip - this is normal for low-volume stocks
                                        logger.debug(f"[BT:{backtest_id[:8]}] ⚠️  {ticker}: No bar data available (skipping)")
                                    else:
                                        logger.error(f"[BT:{backtest_id[:8]}] ❌ Error analyzing {ticker}: {e}", exc_info=True)
                                    continue
                                except Exception as e:
                                    logger.error(f"[BT:{backtest_id[:8]}] ❌ Error analyzing {ticker}: {e}", exc_info=True)
                                    continue
                            
                            if entry_signals_found > 0:
                                logger.info(f"[BT:{backtest_id[:8]}] ✅ Found {entry_signals_found} entry signal(s) from {len(tickers)} tickers")
                            else:
                                logger.debug(f"[BT:{backtest_id[:8]}] ℹ️  No entry signals from {len(tickers)} tickers at this iteration")
                        
                        # Update position management for open positions
                        active_positions = strategy_engine._position_cache
                        for symbol, position in active_positions.items():
                            try:
                                # Get current market data
                                market_data = await market_data_provider.build_market_data(symbol)
                                position.current_price = market_data.price
                                
                                # Update position P&L
                                position.unrealized_pnl = (market_data.price - position.entry_price) * position.quantity
                                position.unrealized_pnl_percent = ((market_data.price - position.entry_price) / position.entry_price) * 100
                                
                                # Get stop update from strategy
                                stop_update = await execution_strategy.manage_position(position, market_data)
                                
                                # Check if we should exit
                                if stop_update.force_exit or market_data.price <= stop_update.current_stop:
                                    logger.info(f"🚪 Exiting {symbol} at ${market_data.price:.2f} (stop=${stop_update.current_stop:.2f})")
                                    
                                    # Submit sell order
                                    await alpaca_wrapper.submit_order(
                                        symbol=symbol,
                                        qty=position.quantity,
                                        side='sell',
                                        order_type='market'
                                    )
                            
                            except Exception as e:
                                logger.error(f"Error managing position {symbol}: {e}", exc_info=True)
                                continue
                    
                    except Exception as e:
                        logger.error(f"Error in strategy iteration: {e}", exc_info=True)
                
                # Check and fill pending orders at EVERY minute (not just strategy iterations)
                current_bars = await self._get_minute_bars(current_time)
                if current_bars:
                    filled_count = await self.order_simulator.check_pending_orders(
                        fund.id,
                        current_time,
                        current_bars
                    )
                    if filled_count > 0:
                        logger.info(f"💰 Filled {filled_count} order(s) at {current_time.strftime('%H:%M')}")
                        
                        # Log fill events for filled orders
                        async with get_async_session() as session:
                            stmt = select(Order).where(
                                Order.fund_id == fund.id,
                                Order.backtest_id == backtest_id,
                                Order.status == 'filled',
                                Order.filled_at == current_time
                            )
                            result = await session.execute(stmt)
                            filled_orders = result.scalars().all()
                            
                            for order in filled_orders:
                                await event_service.log_strategy_engine_event(
                                    fund_id=fund.id,
                                    event_category="fill_tracking",
                                    message=f"Order filled: {order.symbol} {order.side} {order.filled_qty} @ ${order.filled_avg_price:.2f}",
                                    symbol=order.symbol,
                                    event_data={
                                        "order_id": order.id,
                                        "symbol": order.symbol,
                                        "side": order.side,
                                        "quantity": order.filled_qty,
                                        "price": order.filled_avg_price,
                                        "total_value": order.filled_qty * order.filled_avg_price if order.filled_qty and order.filled_avg_price else None,
                                    },
                                    severity="info",
                                    timestamp=current_time
                                )
                        
                        # Update position cache after fills
                        await self._sync_positions_from_transactions(
                            strategy_engine,
                            fund.id,
                            backtest_id
                        )
                
                # Advance to next minute
                current_time += timedelta(minutes=1)
                minute_count += 1
            
            logger.info(f"✅ Trading day complete: {minute_count} minutes simulated, {iteration_count} strategy iterations")
            
        except Exception as e:
            logger.error(f"Error running strategy engine: {e}", exc_info=True)
            raise
    
    async def _precompute_screener_results(
        self,
        fund: Fund,
        start_time: datetime,
        end_time: datetime,
        MONITORING_INTERVAL_MINUTES: int
    ) -> Dict[str, List[str]]:
        """
        Pre-compute screener results for all timestamps in the trading day.
        
        This runs all screener queries upfront, eliminating the 3-4s delay
        during each iteration. Since historical data doesn't change, we can
        safely cache all results.
        
        Returns:
            Dict mapping timestamp ISO string to list of ticker symbols
        """
        from app.services.screener.screener import get_screener_service
        from app.models.strategies import ScreeningCriteria
        
        screener = get_screener_service()
        if not screener or not fund.screening_criteria_id:
            return {}
        
        # Get screening criteria
        async with get_async_session() as session:
            criteria_obj = await session.get(ScreeningCriteria, fund.screening_criteria_id)
            if not criteria_obj or not criteria_obj.criteria:
                return {}
            
            criteria_dict = criteria_obj.criteria
        
        # Generate all timestamps we'll need
        timestamps = []
        current = start_time
        while current <= end_time:
            if (current - start_time).total_seconds() / 60 % MONITORING_INTERVAL_MINUTES == 0:
                timestamps.append(current)
            current += timedelta(minutes=MONITORING_INTERVAL_MINUTES)
        
        logger.info(f"Pre-computing screener for {len(timestamps)} timestamps...")
        
        # Pre-compute all screener results
        cache = {}
        for idx, timestamp in enumerate(timestamps):
            try:
                results = await screener.compute_historical(
                    timestamp=timestamp,
                    min_price=criteria_dict.get('min_price', 5),
                    max_price=criteria_dict.get('max_price', 100),
                    min_volume=criteria_dict.get('min_volume'),
                    min_change_percent=criteria_dict.get('min_change_percent'),
                    max_change_percent=criteria_dict.get('max_change_percent'),
                    min_relative_volume=criteria_dict.get('min_relative_volume', 1.5),
                    order_by=criteria_dict.get('order_by', 'rv14'),
                    limit=criteria_dict.get('limit', 10),
                    technical_filters=criteria_dict.get('technical_filters'),
                    exclude_etfs=criteria_dict.get('exclude_etfs', True),
                    asset_types=criteria_dict.get('asset_types'),
                    market_cap_min=criteria_dict.get('market_cap_min'),
                    market_cap_max=criteria_dict.get('market_cap_max')
                )
                
                if results:
                    tickers = [r.get('ticker') or r.get('symbol') for r in results[:10]]
                    cache[timestamp.isoformat()] = tickers
                    logger.info(f"  [{idx+1}/{len(timestamps)}] {timestamp.strftime('%H:%M')}: {len(tickers)} tickers")
                else:
                    cache[timestamp.isoformat()] = []
            
            except Exception as e:
                logger.warning(f"Error pre-computing screener for {timestamp}: {e}")
                cache[timestamp.isoformat()] = []
        
        return cache
    
    async def _sync_positions_from_transactions(
        self,
        strategy_engine,
        fund_id: str,
        backtest_id: str
    ) -> None:
        """
        Sync position cache from transactions.
        
        Builds PositionContext objects for all open positions by
        aggregating buy/sell transactions.
        """
        from app.strategies.base import PositionContext
        from collections import defaultdict
        
        async with get_async_session() as session:
            # Get all transactions for this backtest
            stmt = select(Transaction).where(
                Transaction.fund_id == fund_id,
                Transaction.backtest_id == backtest_id
            ).order_by(Transaction.timestamp)
            
            result = await session.execute(stmt)
            transactions = result.scalars().all()
            
            # Aggregate by symbol to calculate positions
            positions = defaultdict(lambda: {'quantity': 0, 'cost_basis': 0, 'entry_time': None, 'strategy_state': {}})
            
            for txn in transactions:
                if txn.side == 'buy':
                    positions[txn.symbol]['quantity'] += txn.quantity
                    positions[txn.symbol]['cost_basis'] += txn.total_value
                    if positions[txn.symbol]['entry_time'] is None:
                        positions[txn.symbol]['entry_time'] = txn.timestamp
                    positions[txn.symbol]['strategy_state'] = txn.strategy_state or {}
                elif txn.side == 'sell':
                    positions[txn.symbol]['quantity'] -= txn.quantity
            
            # Build PositionContext objects for non-zero positions
            new_cache = {}
            for symbol, pos_data in positions.items():
                if pos_data['quantity'] > 0.01:  # Ignore dust positions
                    entry_price = pos_data['cost_basis'] / pos_data['quantity'] if pos_data['quantity'] > 0 else 0
                    
                    new_cache[symbol] = PositionContext(
                        symbol=symbol,
                        entry_price=entry_price,
                        entry_time=pos_data['entry_time'],
                        quantity=pos_data['quantity'],
                        current_price=entry_price,  # Will be updated
                        unrealized_pnl=0,
                        unrealized_pnl_percent=0,
                        strategy_state=pos_data['strategy_state']
                    )
            
            # Update engine cache
            strategy_engine._position_cache = new_cache
            
            if new_cache:
                logger.info(f"📊 Position cache updated: {len(new_cache)} open positions ({list(new_cache.keys())})")
    
    async def _get_minute_bars(
        self,
        timestamp: datetime
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get minute bars for all relevant symbols at given timestamp.
        
        Args:
            timestamp: Timestamp to get bars for
            
        Returns:
            Dict mapping symbol to bar data
        """
        bars = {}
        
        async with get_async_session() as session:
            # Query bars at this exact timestamp
            # TODO: Filter by symbols from screening criteria
            stmt = select(MarketData).where(
                MarketData.time == timestamp,
                MarketData.timescale == '1min'
            ).limit(100)  # Limit to prevent memory issues
            
            result = await session.execute(stmt)
            market_data_bars = result.scalars().all()
            
            for bar in market_data_bars:
                bars[bar.symbol] = {
                    'time': bar.time,
                    'open': float(bar.open),
                    'high': float(bar.high),
                    'low': float(bar.low),
                    'close': float(bar.close),
                    'volume': bar.volume,
                }
        
        return bars
    
    async def _finalize_backtest(self, backtest_id: str) -> None:
        """
        Finalize backtest results.
        
        Args:
            backtest_id: Backtest to finalize
        """
        logger.info(f"📊 Finalizing backtest {backtest_id}")
        
        async with get_async_session() as session:
            backtest = await session.get(Backtest, backtest_id)
            if not backtest:
                raise ValueError(f"Backtest {backtest_id} not found")
            
            # Get fund's final balance
            fund = await session.get(Fund, backtest.fund_id)
            if not fund:
                raise ValueError(f"Fund {backtest.fund_id} not found")
            
            # Count orders
            stmt = select(Order).where(Order.backtest_id == backtest_id)
            result = await session.execute(stmt)
            orders = result.scalars().all()
            
            total_orders = len(orders)
            filled_orders = sum(1 for o in orders if o.status == 'filled')
            cancelled_orders = sum(1 for o in orders if o.status == 'canceled')
            
            # Create trades from transactions if they don't exist
            await self._create_trades_from_transactions(session, backtest_id, backtest.fund_id)
            
            # Count trades
            stmt = select(Trade).where(Trade.backtest_id == backtest_id)
            result = await session.execute(stmt)
            trades = result.scalars().all()
            
            total_trades = len(trades)
            winning_trades = sum(1 for t in trades if t.realized_pnl and t.realized_pnl > 0)
            losing_trades = sum(1 for t in trades if t.realized_pnl and t.realized_pnl < 0)
            
            # Calculate P&L
            total_pnl = fund.balance - backtest.starting_balance
            total_pnl_percent = (total_pnl / backtest.starting_balance * 100) if backtest.starting_balance > 0 else 0
            
            # Update backtest record
            backtest.ending_balance = fund.balance
            backtest.total_pnl = total_pnl
            backtest.total_pnl_percent = total_pnl_percent
            backtest.total_trades = total_trades
            backtest.winning_trades = winning_trades
            backtest.losing_trades = losing_trades
            backtest.total_orders = total_orders
            backtest.filled_orders = filled_orders
            backtest.cancelled_orders = cancelled_orders
            backtest.status = 'completed'
            backtest.completed_at = get_current_time()
            
            # Update fund balance to reflect backtest result
            fund.balance = backtest.ending_balance
            await session.commit()
            
            # Log backtest completion event
            await event_service.log_strategy_engine_event(
                fund_id=backtest.fund_id,
                event_category="validation",
                message=f"Backtest completed: ${backtest.starting_balance:.2f} → ${backtest.ending_balance:.2f} ({total_pnl_percent:+.2f}%)",
                event_data={
                    "backtest_id": backtest_id,
                    "starting_balance": backtest.starting_balance,
                    "ending_balance": backtest.ending_balance,
                    "total_pnl": total_pnl,
                    "total_pnl_percent": total_pnl_percent,
                    "total_trades": total_trades,
                    "winning_trades": winning_trades,
                    "losing_trades": losing_trades,
                    "total_orders": total_orders,
                    "filled_orders": filled_orders,
                },
                severity="info",
                timestamp=datetime.now(timezone.utc)
            )
            
            # Calculate metrics for display
            win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0
            fill_rate = (filled_orders / total_orders * 100) if total_orders > 0 else 0
            
            # Beautiful summary logging
            logger.info("=" * 80)
            logger.info(f"🎉 BACKTEST COMPLETE: {fund.name} - {backtest.date.strftime('%Y-%m-%d')}")
            logger.info("=" * 80)
            logger.info(f"📊 PERFORMANCE:")
            logger.info(f"   Starting Balance: ${backtest.starting_balance:,.2f}")
            logger.info(f"   Ending Balance:   ${fund.balance:,.2f}")
            logger.info(f"   P&L:              ${total_pnl:+,.2f} ({total_pnl_percent:+.2f}%)")
            logger.info(f"")
            logger.info(f"📈 TRADING ACTIVITY:")
            logger.info(f"   Total Trades:     {total_trades}")
            logger.info(f"   Winning Trades:   {winning_trades} ({win_rate:.1f}%)")
            logger.info(f"   Losing Trades:    {losing_trades}")
            logger.info(f"")
            logger.info(f"📋 ORDER EXECUTION:")
            logger.info(f"   Total Orders:     {total_orders}")
            logger.info(f"   Filled Orders:    {filled_orders} ({fill_rate:.1f}%)")
            logger.info(f"   Cancelled Orders: {cancelled_orders}")
            logger.info(f"")
            logger.info(f"🆔 Backtest ID: {backtest_id}")
            logger.info("=" * 80)
    
    async def _create_trades_from_transactions(
        self,
        session: AsyncSession,
        backtest_id: str,
        fund_id: str
    ) -> None:
        """
        Create Trade records from transactions using FIFO matching.
        
        This processes all transactions for the backtest that don't have
        trade_ids, groups them into trades using FIFO accounting, and creates
        Trade records with performance metrics.
        
        Args:
            session: Database session
            backtest_id: Backtest ID
            fund_id: Fund ID
        """
        logger.info(f"📊 Creating trades from transactions for backtest {backtest_id[:8]}")
        
        # Get all transactions for this backtest, sorted chronologically
        stmt = select(Transaction).where(
            Transaction.backtest_id == backtest_id
        ).order_by(Transaction.timestamp)
        
        result = await session.execute(stmt)
        transactions = result.scalars().all()
        
        if not transactions:
            logger.info(f"No transactions to process for backtest {backtest_id[:8]}")
            return
        
        logger.info(f"Processing {len(transactions)} transactions to create trades")
        
        # Track open lots per symbol using FIFO
        open_lots_by_symbol: Dict[str, List[Transaction]] = {}  # symbol -> [buy_txn, ...]
        trades_to_create = []  # List of (buy_txns, sell_txn, trade_id) tuples
        
        for txn in transactions:
            symbol = txn.symbol
            
            if symbol not in open_lots_by_symbol:
                open_lots_by_symbol[symbol] = []
            
            if txn.side == "buy":
                # Add to open lots
                open_lots_by_symbol[symbol].append(txn)
            
            elif txn.side == "sell":
                # Match against open lots using FIFO
                sell_qty_remaining = txn.quantity
                matched_buy_txns = []
                
                while sell_qty_remaining > 0 and open_lots_by_symbol[symbol]:
                    buy_txn = open_lots_by_symbol[symbol][0]
                    buy_qty_remaining = buy_txn.quantity
                    
                    # Handle partial matches
                    if buy_qty_remaining <= sell_qty_remaining:
                        # Fully consume this buy lot
                        matched_buy_txns.append(buy_txn)
                        sell_qty_remaining -= buy_qty_remaining
                        open_lots_by_symbol[symbol].pop(0)
                    else:
                        # Partially consume this buy lot - create a split buy transaction
                        # For simplicity, we'll just match the whole buy and record the partial sell
                        matched_buy_txns.append(buy_txn)
                        open_lots_by_symbol[symbol].pop(0)
                        # Adjust sell quantity for partial match
                        actual_sell_qty = buy_qty_remaining
                        sell_qty_remaining -= actual_sell_qty
                
                # Create trade record for this matched trade
                if matched_buy_txns:
                    trade_id = str(uuid.uuid4())
                    trades_to_create.append((matched_buy_txns, txn, trade_id))
        
        # Create Trade records
        trade_builder = TradeBuilder(session)
        trades_created = 0
        
        for buy_txns, sell_txn, trade_id in trades_to_create:
            try:
                # Calculate entry metrics
                total_entry_qty = sum(txn.quantity for txn in buy_txns)
                total_entry_cost = sum(txn.total_value for txn in buy_txns)
                avg_entry_price = total_entry_cost / total_entry_qty if total_entry_qty > 0 else 0.0
                entry_time = min(txn.timestamp for txn in buy_txns)
                entry_order_id = buy_txns[0].order_id
                
                # For the sell, we need to match quantity correctly
                # If we matched multiple buys, we may need to split the sell
                sell_qty = min(sell_txn.quantity, total_entry_qty)  # Don't sell more than we bought
                
                # Calculate exit metrics
                exit_price = sell_txn.price
                exit_time = sell_txn.timestamp
                exit_order_id = sell_txn.order_id
                exit_proceeds = sell_qty * exit_price
                
                # Calculate P&L based on matched quantity
                matched_entry_cost = (sell_qty / total_entry_qty) * total_entry_cost if total_entry_qty > 0 else 0
                realized_pnl = exit_proceeds - matched_entry_cost
                realized_pnl_percent = (realized_pnl / matched_entry_cost * 100) if matched_entry_cost > 0 else 0.0
                
                # Calculate hold duration
                hold_duration = (exit_time - entry_time).total_seconds()
                
                # Get strategy info from first buy order
                first_order = await session.get(Order, entry_order_id)
                strategy_id = getattr(first_order, 'strategy_id', None) if first_order else None
                
                # Create Trade record
                trade = Trade(
                    id=trade_id,
                    fund_id=fund_id,
                    backtest_id=backtest_id,
                    symbol=buy_txns[0].symbol,
                    entry_order_id=entry_order_id,
                    entry_time=entry_time,
                    entry_price=avg_entry_price,
                    entry_quantity=sell_qty,  # Matched quantity
                    exit_order_id=exit_order_id,
                    exit_time=exit_time,
                    exit_price=exit_price,
                    exit_quantity=sell_qty,
                    realized_pnl=realized_pnl,
                    realized_pnl_percent=realized_pnl_percent,
                    hold_duration_seconds=int(hold_duration),
                    strategy_id=strategy_id,
                    status="closed",
                    trade_metadata={"backtest": True}
                )
                
                session.add(trade)
                trades_created += 1
                
                # Update transactions with trade_id
                for buy_txn in buy_txns:
                    if not buy_txn.trade_id:
                        buy_txn.trade_id = trade_id
                
                if not sell_txn.trade_id:
                    sell_txn.trade_id = trade_id
                
                # Update orders with trade_id
                for order_id in set([txn.order_id for txn in buy_txns] + [sell_txn.order_id]):
                    order = await session.get(Order, order_id)
                    if order and not order.trade_id:
                        order.trade_id = trade_id
                
            except Exception as e:
                logger.error(f"Error creating trade from transactions: {e}", exc_info=True)
                continue
        
        await session.commit()
        
        if trades_created > 0:
            logger.info(f"✅ Created {trades_created} trade(s) from transactions")

