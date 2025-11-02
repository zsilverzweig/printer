"""Data loading and state management for screener service."""
from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import date, timedelta
from typing import Any, Deque, Dict

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
    
    async def load_from_timescale(self) -> None:
        """Load historical data from TimescaleDB on startup."""
        try:
            from sqlalchemy import text
            from app.services.core.database import get_async_session
            
            # Initialize TimescaleDB volume calculator
            ts_calc = TimescaleVolumeCalculator(lookback_days=30)
            
            # Get symbols with sufficient complete data
            symbols = await ts_calc.get_symbols_with_complete_data(min_days=14)
            self.logger.info(f"Found {len(symbols)} symbols with complete data")
            
            # Load yesterday's OHLCV for each symbol
            yesterday = date.today() - timedelta(days=1)
            async with get_async_session() as session:
                result = await session.execute(
                    text("""
                        SELECT 
                            symbol,
                            open,
                            high,
                            low,
                            close,
                            volume
                        FROM market_data_daily
                        WHERE bucket::date = :yesterday
                          AND symbol = ANY(:symbols)
                    """),
                    {"yesterday": yesterday, "symbols": symbols}
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
            
            self.logger.info(f"Loaded OHLCV for {len(self.last_day_ohlc)} symbols from TimescaleDB")
            
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

