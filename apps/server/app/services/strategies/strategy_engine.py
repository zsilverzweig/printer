"""
Strategy Execution Engine.

Orchestrates the execution of trading strategies including:
- Candidate screening
- Entry/exit monitoring
- Position management
- Order execution via Alpaca
- State tracking
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import logging
import asyncio
import uuid

from app.strategies.base import (
    ExecutionStrategy,
    MarketDataSnapshot,
    PositionContext,
    StopUpdate,
)
from app.strategies.registry import get_strategy
from app.services.market.market_data_provider import MarketDataProvider
from app.services.trading.alpaca_service import AlpacaService
from app.services.trading.reconciliation_service import get_reconciliation_service
from app.services.trading.position_tracker import (
    get_position_context,
    get_position_quantity_from_transactions,
)
from app.services.trading.constants import POSITION_EPSILON
from app.services.trading.order_lifecycle import OrderLifecycleManager
from app.services.events.event_broadcasting import (
    broadcast_error,
    broadcast_diagnostic,
    _get_utc_timestamp,
)
from app.services.strategies.strategy_service import get_strategy_service
from app.services.strategies.position_sizer import get_position_sizer
from app.services.strategies.position_sync_service import PositionSyncService
from app.services.strategies.risk_manager import RiskManager
from app.services.strategies.order_executor import OrderExecutor
from app.services.strategies.level_monitor import LevelMonitor
from app.services.strategies.screener_connector import ScreenerConnector
from app.lib.strategy_logger import StrategyLogger
from app.models.strategies import Fund, Order, Transaction, DefaultRiskSettings, Trade
from app.services.core.database import get_async_session
from app.types import ScreenerCriteria
from sqlalchemy import select

logger = logging.getLogger(__name__)


class StrategyEngine:
    """
    Orchestrates strategy execution for a fund.
    
    Responsibilities:
    - Load strategy configuration
    - Monitor screener results
    - Subscribe to real-time data for candidates
    - Check entry/exit conditions
    - Execute trades via Alpaca
    - Track position state
    """
    
    def __init__(
        self,
        fund: Fund,
        execution_strategy: ExecutionStrategy,
        market_data_provider: MarketDataProvider,
        alpaca_service: AlpacaService,
    ):
        """
        Initialize strategy engine.
        
        Args:
            fund: Fund object with all configuration (strategy, risk params, position sizing)
            execution_strategy: Instantiated execution strategy
            market_data_provider: Market data provider
            alpaca_service: Alpaca trading service (must match fund mode)
        
        Raises:
            ValueError: If fund mode doesn't match Alpaca service mode
        """
        logger.debug(f"StrategyEngine.__init__ called for fund {fund.id}")
        logger.debug(
            f"Fund object received: "
            f"id={fund.id}, name={fund.name}, balance=${fund.balance:.2f}, "
            f"mode={fund.mode}, status={fund.status}, strategy={fund.strategy_id}"
        )
        # Load default risk settings for fallback values
        # Note: Loading from database is deferred to async initialization in start()
        self.default_size_per_trade = 1000.0  # Fallback default
        self.default_max_order_age_seconds = 60  # Fallback default
        
        # Use fund override if set, otherwise use default
        effective_size = fund.size_per_trade if fund.size_per_trade is not None else self.default_size_per_trade
        logger.debug(
            f"Strategy config: "
            f"strategy_id={fund.strategy_id}, "
            f"size_per_trade=${effective_size:.2f}, "
            f"max_bet_percent={fund.max_bet_percent}"
        )
        
        self.fund = fund
        self.fund_id = fund.id
        self.execution_strategy = execution_strategy
        self.market_data_provider = market_data_provider
        self.alpaca_service = alpaca_service
        
        # Initialize core services
        self.strategy_service = get_strategy_service()
        self.position_sizer = get_position_sizer()
        self.position_sync_service = PositionSyncService(alpaca_service)
        self.strategy_logger = StrategyLogger(
            fund.name,
            fund_ticker=fund.ticker,
            fund_emoji=fund.emoji
        )
        
        # Initialize risk manager
        self.risk_manager = RiskManager(
            fund_id=fund.id,
            fund_mode=fund.mode,
            trading_start_time=fund.trading_start_time,
            trading_end_time=fund.trading_end_time,
            timezone=fund.timezone,
            max_loss_dollars=fund.max_loss_dollars,
            max_loss_percent=fund.max_loss_percent,
            max_total_exposure=fund.max_total_exposure,
            profit_protection_threshold=0.5,
        )
        
        # Initialize order lifecycle manager
        self.order_lifecycle = OrderLifecycleManager(market_data_provider=market_data_provider)
        
        # Initialize order executor
        self.order_executor = OrderExecutor(
            fund=fund,
            alpaca_service=alpaca_service,
            position_sizer=self.position_sizer,
            strategy_service=self.strategy_service,
            strategy_logger=self.strategy_logger,
            order_lifecycle=self.order_lifecycle,
            risk_manager=self.risk_manager,
        )
        
        # Initialize level monitor
        self.level_monitor = LevelMonitor(
            fund_id=fund.id,
            strategy=execution_strategy,
            strategy_service=self.strategy_service,
            market_data_provider=market_data_provider,
            strategy_logger=self.strategy_logger,
            risk_manager=self.risk_manager,
        )
        
        # Initialize screener connector
        self.screener_connector = ScreenerConnector(
            fund_id=fund.id,
            screening_criteria_id=fund.screening_criteria_id,
            strategy=execution_strategy,
            strategy_service=self.strategy_service,
            market_data_provider=market_data_provider,
            strategy_logger=self.strategy_logger,
            risk_manager=self.risk_manager,
        )
        
        # Verify fund mode matches Alpaca service mode
        self.risk_manager.verify_trading_mode(alpaca_service.paper_trading)
        
        # Running state
        self.is_running = False
        self._monitoring_task: Optional[asyncio.Task] = None
        
        # Position cache (refreshed from Alpaca)
        self._position_cache: Dict[str, PositionContext] = {}
    
    def _is_trading_time(self) -> bool:
        """
        Check if current time is within trading hours.
        
        Delegates to risk_manager for trading time check.
        
        Returns:
            True if within trading hours, False otherwise
        """
        return self.risk_manager.is_trading_time()
    
    async def refresh_fund_balance(self) -> None:
        """
        Refresh fund balance from database.
        
        Call this after transfers or other balance-changing operations
        to ensure engine has up-to-date balance for trading decisions.
        """
        try:
            async with get_async_session() as session:
                fund = await session.get(Fund, self.fund_id)
                if fund:
                    old_balance = self.fund.balance
                    self.fund.balance = fund.balance
                    # Only log if balance actually changed
                    if abs(old_balance - fund.balance) > 0.01:
                        logger.info(
                            f"[FUND {self.fund_id}] 💰 Balance: ${old_balance:.2f} → ${fund.balance:.2f}"
                        )
                else:
                    logger.warning(f"Could not refresh balance - fund {self.fund_id} not found")
        except Exception as e:
            logger.error(f"Error refreshing fund balance: {e}", exc_info=True)
    
    async def start(self) -> None:
        """Start the strategy execution loop."""
        if self.is_running:
            logger.warning("Strategy engine already running")
            return
        
        self.is_running = True
        
        # Refresh fund balance
        await self.refresh_fund_balance()
        
        # Load default risk settings from database (best effort)
        try:
            async with get_async_session() as session:
                stmt = select(DefaultRiskSettings).where(DefaultRiskSettings.id == 'default')
                result = await session.execute(stmt)
                default_settings = result.scalar_one_or_none()
                if default_settings:
                    self.default_size_per_trade = default_settings.size_per_trade
                    self.default_max_order_age_seconds = default_settings.max_order_age_seconds
        except Exception as e:
            logger.warning(f"Could not load default risk settings, using fallbacks: {e}")
        
        # Recover persisted state from DB
        self.strategy_logger.fund_message("Recovering persisted levels from DB...", "debug")
        entry_levels, exit_levels = await self.strategy_service.recover_fund_state(self.fund_id)
        self.strategy_logger.fund_message(
            f"Recovered {len(entry_levels)} entry level(s), {len(exit_levels)} exit level(s)",
            "debug"
        )
        
        # Sync positions from Alpaca
        self._position_cache = await self.position_sync_service.refresh_positions_from_alpaca(
            self.fund_id,
            self.fund.name
        )
        
        # Initialize existing positions
        await self._initialize_existing_positions()
        
        # Start monitoring loop
        self._monitoring_task = asyncio.create_task(self._monitoring_loop())
    
    async def stop(self) -> None:
        """Stop the strategy execution loop."""
        self.strategy_logger.fund_message("Stopping strategy engine")
        self.is_running = False
        
        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
        
        # Cleanup strategy resources
        await self.execution_strategy.shutdown()
    
    async def _initialize_existing_positions(self) -> None:
        """
        Initialize existing positions with management state.
        
        Sets up stops for positions loaded from Alpaca on startup.
        Rate-limits AI requests to avoid overwhelming APIs.
        """
        if not self._position_cache:
            self.strategy_logger.fund_message("No existing positions to initialize", "debug")
            return
        
        self.strategy_logger.fund_message(
            f"Initializing {len(self._position_cache)} existing position(s)"
        )
        
        # Rate limit: 2 seconds between AI calls
        ai_request_delay_seconds = 2.0
        
        for symbol, position in self._position_cache.items():
            try:
                # Get current market data
                market_data = await self.market_data_provider.build_market_data(symbol)
                
                # Update position with current price
                position.current_price = market_data.price
                position.unrealized_pnl = (market_data.price - position.entry_price) * position.quantity
                position.unrealized_pnl_percent = ((market_data.price - position.entry_price) / position.entry_price) * 100
                
                # Check if management state already exists
                exit_levels = await self.strategy_service.get_active_exit_levels(self.fund_id)
                if symbol in exit_levels:
                    self.strategy_logger.log(symbol, "Already has management state, skipping")
                    continue
                
                # Call strategy to get initial stop
                self.strategy_logger.log(symbol, "Setting up management state...")
                stop_update = await self.execution_strategy.manage_position(position, market_data)
                
                # Persist to DB
                await self.strategy_service.persist_management_state(
                    self.fund_id,
                    symbol,
                    position.entry_price,
                    position.entry_time,
                    stop_update
                )
                
                self.strategy_logger.log(symbol, f"Initialized stop: ${stop_update.current_stop:.2f}")
                
                # Rate limit
                remaining = len(self._position_cache) - list(self._position_cache.keys()).index(symbol) - 1
                if remaining > 0:
                    await asyncio.sleep(ai_request_delay_seconds)
                
            except Exception as e:
                logger.error(f"Error initializing position {symbol}: {e}", exc_info=True)
        
        self.strategy_logger.fund_message(
            f"✅ Finished initializing {len(self._position_cache)} position(s)"
        )
    
    async def get_active_positions(self) -> Dict[str, PositionContext]:
        """
        Get current active positions from cache.
        
        Note: Cache is explicitly refreshed at strategic points (e.g., start of 
        candidate selection) rather than time-based to ensure consistent state
        during a monitoring cycle.
        
        Returns:
            Dictionary mapping symbol to PositionContext
        """
        return self._position_cache
    
    async def get_pending_orders(self) -> List[Order]:
        """
        Get pending orders for this fund from database.
        
        Returns:
            List of pending Order objects
        """
        async with get_async_session() as session:
            stmt = select(Order).where(
                Order.fund_id == self.fund_id,
                Order.status == "pending"
            )
            result = await session.execute(stmt)
            return result.scalars().all()
    
    async def force_close_all_positions(self, reason: str = "end_of_day") -> int:
        """
        Force close all open positions for the fund.
        
        Used for end-of-day liquidation to ensure no overnight exposure.
        """
        try:
            async with get_async_session() as session:
                stmt = select(Trade).where(
                    Trade.fund_id == self.fund_id,
                    Trade.status.in_(("pending", "open", "partial"))
                )
                result = await session.execute(stmt)
                open_trades = result.scalars().all()
                
                trade_payload = []
                for trade in open_trades:
                    qty = await get_position_quantity_from_transactions(
                        session, self.fund_id, trade.symbol
                    )
                    trade_payload.append(
                        {
                            "id": trade.id,
                            "symbol": trade.symbol,
                            "entry_price": trade.entry_price,
                            "entry_time": trade.entry_time,
                            "quantity": qty,
                        }
                    )
        except Exception as e:
            logger.error(f"Error preparing forced liquidation for fund {self.fund_id}: {e}", exc_info=True)
            return 0
        
        if not trade_payload:
            logger.debug("Forced liquidation requested but no open trades found.")
            return 0
        
        forced_count = 0
        
        for trade_data in trade_payload:
            quantity = trade_data["quantity"]
            symbol = trade_data["symbol"]
            
            if quantity <= POSITION_EPSILON:
                continue
            
            try:
                market_data = await self.market_data_provider.build_market_data(symbol)
            except Exception as data_error:
                logger.error(
                    f"Failed to load market data for {symbol} during forced liquidation: {data_error}",
                    exc_info=True
                )
                continue
            
            entry_price = trade_data["entry_price"] or market_data.price
            entry_time = trade_data["entry_time"] or market_data.timestamp
            
            unrealized = (market_data.price - entry_price) * quantity
            unrealized_pct = (
                ((market_data.price - entry_price) / entry_price * 100)
                if entry_price
                else 0.0
            )
            
            position = PositionContext(
                symbol=symbol,
                entry_price=entry_price,
                entry_time=entry_time,
                quantity=quantity,
                current_price=market_data.price,
                unrealized_pnl=unrealized,
                unrealized_pnl_percent=unrealized_pct,
                strategy_state={},
            )
            
            stop_update = StopUpdate(
                current_stop=market_data.price,
                force_exit=True,
                exit_reason=reason,
                metadata={"source": "forced_liquidation"},
            )
            
            try:
                success = await self.order_executor.execute_sell_order(position, stop_update, market_data)
            except Exception as exec_error:
                logger.error(
                    f"Error executing forced liquidation for {symbol}: {exec_error}",
                    exc_info=True
                )
                success = False
            
            if success:
                forced_count += 1
                self.strategy_logger.log(
                    symbol,
                    f"Forced liquidation ({reason}) executed @ ${market_data.price:.2f}"
                )
                self._position_cache.pop(symbol, None)
        
        if forced_count:
            self.strategy_logger.fund_message(
                f"🚨 Forced liquidation executed for {forced_count} position(s) ({reason})",
                "info"
            )
        else:
            logger.debug("Forced liquidation executed; no positions required closing.")
        
        return forced_count
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop - orchestrates all monitoring phases."""
        while self.is_running:
            try:
                # Cancel stale orders
                pending_orders = await self.get_pending_orders()
                # Use fund override if set, otherwise use default
                max_age = self.fund.max_order_age_seconds if self.fund.max_order_age_seconds is not None else self.default_max_order_age_seconds
                await self.order_executor.cancel_stale_orders(max_age, pending_orders)
                
                # Get screened tickers
                tickers = await self.screener_connector.get_screened_tickers()
                
                # Phase 1: Setup (optional)
                if self.execution_strategy.requires_setup:
                    tickers = await self.screener_connector.run_setup_phase(tickers)
                
                # Refresh positions
                self._position_cache = await self.position_sync_service.refresh_positions_from_alpaca(
                    self.fund_id,
                    self.fund.name
                )
                
                # Check risk limits
                active_positions = await self.get_active_positions()
                can_trade, reason = await self.risk_manager.check_risk_limits(
                    active_positions,
                    self.fund.balance
                )
                
                # Phase 2: Entry analysis
                await self.screener_connector.run_entry_analysis(
                    tickers,
                    active_positions,
                    can_trade,
                    reason
                )
                
                # Phase 3: Check entry triggers
                await self.level_monitor.check_entry_triggers(self.order_executor)
                
                # Phase 4: Update position management
                await self.level_monitor.update_position_management(active_positions, self.order_executor)
                
                # Phase 5: Check stop triggers
                await self.level_monitor.check_stop_triggers(active_positions, self.order_executor)
                
                # Wait before next iteration
                await asyncio.sleep(5)
            
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}", exc_info=True)
                await asyncio.sleep(5)
    
