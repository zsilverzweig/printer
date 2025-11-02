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
                        FROM market_data
                        WHERE time::date = :yesterday
                          AND timescale = '1day'
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
    
    async def fetch_latest_from_timescale(self) -> List[Dict[str, Any]]:
        """
        Fetch the latest market data from TimescaleDB.
        
        Queries both market_data (minute bars) and market_latest_trades (real-time prices).
        Uses latest trade price if more recent than the last complete minute bar.
        
        Returns a list of snapshot-like dictionaries compatible with the existing compute logic.
        Each snapshot contains:
        - ticker: Symbol
        - price: Latest price (from market_latest_trades or last minute bar)
        - volume: Today's accumulated volume
        - exchange: Exchange code
        - day: Yesterday's OHLC data
        """
        try:
            from sqlalchemy import text
            from app.services.core.database import get_async_session
            from datetime import datetime, timezone
            import time
            
            snapshots = []
            today = date.today()
            yesterday = today - timedelta(days=1)
            current_time = time.time()
            
            async with get_async_session() as session:
                # Query for latest bars, latest trades, and yesterday's data
                result = await session.execute(
                    text("""
                        WITH latest_bars AS (
                            SELECT DISTINCT ON (symbol)
                                symbol,
                                close as bar_price,
                                time as bar_time,
                                EXTRACT(EPOCH FROM time) as bar_timestamp
                            FROM market_data
                            WHERE timescale = '1min'
                              AND time::date = :today
                            ORDER BY symbol, time DESC
                        ),
                        today_volume AS (
                            SELECT 
                                symbol,
                                SUM(volume) as total_volume
                            FROM market_data
                            WHERE timescale = '1min'
                              AND time::date = :today
                            GROUP BY symbol
                        ),
                        yesterday_ohlc AS (
                            SELECT
                                symbol,
                                open as prev_open,
                                high as prev_high,
                                low as prev_low,
                                close as prev_close,
                                volume as prev_volume
                            FROM market_data
                            WHERE time::date = :yesterday
                              AND timescale = '1day'
                        ),
                        latest_trades AS (
                            SELECT
                                symbol,
                                price as trade_price,
                                timestamp as trade_time,
                                exchange,
                                EXTRACT(EPOCH FROM timestamp) as trade_timestamp
                            FROM market_latest_trades
                        )
                        SELECT 
                            COALESCE(lb.symbol, lt.symbol) as symbol,
                            lb.bar_price,
                            lb.bar_timestamp,
                            lt.trade_price,
                            lt.trade_timestamp,
                            lt.exchange,
                            COALESCE(tv.total_volume, 0) as today_volume,
                            yo.prev_open,
                            yo.prev_high,
                            yo.prev_low,
                            yo.prev_close,
                            yo.prev_volume
                        FROM latest_bars lb
                        FULL OUTER JOIN latest_trades lt ON lb.symbol = lt.symbol
                        LEFT JOIN today_volume tv ON COALESCE(lb.symbol, lt.symbol) = tv.symbol
                        LEFT JOIN yesterday_ohlc yo ON COALESCE(lb.symbol, lt.symbol) = yo.symbol
                        WHERE (lb.symbol IS NOT NULL OR lt.symbol IS NOT NULL)
                        ORDER BY symbol
                    """),
                    {"today": today, "yesterday": yesterday}
                )
                
                for row in result:
                    symbol = row[0]
                    bar_price = float(row[1]) if row[1] else None
                    bar_timestamp = float(row[2]) if row[2] else None
                    trade_price = float(row[3]) if row[3] else None
                    trade_timestamp = float(row[4]) if row[4] else None
                    exchange = row[5]
                    today_volume = int(row[6])
                    prev_close = float(row[10]) if row[10] else None
                    
                    # Skip symbols without yesterday's close (can't calculate % change)
                    if not prev_close:
                        continue
                    
                    # Choose price: use trade price if it's more recent than bar, otherwise use bar
                    if trade_price and bar_price:
                        # Use trade if it's newer than the bar
                        current_price = trade_price if (trade_timestamp or 0) > (bar_timestamp or 0) else bar_price
                        price_timestamp = trade_timestamp if (trade_timestamp or 0) > (bar_timestamp or 0) else bar_timestamp
                    elif trade_price:
                        current_price = trade_price
                        price_timestamp = trade_timestamp
                    elif bar_price:
                        current_price = bar_price
                        price_timestamp = bar_timestamp
                    else:
                        # No price data available
                        continue
                    
                    # Update price history tracker for intraday change calculations
                    if current_price and price_timestamp:
                        try:
                            self.price_tracker.update_price(symbol, price_timestamp, current_price)
                        except Exception:
                            pass
                    
                    # Get exchange (use from latest_trades, or default)
                    if not exchange:
                        exchange = self.symbol_exchanges.get(symbol, "XNYS")
                    
                    # Build snapshot-like dict
                    snapshot = {
                        "ticker": symbol,
                        "price": current_price,
                        "volume": today_volume,
                        "exchange": exchange,
                        "day": {
                            "o": float(row[7]) if row[7] else None,
                            "h": float(row[8]) if row[8] else None,
                            "l": float(row[9]) if row[9] else None,
                            "c": float(row[10]) if row[10] else None,
                            "v": int(row[11]) if row[11] else None,
                        }
                    }
                    snapshots.append(snapshot)
                
                if len(snapshots) == 0:
                    self.logger.warning(
                        "No market data available for screener. Possible causes:\n"
                        f"  1. No yesterday's daily close data (date: {yesterday}) - run historical data loader for 1day timescale\n"
                        f"  2. No today's pricing data (date: {today}) - ensure snapshot ingestion or real-time ingestion is running\n"
                        "  → Check admin panel or logs to verify data ingestion services are active"
                    )
                else:
                    self.logger.debug(f"Fetched {len(snapshots)} latest market data records from TimescaleDB")
                    
                return snapshots
                
        except Exception as e:
            self.logger.error(f"Failed to fetch latest data from TimescaleDB: {e}", exc_info=True)
            return []

