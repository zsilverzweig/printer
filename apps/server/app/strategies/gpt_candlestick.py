"""
GPT Candlestick Strategy

AI-powered strategy that analyzes 1hr and 15min candlesticks using GPT-4o-mini.
Makes trading decisions on 15-minute intervals with dynamic AI-driven stops.
Long-only positions with automated stop-loss exits.
"""

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.services.ai.gpt_helper import get_gpt_helper
from app.services.news.news_service import NewsService
from app.lib.technical_analysis import (
    calculate_ema,
    calculate_vwap,
    calculate_rsi,
    calculate_macd,
)

logger = logging.getLogger(__name__)


class GPTTradeSignal(BaseModel):
    """Structured output from GPT for trade decisions."""
    entry_price: float = Field(ge=0, description="Price at which to enter the trade")
    stop_loss: float = Field(ge=0, description="Stop loss price")
    confidence: float = Field(ge=0, le=1, description="Confidence level (0-1)")
    reasoning: str = Field(description="Explanation of the decision")
    patterns_identified: List[str] = Field(description="Patterns recognized")


class GPTStopUpdate(BaseModel):
    """Structured output from GPT for stop loss updates."""
    new_stop_loss: float = Field(gt=0, description="Updated stop loss price")
    reasoning: str = Field(description="Explanation for the stop loss update")
    momentum_assessment: str = Field(description="'strengthening', 'weakening', or 'neutral'")


class GPTCandlestickStrategy(ExecutionStrategy):
    """AI-powered candlestick analysis strategy using GPT."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Configuration
        self.evaluation_interval_minutes = config.get("evaluation_interval_minutes", 15)
        self.lookback_hours_1h = config.get("lookback_hours_1h", 48)
        self.lookback_hours_15m = config.get("lookback_hours_15m", 6)
        self.lookback_days_daily = config.get("lookback_days_daily", 7)  # Week of daily bars
        self.lookback_hours_5m = config.get("lookback_hours_5m", 2)  # 2 hours of 5min bars
        self.update_stop_interval_minutes = config.get("update_stop_interval_minutes", 5)  # Check every 5 minutes
        self.min_confidence = config.get("min_confidence", 0.6)
        
        # Initialize news service
        self.news_service = NewsService()
    
    def _get_gpt_helper(self):
        """Get GPT helper with cost tracking."""
        return get_gpt_helper(model="gpt-4o-mini", fund_id=self.fund_id)
    
    @property
    def id(self) -> str:
        return "gpt_candlestick"
    
    @property
    def name(self) -> str:
        return "GPT Candlestick"
    
    @property
    def description(self) -> str:
        return (
            "AI-powered strategy that analyzes 1hr and 15min candlesticks using GPT-4o-mini. "
            "Makes trading decisions on 15-minute intervals with dynamic AI-driven stops. "
            "Long-only positions with automated stop-loss exits."
        )
    
    @property
    def strategy_type(self) -> str:
        return "ai-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "15+ minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False  # Goes straight to entry analysis
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Call GPT every 15 minutes to analyze candlesticks and set entry level.
        """
        # Check if we should evaluate (every 15 minutes)
        if not self._interval_tracker.should_execute(f"entry_{ticker}", self.evaluation_interval_minutes):
            return None
        
        self._interval_tracker.mark_executed(f"entry_{ticker}")
        
        current_price = market_data.price
        
        try:
            # Get 1hr candlestick data
            bars_1h = await self._get_candlesticks(ticker, "1Hour", self.lookback_hours_1h * 60)
            
            # Get 15min candlestick data
            bars_15m = await self._get_candlesticks(ticker, "15Min", self.lookback_hours_15m * 60)
            
            if not bars_1h or not bars_15m:
                logger.warning(f"Insufficient candlestick data for {ticker}")
                return None
            
            # Format data for GPT with indicators
            data_1h = self._format_candlesticks_with_indicators(bars_1h, "1hr", 20)
            data_15m = self._format_candlesticks_with_indicators(bars_15m, "15min", 20)
            
            # Get recent key events (non-blocking)
            try:
                news_events = await self.news_service.get_recent_events(ticker, days=1)
            except Exception as e:
                logger.debug(f"News events unavailable for {ticker}: {e}")
                news_events = "News events unavailable"
            
            # Build prompt for GPT
            prompt = f"""You are a SELECTIVE DAY TRADER analyzing {ticker} for an INTRADAY LONG entry. This is DAY TRADING - we'll exit before market close.

Current Price: ${current_price:.2f}

{data_1h}

{data_15m}

RECENT NEWS & EVENTS:
{news_events}

Based on this candlestick data and recent news, determine if there is a HIGH-QUALITY INTRADAY entry opportunity.

DAY TRADING Evaluation Criteria:
✅ REQUIRED for entry consideration:
- Clear intraday trend direction with momentum
- Strong volume confirmation (not just price movement alone)
- Well-defined support/resistance levels
- Favorable risk/reward ratio (at least 2:1 intraday target)
- Reasonable time of day (avoid late session entries)
- Multiple timeframes confirming the setup
- Consider recent news: positive news can support bullish setups, negative news should be a red flag

❌ REJECT if:
- Choppy, sideways, or unclear price action
- Low volume or volume declining
- No clear support/resistance structure
- Too late in the trading day
- Mixed signals between timeframes
- Setup requires "hoping" price will do something

Confidence Scale (be honest and conservative):
- 0.8-1.0: A+ setup - Multiple confirming factors, high probability
- 0.6-0.8: B+ setup - Decent evidence, some supporting factors
- 0.4-0.6: C setup - Coin flip, unclear
- 0.0-0.4: D/F setup - Weak/speculative

IMPORTANT: ALWAYS provide an entry_price and stop_loss, even for weak setups.
- For HIGH-QUALITY setups (confidence >= 0.6): Suggest an aggressive entry at current levels
- For WEAK setups (confidence < 0.6): Suggest a CONSERVATIVE entry price well below current price (e.g., at strong support, 5-10% below current)
- This allows the strategy to wait for better prices on uncertain setups

Analyze using ANY patterns you recognize:
- Key support/resistance from 1hr and 15min levels
- Classic patterns (flags, triangles, head & shoulders, etc.)
- EMA9/20 crossovers and trend direction (also EMA12/26 for longer context)
- VWAP as dynamic support/resistance
- RSI for overbought/oversold conditions (>70 overbought, <30 oversold)
- MACD for momentum confirmation (crossovers, histogram strength, divergence)
- Volume patterns and anomalies
- Candlestick formations

Respond ONLY with a JSON object in this exact format:
{{
  "entry_price": 123.45,
  "stop_loss": 120.00,
  "confidence": 0.75,
  "reasoning": "Clear intraday uptrend with volume, breaking above resistance at $123.45. Stop below recent support at $120.",
  "patterns_identified": ["uptrend", "resistance breakout", "volume confirmation"]
}}

Be conservative with confidence but ALWAYS provide realistic prices based on technical levels.
If there is NO setup, set entry_price and stop_loss to 0, confidence to 0, and explain why in reasoning.
"""
            
            # Get GPT response
            logger.info(f"🤖 Calling GPT for {ticker} candlestick analysis...")
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTTradeSignal,
                system_prompt="You are an expert intraday trader analyzing chart patterns. For high-quality setups, suggest aggressive entry prices near current levels. For weak/uncertain setups, suggest conservative entry prices well below current price at strong support levels. Focus on realistic intraday setups that can play out in hours, not days. Respond only with valid JSON.",
                temperature=0.2,
                operation="entry_analysis",
                symbol=ticker,
                metadata={"strategy": "gpt_candlestick"},
            )
            
            logger.info(
                f"🤖 GPT analysis for {ticker}: entry=${response.entry_price:.2f}, "
                f"stop=${response.stop_loss:.2f}, confidence={response.confidence:.2f}"
            )
            logger.debug(f"🤖 GPT reasoning: {response.reasoning}")
            logger.debug(f"🤖 Patterns: {', '.join(response.patterns_identified)}")
            
            # Validate response
            if response.entry_price <= 0 or response.stop_loss <= 0:
                logger.warning(f"❌ GPT returned no setup for {ticker}")
                return None
            
            # Basic validation
            if response.entry_price > current_price * 1.10:
                logger.warning(f"❌ GPT entry price too high for {ticker}: ${response.entry_price:.2f}")
                return None
            
            if response.stop_loss >= response.entry_price:
                logger.warning(f"❌ GPT stop loss >= entry for {ticker}")
                return None
            
            # Check confidence threshold
            if response.confidence < self.min_confidence:
                logger.info(f"⚠️ GPT confidence too low for {ticker}: {response.confidence:.2f} < {self.min_confidence:.2f}")
                return None
            
            # Return entry level - engine will persist it and trigger when price crosses
            logger.info(
                f"📊 Setting entry level for {ticker}: ${response.entry_price:.2f} "
                f"(current: ${current_price:.2f}, patterns: {', '.join(response.patterns_identified)})"
            )
            
            return EntryLevel(
                entry_price=response.entry_price,
                stop_loss=response.stop_loss,
                confidence=response.confidence,
                order_type="market",
                metadata={
                    "patterns": response.patterns_identified,
                    "reasoning": response.reasoning,
                }
            )
        
        except Exception as e:
            logger.error(f"Error in GPT candlestick analysis for {ticker}: {e}", exc_info=True)
            return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Update stop every 5 minutes using GPT analysis.
        Raise stop to lock in profits as position develops.
        Engine will enforce 50% profit protection on top of this.
        """
        symbol = position.symbol
        current_price = market_data.price
        
        # Get current stop from position state
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.95)
        
        # Check if we should update (every 5 minutes)
        if not self._interval_tracker.should_execute(f"manage_{symbol}", self.update_stop_interval_minutes):
            return StopUpdate(current_stop=current_stop)
        
        self._interval_tracker.mark_executed(f"manage_{symbol}")
        
        try:
            # Get multiple timeframes for comprehensive context
            bars_daily = await self._get_candlesticks(symbol, "1Day", self.lookback_days_daily * 24 * 60)
            bars_1h = await self._get_candlesticks(symbol, "1Hour", 12 * 60)  # 12 hours
            bars_15m = await self._get_candlesticks(symbol, "15Min", self.lookback_hours_15m * 60)
            bars_5m = await self._get_candlesticks(symbol, "5Min", self.lookback_hours_5m * 60)
            
            if not bars_1h or not bars_15m or not bars_5m:
                logger.warning(f"No candlestick data for stop update: {symbol}")
                return StopUpdate(current_stop=current_stop)
            
            # Format data for GPT with indicators
            data_daily = self._format_candlesticks_with_indicators(bars_daily, "Daily", 7) if bars_daily else "No daily data"
            data_1h = self._format_candlesticks_with_indicators(bars_1h, "1hr", 12)
            data_15m = self._format_candlesticks_with_indicators(bars_15m, "15min", 20)
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", 12)
            
            time_in_trade = position.time_in_position_minutes()
            
            # Get original entry reasoning if available
            entry_reasoning = position.strategy_state.get("entry_reasoning", "N/A")
            entry_patterns = position.strategy_state.get("entry_patterns", [])
            
            # Get recent key events (non-blocking)
            try:
                news_events = await self.news_service.get_recent_events(symbol, days=1)
            except Exception as e:
                logger.debug(f"News events unavailable for {symbol}: {e}")
                news_events = "News events unavailable"
            
            prompt = f"""Managing INTRADAY LONG position in {symbol}. This is DAY TRADING - we exit before close.

Position Details:
- Entry Price: ${position.entry_price:.2f}
- Current Price: ${current_price:.2f}
- Current Stop Loss: ${current_stop:.2f}
- Time in Position: {time_in_trade:.1f} minutes
- Unrealized P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)
- Entry Reasoning: {entry_reasoning}
- Entry Patterns: {', '.join(entry_patterns) if entry_patterns else 'N/A'}

Market Context (Multiple Timeframes):
{data_daily}

{data_1h}

{data_15m}

{data_5m}

RECENT NEWS & EVENTS:
{news_events}

Based on the recent price action and news, determine if the stop loss should be updated.

DAY TRADING Guidelines:
- NEVER lower the stop loss (only raise it or keep it the same)
- Consider original entry patterns and whether thesis is still intact
- If in profit, consider raising stop to breakeven to protect gains
- If strong momentum continues (MACD histogram growing, price above EMAs), use trailing stop
- If patterns break down or momentum fading (MACD turning negative, price below EMAs), be aggressive with stops
- Remember: we exit before market close - protect profits as day progresses
- Use technical levels (EMA9/20, VWAP, support) to place stops intelligently
- Watch for EMA crossovers and MACD divergences as momentum shift signals
- Consider news: negative news may warrant tighter stops, positive news may support wider stops

Respond ONLY with a JSON object:
{{
  "new_stop_loss": 123.45,
  "reasoning": "Price made new high above resistance, raising stop to EMA26 support at $123.45 to lock in gains.",
  "momentum_assessment": "strengthening"
}}
"""
            
            logger.info(f"🤖 Calling GPT for {symbol} stop loss update...")
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTStopUpdate,
                system_prompt="You are an expert trader managing stop losses for intraday positions. Never lower stops. Use technical levels intelligently. Respond only with valid JSON.",
                temperature=0.1,
                operation="stop_loss_update",
                symbol=symbol,
                metadata={"strategy": "gpt_candlestick"},
            )
            
            # Validate: never lower stop
            if response.new_stop_loss < current_stop:
                logger.warning(f"❌ GPT tried to lower stop for {symbol}, keeping current: ${current_stop:.2f}")
                return StopUpdate(current_stop=current_stop)
            
            # Validate: don't set stop above current price
            if response.new_stop_loss > current_price * 0.99:
                logger.warning(f"⚠️ GPT stop too high for {symbol}, capping at 99% of current price")
                response.new_stop_loss = current_price * 0.99
            
            logger.info(
                f"🤖 GPT stop update (5min check) for {symbol}: ${current_stop:.2f} → ${response.new_stop_loss:.2f} "
                f"({response.momentum_assessment})"
            )
            logger.debug(f"🤖 Reasoning: {response.reasoning}")
            
            return StopUpdate(current_stop=response.new_stop_loss)
        
        except Exception as e:
            logger.error(f"Error updating stop for {symbol}: {e}", exc_info=True)
            return StopUpdate(current_stop=current_stop)
    
    def _format_candlesticks_with_indicators(
        self,
        bars: List[Dict[str, Any]],
        timeframe: str,
        max_bars: int = 20
    ) -> str:
        """Format candlestick data with technical indicators for GPT."""
        if not bars:
            return f"No {timeframe} data available"
        
        # Limit to max_bars most recent
        display_bars = bars[-max_bars:] if len(bars) > max_bars else bars
        
        # Calculate indicators
        ema_9 = calculate_ema(bars, 9)
        ema_20 = calculate_ema(bars, 20)
        ema_12 = calculate_ema(bars, 12)
        ema_26 = calculate_ema(bars, 26)
        vwap = calculate_vwap(bars, reset_daily=True)
        rsi = calculate_rsi(bars, 14)
        macd_data = calculate_macd(bars, 12, 26, 9)
        
        start_idx = len(bars) - len(display_bars)
        
        formatted = [f"\n{timeframe} Candlesticks with Indicators (most recent last):"]
        formatted.append(
            f"{'Time':<20} {'O':<8} {'H':<8} {'L':<8} {'C':<8} {'Vol':<10} "
            f"{'EMA9':<8} {'EMA20':<8} {'VWAP':<8} {'RSI':<6} {'MACD':<8} {'Signal':<8} {'Hist':<7}"
        )
        formatted.append("-" * 135)
        
        for i, bar in enumerate(display_bars):
            bar_idx = start_idx + i
            
            ts = bar.get('timestamp', 'N/A')
            if hasattr(ts, 'strftime'):
                ts = ts.strftime('%m/%d %H:%M')
            else:
                ts = str(ts)[:16]
            
            o = bar.get('open', 0)
            h = bar.get('high', 0)
            l = bar.get('low', 0)
            c = bar.get('close', 0)
            v = bar.get('volume', 0)
            
            # Format indicators
            ema9_str = f"{ema_9[bar_idx]:.2f}" if bar_idx < len(ema_9) and ema_9[bar_idx] else "N/A"
            ema20_str = f"{ema_20[bar_idx]:.2f}" if bar_idx < len(ema_20) and ema_20[bar_idx] else "N/A"
            vwap_str = f"{vwap[bar_idx]:.2f}" if bar_idx < len(vwap) and vwap[bar_idx] else "N/A"
            rsi_str = f"{rsi[bar_idx]:.1f}" if bar_idx < len(rsi) and rsi[bar_idx] else "N/A"
            
            # Format MACD values
            macd_line = macd_data.get("macd", [])
            macd_signal = macd_data.get("signal", [])
            macd_hist = macd_data.get("histogram", [])
            
            macd_str = f"{macd_line[bar_idx]:.3f}" if bar_idx < len(macd_line) and macd_line[bar_idx] is not None else "N/A"
            signal_str = f"{macd_signal[bar_idx]:.3f}" if bar_idx < len(macd_signal) and macd_signal[bar_idx] is not None else "N/A"
            hist_str = f"{macd_hist[bar_idx]:.3f}" if bar_idx < len(macd_hist) and macd_hist[bar_idx] is not None else "N/A"
            
            formatted.append(
                f"{ts:<20} {o:<8.2f} {h:<8.2f} {l:<8.2f} {c:<8.2f} {v:<10,.0f} "
                f"{ema9_str:<8} {ema20_str:<8} {vwap_str:<8} {rsi_str:<6} {macd_str:<8} {signal_str:<8} {hist_str:<7}"
            )
        
        return "\n".join(formatted)
    
    async def _get_candlesticks(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int
    ) -> List[Dict[str, Any]]:
        """Get candlestick data."""
        try:
            from app.services.market.market_data_provider import MarketDataProvider
            from app.core import get_client
            
            provider = MarketDataProvider(polygon_client=get_client())
            
            bars = await provider.get_historical_bars(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes
            )
            
            return bars
        except Exception as e:
            logger.error(f"Error fetching candlesticks for {symbol}: {e}")
            return []
