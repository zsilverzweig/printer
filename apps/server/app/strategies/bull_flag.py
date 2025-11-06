"""
Bull Flag Pattern Strategy - Warrior Trading Methodology

Day trading strategy that identifies bull flag patterns following Warrior Trading principles:
- Flagpole: Strong upward movement on high relative volume (5x+)
- Flag: Consolidation phase with lighter volume, slight downward/sideways drift
- Entry: Breakout on first candle making new high after consolidation
- Stop-loss: Just below lowest point of pullback within flag
- Profit target: Retest of high of day

Stock Selection Criteria:
- Price: $2-$20
- 10%+ daily increase
- 5x+ relative volume
- Float <20M (optional, handled by screener)
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from app.strategies.base import (
    ExecutionStrategy,
    EntryLevel,
    StopUpdate,
    MarketDataSnapshot,
    PositionContext,
)
from app.services.news.news_service import NewsService
from app.lib.technical_analysis import calculate_macd, is_red_candle, is_green_candle

logger = logging.getLogger(__name__)


class BullFlagStrategy(ExecutionStrategy):
    """Bull Flag pattern day trading strategy - Warrior Trading methodology."""
    
    def __init__(self, config: Dict[str, Any], fund_id: Optional[str] = None):
        super().__init__(config, fund_id=fund_id)
        
        # Warrior Trading defaults
        self.min_flagpole_rv = config.get("min_flagpole_rv", 5.0)  # Min 5x relative volume on flagpole
        self.min_daily_change = config.get("min_daily_change", 0.10)  # 10% minimum daily increase
        self.max_pullback_ratio = config.get("max_pullback_ratio", 0.50)  # Max 50% pullback from flagpole high
        self.flag_consolidation_minutes = config.get("flag_consolidation_minutes", 2)  # Min consolidation period
        self.flag_consolidation_max_minutes = config.get("flag_consolidation_max_minutes", 10)  # Max consolidation period
        self.breakeven_time_minutes = config.get("breakeven_time_minutes", 1.0)
        self.price_min = config.get("price_min", 2.0)  # $2 minimum
        self.price_max = config.get("price_max", 20.0)  # $20 maximum
        
        # Volume analysis
        self.flag_volume_ratio = config.get("flag_volume_ratio", 0.60)  # Flag volume should be <60% of flagpole volume
        self.breakout_volume_ratio = config.get("breakout_volume_ratio", 1.20)  # Breakout should have >120% of flag volume
        self.min_volume_ratio = config.get("min_volume_ratio", 0.20)  # Recent volume should be at least 20% of flag volume (avoid really low volume)
        
        # News service for checking news events when stock is up
        self.news_service = NewsService()
        self.check_news = config.get("check_news", True)  # Enable/disable news checking
        self.news_days = config.get("news_days", 1)  # Days of news to check
    
    @property
    def id(self) -> str:
        return "bull_flag"
    
    @property
    def name(self) -> str:
        return "Bull Flag Pattern (Warrior Trading)"
    
    @property
    def description(self) -> str:
        return (
            "Warrior Trading bull flag strategy: Identifies strong upward moves (flagpole) "
            "on high relative volume, followed by consolidation (flag) with lighter volume. "
            "Waits for 2+ red candles in the dip, then enters when a green candle closes above "
            "the last red candle's close (only if MACD is positive). Entry price updates every tick. "
            "Typical hold time: 1-3 minutes."
        )
    
    @property
    def strategy_type(self) -> str:
        return "math-based"
    
    @property
    def expected_timeframe(self) -> str:
        return "1-3 minutes"
    
    @property
    def requires_setup(self) -> bool:
        return True  # Uses setup to detect patterns
    
    def _detect_flagpole(
        self,
        bars: List[Dict[str, Any]],
        metrics: Optional[Dict[str, Any]] = None
    ) -> Optional[Tuple[int, float, float, float]]:
        """
        Detect flagpole: strong upward movement with high volume.
        
        Returns:
            Tuple of (flagpole_end_idx, flagpole_high, flagpole_low, flagpole_volume) or None
        """
        if len(bars) < 3:
            return None
        
        # Look for a strong upward move (flagpole) in recent bars
        # Flagpole should be 2-5 bars with strong upward momentum
        max_flagpole_length = 5
        
        best_flagpole = None
        best_strength = 0.0
        
        # Check for flagpole starting at different positions
        for start_idx in range(max(0, len(bars) - 15), len(bars) - 2):
            # Try different flagpole lengths (2-5 bars)
            for length in range(2, min(max_flagpole_length + 1, len(bars) - start_idx)):
                end_idx = start_idx + length - 1
                
                if end_idx >= len(bars):
                    continue
                
                flagpole_bars = bars[start_idx:end_idx + 1]
                flagpole_start = flagpole_bars[0]
                flagpole_end = flagpole_bars[-1]
                
                # Calculate flagpole metrics
                flagpole_low = min(bar.get('low', bar.get('l', 0)) for bar in flagpole_bars)
                flagpole_high = max(bar.get('high', bar.get('h', 0)) for bar in flagpole_bars)
                flagpole_volume = sum(bar.get('volume', bar.get('v', 0)) for bar in flagpole_bars)
                
                # Flagpole should show upward movement
                price_change = flagpole_end.get('close', flagpole_end.get('c', 0)) - flagpole_start.get('open', flagpole_start.get('o', 0))
                price_change_pct = price_change / flagpole_start.get('open', flagpole_start.get('o', 1))
                
                # Must have significant upward movement (at least 3%)
                if price_change_pct < 0.03:
                    continue
                
                # Calculate strength: price change % * volume
                strength = price_change_pct * (flagpole_volume / 1000)  # Normalize volume
                
                if strength > best_strength:
                    best_strength = strength
                    best_flagpole = (end_idx, flagpole_high, flagpole_low, flagpole_volume)
        
        return best_flagpole
    
    def _detect_flag_consolidation(
        self,
        bars: List[Dict[str, Any]],
        flagpole_end_idx: int,
        flagpole_high: float,
        flagpole_volume: float
    ) -> Optional[Tuple[int, float, float, float]]:
        """
        Detect flag consolidation after flagpole.
        
        Returns:
            Tuple of (flag_end_idx, flag_high, flag_low, flag_volume) or None
        """
        if flagpole_end_idx >= len(bars) - 1:
            return None
        
        # Flag should be 2-10 bars after flagpole
        flag_start_idx = flagpole_end_idx + 1
        max_flag_length = min(10, len(bars) - flag_start_idx)
        
        if max_flag_length < 2:
            return None
        
        # Check consolidation periods of different lengths
        for flag_length in range(2, max_flag_length + 1):
            flag_end_idx = flag_start_idx + flag_length - 1
            
            if flag_end_idx >= len(bars):
                continue
            
            flag_bars = bars[flag_start_idx:flag_end_idx + 1]
            
            flag_low = min(bar.get('low', bar.get('l', float('inf'))) for bar in flag_bars)
            flag_high = max(bar.get('high', bar.get('h', 0)) for bar in flag_bars)
            flag_volume = sum(bar.get('volume', bar.get('v', 0)) for bar in flag_bars)
            
            # Flag should not exceed flagpole high (might be slightly above, but not significantly)
            if flag_high > flagpole_high * 1.01:  # Allow 1% tolerance
                continue
            
            # Flag should show consolidation (not strong upward movement)
            flag_start_price = flag_bars[0].get('open', flag_bars[0].get('o', 0))
            flag_end_price = flag_bars[-1].get('close', flag_bars[-1].get('c', 0))
            flag_change_pct = (flag_end_price - flag_start_price) / flag_start_price if flag_start_price > 0 else 0
            
            # Flag should be sideways or slightly down (not up more than 2%)
            if flag_change_pct > 0.02:
                continue
            
            # Check volume: flag should have lighter volume than flagpole
            avg_flagpole_volume = flagpole_volume / (flagpole_end_idx - (flagpole_end_idx - len(flag_bars) + 1) + 1) if flagpole_volume > 0 else 0
            avg_flag_volume = flag_volume / flag_length if flag_length > 0 else 0
            
            if avg_flag_volume > avg_flagpole_volume * self.flag_volume_ratio:
                continue  # Flag volume too high
            
            # Check pullback: flag low should not pullback more than max_pullback_ratio from flagpole high
            pullback_from_high = (flagpole_high - flag_low) / flagpole_high if flagpole_high > 0 else 1.0
            if pullback_from_high > self.max_pullback_ratio:
                continue  # Pullback too deep
            
            # This looks like a valid flag
            return (flag_end_idx, flag_high, flag_low, flag_volume)
        
        return None
    
    async def analyze_setup(
        self,
        tickers: List[str],
        market_data: Dict[str, MarketDataSnapshot]
    ) -> List[str]:
        """
        Detect which tickers have bull flag patterns following Warrior Trading methodology.
        
        Pattern requirements:
        1. Flagpole: Strong upward move with high relative volume (5x+)
        2. Flag: Consolidation with lighter volume, max 50% pullback
        3. Price: $2-$20
        4. Daily change: 10%+ (checked via metrics)
        5. News events: Check for recent news if stock is up
        """
        logger.info(f"🚩 Bull flag setup: Analyzing {len(tickers)} tickers for pattern detection")
        filtered = []
        
        for ticker in tickers:
            logger.debug(f"🚩 [{ticker}] Starting pattern analysis")
            data = market_data.get(ticker)
            if not data or not data.bars:
                logger.debug(f"🚩 [{ticker}] Skipping: No market data or bars")
                continue
            
            # Check price range
            current_price = data.price
            logger.debug(f"🚩 [{ticker}] Current price: ${current_price:.2f}")
            if current_price < self.price_min or current_price > self.price_max:
                logger.debug(
                    f"🚩 [{ticker}] Skipping: Price ${current_price:.2f} outside range "
                    f"${self.price_min}-${self.price_max}"
                )
                continue
            
            # Check daily change via metrics
            metrics = data.metrics or {}
            # Try different metric key names (change_close, change_close_pct, change_percent)
            change_percent = (
                metrics.get("change_close_pct") or 
                metrics.get("change_close") or 
                metrics.get("change_percent") or 
                0.0
            )
            # Metrics may be in percentage form (10.5 = 10.5%) or decimal (0.105 = 10.5%)
            # Convert to percentage if < 1 (assumed decimal)
            if change_percent < 1.0:
                change_percent = change_percent * 100
            
            min_change_pct = self.min_daily_change * 100
            logger.debug(f"🚩 [{ticker}] Daily change: {change_percent:.1f}% (min: {min_change_pct:.1f}%)")
            if change_percent < min_change_pct:
                logger.debug(
                    f"🚩 [{ticker}] Skipping: Daily change {change_percent:.1f}% "
                    f"below minimum {min_change_pct:.1f}%"
                )
                continue
            
            # Check if stock is up - if so, check for news events
            news_events = None
            if self.check_news and change_percent > 0:
                try:
                    logger.debug(f"🚩 [{ticker}] Stock is up {change_percent:.1f}%, checking for news events...")
                    news_events = await self.news_service.get_recent_events(ticker, days=self.news_days)
                    if news_events and "No recent news" not in news_events and "unavailable" not in news_events.lower():
                        logger.info(
                            f"🚩 [{ticker}] News events found: {news_events[:200]}..."
                            if len(news_events) > 200 else f"🚩 [{ticker}] News events: {news_events}"
                        )
                    else:
                        logger.debug(f"🚩 [{ticker}] No significant news events found")
                except Exception as e:
                    logger.warning(f"🚩 [{ticker}] Error checking news events: {e}")
                    # Continue without news if fetch fails
            
            # Check relative volume (flagpole should have high RV)
            rv14 = metrics.get("rv14", 0.0)
            logger.debug(f"🚩 [{ticker}] RV14: {rv14:.2f}x (min: {self.min_flagpole_rv:.1f}x)")
            if rv14 < self.min_flagpole_rv:
                logger.debug(
                    f"🚩 [{ticker}] Skipping: RV14 {rv14:.2f}x below minimum "
                    f"{self.min_flagpole_rv:.1f}x"
                )
                continue
            
            # Need at least 10 bars for pattern detection
            bars = data.bars[-20:] if len(data.bars) > 20 else data.bars
            logger.debug(f"🚩 [{ticker}] Analyzing {len(bars)} bars for pattern")
            if len(bars) < 10:
                logger.debug(f"🚩 [{ticker}] Skipping: Insufficient bars ({len(bars)} < 10)")
                continue
            
            # Detect flagpole
            logger.debug(f"🚩 [{ticker}] Detecting flagpole...")
            flagpole = self._detect_flagpole(bars, metrics)
            if not flagpole:
                logger.debug(f"🚩 [{ticker}] No valid flagpole detected")
                continue
            
            flagpole_end_idx, flagpole_high, flagpole_low, flagpole_volume = flagpole
            flagpole_length = flagpole_end_idx - (flagpole_end_idx - len(bars) + 1) + 1
            logger.debug(
                f"🚩 [{ticker}] Flagpole detected: high=${flagpole_high:.2f}, "
                f"low=${flagpole_low:.2f}, volume={flagpole_volume:.0f}, length={flagpole_length} bars"
            )
            
            # Detect flag consolidation
            logger.debug(f"🚩 [{ticker}] Detecting flag consolidation...")
            flag = self._detect_flag_consolidation(bars, flagpole_end_idx, flagpole_high, flagpole_volume)
            if not flag:
                logger.debug(f"🚩 [{ticker}] No valid flag consolidation detected")
                continue
            
            flag_end_idx, flag_high, flag_low, flag_volume = flag
            flag_length = flag_end_idx - (flagpole_end_idx + 1) + 1
            pullback_pct = ((flagpole_high - flag_low) / flagpole_high * 100) if flagpole_high > 0 else 0
            logger.debug(
                f"🚩 [{ticker}] Flag detected: high=${flag_high:.2f}, low=${flag_low:.2f}, "
                f"volume={flag_volume:.0f}, length={flag_length} bars, pullback={pullback_pct:.1f}%"
            )
            
            # Pattern detected!
            filtered.append(ticker)
            logger.info(
                f"🚩 [{ticker}] ✅ Bull flag pattern CONFIRMED - "
                f"Flagpole: ${flagpole_low:.2f}→${flagpole_high:.2f} (+{((flagpole_high-flagpole_low)/flagpole_low*100):.1f}%), "
                f"Flag: ${flag_low:.2f}-${flag_high:.2f}, "
                f"RV14={rv14:.2f}x, Change={change_percent:.1f}%, "
                f"News: {'✅' if news_events and 'No recent news' not in news_events else '❌'}"
            )
        
        logger.info(
            f"🚩 Bull flag setup complete: {len(filtered)} pattern(s) found from {len(tickers)} tickers "
            f"({len(filtered)/len(tickers)*100:.1f}% match rate)" if tickers else "0% match rate"
        )
        return filtered
    
    async def analyze_entry(
        self,
        ticker: str,
        market_data: MarketDataSnapshot
    ) -> Optional[EntryLevel]:
        """
        Set entry at close of last red candle in the dip, updating every tick.
        
        Warrior Trading entry rules:
        - Require 2+ red candles in the consolidation/dip phase
        - Set entry price = close of last red candle (updates every tick)
        - Enter when a green candle closes above the last red candle's close
        - Only enter if MACD is still positive
        - Stop-loss: Just below lowest point of pullback within flag
        - Profit target: Retest of high of day (stored in metadata)
        """
        logger.info(f"🚩 [{ticker}] Analyzing entry conditions...")
        
        if not market_data.bars or len(market_data.bars) < 10:
            logger.debug(f"🚩 [{ticker}] Skipping entry: Insufficient bars ({len(market_data.bars) if market_data.bars else 0})")
            return None
        
        bars = market_data.bars[-20:] if len(market_data.bars) > 20 else market_data.bars
        logger.debug(f"🚩 [{ticker}] Analyzing entry with {len(bars)} bars, current price=${market_data.price:.2f}")
        
        # Re-detect pattern to get exact levels
        flagpole = self._detect_flagpole(bars, market_data.metrics)
        if not flagpole:
            logger.debug(f"🚩 [{ticker}] Entry analysis: No flagpole detected")
            return None
        
        flagpole_end_idx, flagpole_high, flagpole_low, flagpole_volume = flagpole
        
        flag = self._detect_flag_consolidation(bars, flagpole_end_idx, flagpole_high, flagpole_volume)
        if not flag:
            logger.debug(f"🚩 [{ticker}] Entry analysis: No flag consolidation detected")
            return None
        
        flag_end_idx, flag_high, flag_low, flag_volume = flag
        logger.debug(
            f"🚩 [{ticker}] Entry analysis: Pattern confirmed - "
            f"Flagpole high=${flagpole_high:.2f}, Flag=${flag_low:.2f}-${flag_high:.2f}"
        )
        
        # Get bars in the flag consolidation phase (dip)
        flag_start_idx = flagpole_end_idx + 1
        flag_bars = bars[flag_start_idx:flag_end_idx + 1]
        
        if len(flag_bars) < 2:
            logger.debug(f"🚩 [{ticker}] Entry analysis: Flag too short ({len(flag_bars)} bars)")
            return None
        
        # Helper function to get OHLC values from a bar
        def get_ohlc(bar: Dict[str, Any]) -> Tuple[float, float, float, float]:
            """Get open, high, low, close from bar (handles different key formats)."""
            o = bar.get('open', bar.get('o', 0))
            h = bar.get('high', bar.get('h', 0))
            l = bar.get('low', bar.get('l', 0))
            c = bar.get('close', bar.get('c', 0))
            return (o, h, l, c)
        
        # Require at least 2 consecutive red candles in the flag (dip)
        consecutive_red = 0
        max_consecutive_red = 0
        last_consecutive_red_end_idx = -1
        
        for i, bar in enumerate(flag_bars):
            if is_red_candle(bar):  # Red candle
                consecutive_red += 1
                if consecutive_red > max_consecutive_red:
                    max_consecutive_red = consecutive_red
                    last_consecutive_red_end_idx = i + flag_start_idx
            else:  # Not red, reset counter
                consecutive_red = 0
        
        if max_consecutive_red < 2:
            logger.debug(
                f"🚩 [{ticker}] Entry analysis: Max consecutive red candles={max_consecutive_red} "
                f"(need at least 2 consecutive)"
            )
            return None
        
        # Get the last red candle in the consecutive sequence - this is our entry price (updates every tick)
        last_red_bar_in_flag = flag_bars[last_consecutive_red_end_idx - flag_start_idx]
        _, _, _, last_red_close = get_ohlc(last_red_bar_in_flag)
        entry_price = last_red_close
        
        logger.debug(
            f"🚩 [{ticker}] Entry analysis: Found {max_consecutive_red} consecutive red candles in flag. "
            f"Last red candle close=${entry_price:.2f} (entry price)"
        )
        
        # Check for green candles since flag high - if more than 1 green candle and no entry triggered, invalidate
        # BUT: if there's a new flag high (higher than original), we reset and can still enter
        # Find the CURRENT flag high (may be higher than original if new high formed)
        current_flag_high = flag_high
        current_flag_high_idx = flag_end_idx
        
        # Check all bars (flag + after) to find the highest high since flag started
        # This allows for a new flag high that resets the invalidation logic
        for i in range(flag_start_idx, len(bars)):
            bar = bars[i]
            _, h, _, _ = get_ohlc(bar)
            if h > current_flag_high:
                current_flag_high = h
                current_flag_high_idx = i
        
        # Find the bar index where current_flag_high occurred
        flag_high_idx = -1
        for i in range(flag_start_idx, len(bars)):
            bar = bars[i]
            _, h, _, _ = get_ohlc(bar)
            # Check if this bar's high matches current_flag_high (with small tolerance)
            if abs(h - current_flag_high) < current_flag_high * 0.001:  # Within 0.1% tolerance
                flag_high_idx = i
                # Use the last occurrence (most recent bar with this high)
                break
        
        # If not found, use current_flag_high_idx
        if flag_high_idx == -1:
            flag_high_idx = current_flag_high_idx
        
        # Count green candles since the CURRENT flag high (in bars after flag_high_idx)
        bars_since_flag_high = bars[flag_high_idx + 1:] if flag_high_idx + 1 < len(bars) else []
        green_candles_since_flag_high = 0
        
        for bar in bars_since_flag_high:
            if is_green_candle(bar):  # Green candle
                green_candles_since_flag_high += 1
        
        # If more than 1 green candle since CURRENT flag high and we haven't triggered entry, invalidate
        # Note: If a new flag high formed (current_flag_high > flag_high), this resets the count
        if green_candles_since_flag_high > 1:
            logger.debug(
                f"🚩 [{ticker}] Entry analysis: {green_candles_since_flag_high} green candle(s) since flag high "
                f"${current_flag_high:.2f} - position invalidated (need entry on first green above red close)"
            )
            return None
        
        # Log if new flag high was found
        if current_flag_high > flag_high:
            logger.debug(
                f"🚩 [{ticker}] Entry analysis: New flag high formed ${flag_high:.2f} → ${current_flag_high:.2f} "
                f"(green candle count reset)"
            )
        
        # Calculate MACD to check if it's positive
        closes = [get_ohlc(bar)[3] for bar in bars]  # Extract closes
        macd_data = calculate_macd(bars, fast_period=12, slow_period=26, signal_period=9)
        macd_line = macd_data.get("macd", [])
        
        if not macd_line or len(macd_line) == 0:
            logger.debug(f"🚩 [{ticker}] Entry analysis: MACD not available")
            return None
        
        # Get the most recent MACD value
        current_macd = macd_line[-1]
        if current_macd is None:
            logger.debug(f"🚩 [{ticker}] Entry analysis: Current MACD is None")
            return None
        
        # MACD must be positive
        if current_macd <= 0:
            logger.debug(
                f"🚩 [{ticker}] Entry analysis: MACD is not positive (MACD={current_macd:.3f})"
            )
            return None
        
        logger.debug(f"🚩 [{ticker}] Entry analysis: MACD is positive (MACD={current_macd:.3f}) ✅")
        
        # Check if we have a green candle that closed above the last red candle's close
        # Look at bars after the last red candle in the consecutive sequence
        bars_after_last_red = bars[last_consecutive_red_end_idx + 1:] if last_consecutive_red_end_idx + 1 < len(bars) else []
        
        green_above_red = False
        if bars_after_last_red:
            # Check the most recent completed candle
            latest_bar = bars_after_last_red[-1]
            o, h, l, c = get_ohlc(latest_bar)
            
            # Green candle = close > open, and close > last red candle's close
            if is_green_candle(latest_bar) and c > entry_price:
                green_above_red = True
                logger.info(
                    f"🚩 [{ticker}] Entry signal: Green candle closed at ${c:.2f} above "
                    f"last red close ${entry_price:.2f} ✅"
                )
            else:
                logger.debug(
                    f"🚩 [{ticker}] Entry analysis: Latest bar close=${c:.2f}, open=${o:.2f}, "
                    f"last red close=${entry_price:.2f} - waiting for green candle above red close"
                )
        else:
            # No bars after last red yet, check current price
            current_price = market_data.price
            if current_price > entry_price:
                logger.debug(
                    f"🚩 [{ticker}] Entry analysis: Current price ${current_price:.2f} above "
                    f"entry ${entry_price:.2f}, but no completed green candle yet"
                )
        
        current_price = market_data.price
        
        # Check if price has already broken out significantly (might be too late)
        price_above_flag = ((current_price / flag_high - 1) * 100) if flag_high > 0 else 0
        if current_price > flag_high * 1.01:
            # Already broken out significantly, might be too late
            logger.warning(
                f"🚩 [{ticker}] Price ${current_price:.2f} already {price_above_flag:.2f}% above flag high "
                f"${flag_high:.2f} - may be too late"
            )
            # Still allow entry but with lower confidence
            confidence = 0.6
        else:
            # Not yet broken out, good entry setup
            distance_to_entry = ((entry_price - current_price) / current_price * 100) if current_price > 0 else 0
            logger.debug(
                f"🚩 [{ticker}] Price ${current_price:.2f} is {distance_to_entry:.2f}% below entry "
                f"${entry_price:.2f} (flag high: ${flag_high:.2f})"
            )
            confidence = 0.85
        
        # Stop-loss: Just below flag low (lowest point of pullback)
        stop_loss = flag_low * 0.999  # 0.1% below flag low for safety
        
        # Calculate risk/reward
        risk = entry_price - stop_loss
        reward = flagpole_high - entry_price  # Target: retest flagpole high
        risk_reward_ratio = reward / risk if risk > 0 else 0
        risk_pct = (risk / entry_price * 100) if entry_price > 0 else 0
        reward_pct = (reward / entry_price * 100) if entry_price > 0 else 0
        
        logger.debug(
            f"🚩 [{ticker}] Risk/Reward: Risk=${risk:.2f} ({risk_pct:.1f}%), "
            f"Reward=${reward:.2f} ({reward_pct:.1f}%), R:R={risk_reward_ratio:.2f}"
        )
        
        # Profit target: High of day (use flagpole high as initial target)
        high_of_day = max(bar.get('high', bar.get('h', 0)) for bar in bars)
        profit_target = max(flagpole_high, high_of_day)
        logger.debug(
            f"🚩 [{ticker}] Profit targets: Flagpole high=${flagpole_high:.2f}, "
            f"High of day=${high_of_day:.2f}, Target=${profit_target:.2f}"
        )
        
        # Check breakout volume if we have recent bar data
        breakout_volume_confirmed = True
        if len(bars) > flag_end_idx + 1:
            recent_bars = bars[flag_end_idx + 1:]
            if recent_bars:
                recent_volume = sum(bar.get('volume', bar.get('v', 0)) for bar in recent_bars)
                flag_length = flag_end_idx - (flagpole_end_idx + 1) + 1
                avg_flag_volume = flag_volume / flag_length if flag_length > 0 and flag_volume > 0 else 0
                if avg_flag_volume > 0:
                    avg_recent_volume = recent_volume / len(recent_bars) if len(recent_bars) > 0 else 0
                    volume_ratio = avg_recent_volume / avg_flag_volume if avg_flag_volume > 0 else 0
                    breakout_volume_confirmed = volume_ratio >= self.breakout_volume_ratio
                    logger.debug(
                        f"🚩 [{ticker}] Volume analysis: Flag avg={avg_flag_volume:.0f}, "
                        f"Recent avg={avg_recent_volume:.0f}, Ratio={volume_ratio:.2f}x "
                        f"(required: {self.breakout_volume_ratio:.2f}x) - "
                        f"{'✅ Confirmed' if breakout_volume_confirmed else '❌ Not confirmed'}"
                    )
                    if not breakout_volume_confirmed:
                        confidence *= 0.9  # Reduce confidence if volume not confirmed
                        logger.warning(f"🚩 [{ticker}] Breakout volume not confirmed - reducing confidence")
        
        # Check that volume hasn't gotten really low (entry criteria)
        # Recent volume should be at least min_volume_ratio of flag volume to avoid entering on dead volume
        volume_too_low = False
        if len(bars) > flag_end_idx:
            # Check the most recent bars (last 2-3 bars) for volume
            recent_bars_for_check = bars[max(0, len(bars) - 3):]
            if recent_bars_for_check:
                recent_volume_check = sum(bar.get('volume', bar.get('v', 0)) for bar in recent_bars_for_check)
                flag_length = flag_end_idx - (flagpole_end_idx + 1) + 1
                avg_flag_volume = flag_volume / flag_length if flag_length > 0 and flag_volume > 0 else 0
                if avg_flag_volume > 0:
                    avg_recent_volume_check = recent_volume_check / len(recent_bars_for_check) if len(recent_bars_for_check) > 0 else 0
                    volume_ratio_check = avg_recent_volume_check / avg_flag_volume if avg_flag_volume > 0 else 0
                    volume_too_low = volume_ratio_check < self.min_volume_ratio
                    
                    logger.debug(
                        f"🚩 [{ticker}] Volume health check: Recent avg={avg_recent_volume_check:.0f}, "
                        f"Flag avg={avg_flag_volume:.0f}, Ratio={volume_ratio_check:.2f}x "
                        f"(min: {self.min_volume_ratio:.2f}x) - "
                        f"{'✅ Healthy' if not volume_too_low else '❌ TOO LOW'}"
                    )
                    
                    if volume_too_low:
                        logger.warning(
                            f"🚩 [{ticker}] Volume too low for entry: {volume_ratio_check:.2f}x "
                            f"below minimum {self.min_volume_ratio:.2f}x - rejecting entry"
                        )
                        return None  # Reject entry if volume has dropped too low
        
        # Check for news events if stock is up
        news_events = None
        metrics = market_data.metrics or {}
        change_percent = (
            metrics.get("change_close_pct") or 
            metrics.get("change_close") or 
            metrics.get("change_percent") or 
            0.0
        )
        if change_percent < 1.0:
            change_percent = change_percent * 100
        
        if self.check_news and change_percent > 0:
            try:
                logger.debug(f"🚩 [{ticker}] Fetching news events for entry analysis...")
                news_events = await self.news_service.get_recent_events(ticker, days=self.news_days)
                if news_events and "No recent news" not in news_events and "unavailable" not in news_events.lower():
                    logger.info(f"🚩 [{ticker}] News context for entry: {news_events[:150]}...")
            except Exception as e:
                logger.warning(f"🚩 [{ticker}] Error fetching news for entry analysis: {e}")
        
        logger.info(
            f"🚩 [{ticker}] ✅ ENTRY SETUP: Entry=${entry_price:.2f}, Stop=${stop_loss:.2f}, "
            f"Target=${profit_target:.2f}, R:R={risk_reward_ratio:.2f}, "
            f"Confidence={confidence:.2f}, Breakout Volume={'✅' if breakout_volume_confirmed else '⚠️'}, "
            f"Volume Health={'✅' if not volume_too_low else '❌'}, "
            f"News={'✅' if news_events and 'No recent news' not in news_events else '❌'}"
        )
        
        return EntryLevel(
            entry_price=entry_price,
            stop_loss=stop_loss,
            confidence=confidence,
            order_type="limit",
            metadata={
                "flag_high": flag_high,
                "flag_low": flag_low,
                "flagpole_high": flagpole_high,
                "flagpole_low": flagpole_low,
                "profit_target": profit_target,
                "high_of_day": high_of_day,
                "risk_reward_ratio": risk_reward_ratio,
                "pattern": "bull_flag",
                "methodology": "warrior_trading",
                "news_events": news_events if news_events else None,
                "breakout_volume_confirmed": breakout_volume_confirmed
            }
        )
    
    async def manage_position(
        self,
        position: PositionContext,
        market_data: MarketDataSnapshot
    ) -> StopUpdate:
        """
        Raise stop to breakeven after configured time.
        Engine handles 50% profit protection on top of this.
        
        Warrior Trading: Protect profits by moving stop to breakeven quickly,
        then trail to lock in gains as price moves toward profit target.
        """
        current_stop = position.strategy_state.get("stop_loss", position.entry_price * 0.98)
        time_in_position = position.time_in_position_minutes()
        current_price = market_data.price
        
        # Get profit target from metadata
        profit_target = position.strategy_state.get("profit_target", position.entry_price * 1.05)
        flagpole_high = position.strategy_state.get("flagpole_high", profit_target)
        
        # Calculate current P&L
        unrealized_pnl = position.unrealized_pnl
        unrealized_pnl_pct = position.unrealized_pnl_percent
        
        logger.debug(
            f"🚩 [{position.symbol}] Position management: Price=${current_price:.2f}, "
            f"Entry=${position.entry_price:.2f}, P&L=${unrealized_pnl:.2f} ({unrealized_pnl_pct:.2f}%), "
            f"Time={time_in_position:.1f}m, Current stop=${current_stop:.2f}"
        )
        
        # Move to breakeven after breakeven_time_minutes
        if time_in_position > self.breakeven_time_minutes:
            breakeven_stop = position.entry_price
            if breakeven_stop > current_stop:
                logger.info(
                    f"🚩 [{position.symbol}] Moving stop to breakeven: "
                    f"${current_stop:.2f} → ${breakeven_stop:.2f} "
                    f"(time in position: {time_in_position:.1f}m)"
                )
                return StopUpdate(current_stop=breakeven_stop)
        
        # Trail stop if we're approaching profit target (within 80% of target)
        if profit_target > position.entry_price:
            profit_progress = (current_price - position.entry_price) / (profit_target - position.entry_price)
            
            if profit_progress > 0.8 and current_price > position.entry_price:
                # Trail stop to lock in profits (stop at 50% of profit gained)
                profit_gained = current_price - position.entry_price
                trailing_stop = position.entry_price + (profit_gained * 0.5)
                
                if trailing_stop > current_stop:
                    logger.info(
                        f"🚩 [{position.symbol}] Trailing stop: "
                        f"${current_stop:.2f} → ${trailing_stop:.2f} "
                        f"(profit progress: {profit_progress:.1%}, "
                        f"P&L: ${unrealized_pnl:.2f} ({unrealized_pnl_pct:.2f}%))"
                    )
                    return StopUpdate(current_stop=trailing_stop)
            elif profit_progress > 0:
                logger.debug(
                    f"🚩 [{position.symbol}] Profit progress: {profit_progress:.1%} "
                    f"(target: ${profit_target:.2f}, P&L: ${unrealized_pnl:.2f})"
                )
        
        return StopUpdate(current_stop=current_stop)
