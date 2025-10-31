"""
GPT Candlestick Analysis Strategy

An AI-powered trading strategy that:
- Analyzes 1hr and 15min candlesticks using GPT-4o-mini
- Makes trading decisions on 15-minute interval boundaries
- Uses GPT to determine entry price levels to monitor
- Waits for price to cross entry levels, then places MARKET orders
- Long-only positions with automated stop-loss exits
- Logs all monitored entry levels on each tick
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.strategies.base import (
    ExecutionStrategy,
    EntrySignal,
    ExitSignal,
    MarketData,
    PositionContext,
    ScaleSignal,
)
from app.services.ai.gpt_helper import get_gpt_helper
from app.services.core.validation import validate_entry_prices, validate_stop_update
from app.services.market.market_formatting import format_candlesticks_table
from app.services.news.news_service import NewsService

logger = logging.getLogger(__name__)


class GPTTradeSignal(BaseModel):
    """Structured output from GPT for trade decisions."""
    entry_price: float = Field(gt=0, description="Price at which to enter the trade")
    stop_loss: float = Field(gt=0, description="Stop loss price")
    confidence: float = Field(ge=0, le=1, description="Confidence level (0-1)")
    reasoning: str = Field(description="Explanation of the decision")
    
    def validate_prices(self, current_price: float) -> tuple[bool, Optional[str]]:
        """
        Validate that prices are reasonable.
        
        Args:
            current_price: Current market price
            
        Returns:
            (is_valid, error_message)
        """
        import math
        
        # Check confidence is finite
        if not math.isfinite(self.confidence):
            return False, f"confidence is not finite: {self.confidence}"
        
        # Use validation utility for price/stop validation
        return validate_entry_prices(
            entry_price=self.entry_price,
            stop_loss=self.stop_loss,
            current_price=current_price,
            side="long"
        )


class GPTStopUpdate(BaseModel):
    """Structured output from GPT for stop loss updates."""
    new_stop_loss: float = Field(gt=0, description="Updated stop loss price")
    reasoning: str = Field(description="Explanation for the stop loss update")
    
    def validate_stop(
        self, 
        current_stop: float, 
        current_price: float, 
        entry_price: float
    ) -> tuple[bool, Optional[str]]:
        """
        Validate that the new stop loss is reasonable.
        
        Args:
            current_stop: Current stop loss price
            current_price: Current market price
            entry_price: Original entry price
            
        Returns:
            (is_valid, error_message)
        """
        # Use validation utility for stop update validation
        return validate_stop_update(
            new_stop=self.new_stop_loss,
            current_stop=current_stop,
            current_price=current_price,
            entry_price=entry_price,
            side="long"
        )


class GPTTradeThesis(BaseModel):
    """Trade thesis captured at entry to guide exit decisions."""
    why_entered: str = Field(description="Why this trade was entered")
    expected_outcome: str = Field(description="What we expect to happen next")
    key_levels: str = Field(description="Important price levels to watch")
    first_target: float = Field(gt=0, description="First profit target price to scale out 50%")
    exit_considerations: str = Field(description="Things to consider for exit decisions")
    holding_period_target: str = Field(description="Expected holding period (e.g., '15-30 minutes', 'until EOD')")


class GPTCandlestickStrategy(ExecutionStrategy):
    """AI-powered candlestick analysis strategy using GPT."""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        
        # Configuration
        self.evaluation_interval_minutes = config.get("evaluation_interval_minutes", 15)
        self.lookback_hours_1h = config.get("lookback_hours_1h", 48)
        self.lookback_hours_15m = config.get("lookback_hours_15m", 6)
        self.min_confidence = config.get("min_confidence", 0.5)
        self.update_stop_interval_minutes = config.get("update_stop_interval_minutes", 15)
        
        # Initialize GPT helper
        self.gpt_helper = get_gpt_helper(model="gpt-4o-mini")
        
        # Initialize news service
        self.news_service = NewsService()
        
        # Track monitored entry levels: symbol -> GPTTradeSignal
        self._monitored_levels: Dict[str, GPTTradeSignal] = {}
        
        # Track last price seen for each symbol (to detect crossovers)
        self._last_price: Dict[str, float] = {}
        
        # Cache for trade theses (symbol -> GPTTradeThesis)
        self._thesis_cache: Dict[str, Optional[GPTTradeThesis]] = {}
        
        # Note: _interval_tracker, _task_manager from base class
        # replaces _last_evaluation, _news_fetch_tasks, _thesis_tasks
    
    @property
    def id(self) -> str:
        return "gpt_candlestick"
    
    @property
    def name(self) -> str:
        return "GPT Candlestick Analysis"
    
    @property
    def description(self) -> str:
        return (
            "AI-powered strategy that analyzes 1hr and 15min candlesticks using GPT-4o-mini. "
            "Makes trading decisions on 15-minute intervals with dynamic AI-driven stop losses. "
            "Long-only positions with automated stop-loss exits."
        )
    
    @property
    def strategy_type(self) -> str:
        return "ai-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "15+ minutes"
    
    @property
    def required_indicators(self) -> List[str]:
        return []  # GPT analyzes raw candlestick data
    
    @property
    def config_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "evaluation_interval_minutes": {
                    "type": "integer",
                    "minimum": 5,
                    "maximum": 60,
                    "default": 15,
                    "description": "How often to evaluate entry signals (minutes)",
                },
                "lookback_hours_1h": {
                    "type": "integer",
                    "minimum": 12,
                    "maximum": 168,
                    "default": 48,
                    "description": "Hours of 1hr candlestick data to analyze",
                },
                "lookback_hours_15m": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 24,
                    "default": 6,
                    "description": "Hours of 15min candlestick data to analyze",
                },
                "min_confidence": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "default": 0.5,
                    "description": "Minimum AI confidence to enter trade",
                },
                "update_stop_interval_minutes": {
                    "type": "integer",
                    "minimum": 5,
                    "maximum": 60,
                    "default": 15,
                    "description": "How often to update stop loss for open positions",
                },
            },
        }
    
    async def get_monitored_symbols(
        self,
        candidates: List[Dict[str, Any]],
        active_position_count: int = 0,
        active_order_count: int = 0
    ) -> List[str]:
        """
        Monitor all screener candidates.
        
        GPT Candlestick analyzes all candidates but only evaluates
        them on 15-minute interval boundaries.
        """
        symbols = [c.get("ticker") for c in candidates if c.get("ticker")]
        
        logger.info(
            f"🤖 GPT Candlestick monitoring {len(symbols)} candidates "
            f"(active positions: {active_position_count}, pending orders: {active_order_count})"
        )
        
        return symbols
    
    def cleanup_symbol(self, symbol: str) -> None:
        """
        Clean up all monitoring resources for a symbol.
        
        Override base class to add strategy-specific cleanup.
        
        Args:
            symbol: Stock symbol to clean up
        """
        # Call base class cleanup
        super().cleanup_symbol(symbol)
        
        # Remove monitored level
        self._monitored_levels.pop(symbol, None)
        
        # Remove last price tracking
        self._last_price.pop(symbol, None)
        
        # Remove thesis cache
        self._thesis_cache.pop(symbol, None)
        
        # Note: Background tasks are managed by base class _task_manager
    
    def _should_update_stop(self, symbol: str) -> bool:
        """
        Check if we should update stop loss for this position.
        
        Uses base class interval tracker.
        
        Args:
            symbol: Stock symbol
            
        Returns:
            True if enough time has passed since last stop update
        """
        return self._interval_tracker.should_execute(
            f"stop_update_{symbol}",
            self.update_stop_interval_minutes
        )
    
    def _log_monitored_levels(self) -> None:
        """
        Log all currently monitored entry levels.
        
        Called on each tick to show what levels we're watching.
        """
        if not self._monitored_levels:
            return
        
        level_info = []
        for symbol, signal in self._monitored_levels.items():
            current_price = self._last_price.get(symbol, 0.0)
            distance_pct = ((signal.entry_price - current_price) / current_price * 100) if current_price > 0 else 0
            level_info.append(
                f"{symbol}: entry=${signal.entry_price:.2f} (current=${current_price:.2f}, "
                f"{'↑' if distance_pct > 0 else '↓'}{abs(distance_pct):.1f}%), "
                f"stop=${signal.stop_loss:.2f}, conf={signal.confidence:.2f}"
            )
        
        logger.info(f"📊 Monitored Entry Levels ({len(self._monitored_levels)}):")
        for info in level_info:
            logger.info(f"   {info}")
    
    def _format_candlesticks(self, bars: List[Dict[str, Any]], timeframe: str) -> str:
        """
        Format candlestick data for GPT prompt.
        
        Uses shared utility function.
        
        Args:
            bars: List of OHLCV bars
            timeframe: Timeframe description (e.g., "1hr", "15min")
            
        Returns:
            Formatted string for GPT
        """
        return format_candlesticks_table(bars, timeframe, max_bars=20)
    
    async def should_enter(self, symbol: str, market_data: MarketData) -> EntrySignal:
        """
        Determine entry signal using GPT analysis of candlesticks.
        
        Two-phase approach:
        1. On evaluation intervals: Get GPT analysis and store entry level
        2. On every tick: Check if price crosses stored entry level
        """
        current_price = market_data.price
        
        # Update last price for this symbol
        last_price = self._last_price.get(symbol)
        self._last_price[symbol] = current_price
        
        # Phase 1: Evaluate and store new entry levels on interval boundaries
        if self.should_evaluate_on_interval(symbol, self.evaluation_interval_minutes):
            try:
                # Mark evaluation time
                self.mark_evaluated(symbol)
                
                # Get 1hr candlestick data
                bars_1h = await self._get_candlesticks(symbol, "1Hour", self.lookback_hours_1h * 60)
                
                # Get 15min candlestick data
                bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_hours_15m * 60)
                
                if not bars_1h or not bars_15m:
                    logger.warning(f"Insufficient candlestick data for {symbol}")
                    # Clear monitored level if data unavailable
                    self.cleanup_symbol(symbol)
                    return EntrySignal(should_enter=False, reason="insufficient_data")
                
                # Format data for GPT
                data_1h = self._format_candlesticks(bars_1h, "1hr")
                data_15m = self._format_candlesticks(bars_15m, "15min")
                
                # Build prompt for GPT
                prompt = f"""You are a DAY TRADER analyzing {symbol} for an INTRADAY LONG entry. This is DAY TRADING - we'll exit before market close.

Current Price: ${current_price:.2f}

{data_1h}

{data_15m}

Based on this candlestick data, determine if there is a good INTRADAY entry opportunity.

DAY TRADING Considerations:
- Trend direction and momentum (intraday timeframe)
- Support and resistance levels
- Recent price action and patterns
- Volume confirmation
- Risk/reward for a day trade (realistic intraday targets)
- Time of day (avoid entries late in session)

If you see a valid DAY TRADE setup:
- Provide an entry price (where we buy if price crosses it)
- Set stop loss to protect against adverse moves
- Confidence should reflect likelihood of intraday success

Respond ONLY with a JSON object in this exact format:
{{
  "entry_price": 123.45,
  "stop_loss": 120.00,
  "confidence": 0.75,
  "reasoning": "Clear intraday uptrend with volume, breaking above resistance at $123.45. Stop below recent support at $120."
}}

If there is NO clear DAY TRADE setup, set entry_price and stop_loss to 0 and confidence to 0.
"""
                
                # Get GPT response
                logger.info(f"🤖 Calling GPT for {symbol} entry analysis...")
                response = await self.gpt_helper.get_structured_response(
                    prompt=prompt,
                    response_model=GPTTradeSignal,
                    system_prompt="You are an expert intraday trader analyzing candlestick patterns for day trading entry signals. Focus on realistic intraday setups that can play out in hours, not days. Respond only with valid JSON.",
                    temperature=0.2,
                )
                
                logger.info(
                    f"🤖 GPT analysis for {symbol}: entry=${response.entry_price:.2f}, "
                    f"stop=${response.stop_loss:.2f}, confidence={response.confidence:.2f}"
                )
                logger.debug(f"🤖 GPT reasoning: {response.reasoning}")
                
                # Validate response
                if response.entry_price <= 0 or response.stop_loss <= 0:
                    # Clear monitored level
                    self.cleanup_symbol(symbol)
                    logger.warning(f"❌ GPT returned no setup for {symbol}")
                    return EntrySignal(
                        should_enter=False,
                        reason="no_setup",
                        metadata={"gpt_reasoning": response.reasoning}
                    )
                
                # Validate prices are reasonable
                is_valid, error_msg = response.validate_prices(current_price)
                if not is_valid:
                    self.cleanup_symbol(symbol)
                    logger.error(f"❌ GPT returned invalid prices for {symbol}: {error_msg}")
                    return EntrySignal(
                        should_enter=False,
                        reason="invalid_gpt_response",
                        metadata={
                            "error": error_msg,
                            "gpt_reasoning": response.reasoning
                        }
                    )
                
                # Check confidence threshold
                if response.confidence < self.min_confidence:
                    # Clear monitored level
                    self.cleanup_symbol(symbol)
                    logger.info(
                        f"⚠️ GPT confidence too low for {symbol}: {response.confidence:.2f} < {self.min_confidence:.2f}"
                    )
                    return EntrySignal(
                        should_enter=False,
                        reason="low_confidence",
                        metadata={
                            "confidence": response.confidence,
                            "gpt_reasoning": response.reasoning
                        }
                    )
                
                # Store the entry level for monitoring
                self._monitored_levels[symbol] = response
                logger.info(
                    f"📊 Monitoring entry level for {symbol}: ${response.entry_price:.2f} "
                    f"(current: ${current_price:.2f})"
                )
            
            except Exception as e:
                logger.error(f"Error in GPT entry analysis for {symbol}: {e}", exc_info=True)
                # Clear monitored level on error
                self.cleanup_symbol(symbol)
                return EntrySignal(should_enter=False, reason="analysis_error")
        
        # Log all monitored levels (on every tick for all symbols being checked)
        self._log_monitored_levels()
        
        # Phase 2: Check if price crosses any monitored entry level
        if symbol in self._monitored_levels:
            signal = self._monitored_levels[symbol]
            entry_price = signal.entry_price
            
            # Check if we're within 5% of entry price - pre-fetch news if so
            price_diff_percent = abs(current_price - entry_price) / entry_price * 100
            if price_diff_percent <= 5.0 and not self._task_manager.is_running(f"news_fetch_{symbol}"):
                # Start fetching news in background (don't wait)
                logger.info(f"📡 Pre-fetching news for {symbol} (within 5% of entry)")
                await self.news_service.prefetch_background(symbol, self._task_manager)
            
            # Check for price crossing entry level (price moved from below to above, or is already above)
            crossed = False
            if last_price is None:
                # First tick - check if already above entry
                crossed = current_price >= entry_price
            else:
                # Check if crossed from below to above
                crossed = last_price < entry_price <= current_price
            
            if crossed:
                logger.info(
                    f"🎯 Entry level TRIGGERED for {symbol}: price ${current_price:.2f} "
                    f"crossed ${entry_price:.2f}. Placing MARKET order IMMEDIATELY."
                )
                
                # Clean up monitoring (removes level and cancels background tasks)
                self.cleanup_symbol(symbol)
                
                # Start thesis generation in background (DON'T WAIT!)
                logger.info(f"⚙️ Starting background thesis generation for {symbol}")
                self._task_manager.start_task(
                    f"thesis_{symbol}",
                    self._generate_thesis_background(
                        symbol=symbol,
                        entry_price=current_price,
                        stop_loss=signal.stop_loss,
                        original_reasoning=signal.reasoning,
                        market_data=market_data
                    ),
                    replace_existing=True
                )
                
                # Return entry signal with MARKET order IMMEDIATELY (no thesis yet)
                return EntrySignal(
                    should_enter=True,
                    entry_price=current_price,  # Use current price for market order
                    stop_loss=signal.stop_loss,
                    confidence=signal.confidence,
                    reason="level_triggered",
                    order_type="market",  # MARKET ORDER
                    metadata={
                        "gpt_reasoning": signal.reasoning,
                        "target_entry_price": entry_price,
                        "triggered_at_price": current_price,
                        "analysis_time": datetime.now().isoformat(),
                        "thesis_generating": True,  # Thesis is being generated in background
                    }
                )
        
        # No entry signal
        return EntrySignal(should_enter=False, reason="monitoring")
    
    async def should_exit(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> ExitSignal:
        """
        Determine exit signal based on stop loss.
        
        Updates stop loss using GPT on interval boundaries, then checks
        if current price has hit the stop.
        """
        current_price = market_data.price
        
        # Get current stop loss from position state
        stop_loss = position.strategy_state.get("stop_loss")
        
        if stop_loss is None:
            logger.warning(f"No stop_loss in position state for {position.symbol}, using entry-based stop")
            stop_loss = position.entry_price * 0.95  # 5% below entry as fallback
        
        # Check if we should update the stop loss
        if self._should_update_stop(position.symbol):
            try:
                new_stop = await self._update_stop_loss(position, market_data)
                if new_stop and new_stop > stop_loss:
                    logger.info(
                        f"🤖 Raising stop loss for {position.symbol}: "
                        f"${stop_loss:.2f} → ${new_stop:.2f}"
                    )
                    stop_loss = new_stop
                    # Note: The actual strategy_state update happens in the engine
                    # We return the new stop in the metadata
                
                # Mark stop update time
                self._interval_tracker.mark_executed(f"stop_update_{position.symbol}")
            
            except Exception as e:
                logger.error(f"Error updating stop loss for {position.symbol}: {e}")
        
        # Check if stop loss is hit
        if current_price <= stop_loss:
            logger.info(
                f"🛑 Stop loss hit for {position.symbol}: "
                f"price=${current_price:.2f} <= stop=${stop_loss:.2f}"
            )
            return ExitSignal(
                should_exit=True,
                exit_price=current_price,
                reason="stop_loss",
            )
        
        # No exit signal
        return ExitSignal(should_exit=False)
    
    async def should_scale_out(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[ScaleSignal]:
        """
        Determine if we should scale out (take partial profits).
        
        Strategy: Take 50% profit at first target, let remaining 50% run.
        """
        current_price = market_data.price
        
        # Check if we've already scaled out
        if position.has_scaled_out:
            return None
        
        # Get first target from trade thesis (position state OR cache)
        trade_thesis_dict = position.strategy_state.get("trade_thesis")
        
        # If not in position state, check cache
        if not trade_thesis_dict and position.symbol in self._thesis_cache:
            cached_thesis = self._thesis_cache[position.symbol]
            if cached_thesis:
                trade_thesis_dict = cached_thesis.dict()
                logger.info(f"📋 Using cached thesis for {position.symbol} scale out check")
        
        if not trade_thesis_dict:
            return None
        
        first_target = trade_thesis_dict.get("first_target")
        if not first_target:
            return None
        
        # Check if price hit or exceeded first target
        if current_price >= first_target:
            logger.info(
                f"🎯 FIRST TARGET HIT for {position.symbol}: "
                f"price ${current_price:.2f} >= target ${first_target:.2f}. "
                f"Taking 50% profit!"
            )
            
            return ScaleSignal(
                action="scale_out",
                percent=50.0,
                reason="first_target_hit",
                adjust_stop_to_breakeven=True,  # Move stop to breakeven on remaining 50%
            )
        
        return None
    
    async def _update_stop_loss(
        self,
        position: PositionContext,
        market_data: MarketData
    ) -> Optional[float]:
        """
        Use GPT to update stop loss for an open position.
        
        Args:
            position: Current position context
            market_data: Current market data
            
        Returns:
            New stop loss price, or None if update fails
        """
        try:
            symbol = position.symbol
            
            # Get recent 15min candlesticks
            bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_hours_15m * 60)
            
            if not bars_15m:
                logger.warning(f"No candlestick data available for stop update: {symbol}")
                return None
            
            data_15m = self._format_candlesticks(bars_15m, "15min")
            
            current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.95)
            
            # Get trade thesis from position state OR cache (if still generating)
            trade_thesis_dict = position.strategy_state.get("trade_thesis")
            
            # If not in position state, check cache
            if not trade_thesis_dict and symbol in self._thesis_cache:
                cached_thesis = self._thesis_cache[symbol]
                if cached_thesis:
                    trade_thesis_dict = cached_thesis.dict()
                    logger.info(f"📋 Using cached thesis for {symbol} stop update")
            
            thesis_context = ""
            
            if trade_thesis_dict:
                thesis_context = f"""
ORIGINAL TRADE THESIS (captured at entry):
- Why Entered: {trade_thesis_dict.get('why_entered', 'N/A')}
- Expected Outcome: {trade_thesis_dict.get('expected_outcome', 'N/A')}
- Key Levels: {trade_thesis_dict.get('key_levels', 'N/A')}
- Exit Considerations: {trade_thesis_dict.get('exit_considerations', 'N/A')}
- Target Hold Time: {trade_thesis_dict.get('holding_period_target', 'N/A')}
"""
            
            # Build prompt
            prompt = f"""You are managing an open DAY TRADE LONG position in {symbol}. Remember: this is INTRADAY trading.

Position Details:
- Entry Price: ${position.entry_price:.2f}
- Current Price: ${market_data.price:.2f}
- Current Stop Loss: ${current_stop:.2f}
- Time in Position: {position.time_in_position_minutes():.1f} minutes
- Unrealized P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)
- Has Scaled Out: {position.has_scaled_out} (if True, this is remaining 50%)
{thesis_context}
Recent Price Action:
{data_15m}

Based on the recent price action and your original day trade thesis, determine if the stop loss should be updated.

DAY TRADING Guidelines:
- NEVER lower the stop loss (only raise it or keep it the same)
- Consider your original expectations and key levels
- If in profit, consider raising stop to breakeven to protect gains
- If strong momentum, use trailing stop
- If thesis is invalidated or momentum fading, be aggressive with stops
- Remember: we exit before market close - protect profits as day progresses
- If we scaled out at first target, be more aggressive protecting remaining position

Respond ONLY with a JSON object in this exact format:
{{
  "new_stop_loss": 123.45,
  "reasoning": "Price made new high, raising stop to breakeven to lock in risk-free trade."
}}
"""
            
            logger.info(f"🤖 Calling GPT for {symbol} stop loss update...")
            response = await self.gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTStopUpdate,
                system_prompt="You are an expert trader managing stop losses. Never lower stops. Respond only with valid JSON.",
                temperature=0.1,
            )
            
            logger.info(
                f"🤖 GPT stop update for {symbol}: ${current_stop:.2f} → ${response.new_stop_loss:.2f}"
            )
            logger.debug(f"🤖 GPT reasoning: {response.reasoning}")
            
            # Validate the new stop loss
            is_valid, error_msg = response.validate_stop(
                current_stop=current_stop,
                current_price=market_data.price,
                entry_price=position.entry_price
            )
            
            if not is_valid:
                logger.error(f"❌ GPT returned invalid stop loss for {symbol}: {error_msg}")
                return None
            
            logger.info(f"✅ Valid stop loss update for {symbol}: ${current_stop:.2f} → ${response.new_stop_loss:.2f}")
            return response.new_stop_loss
        
        except Exception as e:
            logger.error(f"Error in GPT stop loss update for {symbol}: {e}", exc_info=True)
            return None
    
    async def _get_candlesticks(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int
    ) -> List[Dict[str, Any]]:
        """
        Get candlestick data using the market data provider.
        
        Args:
            symbol: Stock symbol
            timeframe: Timeframe (e.g., "1Hour", "15Min")
            lookback_minutes: Minutes to look back
            
        Returns:
            List of OHLCV bars
        """
        try:
            # Note: This will be called via the market data provider
            # injected by the strategy engine
            from app.services.market.market_data_provider import MarketDataProvider
            from app.core import get_client
            
            # Create provider instance
            provider = MarketDataProvider(polygon_client=get_client())
            
            # Get historical bars
            bars = await provider.get_historical_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes
            )
            
            return bars
        
        except Exception as e:
            logger.error(f"Error fetching candlesticks for {symbol}: {e}")
            return []
    
    # Note: News fetching now handled by NewsService
    # Use: self.news_service.fetch_news_context(), prefetch_background(), get_cached_or_fetch()
    
    async def _generate_thesis_background(
        self,
        symbol: str,
        entry_price: float,
        stop_loss: float,
        original_reasoning: str,
        market_data: MarketData
    ) -> None:
        """
        Generate trade thesis in background and cache it.
        
        Note: Task tracking handled by base class _task_manager.
        
        Args:
            symbol: Stock symbol
            entry_price: Actual entry price
            stop_loss: Stop loss price
            original_reasoning: GPT's original entry reasoning
            market_data: Market data at entry
        """
        try:
            logger.debug(f"🔄 Background thesis generation started for {symbol}")
            
            thesis = await self._generate_trade_thesis(
                symbol=symbol,
                entry_price=entry_price,
                stop_loss=stop_loss,
                original_reasoning=original_reasoning,
                market_data=market_data
            )
            
            # Cache the thesis
            self._thesis_cache[symbol] = thesis
            
            if thesis:
                logger.info(f"✅ Trade thesis generated and cached for {symbol}")
            else:
                logger.warning(f"⚠️ Thesis generation returned None for {symbol}")
            
        except Exception as e:
            logger.error(f"❌ Background thesis generation failed for {symbol}: {e}", exc_info=True)
            # Cache None so we don't keep trying
            self._thesis_cache[symbol] = None
        
        # Note: Task cleanup handled automatically by _task_manager
    
    async def _generate_trade_thesis(
        self,
        symbol: str,
        entry_price: float,
        stop_loss: float,
        original_reasoning: str,
        market_data: MarketData
    ) -> Optional[GPTTradeThesis]:
        """
        Generate trade thesis at entry to guide future exit decisions.
        
        Args:
            symbol: Stock symbol
            entry_price: Price at which we entered
            stop_loss: Initial stop loss
            original_reasoning: GPT's reasoning for entry signal
            market_data: Current market data
            
        Returns:
            Trade thesis or None if generation fails
        """
        try:
            # Get recent 15min bars for context
            bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_hours_15m * 60)
            
            if not bars_15m:
                logger.warning(f"No candlestick data for thesis generation: {symbol}")
                return None
            
            data_15m = self._format_candlesticks(bars_15m, "15min")
            
            # Get news context (use cached if available, otherwise fetch)
            news_context = await self.news_service.get_cached_or_fetch(symbol)
            
            prompt = f"""You are a DAY TRADER who just entered a LONG position in {symbol}. This is INTRADAY TRADING - you will exit before market close.

TRADE ENTRY:
- Entry Price: ${entry_price:.2f}
- Stop Loss: ${stop_loss:.2f}
- Original Reasoning: {original_reasoning}

MARKET CONTEXT:
{data_15m}

RECENT NEWS & EVENTS:
{news_context}

Reflect on this DAY TRADE and provide a thesis to guide intraday exit management:

1. WHY WE ENTERED: What pattern/setup triggered this entry? How does news support or contradict?
2. EXPECTED OUTCOME: What do you expect in the next 1-4 hours? Realistic intraday price target?
3. KEY LEVELS: Support, resistance, and FIRST PROFIT TARGET (where we'll take 50% off)
4. EXIT CONSIDERATIONS: What to watch? What invalidates this day trade thesis?
5. HOLDING PERIOD: Expected hold time (e.g., '15-60 minutes', 'until 2pm', 'until EOD')

IMPORTANT: Set a realistic FIRST TARGET price above entry where we'll take 50% profit. This is day trading - targets should be achievable within hours, not days.

Respond ONLY with a JSON object in this exact format:
{{
  "why_entered": "Core setup that triggered entry + news catalyst if any",
  "expected_outcome": "Intraday expectation and realistic targets",
  "key_levels": "Important levels: support at $X, resistance at $Y",
  "first_target": 155.50,
  "exit_considerations": "Watch for: volume drop, break below support, time-based exit",
  "holding_period_target": "Expected intraday hold time"
}}
"""
            
            logger.info(f"🧠 Generating trade thesis for {symbol}...")
            thesis = await self.gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTTradeThesis,
                system_prompt="You are an intraday trader reflecting on a day trade you just entered. Focus on realistic intraday targets and exit plans that work within market hours. Be specific about levels and timing.",
                temperature=0.3,
            )
            
            # Log the thesis
            logger.info(f"📝 TRADE THESIS for {symbol}:")
            logger.info(f"   Entry: ${entry_price:.2f} | Stop: ${stop_loss:.2f} | First Target: ${thesis.first_target:.2f}")
            logger.info(f"   Why Entered: {thesis.why_entered}")
            logger.info(f"   Expected: {thesis.expected_outcome}")
            logger.info(f"   Key Levels: {thesis.key_levels}")
            logger.info(f"   Exit Watch: {thesis.exit_considerations}")
            logger.info(f"   Target Hold: {thesis.holding_period_target}")
            logger.info(f"   News Context: {news_context[:200]}...")  # Log first 200 chars of news
            
            return thesis
        
        except Exception as e:
            logger.error(f"Error generating trade thesis for {symbol}: {e}", exc_info=True)
            return None
    
    async def position_sizing(
        self,
        signal: EntrySignal,
        fund_balance: float,
        risk_params: Dict[str, Any]
    ) -> float:
        """
        Calculate position size based on fund configuration.
        
        Uses the fund's size_per_trade setting.
        """
        size_per_trade = risk_params.get("size_per_trade", 1000.0)
        max_bet_percent = risk_params.get("max_bet_percent")
        
        position_size = size_per_trade
        
        # Respect max bet percentage if set
        if max_bet_percent is not None and max_bet_percent > 0:
            max_position = fund_balance * (max_bet_percent / 100.0)
            position_size = min(position_size, max_position)
        
        # Adjust by confidence
        position_size *= signal.confidence
        
        logger.info(
            f"🤖 GPT Candlestick position sizing: ${position_size:.2f} "
            f"(confidence={signal.confidence:.2f})"
        )
        
        return position_size

