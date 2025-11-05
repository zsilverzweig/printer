"""Data loading and state management for screener service."""
from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import date, timedelta
from typing import Any, Deque, Dict, List

from app import core
from app.services.market.history import load_history
from app.services.screener.screener_price_history import PriceHistoryTracker
from app.services.screener.screener_volume import TimescaleVolumeCalculator, VolumeCalculator


class ScreenerDataLoader:
    """Handles loading and managing screener data state."""
    
    def __init__(self):
        self.logger = logging.getLogger("app.screener.data")
        
        # Historical volume data for relative volume calculations
        self.volumes: Dict[str, Deque[float]] = {}
        self.last_day_ohlc: Dict[str, Dict[str, float]] = {}
        
        # Price history tracking for % change calculations
        self.price_tracker = PriceHistoryTracker()
        
        # Volume calculator (initialized after loading historical data)
        self.volume_calculator: VolumeCalculator | None = None
        
        # Cache for symbols with exchange info
        self.symbol_exchanges: Dict[str, str] = {}
    
    async def load_from_timescale(self) -> None:
        """Load historical data from TimescaleDB on startup."""
        try:
            from sqlalchemy import text
            from app.services.core.database import get_async_session
            
            # Initialize TimescaleDB volume calculator
            ts_calc = TimescaleVolumeCalculator(lookback_days=30)
            
            # Get symbols with sufficient complete data
            symbols = await ts_calc.get_symbols_with_complete_data(min_days=14)
            # Found symbols - no verbose log needed
            
            # Load most recent daily OHLCV for each symbol
            # Don't hardcode "yesterday" - find the most recent date with data
            async with get_async_session() as session:
                # Find the most recent date with daily data
                latest_daily_result = await session.execute(
                    text("""
                        SELECT MAX(time::date) as latest_date
                        FROM market_data
                        WHERE timescale = '1day'
                    """)
                )
                latest_daily_row = latest_daily_result.fetchone()
                if not latest_daily_row or not latest_daily_row[0]:
                    self.logger.warning("No daily market data found in database")
                    self.volume_calculator = VolumeCalculator(self.volumes)
                    return
                
                latest_daily_date = latest_daily_row[0]
                # Loading daily data - no verbose log needed
                
                result = await session.execute(
                    text("""
                        SELECT 
                            symbol,
                            open,
                            high,
                            low,
                            close,
                            volume
                        FROM market_data
                        WHERE time::date = :latest_daily_date
                          AND timescale = '1day'
                          AND symbol = ANY(:symbols)
                    """),
                    {"latest_daily_date": latest_daily_date, "symbols": symbols}
                )
                
                for row in result:
                    symbol = row[0]
                    self.last_day_ohlc[symbol] = {
                        "o": float(row[1]),
                        "h": float(row[2]),
                        "l": float(row[3]),
                        "c": float(row[4]),
                        "v": float(row[5])
                    }
            
            # For backward compatibility, keep empty volume calculator
            self.volume_calculator = VolumeCalculator(self.volumes)
            
            self.logger.debug(f"Loaded OHLCV for {len(self.last_day_ohlc)} symbols from TimescaleDB")
            
        except Exception as e:
            self.logger.error(f"Failed to load from TimescaleDB: {e}", exc_info=True)
            # Fallback to old method if TimescaleDB not available
            self.logger.warning("Falling back to Polygon grouped daily API")
            volumes, last_day_ohlc, _ = await asyncio.to_thread(
                load_history, core.API_KEY, 60, 14
            )
            self.volumes = volumes
            self.last_day_ohlc = last_day_ohlc
            self.volume_calculator = VolumeCalculator(self.volumes)
    
    def update_price_history(self, snaps: list[Any], current_time: float) -> None:
        """Update price history tracker with new snapshots."""
        from app.services.screener.screener_snapshot import extract_snapshot_data
        
        for snapshot in snaps:
            try:
                data = extract_snapshot_data(snapshot)
                ticker = data["ticker"]
                price = data["price"]
                
                if ticker and price:
                    try:
                        self.price_tracker.update_price(ticker, current_time, float(price))
                    except Exception:
                        pass
            except Exception:
                pass
    
    async def fetch_latest_from_timescale(
        self,
        min_relative_volume: float | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Fetch the latest market data from TimescaleDB using the unified fetcher.
        
        Queries both market_data (minute bars) and market_latest_trades (real-time prices).
        Uses latest trade price if more recent than the last complete minute bar.
        Uses the most recent available data, not hardcoded to today/yesterday.
        
        Args:
            min_relative_volume: Optional RV14 filter (applied in unified fetcher)
        
        Returns a list of snapshot-like dictionaries compatible with the existing compute logic.
        Each snapshot contains:
        - ticker: Symbol
        - price: Latest price (from market_latest_trades or last minute bar)
        - volume: Today's accumulated volume
        - exchange: Exchange code
        - day: Yesterday's OHLC data
        - rv14, rv30, rv60: Pre-calculated relative volumes
        - Other technical indicators from screener_metrics
        """
        try:
            # Use unified fetcher (same pattern as historical screener)
            from app.services.screener.screener_data_unified import fetch_screener_data_unified
            
            snapshots = await fetch_screener_data_unified(
                min_relative_volume=min_relative_volume
            )
            
            if not snapshots:
                self.logger.warning("[REALTIME SCREENER] No snapshots from unified fetcher")
            
            return snapshots
            
        except Exception as e:
            self.logger.error(f"[REALTIME SCREENER] Error with unified fetcher: {e}", exc_info=True)
            return []
