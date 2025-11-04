"""
GPT Five Guy Strategy

Ultra-aggressive AI-powered 5-minute scalping strategy.
Analyzes multiple timeframes using GPT-4o-mini to set patient entry levels.
Updates stops every 30 seconds for rapid risk management.
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


class GPTFiveGuyStrategy(ExecutionStrategy):
    """GPT Five Guy: Ultra-aggressive AI-powered 5-minute scalping strategy."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Configuration
        self.evaluation_interval_minutes = config.get("evaluation_interval_minutes", 5)
        self.lookback_days_daily = config.get("lookback_days_daily", 7)
        self.lookback_hours_1h = config.get("lookback_hours_1h", 24)
        self.lookback_hours_15m = config.get("lookback_hours_15m", 3)
        self.lookback_hours_5m = config.get("lookback_hours_5m", 1)
        self.lookback_minutes_1m = config.get("lookback_minutes_1m", 30)
        self.update_stop_interval_minutes = config.get("update_stop_interval_minutes", 0.5)  # 30 seconds
        self.min_confidence = config.get("min_confidence", 0.7)
        self.max_concurrent_positions = config.get("max_concurrent_positions", 5)
    
    def _get_gpt_helper(self):
        """Get GPT helper with cost tracking, respecting model override from config."""
        return get_gpt_helper(
            model="gpt-5-nano",
            fund_id=self.fund_id,
            config=self.config
        )
    
    @property
    def id(self) -> str:
        return "gpt_five_guy"
    
    @property
    def name(self) -> str:
        return "GPT Five Guy"
    
    @property
    def description(self) -> str:
        return (
            "Ultra-aggressive AI-powered 5-minute scalping strategy. "
            "Analyzes daily/1hr/15min/5min/1min candlesticks every 5 minutes. "
            "Sets patient entry levels. Updates stops every 30 seconds. "
            "Target hold: 1-20 minutes."
        )
    
    @property
    def strategy_type(self) -> str:
        return "ai-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "1-20 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return False  # Goes straight to entry analysis
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Call GPT every 5 minutes to analyze and set entry level.
        """
        # Check if we should evaluate (every 5 minutes)
        if not self._interval_tracker.should_execute(f"entry_{ticker}", self.evaluation_interval_minutes):
            return None
        
        self._interval_tracker.mark_executed(f"entry_{ticker}")
        
        current_price = market_data.price
        
        try:
            # Fetch all timeframes
            bars_daily = await self._get_candlesticks(ticker, "1Day", self.lookback_days_daily * 24 * 60)
            bars_1h = await self._get_candlesticks(ticker, "1Hour", self.lookback_hours_1h * 60)
            bars_15m = await self._get_candlesticks(ticker, "15Min", self.lookback_hours_15m * 60)
            bars_5m = await self._get_candlesticks(ticker, "5Min", self.lookback_hours_5m * 60)
            bars_1m = await self._get_candlesticks(ticker, "1Min", self.lookback_minutes_1m)
            
            if not bars_1h or not bars_15m or not bars_5m or not bars_1m:
                logger.warning(f"🍔 Insufficient candlestick data for {ticker}")
                return None
            
            # Format data for GPT with indicators
            data_daily = self._format_candlesticks_with_indicators(bars_daily, "Daily", 7) if bars_daily else "No daily data"
            data_1h = self._format_candlesticks_with_indicators(bars_1h, "1hr", 12)
            data_15m = self._format_candlesticks_with_indicators(bars_15m, "15min", 12)
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", 12)
            data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", 15)
            
            # Build prompt
            prompt = f"""You are a sophisticated day trader analyzing {ticker} for RAPID INTRADAY entries.
Target hold time: 1-20 MINUTES (not hours, not days).

Current Price: ${current_price:.2f}

{data_daily}

{data_1h}

{data_15m}

{data_5m}

{data_1m}

Your task: Set an entry price you're CONFIDENT will be a good buy if price reaches it.

Analyze using ANY patterns you recognize:
- Key support/resistance from daily and intraday levels
- Classic patterns (flags, triangles, head & shoulders, etc.)
- EMA crossovers and trend direction
- VWAP as dynamic support/resistance
- RSI for overbought/oversold conditions
- MACD for momentum confirmation
- Volume patterns and anomalies
- Candlestick formations

CRITICAL APPROACH:
- Entry must be AT OR BELOW current price ${current_price:.2f}
- Be PATIENT: Set entry at strong support far below current price if needed
- Don't chase! Set the price YOU want to buy at
- Aim for 2R minimum risk/reward
- This is RAPID trading once entered - we exit in 1-20 minutes

Respond ONLY with a JSON object:
{{
  "entry_price": 123.45,
  "stop_loss": 120.00,
  "confidence": 0.75,
  "reasoning": "Setting entry at EMA26 support...",
  "patterns_identified": ["ema support", "daily support"]
}}

If there is NO good entry level, set entry_price and stop_loss to 0 and confidence to 0.
"""
            
            logger.info(f"🍔 Calling GPT for {ticker} entry analysis...")
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTTradeSignal,
                system_prompt="You are a sophisticated intraday trader who sets patient entry levels. Respond only with valid JSON.",
                temperature=0.2,
                operation="entry_analysis",
                symbol=ticker,
                metadata={"strategy": "gpt_five_guy"},
            )
            
            logger.info(
                f"🍔 GPT analysis for {ticker}: entry=${response.entry_price:.2f}, "
                f"stop=${response.stop_loss:.2f}, confidence={response.confidence:.2f}"
            )
            
            # Validate response
            if response.entry_price <= 0 or response.stop_loss <= 0:
                logger.warning(f"❌ GPT returned no setup for {ticker}")
                return None
            
            # Basic validation
            if response.entry_price > current_price * 1.05:
                logger.warning(f"❌ GPT entry price too high for {ticker}: ${response.entry_price:.2f}")
                return None
            
            if response.stop_loss >= response.entry_price:
                logger.warning(f"❌ GPT stop loss >= entry for {ticker}")
                return None
            
            # Check confidence threshold
            if response.confidence < self.min_confidence:
                logger.info(f"⚠️ GPT confidence too low for {ticker}: {response.confidence:.2f}")
                return None
            
            # Return entry level - engine will persist it
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
            logger.error(f"Error in GPT entry analysis for {ticker}: {e}", exc_info=True)
            return None
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Update stop every 30 seconds - raise it to lock in profits.
        Engine will enforce 50% profit protection on top of this.
        """
        symbol = position.symbol
        current_price = market_data.price
        
        # Get current stop from position state
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.95)
        
        # Check if we should update (every 30 seconds)
        if not self._interval_tracker.should_execute(f"manage_{symbol}", self.update_stop_interval_minutes):
            return StopUpdate(current_stop=current_stop)
        
        self._interval_tracker.mark_executed(f"manage_{symbol}")
        
        try:
            # Get recent price action
            bars_5m = await self._get_candlesticks(symbol, "5Min", 60)
            bars_1m = await self._get_candlesticks(symbol, "1Min", 15)
            
            if not bars_5m or not bars_1m:
                logger.warning(f"No candlestick data for stop update: {symbol}")
                return StopUpdate(current_stop=current_stop)
            
            data_5m = self._format_candlesticks_with_indicators(bars_5m, "5min", 12)
            data_1m = self._format_candlesticks_with_indicators(bars_1m, "1min", 15)
            
            time_in_trade = position.time_in_position_minutes()
            
            prompt = f"""Managing RAPID TRADE in {symbol}. Target: 1-20 minute hold.

Position Details:
- Entry Price: ${position.entry_price:.2f}
- Current Price: ${current_price:.2f}
- Current Stop Loss: ${current_stop:.2f}
- Time in Position: {time_in_trade:.1f} minutes
- Unrealized P&L: ${position.unrealized_pnl:.2f} ({position.unrealized_pnl_percent:+.2f}%)

Recent Price Action:
{data_5m}

{data_1m}

Quick assessment:
- Is momentum strengthening or weakening?
- Should we tighten stop to lock profits?
- Are we near key support/resistance?

NEVER lower stop. Tighten quickly as profit builds.

Respond ONLY with a JSON object:
{{
  "new_stop_loss": 123.45,
  "reasoning": "Price made new high, raising stop to EMA12...",
  "momentum_assessment": "strengthening"
}}
"""
            
            gpt_helper = self._get_gpt_helper()
            response = await gpt_helper.get_structured_response(
                prompt=prompt,
                response_model=GPTStopUpdate,
                system_prompt="You are an expert trader managing stop losses. Never lower stops. Respond only with valid JSON.",
                temperature=0.1,
                operation="stop_loss_update",
                symbol=symbol,
                metadata={"strategy": "gpt_five_guy"},
            )
            
            # Validate: never lower stop
            if response.new_stop_loss < current_stop:
                logger.warning(f"❌ GPT tried to lower stop for {symbol}, keeping current")
                return StopUpdate(current_stop=current_stop)
            
            # Validate: don't set stop above current price
            if response.new_stop_loss > current_price * 0.99:
                logger.warning(f"⚠️ GPT stop too high for {symbol}, capping at current price")
                response.new_stop_loss = current_price * 0.99
            
            logger.debug(
                f"🍔 GPT stop update for {symbol}: ${current_stop:.2f} → ${response.new_stop_loss:.2f}"
            )
            
            return StopUpdate(current_stop=response.new_stop_loss)
        
        except Exception as e:
            logger.error(f"Error updating stop for {symbol}: {e}", exc_info=True)
            return StopUpdate(current_stop=current_stop)
    
    def _format_candlesticks_with_indicators(
        self,
        bars: List[Dict[str, Any]],
        timeframe: str,
        max_bars: int = 12
    ) -> str:
        """Format candlestick data with technical indicators for GPT."""
        if not bars:
            return f"No {timeframe} data available"
        
        # Limit to max_bars most recent
        display_bars = bars[-max_bars:] if len(bars) > max_bars else bars
        
        # Calculate indicators
        ema_12 = calculate_ema(bars, 12)
        ema_26 = calculate_ema(bars, 26)
        vwap = calculate_vwap(bars, reset_daily=True)
        rsi = calculate_rsi(bars, 14)
        macd_data = calculate_macd(bars, 12, 26, 9)
        
        start_idx = len(bars) - len(display_bars)
        
        formatted = [f"\n{timeframe} Candlesticks with Indicators (most recent last):"]
        formatted.append(
            f"{'Time':<20} {'O':<8} {'H':<8} {'L':<8} {'C':<8} "
            f"{'Vol':<10} {'EMA12':<8} {'EMA26':<8} {'VWAP':<8} {'RSI':<6}"
        )
        formatted.append("-" * 110)
        
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
            
            ema12_str = f"{ema_12[bar_idx]:.2f}" if bar_idx < len(ema_12) and ema_12[bar_idx] else "N/A"
            ema26_str = f"{ema_26[bar_idx]:.2f}" if bar_idx < len(ema_26) and ema_26[bar_idx] else "N/A"
            vwap_str = f"{vwap[bar_idx]:.2f}" if bar_idx < len(vwap) and vwap[bar_idx] else "N/A"
            rsi_str = f"{rsi[bar_idx]:.1f}" if bar_idx < len(rsi) and rsi[bar_idx] else "N/A"
            
            formatted.append(
                f"{ts:<20} {o:<8.2f} {h:<8.2f} {l:<8.2f} {c:<8.2f} "
                f"{v:<10,.0f} {ema12_str:<8} {ema26_str:<8} {vwap_str:<8} {rsi_str:<6}"
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
