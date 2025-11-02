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
            self.logger.info(f"Found {len(symbols)} symbols with complete data")
            
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
                self.logger.info(f"Loading daily OHLCV from most recent date: {latest_daily_date}")
                
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
        Uses the most recent available data, not hardcoded to today/yesterday.
        
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
            current_time = time.time()
            
            async with get_async_session() as session:
                # Set statement timeout to prevent hanging queries (30 seconds)
                await session.execute(text("SET statement_timeout = '30s'"))
                
                # First, find the most recent date with daily data
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
                    return []
                
                latest_daily_date = latest_daily_row[0]
                self.logger.info(f"Using most recent daily data from: {latest_daily_date}")
                
                # Query for latest trades and daily data only (no minute bars needed)
                # Screener uses daily OHLC + latest trade price
                result = await session.execute(
                    text("""
                        WITH recent_daily_ohlc AS (
                            SELECT
                                symbol,
                                open as prev_open,
                                high as prev_high,
                                low as prev_low,
                                close as prev_close,
                                volume as prev_volume
                            FROM market_data
                            WHERE time::date = :latest_daily_date
                              AND timescale = '1day'
                        ),
                        latest_trades AS (
                            SELECT DISTINCT ON (symbol)
                                symbol,
                                price as trade_price,
                                timestamp as trade_time,
                                exchange,
                                EXTRACT(EPOCH FROM timestamp) as trade_timestamp
                            FROM market_latest_trades
                            WHERE symbol IN (SELECT symbol FROM recent_daily_ohlc)
                            ORDER BY symbol, timestamp DESC
                        )
                        SELECT 
                            rd.symbol,
                            lt.trade_price,
                            lt.trade_timestamp,
                            lt.exchange,
                            rd.prev_open,
                            rd.prev_high,
                            rd.prev_low,
                            rd.prev_close,
                            rd.prev_volume
                        FROM recent_daily_ohlc rd
                        LEFT JOIN latest_trades lt ON rd.symbol = lt.symbol
                        ORDER BY rd.symbol
                    """),
                    {"latest_daily_date": latest_daily_date}
                )
                
                for row in result:
                    symbol = row[0]
                    trade_price = float(row[1]) if row[1] else None
                    trade_timestamp = float(row[2]) if row[2] else None
                    exchange = row[3]
                    prev_open = float(row[4]) if row[4] else None
                    prev_high = float(row[5]) if row[5] else None
                    prev_low = float(row[6]) if row[6] else None
                    prev_close = float(row[7]) if row[7] else None
                    prev_volume = int(row[8]) if row[8] else 0
                    
                    # Skip symbols without previous close (can't calculate % change)
                    if not prev_close:
                        continue
                    
                    # Use trade price if available, otherwise fall back to previous close
                    if trade_price:
                        current_price = trade_price
                        price_timestamp = trade_timestamp
                    else:
                        # No real-time price data, use previous close as current price
                        current_price = prev_close
                        price_timestamp = current_time
                    
                    # Update price history tracker for intraday change calculations
                    if current_price and price_timestamp:
                        try:
                            self.price_tracker.update_price(symbol, price_timestamp, current_price)
                        except Exception:
                            pass
                    
                    # Get exchange (use from latest_trades, or default)
                    if not exchange:
                        exchange = self.symbol_exchanges.get(symbol, "XNYS")
                    
                    # Build snapshot-like dict with daily OHLC
                    snapshot = {
                        "ticker": symbol,
                        "price": current_price,
                        "volume": prev_volume,  # Use yesterday's volume
                        "exchange": exchange,
                        "day": {
                            "o": prev_open,
                            "h": prev_high,
                            "l": prev_low,
                            "c": prev_close,
                            "v": prev_volume,
                        }
                    }
                    snapshots.append(snapshot)
                
                if len(snapshots) == 0:
                    self.logger.warning(
                        "No market data available for screener. Possible causes:\n"
                        f"  1. No recent daily close data (checked date: {latest_daily_date}) - run historical data loader for 1day timescale\n"
                        "  2. No current pricing data - ensure real-time ingestion is running\n"
                        "  → Check admin panel or logs to verify data ingestion services are active"
                    )
                else:
                    self.logger.info(f"Fetched {len(snapshots)} market data records from TimescaleDB (using daily data from: {latest_daily_date})")
                    
                return snapshots
                
        except Exception as e:
            self.logger.error(f"Failed to fetch latest data from TimescaleDB: {e}", exc_info=True)
            return []

