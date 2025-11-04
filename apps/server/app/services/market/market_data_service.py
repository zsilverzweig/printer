"""
Comprehensive Market Data Service for historical bars.

Single source of truth for all historical bar queries across strategies, screener,
and other services. Database-first approach with intelligent API fallback and caching.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from decimal import Decimal

from sqlalchemy import select, text, and_, bindparam, String
from sqlalchemy.dialects.postgresql import insert, ARRAY as postgresql_ARRAY

from app.services.core.database import get_async_session
from app.models.market_data import MarketData
from app.services.core.time_context import get_current_time, get_backtest_context


logger = logging.getLogger(__name__)


class MarketDataService:
    """
    Centralized service for querying historical market data bars.
    
    Features:
    - Database-first queries (TimescaleDB hypertable)
    - Intelligent API fallback (Alpaca -> Polygon)
    - Automatic caching of API results
    - Batch query support for multiple symbols
    - Data quality validation
    - Performance metrics tracking
    """
    
    def __init__(self):
        """Initialize the service."""
        self.completeness_threshold = 0.8  # 80% of expected bars is acceptable
        self.staleness_minutes = 5  # Max age for "fresh" data
        
        # Performance tracking
        self._db_hits = 0
        self._api_calls = 0
        self._total_queries = 0
    
    async def get_bars(
        self,
        symbol: str,
        timeframe: str = "1min",
        lookback_minutes: int = 60,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get historical bars for a single symbol - DATABASE FIRST.
        
        Logic:
        1. Normalize timeframe format (1Min -> 1min)
        2. Calculate time window
        3. Query database
        4. If sufficient data, return from DB
        5. Otherwise, fetch from API and cache
        
        Args:
            symbol: Stock ticker symbol
            timeframe: Bar granularity ("1min", "5min", "15min", "1hour", "1day")
            lookback_minutes: How far back to fetch (ignored if start_time provided)
            start_time: Optional explicit start time
            end_time: Optional explicit end time (defaults to now)
        
        Returns:
            List of bar dicts with keys: timestamp, open, high, low, close, volume
        """
        self._total_queries += 1
        
        # Normalize timeframe
        timeframe = self._normalize_timeframe(timeframe)
        
        # Calculate time window (respecting backtest context)
        if end_time is None:
            # Use backtest time if in backtest mode, otherwise current time
            end_time = get_current_time()
            if end_time.tzinfo is None:
                end_time = end_time.replace(tzinfo=timezone.utc)
        if start_time is None:
            start_time = end_time - timedelta(minutes=lookback_minutes)
        
        try:
            # Check validation table FIRST (before querying) to avoid unnecessary API calls
            # If validated, we have all available data (even if sparse) and should not refetch
            ctx = get_backtest_context()
            if ctx:
                # Only check validation in backtest mode (for performance)
                is_validated = await self._check_validation(symbol, timeframe, start_time, end_time)
                
                if is_validated:
                    # Data has been validated - query DB and use whatever we have
                    result = await self._query_database(
                        symbols=[symbol],
                        timeframe=timeframe,
                        start_time=start_time,
                        end_time=end_time
                    )
                    bars = result.get(symbol, [])
                    
                    self._db_hits += 1
                    logger.info(
                        f"✓ VALIDATED: {symbol} {timeframe} - using DB ({len(bars)} bars), skipping API"
                    )
                    return bars
            
            # Try database first (for non-validated or live mode)
            result = await self._query_database(
                symbols=[symbol],
                timeframe=timeframe,
                start_time=start_time,
                end_time=end_time
            )
            
            bars = result.get(symbol, [])
            
            # Calculate expected bar count
            expected_count = self._calculate_expected_bar_count(timeframe, lookback_minutes)
            
            # Check if we have sufficient data
            # Consider it sufficient if:
            # 1. We have bars AND
            # 2. EITHER we have >= threshold of expected bars
            #    OR the latest bar is very recent (< 10 min old) suggesting we have all available data
            if bars:
                has_enough_bars = len(bars) >= expected_count * self.completeness_threshold
                
                # Check if data is recent (indicates we have all available data)
                latest_bar_time = bars[-1]["timestamp"] if bars else None
                is_recent = False
                age_minutes = None
                if latest_bar_time:
                    age_minutes = (datetime.now(timezone.utc) - latest_bar_time).total_seconds() / 60
                    is_recent = age_minutes < 10
                
                if has_enough_bars or is_recent:
                    self._db_hits += 1
                    logger.debug(
                        f"DB HIT: {symbol} {timeframe} ({len(bars)}/{expected_count} bars, "
                        f"latest: {latest_bar_time.strftime('%H:%M') if latest_bar_time else 'N/A'}, "
                        f"age: {age_minutes:.1f}min)"
                    )
                    return bars
                else:
                    # Log why we're missing cache
                    logger.debug(
                        f"Cache insufficient: {symbol} {timeframe} - "
                        f"has {len(bars)}/{expected_count} bars "
                        f"({len(bars) / expected_count * 100:.1f}% vs {self.completeness_threshold * 100:.0f}% threshold), "
                        f"latest bar age: {age_minutes:.1f}min (needs <10min)"
                    )
            
            # Insufficient data - fall back to API
            logger.info(
                f"DB MISS: {symbol} {timeframe} ({len(bars)}/{expected_count} bars), "
                f"fetching from API"
            )
            
        except Exception as e:
            logger.warning(f"Database query failed for {symbol}: {e}")
        
        # Fetch from API and cache
        try:
            bars = await self._fetch_from_api_and_cache(
                symbol=symbol,
                timeframe=timeframe,
                lookback_minutes=lookback_minutes,
                start_time=start_time,
                end_time=end_time
            )
            self._api_calls += 1
            return bars
            
        except Exception as e:
            logger.error(f"API fetch failed for {symbol} {timeframe}: {e}")
            # Return whatever we got from DB, even if incomplete
            return result.get(symbol, []) if 'result' in locals() else []
    
    async def get_bars_batch(
        self,
        symbols: List[str],
        timeframe: str = "1min",
        lookback_minutes: int = 60,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get historical bars for multiple symbols in efficient batched queries.
        
        Critical for performance when monitoring many symbols.
        Processes up to 2000 symbols per batch to avoid query timeouts.
        
        Args:
            symbols: List of stock ticker symbols
            timeframe: Bar granularity
            lookback_minutes: How far back to fetch
            start_time: Optional explicit start time
            end_time: Optional explicit end time
        
        Returns:
            Dict mapping symbol -> list of bars
        """
        if not symbols:
            return {}
        
        self._total_queries += len(symbols)
        
        # Normalize timeframe
        timeframe = self._normalize_timeframe(timeframe)
        
        # Calculate time window
        if end_time is None:
            end_time = datetime.now(timezone.utc)
        if start_time is None:
            start_time = end_time - timedelta(minutes=lookback_minutes)
        
        # Query database in batches of 2000 symbols
        batch_size = 2000
        all_results = {}
        
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i:i + batch_size]
            
            try:
                result = await self._query_database(
                    symbols=batch,
                    timeframe=timeframe,
                    start_time=start_time,
                    end_time=end_time
                )
                all_results.update(result)
                
            except Exception as e:
                logger.error(f"Batch query failed for {len(batch)} symbols: {e}")
        
        # Track hits
        self._db_hits += len([s for s in all_results if all_results[s]])
        
        logger.debug(
            f"Batch query: {len(all_results)}/{len(symbols)} symbols retrieved "
            f"({timeframe}, {lookback_minutes}min)"
        )
        
        return all_results
    
    async def get_latest_bar(
        self,
        symbol: str,
        timeframe: str = "1min",
        at_timestamp: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get the most recent bar for a symbol, optionally at a specific timestamp.
        
        Optimized single-row query using index.
        
        Args:
            symbol: Stock ticker symbol
            timeframe: Bar granularity
            at_timestamp: Optional timestamp to get bar at or before
        
        Returns:
            Most recent bar dict or None if not found
        """
        timeframe = self._normalize_timeframe(timeframe)
        
        try:
            async with get_async_session() as session:
                if at_timestamp:
                    # Get latest bar at or before timestamp
                    stmt = select(MarketData).where(
                        and_(
                            MarketData.symbol == symbol,
                            MarketData.timescale == timeframe,
                            MarketData.time <= at_timestamp
                        )
                    ).order_by(MarketData.time.desc()).limit(1)
                else:
                    # Get most recent bar
                    stmt = select(MarketData).where(
                        and_(
                            MarketData.symbol == symbol,
                            MarketData.timescale == timeframe
                        )
                    ).order_by(MarketData.time.desc()).limit(1)
                
                result = await session.execute(stmt)
                bar = result.scalar_one_or_none()
                
                if bar:
                    return self._bar_to_dict(bar)
                return None
                
        except Exception as e:
            logger.error(f"Error fetching latest bar for {symbol}: {e}")
            return None
    
    async def get_latest_prices_batch(
        self,
        symbols: List[str],
        timeframe: str = "5min",
        at_timestamp: Optional[datetime] = None
    ) -> Dict[str, float]:
        """
        Get latest close prices for multiple symbols - optimized for screener.
        
        Parallelizes large batches into concurrent queries for speed.
        
        Args:
            symbols: List of stock symbols
            timeframe: Bar granularity to use for prices
            at_timestamp: Optional timestamp (for historical screener runs)
        
        Returns:
            Dict mapping symbol -> close price
        """
        if not symbols:
            return {}
        
        timeframe = self._normalize_timeframe(timeframe)
        
        # For large batches, split into parallel chunks for speed
        CHUNK_SIZE = 10  # Tiny chunks = maximum parallelism (10 symbols per query, ~130 concurrent)
        if len(symbols) > CHUNK_SIZE:
            # Run parallel queries
            chunks = [symbols[i:i + CHUNK_SIZE] for i in range(0, len(symbols), CHUNK_SIZE)]
            
            # Get backtest ID for logging
            from app.services.core.time_context import get_backtest_id
            bt_id = get_backtest_id()
            bt_label = f"[BT:{bt_id[:8]}]" if bt_id else ""
            
            logger.info(f"{bt_label} [BATCH] Splitting {len(symbols)} symbols into {len(chunks)} parallel queries")
            
            import time
            start = time.time()
            
            tasks = [
                self._get_latest_prices_chunk(chunk, timeframe, at_timestamp)
                for chunk in chunks
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Merge results
            price_map = {}
            for result in results:
                if isinstance(result, dict):
                    price_map.update(result)
                elif isinstance(result, Exception):
                    logger.warning(f"Chunk query failed: {result}")
            
            elapsed = time.time() - start
            logger.info(f"{bt_label} [BATCH] Completed {len(chunks)} parallel queries in {elapsed:.2f}s ({len(price_map)} symbols)")
            
            return price_map
        
        # Small batch - single query
        return await self._get_latest_prices_chunk(symbols, timeframe, at_timestamp)
    
    async def _get_latest_prices_chunk(
        self,
        symbols: List[str],
        timeframe: str,
        at_timestamp: Optional[datetime] = None
    ) -> Dict[str, float]:
        """Execute a single price query for a chunk of symbols."""
        try:
            async with get_async_session() as session:
                if at_timestamp:
                    # Historical mode: Use LATERAL join for better performance
                    # This does one index lookup per symbol instead of scanning all bars
                    result = await session.execute(
                        text("""
                            SELECT s.symbol, m.close as current_price
                            FROM unnest(CAST(:symbols AS text[])) AS s(symbol)
                            CROSS JOIN LATERAL (
                                SELECT close
                                FROM market_data
                                WHERE symbol = s.symbol
                                  AND timescale = :timescale
                                  AND time <= :timestamp
                                ORDER BY time DESC
                                LIMIT 1
                            ) m
                        """).bindparams(
                            bindparam("symbols", type_=postgresql_ARRAY(String))
                        ),
                        {"symbols": symbols, "timescale": timeframe, "timestamp": at_timestamp}
                    )
                else:
                    # Live mode: Use LATERAL join
                    result = await session.execute(
                        text("""
                            SELECT s.symbol, m.close as current_price
                            FROM unnest(CAST(:symbols AS text[])) AS s(symbol)
                            CROSS JOIN LATERAL (
                                SELECT close
                                FROM market_data
                                WHERE symbol = s.symbol
                                  AND timescale = :timescale
                                ORDER BY time DESC
                                LIMIT 1
                            ) m
                        """).bindparams(
                            bindparam("symbols", type_=postgresql_ARRAY(String))
                        ),
                        {"symbols": symbols, "timescale": timeframe}
                    )
                
                price_map = {}
                for row in result:
                    if row[1] is not None:
                        price_map[row[0]] = float(row[1])
                
                return price_map
                
        except Exception as e:
            logger.error(f"Error fetching latest prices chunk ({len(symbols)} symbols): {e}")
            return {}
    
    async def _query_database(
        self,
        symbols: List[str],
        timeframe: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Query market_data table efficiently using proper indexes.
        
        Uses idx_market_data_symbol_timescale_time index for optimal performance.
        
        Args:
            symbols: List of symbols to query
            timeframe: Normalized timeframe string
            start_time: Start of time range
            end_time: End of time range
        
        Returns:
            Dict mapping symbol -> list of bars (chronological order)
        """
        if not symbols:
            return {}
        
        async with get_async_session() as session:
            # Use raw SQL for better control and performance
            result = await session.execute(
                text("""
                    SELECT 
                        time,
                        symbol,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        vwap,
                        trade_count
                    FROM market_data
                    WHERE symbol = ANY(:symbols)
                      AND timescale = :timescale
                      AND time >= :start_time
                      AND time <= :end_time
                    ORDER BY symbol, time ASC
                """),
                {
                    "symbols": symbols,
                    "timescale": timeframe,
                    "start_time": start_time,
                    "end_time": end_time
                }
            )
            
            # Group bars by symbol
            bars_by_symbol = {}
            for row in result:
                symbol = row[1]
                if symbol not in bars_by_symbol:
                    bars_by_symbol[symbol] = []
                
                bars_by_symbol[symbol].append({
                    "timestamp": row[0],
                    "open": float(row[2]) if row[2] else 0.0,
                    "high": float(row[3]) if row[3] else 0.0,
                    "low": float(row[4]) if row[4] else 0.0,
                    "close": float(row[5]) if row[5] else 0.0,
                    "volume": int(row[6]) if row[6] else 0,
                    "vwap": float(row[7]) if row[7] else None,
                    "trade_count": int(row[8]) if row[8] else None,
                })
            
            return bars_by_symbol
    
    async def _fetch_from_api_and_cache(
        self,
        symbol: str,
        timeframe: str,
        lookback_minutes: int,
        start_time: datetime,
        end_time: datetime
    ) -> List[Dict[str, Any]]:
        """
        Fetch bars from external API and cache in database.
        
        Tries Alpaca first, falls back to Polygon.
        Caches all fetched bars in market_data table.
        
        Args:
            symbol: Stock symbol
            timeframe: Normalized timeframe
            lookback_minutes: Lookback period
            start_time: Start time
            end_time: End time
        
        Returns:
            List of bars from API
        """
        bars = []
        
        # Try Alpaca first
        try:
            from alpaca.data.historical import StockHistoricalDataClient
            from alpaca.data.requests import StockBarsRequest
            from alpaca.data.timeframe import TimeFrame
            import os
            
            api_key = os.getenv("ALPACA_API_KEY")
            api_secret = os.getenv("ALPACA_API_SECRET")
            
            if api_key and api_secret:
                client = StockHistoricalDataClient(api_key, api_secret)
                
                # Convert timeframe to Alpaca format
                tf_map = {
                    "1min": TimeFrame.Minute,
                    "5min": TimeFrame(5, "Min"),
                    "15min": TimeFrame(15, "Min"),
                    "1hour": TimeFrame.Hour,
                    "1day": TimeFrame.Day,
                }
                
                tf = tf_map.get(timeframe, TimeFrame.Minute)
                
                request = StockBarsRequest(
                    symbol_or_symbols=symbol,
                    timeframe=tf,
                    start=start_time,
                    end=end_time
                )
                
                response = client.get_stock_bars(request)
                
                if symbol in response:
                    for bar in response[symbol]:
                        bars.append({
                            "timestamp": bar.timestamp,
                            "open": float(bar.open),
                            "high": float(bar.high),
                            "low": float(bar.low),
                            "close": float(bar.close),
                            "volume": int(bar.volume),
                        })
                    
                    logger.info(f"Fetched {len(bars)} bars from Alpaca for {symbol}")
                    
        except Exception as e:
            logger.warning(f"Alpaca fetch failed for {symbol}: {e}")
        
        # Fall back to Polygon if Alpaca didn't work
        if not bars:
            try:
                from polygon import RESTClient
                import app.core as core
                
                client = core.get_client()
                
                # Convert timeframe to Polygon format
                tf_map = {
                    "1min": (1, "minute"),
                    "5min": (5, "minute"),
                    "15min": (15, "minute"),
                    "1hour": (1, "hour"),
                    "1day": (1, "day"),
                }
                
                multiplier, timespan = tf_map.get(timeframe, (1, "minute"))
                
                from_date = start_time.strftime("%Y-%m-%d")
                to_date = end_time.strftime("%Y-%m-%d")
                
                aggs = list(client.list_aggs(
                    ticker=symbol,
                    multiplier=multiplier,
                    timespan=timespan,
                    from_=from_date,
                    to=to_date,
                    limit=5000
                ))
                
                for agg in aggs:
                    bars.append({
                        "timestamp": datetime.fromtimestamp(agg.timestamp / 1000, tz=timezone.utc),
                        "open": float(agg.open),
                        "high": float(agg.high),
                        "low": float(agg.low),
                        "close": float(agg.close),
                        "volume": int(agg.volume),
                    })
                
                logger.info(f"Fetched {len(bars)} bars from Polygon for {symbol}")
                
            except Exception as e:
                logger.error(f"Polygon fetch failed for {symbol}: {e}")
        
        # Cache bars in database if we got any
        if bars:
            await self._cache_bars(symbol, timeframe, bars)
        
        return bars
    
    async def _cache_bars(
        self,
        symbol: str,
        timeframe: str,
        bars: List[Dict[str, Any]]
    ) -> None:
        """
        Cache fetched bars in market_data table.
        
        Deduplicates bars before insert to avoid constraint violations.
        Uses INSERT ... ON CONFLICT DO NOTHING to handle existing rows.
        
        Args:
            symbol: Stock symbol
            timeframe: Normalized timeframe
            bars: List of bars to cache
        """
        if not bars:
            return
        
        try:
            async with get_async_session() as session:
                # Deduplicate bars by timestamp BEFORE inserting
                # API responses sometimes contain duplicate timestamps
                seen_timestamps = set()
                unique_records = []
                duplicates_found = 0
                
                for bar in bars:
                    timestamp = bar["timestamp"]
                    
                    # Check if we've already seen this timestamp
                    if timestamp in seen_timestamps:
                        duplicates_found += 1
                        continue
                    
                    seen_timestamps.add(timestamp)
                    unique_records.append({
                        "time": timestamp,
                        "symbol": symbol,
                        "timescale": timeframe,
                        "open": Decimal(str(bar["open"])),
                        "high": Decimal(str(bar["high"])),
                        "low": Decimal(str(bar["low"])),
                        "close": Decimal(str(bar["close"])),
                        "volume": bar["volume"],
                        "vwap": Decimal(str(bar.get("vwap"))) if bar.get("vwap") else None,
                        "trade_count": bar.get("trade_count"),
                        "session_type": "regular",
                    })
                
                if duplicates_found > 0:
                    logger.warning(
                        f"Deduplicated {duplicates_found} duplicate bars for {symbol} {timeframe} "
                        f"(API returned {len(bars)} bars, inserting {len(unique_records)} unique)"
                    )
                
                if not unique_records:
                    logger.warning(f"No unique bars to cache for {symbol} {timeframe}")
                    return
                
                # Bulk insert with conflict handling
                stmt = insert(MarketData).values(unique_records)
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=["time", "symbol", "timescale"]
                )
                
                await session.execute(stmt)
                await session.commit()
                
                logger.info(f"✅ Cached {len(unique_records)} bars for {symbol} {timeframe}")
                
        except Exception as e:
            logger.error(f"❌ Failed to cache bars for {symbol}: {e}", exc_info=True)
    
    def _normalize_timeframe(self, timeframe: str) -> str:
        """
        Normalize timeframe format to database standard.
        
        Handles various input formats:
        - "1Min", "5Min", "15Min" (Alpaca/strategy format)
        - "1min", "5min", "15min" (database format)
        
        Args:
            timeframe: Input timeframe string
        
        Returns:
            Normalized timeframe string
        """
        # Normalize to lowercase
        tf = timeframe.lower()
        
        # Handle common variations
        tf = tf.replace("minute", "min")
        tf = tf.replace("hour", "hour")  # Already correct
        tf = tf.replace("day", "day")  # Already correct
        
        # Validate it's a known timeframe
        valid_timeframes = ["1min", "5min", "15min", "1hour", "1day"]
        if tf not in valid_timeframes:
            logger.warning(f"Unknown timeframe '{timeframe}', defaulting to '1min'")
            return "1min"
        
        return tf
    
    def _calculate_expected_bar_count(
        self,
        timeframe: str,
        lookback_minutes: int
    ) -> int:
        """
        Calculate expected number of bars for data quality check.
        
        Accounts for:
        - Market hours (9:30-16:00 ET = 390 trading minutes per day)
        - Timeframe granularity
        - Only counting bars during actual trading time
        
        Args:
            timeframe: Normalized timeframe string
            lookback_minutes: Lookback period in minutes
        
        Returns:
            Expected number of bars during trading hours
        """
        # Minutes per bar
        minutes_per_bar = {
            "1min": 1,
            "5min": 5,
            "15min": 15,
            "1hour": 60,
            "1day": 390,  # Full trading day
        }
        
        bar_minutes = minutes_per_bar.get(timeframe, 1)
        
        if timeframe == "1day":
            # For daily bars, convert minutes to trading days (~22 per month)
            # Assume ~6.5 hours/day = 390 minutes
            days = lookback_minutes / 390
            # Approximate: 5 trading days per 7 calendar days
            trading_days = days * (5 / 7)
            return int(trading_days)
        else:
            # For intraday bars, account for market hours
            # Market is open 9:30-16:00 ET = 390 minutes per day
            TRADING_MINUTES_PER_DAY = 390
            
            # Calculate number of potential trading days in lookback period
            days_in_lookback = lookback_minutes / (24 * 60)
            
            # Approximate trading days (5 out of 7 days)
            trading_days = days_in_lookback * (5 / 7)
            
            # Total trading minutes in the period
            trading_minutes = min(
                lookback_minutes,  # Can't exceed actual lookback
                trading_days * TRADING_MINUTES_PER_DAY
            )
            
            # Calculate expected bars
            expected_bars = max(1, int(trading_minutes / bar_minutes))
            
            # Add buffer for current partial day if lookback is small
            # (e.g., if requesting last hour and market just opened)
            if lookback_minutes <= TRADING_MINUTES_PER_DAY:
                # For intraday queries, be more lenient
                expected_bars = max(1, int(lookback_minutes / bar_minutes * 0.6))
            
            return expected_bars
    
    async def _check_validation(
        self,
        symbol: str,
        timeframe: str,
        start_time: datetime,
        end_time: datetime
    ) -> bool:
        """
        Check if this symbol/date/timescale has been validated.
        
        If validated, we've already fetched all available data from the API,
        so we should use whatever is in the DB (even if sparse/empty).
        
        Args:
            symbol: Stock symbol
            timeframe: Timescale
            start_time: Query start time
            end_time: Query end time
            
        Returns:
            True if data has been validated (don't refetch), False otherwise
        """
        try:
            from app.models.market_data import SymbolDateValidation
            
            async with get_async_session() as session:
                # Check if all days in the range have validation records
                start_date = start_time.date()
                end_date = end_time.date()
                
                # Simple check: if we have a validation record for the date, trust it
                stmt = select(SymbolDateValidation).where(
                    SymbolDateValidation.symbol == symbol,
                    SymbolDateValidation.timescale == timeframe,
                    SymbolDateValidation.date >= start_date,
                    SymbolDateValidation.date <= end_date
                )
                result = await session.execute(stmt)
                validations = result.scalars().all()
                
                # If we have validation records covering the date range, consider it validated
                if validations:
                    logger.debug(f"Validation exists for {symbol} on {start_date} - using DB data as-is")
                    return True
                
                return False
        
        except Exception as e:
            logger.debug(f"Error checking validation for {symbol}: {e}")
            return False
    
    def _bar_to_dict(self, bar: MarketData) -> Dict[str, Any]:
        """Convert SQLAlchemy MarketData model to dict."""
        return {
            "timestamp": bar.time,
            "open": float(bar.open),
            "high": float(bar.high),
            "low": float(bar.low),
            "close": float(bar.close),
            "volume": int(bar.volume),
            "vwap": float(bar.vwap) if bar.vwap else None,
            "trade_count": int(bar.trade_count) if bar.trade_count else None,
        }
    
    def get_metrics(self) -> Dict[str, Any]:
        """
        Get service performance metrics.
        
        Returns:
            Dict with cache hit rate, API calls, etc.
        """
        hit_rate = self._db_hits / self._total_queries if self._total_queries > 0 else 0.0
        
        return {
            "total_queries": self._total_queries,
            "db_hits": self._db_hits,
            "api_calls": self._api_calls,
            "cache_hit_rate": hit_rate,
        }


# Global instance (singleton pattern like PriceService)
_market_data_service: Optional[MarketDataService] = None


def get_market_data_service() -> MarketDataService:
    """Get or create the global MarketDataService instance."""
    global _market_data_service
    
    if _market_data_service is None:
        _market_data_service = MarketDataService()
    
    return _market_data_service

